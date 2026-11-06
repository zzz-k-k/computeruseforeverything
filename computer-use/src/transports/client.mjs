import { mkdir, open, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

export function localURL(value = 'http://127.0.0.1:8766') {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) || url.username || url.password) throw new Error('--url must be an HTTP loopback address');
  return url;
}
async function healthy(url) {
  const response = await fetch(new URL('/health', url), { signal: AbortSignal.timeout(1000), redirect: 'error' });
  const payload = await response.json();
  if (!response.ok || payload.service !== 'computer-use-local' || payload.status !== 'ok') throw new Error('The local port is occupied by a different or unhealthy service');
}

export async function ensureLocalServer({ url, stateDir, tokenFile }) {
  url = localURL(url);
  try { await healthy(url); return { started: false }; }
  catch (error) { if (error.cause?.code !== 'ECONNREFUSED') throw error; }
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  const logPath = join(stateDir, 'server.log');
  const log = await open(logPath, 'a', 0o600);
  let child;
  let startError;
  try {
    child = spawn(process.execPath, [fileURLToPath(new URL('../../bin/computer-use-server.mjs', import.meta.url)), '--listen', url.host, '--state-dir', stateDir, '--token-file', tokenFile], { detached: true, stdio: ['ignore', log.fd, log.fd] });
    child.on('error', error => { startError = error; });
    child.unref();
  } finally { await log.close(); }
  for (let attempt = 0; attempt < 40; attempt++) {
    if (startError) throw startError;
    try {
      await healthy(url);
      if (child.exitCode === null) await writeFile(join(stateDir, 'server.pid'), `${child.pid}\n`, { mode: 0o600 });
      return { started: true, pid: child.pid };
    } catch (error) {
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Local server failed to start; see ${logPath}`);
      if (error.cause?.code !== 'ECONNREFUSED') throw error;
    }
    await delay(250);
  }
  child.kill('SIGTERM');
  throw new Error(`Local server startup timed out; see ${logPath}`);
}

export function createHttpRuntime({ url, token }) {
  url = localURL(url);
  async function request(path, { body, signal } = {}) {
    const response = await fetch(new URL(path, url), {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal,
      headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) throw Object.assign(new Error(payload.error || `HTTP ${response.status}`), { code: payload.code || `http_${response.status}` });
    return payload;
  }
  return {
    async list() { return (await request('/v1/tools')).tools; },
    async call(name, args, { sessionId = 'local', signal } = {}) {
      const payload = await request(`/v1/tools/${encodeURIComponent(name)}`, { body: { arguments: args, session_id: sessionId }, signal });
      return { result: payload.result, images: payload.images.map(image => ({ mime_type: image.mime_type, bytes: Buffer.from(image.data, 'base64') })) };
    },
    async dispose() {},
  };
}
