import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const defaultBinary = fileURLToPath(new URL('../../bin/desktop-bridge', import.meta.url));
const failure = (code, message) => Object.assign(new Error(message), { code });

export function createMacOS({ binaryPath = defaultBinary } = {}) {
  async function invoke(action, args = {}) {
    if (process.platform !== 'darwin') throw failure('unsupported_platform', 'Desktop control requires macOS 14 or later.');
    return new Promise((resolve, reject) => {
      const child = spawn(binaryPath, [], { stdio: ['pipe', 'pipe', 'pipe'] });
      const chunks = [];
      let size = 0;
      let settled = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        error ? reject(error) : resolve(value);
      };
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        finish(failure('native_timeout', 'The native desktop bridge timed out. Input may already have been posted; do not retry automatically.'));
      }, 30_000);
      child.on('error', error => finish(failure('native_bridge_unavailable', `Cannot launch desktop bridge (${error.code}). Run npm run build.`)));
      child.stdout.on('data', data => {
        size += data.length;
        if (size > 128 * 1024 * 1024) {
          child.kill('SIGKILL');
          finish(failure('native_response_too_large', 'Native desktop response exceeds 128 MiB.'));
        } else chunks.push(data);
      });
      child.stderr.resume();
      child.stdin.on('error', () => {}); // Spawn/close handlers report process failures.
      child.on('close', code => {
        if (settled) return;
        if (code !== 0) return finish(failure('native_bridge_failed', `Desktop bridge exited with status ${code}.`));
        let response;
        try { response = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { return finish(failure('native_protocol_error', 'Desktop bridge returned invalid JSON.')); }
        if (response.ok === false && typeof response.error?.code === 'string') {
          finish(failure(response.error.code, response.error.message ?? response.error.code));
        } else if (response.ok === true && response.result && typeof response.result === 'object') {
          finish(null, response.result);
        } else finish(failure('native_protocol_error', 'Desktop bridge returned an invalid response envelope.'));
      });
      child.stdin.end(JSON.stringify({ action, ...args }));
    });
  }
  return {
    listApps: () => invoke('apps'),
    listWindows: () => invoke('windows'),
    windowInfo: target => invoke('window_info', {target}),
    appState: target => invoke('app_state', {target}),
    targetAction: args => invoke('target_action', args),
    async captureWindow(target) {
      const {png, ...frame} = await invoke('window_capture', {target});
      return {...frame, png: Buffer.from(png, 'base64')};
    },
    displayLayout: () => invoke('layout'),
    permissions: () => invoke('permissions'),
    async captureDisplay(displayId) {
      const { png, ...frame } = await invoke('capture', { displayId });
      return { ...frame, png: Buffer.from(png, 'base64') };
    },
    postClick: ({ x, y }, right = false) => invoke('click', { x, y, right }),
    postText: text => invoke('text', { text }),
    postKey: key => invoke('key', { key }),
    postScroll: ({ x, y }, deltaX, deltaY) => invoke('scroll', { x, y, deltaX, deltaY }),
  };
}
