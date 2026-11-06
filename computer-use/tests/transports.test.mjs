import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { request as httpRequest } from 'node:http';
import { createServer as netServer } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const execute = promisify(execFile);
const token = 'fixture-token-never-log';
const auth = { authorization: `Bearer ${token}` };
const png = Buffer.from('fixture-png');
function fixtureRuntime() {
  return {
    async list() { return [{ name: 'desktop_get', description: 'Fixture desktop state', inputSchema: { type: 'object', properties: { action: { type: 'string' } }, required: ['action'] } }]; },
    async call(name, args, { sessionId }) {
      if (name !== 'desktop_get') throw new Error('Unknown tool');
      if (args.action === 'fail') throw Object.assign(new Error('Fixture failure'), { code: 'stale_frame' });
      return { result: { action: args.action, session: sessionId, ...(args.minFrames === undefined ? {} : { minFrames: args.minFrames }), ...(args.text === undefined ? {} : { text: args.text }) }, images: [{ mime_type: 'image/png', bytes: png }] };
    },
    async dispose() {},
  };
}
async function server(t) {
  const module = await import('../src/transports/http.mjs').catch(() => ({}));
  assert.equal(typeof module.startServer, 'function', 'HTTP transport must export startServer');
  const service = await module.startServer({ runtime: fixtureRuntime(), token, port: 0 });
  t.after(() => service.close());
  return service;
}

test('HTTP authenticates tools, rejects browser/rebinding requests, and preserves session/image payloads', async t => {
  const { url } = await server(t);
  assert.equal((await fetch(`${url}/health`)).status, 200);
  assert.equal((await fetch(`${url}/v1/tools`)).status, 401);
  assert.equal((await fetch(`${url}/v1/tools`, { headers: { ...auth, origin: 'https://evil.example' } })).status, 403);
  const badHostStatus = await new Promise((resolve, reject) => {
    const req = httpRequest(`${url}/v1/tools`, { headers: { ...auth, host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); });
    req.once('error', reject); req.end();
  });
  assert.equal(badHostStatus, 403);
  const list = await (await fetch(`${url}/v1/tools`, { headers: auth })).json();
  assert.equal(list.tools[0].name, 'desktop_get');
  const response = await fetch(`${url}/v1/tools/desktop_get`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ arguments: { action: 'inspect' }, session_id: 'http-client' }) });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { result: { action: 'inspect', session: 'http-client' }, images: [{ mime_type: 'image/png', data: 'Zml4dHVyZS1wbmc=' }] });
  assert.equal((await fetch(`${url}/v1/tools/desktop_get`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: 'broken json' })).status, 400);
});

test('MCP SDK client initializes, lists tools, and receives text/image content with explicit session', async t => {
  const { url } = await server(t);
  const client = new Client({ name: 'transport-test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${url}/mcp`), { requestInit: { headers: { ...auth, 'x-computer-use-session': 'mcp-client' } } });
  await client.connect(transport);
  t.after(() => client.close());
  assert.equal((await client.listTools()).tools[0].name, 'desktop_get');
  const result = await client.callTool({ name: 'desktop_get', arguments: { action: 'inspect' } });
  assert.deepEqual(JSON.parse(result.content[0].text), { action: 'inspect', session: 'mcp-client' });
  assert.deepEqual(result.content[1], { type: 'image', mimeType: 'image/png', data: 'Zml4dHVyZS1wbmc=' });
  const failed = await client.callTool({ name: 'desktop_get', arguments: { action: 'fail' } });
  assert.equal(failed.isError, true);
  assert.equal(JSON.parse(failed.content[0].text).code, 'stale_frame');
});

test('HTTP server rejects public binding and missing credentials', async () => {
  const module = await import('../src/transports/http.mjs').catch(() => ({}));
  assert.equal(typeof module.startServer, 'function');
  await assert.rejects(module.startServer({ runtime: fixtureRuntime(), token, host: '0.0.0.0' }), /loopback/i);
  await assert.rejects(module.startServer({ runtime: fixtureRuntime(), token: '', port: 0 }), /token/i);
});

test('CLI calls hyphenated tools, maps options, and saves image bytes without printing token', async t => {
  const { url } = await server(t);
  const dir = await mkdtemp(join(tmpdir(), 'computer-use-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const tokenFile = join(dir, 'token');
  await writeFile(tokenFile, `${token}\n`, { mode: 0o600 });
  const { stdout, stderr } = await execute(process.execPath, ['bin/computer-use.mjs', 'desktop-get', '--action', 'inspect', '--session', 'cli-client', '--url', url, '--token-file', tokenFile, '--out-dir', dir, '--json'], { cwd: new URL('..', import.meta.url) });
  assert.equal(stderr, '');
  assert.equal(stdout.includes(token), false);
  const result = JSON.parse(stdout);
  assert.deepEqual(result.result, { action: 'inspect', session: 'cli-client' });
  assert.deepEqual(await readFile(result.images[0].path), png);
  const health = await execute(process.execPath, ['bin/computer-use.mjs', 'health', '--url', url, '--json'], { cwd: new URL('..', import.meta.url) });
  assert.equal(JSON.parse(health.stdout).status, 'ok');
});

test('CLI launcher runs without PATH and maps see_now minFrames option', async t => {
  const { stdout } = await execute('./bin/computer-use', ['--help'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PATH: '/nonexistent' } });
  assert.match(stdout, /Usage:/);
  const { url } = await server(t);
  const dir = await mkdtemp(join(tmpdir(), 'computer-use-option-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'token'), token);
  const called = await execute('./bin/computer-use', ['desktop-get', '--action', 'inspect', '--min-frames', '3', '--text', '123', '--url', url, '--token-file', join(dir, 'token'), '--out-dir', dir, '--json'], { cwd: new URL('..', import.meta.url) });
  assert.equal(JSON.parse(called.stdout).result.minFrames, 3);
  assert.equal(JSON.parse(called.stdout).result.text, '123');
});

test('CLI rejects malformed tool JSON and nonlocal URLs', async t => {
  const { url } = await server(t);
  const dir = await mkdtemp(join(tmpdir(), 'computer-use-invalid-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'token'), token);
  await assert.rejects(execute('./bin/computer-use', ['desktop-get', '--args', '[]', '--url', url, '--token-file', join(dir, 'token')], { cwd: new URL('..', import.meta.url) }), error => error.code === 1 && /JSON object/.test(error.stderr));
  await assert.rejects(execute('./bin/computer-use', ['list', '--url', 'http://example.com'], { cwd: new URL('..', import.meta.url) }), error => error.code === 1 && /loopback/.test(error.stderr));
});

test('autostart launches local server with private token and reuses a healthy service', async t => {
  const module = await import('../src/transports/client.mjs').catch(() => ({}));
  assert.equal(typeof module.ensureLocalServer, 'function', 'local autostart helper must exist');
  const reserve = netServer();
  await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  const dir = await mkdtemp(join(tmpdir(), 'computer-use-autostart-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const settings = { url: new URL(`http://127.0.0.1:${port}`), stateDir: dir, tokenFile: join(dir, 'token') };
  const result = await module.ensureLocalServer(settings);
  t.after(() => { try { process.kill(result.pid, 'SIGTERM'); } catch {} });
  assert.equal(result.started, true);
  assert.match(await readFile(settings.tokenFile, 'utf8'), /^[a-f0-9]{64}\n$/);
  const response = await fetch(`${settings.url}v1/tools`, { headers: { authorization: `Bearer ${(await readFile(settings.tokenFile, 'utf8')).trim()}` } });
  assert.equal(response.status, 200);
  assert.ok((await response.json()).tools.some(tool => tool.name === 'screenshot'));
  const invalid = await fetch(`${settings.url}v1/tools/screenshot`, { method: 'POST', headers: { authorization: `Bearer ${(await readFile(settings.tokenFile, 'utf8')).trim()}`, 'content-type': 'application/json' }, body: JSON.stringify({ arguments: { display_id: 'invalid' } }) });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).code, 'invalid_arguments');
  assert.equal((await module.ensureLocalServer(settings)).started, false);
});

test('stdio MCP forwards through authenticated HTTP preserving shared sessions and image bytes', async t => {
  const { url } = await server(t);
  const dir = await mkdtemp(join(tmpdir(), 'computer-use-stdio-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'token'), token);
  const client = new Client({ name: 'stdio-transport-test', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [new URL('../bin/computer-use.mjs', import.meta.url).pathname, 'mcp', '--url', url, '--token-file', join(dir, 'token'), '--session', 'shared-stdio'], stderr: 'pipe' });
  await client.connect(transport);
  t.after(() => client.close());
  assert.equal((await client.listTools()).tools[0].name, 'desktop_get');
  const result = await client.callTool({ name: 'desktop_get', arguments: { action: 'inspect' } });
  assert.equal(JSON.parse(result.content[0].text).session, 'shared-stdio');
  assert.equal(result.content[1].data, 'Zml4dHVyZS1wbmc=');
});
