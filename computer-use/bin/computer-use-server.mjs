#!/usr/bin/env node
import { createRuntime } from '../src/runtime.mjs';
import { startServer } from '../src/transports/http.mjs';
import { parseOptions, paths, ensureToken } from '../src/transports/config.mjs';

let runtime;
try {
  const { options } = parseOptions(process.argv.slice(2));
  if (options.help) {
    process.stdout.write('Usage: computer-use-server [--port 8766] [--host 127.0.0.1] [--state-dir PATH] [--token-file PATH] [--ffmpeg PATH] [--ffprobe PATH]\n');
  } else {
    const { stateDir, tokenFile } = paths(options);
    const token = await ensureToken(tokenFile);
    runtime = await createRuntime({ stateDir, ffmpegPath: options.ffmpeg, ffprobePath: options.ffprobe });
    const listen = options.listen === undefined ? undefined : new URL(`http://${options.listen}`);
    const service = await startServer({ runtime, token, port: Number(options.port ?? listen?.port ?? 8766), host: String(options.host || listen?.hostname?.replace(/^\[|\]$/g, '') || '127.0.0.1') });
    process.stdout.write(`computer-use listening at ${service.url}\nMCP endpoint: ${service.url}/mcp\nToken file: ${tokenFile}\n`);
    let stopping = false;
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
      if (stopping) return;
      stopping = true;
      try { await service.close(); await runtime.dispose(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
    });
  }
} catch (error) {
  await runtime?.dispose();
  process.stderr.write(`computer-use-server: ${error.message || error}\n`);
  process.exitCode = 1;
}
