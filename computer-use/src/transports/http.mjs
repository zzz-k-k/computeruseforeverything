import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './mcp.mjs';

const MAX_BODY = 8 * 1024 * 1024;
function json(res, status, data) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(data));
}
function authorized(value, token) {
  const supplied = Buffer.from(typeof value === 'string' ? value : '');
  const expected = Buffer.from(`Bearer ${token}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
function session(value) {
  if (value === undefined) return 'local';
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(value)) throw Object.assign(new Error('session_id must contain 1–128 letters, digits, dots, colons, underscores or hyphens'), { status: 400 });
  return value;
}
async function body(req) {
  if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw Object.assign(new Error('Content-Type must be application/json'), { status: 415 });
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('Request exceeds 8 MiB'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Invalid JSON body'), { status: 400 }); }
}

export async function startServer({ runtime, token, port = 8766, host = '127.0.0.1' }) {
  if (!['127.0.0.1', '::1', 'localhost'].includes(host)) throw new Error('Server host must be loopback (127.0.0.1, ::1 or localhost)');
  if (typeof token !== 'string' || !token.trim() || /\s/.test(token)) throw new Error('A nonempty token without whitespace is required');
  const bindHost = host === 'localhost' ? '127.0.0.1' : host;
  let url;
  const activeMcp = new Set();
  const requests = new Set();
  const server = createServer(async (req, res) => {
    const controller = new AbortController();
    requests.add(controller);
    res.once('close', () => {
      requests.delete(controller);
      if (!res.writableFinished) controller.abort();
    });
    try {
      const actualPort = server.address().port;
      const allowedHosts = new Set([`127.0.0.1:${actualPort}`, `localhost:${actualPort}`, `[::1]:${actualPort}`]);
      if (!allowedHosts.has(req.headers.host?.toLowerCase())) return json(res, 403, { error: 'Host is not a loopback server address' });
      if (req.headers.origin && req.headers.origin !== url) return json(res, 403, { error: 'Origin is not allowed' });
      const path = new URL(req.url, url).pathname;
      if (req.method === 'GET' && path === '/health') return json(res, 200, { status: 'ok', service: 'computer-use-local' });
      if (!authorized(req.headers.authorization, token)) {
        res.setHeader('www-authenticate', 'Bearer');
        return json(res, 401, { error: 'Bearer authentication required' });
      }
      if (path === '/mcp') {
        if (!['POST', 'GET', 'DELETE'].includes(req.method)) return json(res, 405, { error: 'Method not allowed' });
        const sessionId = session(req.headers['x-computer-use-session']);
        const payload = req.method === 'POST' ? await body(req) : undefined;
        const mcp = createMcpServer({ runtime, sessionId });
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
        activeMcp.add(mcp);
        res.once('close', () => { activeMcp.delete(mcp); mcp.close().catch(() => {}); });
        await mcp.connect(transport);
        await transport.handleRequest(req, res, payload);
        return;
      }
      if (req.method === 'GET' && path === '/v1/tools') return json(res, 200, { tools: await runtime.list() });
      const match = /^\/v1\/tools\/([a-zA-Z0-9_]+)$/.exec(path);
      if (req.method === 'POST' && match) {
        const payload = await body(req);
        if (!payload || typeof payload !== 'object' || Array.isArray(payload) || (payload.arguments !== undefined && (!payload.arguments || typeof payload.arguments !== 'object' || Array.isArray(payload.arguments)))) return json(res, 400, { error: 'Body must be an object with an arguments object' });
        const result = await runtime.call(match[1], payload.arguments ?? {}, { sessionId: session(payload.session_id), signal: controller.signal });
        return json(res, 200, { result: result.result, images: (result.images ?? []).map(image => ({ mime_type: image.mime_type, data: Buffer.from(image.bytes).toString('base64') })) });
      }
      return json(res, 404, { error: 'Not found' });
    } catch (error) {
      json(res, error.status ?? 400, { error: error.message || String(error), code: error.code || 'request_failed' });
    }
  });
  server.requestTimeout = 120_000;
  server.headersTimeout = 10_000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, bindHost, resolve); });
  url = `http://${bindHost === '::1' ? '[::1]' : bindHost}:${server.address().port}`;
  let closing;
  return { url, close() {
    return closing ??= (async () => {
      for (const controller of requests) controller.abort();
      await Promise.allSettled([...activeMcp].map(mcp => mcp.close()));
      const closed = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      server.closeAllConnections();
      await closed;
    })();
  } };
}
