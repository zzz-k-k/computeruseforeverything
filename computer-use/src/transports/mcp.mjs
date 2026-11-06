import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

export function createMcpServer({ runtime, sessionId = 'local' }) {
  const server = new Server({ name: 'computer-use-local', version: '0.1.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: await runtime.list() }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    try {
      const { result, images = [] } = await runtime.call(request.params.name, request.params.arguments ?? {}, { sessionId, signal: extra.signal });
      return { content: [
        { type: 'text', text: JSON.stringify(result) ?? 'null' },
        ...images.map(image => ({ type: 'image', mimeType: image.mime_type, data: Buffer.from(image.bytes).toString('base64') })),
      ] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: error.message || String(error), code: error.code || 'tool_failed' }) }] };
    }
  });
  return server;
}

export async function startStdio({ runtime, sessionId = 'local' }) {
  const server = createMcpServer({ runtime, sessionId });
  await server.connect(new StdioServerTransport());
  return { close: () => server.close() };
}
