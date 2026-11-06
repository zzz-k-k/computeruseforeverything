#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseOptions, paths, readToken } from '../src/transports/config.mjs';
import { localURL, ensureLocalServer, createHttpRuntime } from '../src/transports/client.mjs';

const usage = `Usage: computer-use <list|health|doctor|mcp|tool-name> [options]
  --url http://127.0.0.1:8766   Local HTTP server
  --token-file PATH           Bearer token file (never printed)
  --session NAME              Session namespace (default: local)
  --args '{"action":"..."}'  Tool arguments as JSON
  --action VALUE ...          Individual tool arguments; kebab maps to snake_case
  --out-dir PATH              Save returned images (default: ./computer-use-output)
  --json                     Print JSON with saved image paths
  --state-dir PATH            Local state/token directory; also used by mcp

Examples:
  computer-use list
  computer-use screenshot --json
  computer-use mcp --session my-client  # MCP over stdio; stdout is protocol only
`;
try {
  const { options, positional } = parseOptions(process.argv.slice(2));
  const command = positional[0];
  if (!command || options.help || command === 'help') { process.stdout.write(usage); }
  else if (command === 'mcp') {
    const { startStdio } = await import('../src/transports/mcp.mjs');
    const url = localURL(String(options.url || process.env.COMPUTER_USE_URL || 'http://127.0.0.1:8766'));
    if (!options.url && !process.env.COMPUTER_USE_URL) await ensureLocalServer({ url, ...paths(options) });
    const runtime = createHttpRuntime({ url, token: await readToken(paths(options).tokenFile) });
    const transport = await startStdio({ runtime, sessionId: String(options.session || 'local') });
    let closing = false;
    const close = async () => { if (closing) return; closing = true; await transport.close(); await runtime.dispose(); };
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => close().finally(() => process.exit(0)));
    process.stdin.once('end', () => close().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }));
  } else {
    const base = localURL(String(options.url || process.env.COMPUTER_USE_URL || 'http://127.0.0.1:8766'));
    if (!options.url && !process.env.COMPUTER_USE_URL) await ensureLocalServer({ url: base, ...paths(options) });
    const health = command === 'health' || command === 'doctor';
    const headers = health ? {} : { authorization: `Bearer ${await readToken(paths(options).tokenFile)}` };
    let route = health ? '/health' : '/v1/tools';
    const request = { headers, redirect: 'error' };
    if (!health && command !== 'list') {
      const args = options.args ? JSON.parse(String(options.args)) : {};
      if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('--args must be a JSON object');
      const reserved = new Set(['url', 'token-file', 'state-dir', 'session', 'args', 'out-dir', 'json', 'help']);
      for (const [key, value] of Object.entries(options)) {
        if (reserved.has(key)) continue;
        let parsed = value;
        if (typeof value === 'string' && new Set(['x','y','delta-x','delta-y','display-id','frame-index','timestamp-ms','seconds','min-frames','minFrames','capture-after','realtime','scene','show']).has(key)) { try { parsed = JSON.parse(value); } catch {} }
        args[key === 'min-frames' ? 'minFrames' : key.replaceAll('-', '_')] = parsed;
      }
      route += `/${encodeURIComponent(command.replaceAll('-', '_'))}`;
      request.method = 'POST';
      request.headers['content-type'] = 'application/json';
      request.body = JSON.stringify({ arguments: args, session_id: String(options.session || 'local') });
    }
    const response = await fetch(new URL(route, base), request);
    const output = await response.json();
    if (!response.ok) throw Object.assign(new Error(output.error || `HTTP ${response.status}`), { code: output.code });
    if (Array.isArray(output.images)) {
      const directory = resolve(String(options['out-dir'] || 'computer-use-output'));
      if (output.images.length) await mkdir(directory, { recursive: true });
      const id = randomUUID();
      output.images = await Promise.all(output.images.map(async (image, index) => {
        const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[image.mime_type] || 'bin';
        const path = resolve(directory, `${id}-${index + 1}.${extension}`);
        await writeFile(path, Buffer.from(image.data, 'base64'), { flag: 'wx', mode: 0o600 });
        return { mime_type: image.mime_type, path };
      }));
    }
    if (command === 'list' && !options.json) process.stdout.write(`${output.tools.map(tool => `${tool.name}\t${tool.description}`).join('\n')}\n`);
    else process.stdout.write(`${JSON.stringify(output, null, options.json ? 0 : 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`computer-use: ${error.code ? `${error.code}: ` : ''}${error.message || error}\n`);
  process.exitCode = 1;
}
