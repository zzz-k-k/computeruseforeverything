import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const binary = fileURLToPath(new URL('../bin/desktop-bridge', import.meta.url));
const macOnly = { skip: process.platform !== 'darwin' };

function nativeRequest(request) {
  const result = spawnSync(binary, [], { input: JSON.stringify(request), encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('native protocol rejects unknown actions without issuing input', macOnly, () => {
  const result = nativeRequest({ action: 'not_an_action' });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'invalid_action');
});

test('native protocol rejects malformed requests', macOnly, () => {
  const result = nativeRequest({ action: 'click', x: 'bad', y: 0 });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'invalid_point');
});

test('native layout reports stable geometry and a real main display', macOnly, async () => {
  const { createMacOS } = await import('../src/native/macos.mjs');
  const macos = createMacOS();
  const first = await macos.displayLayout();
  const second = await macos.displayLayout();
  assert.equal(first.version, second.version);
  assert.match(first.version, /^[a-f0-9]{64}$/);
  assert.ok(first.displays.some(display => display.id === first.mainDisplayId));
  for (const display of first.displays) {
    assert.ok(display.width > 0 && display.height > 0);
    assert.ok(display.desktopBounds.width > 0 && display.desktopBounds.height > 0);
    assert.equal(typeof display.desktopBounds.left, 'number');
    assert.equal(typeof display.desktopBounds.top, 'number');
  }
});

test('native permission read is non-prompting and reports both prerequisites', macOnly, async () => {
  const { createMacOS } = await import('../src/native/macos.mjs');
  const result = await createMacOS().permissions();
  assert.equal(typeof result.screenRecording, 'boolean');
  assert.equal(typeof result.accessibility, 'boolean');
});

test('native capture returns PNG pixels or an actionable screen permission error', macOnly, async () => {
  const { createMacOS } = await import('../src/native/macos.mjs');
  const macos = createMacOS();
  const permissions = await macos.permissions();
  const layout = await macos.displayLayout();
  if (!permissions.screenRecording) {
    await assert.rejects(macos.captureDisplay(layout.mainDisplayId), { code: 'screen_recording_denied' });
    return;
  }
  const frame = await macos.captureDisplay(layout.mainDisplayId);
  assert.ok(Buffer.isBuffer(frame.png));
  assert.equal(frame.png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(frame.png.readUInt32BE(16), frame.width);
  assert.equal(frame.png.readUInt32BE(20), frame.height);
  const display = layout.displays.find(d => d.id === layout.mainDisplayId);
  assert.deepEqual(frame.desktopBounds, display.desktopBounds);
  assert.equal(frame.width, display.width, 'layout width must use capture pixels on Retina displays');
  assert.equal(frame.height, display.height, 'layout height must use capture pixels on Retina displays');
});

test('native wrapper explains a missing bridge executable', macOnly, async () => {
  const { createMacOS } = await import('../src/native/macos.mjs');
  await assert.rejects(createMacOS({ binaryPath: '/nonexistent/desktop-bridge' }).permissions(), { code: 'native_bridge_unavailable' });
});

test('native key and scroll validation cannot emit invalid input', macOnly, () => {
  for (const [request, code] of [
    [{ action: 'key', key: 'meta+meta+a' }, 'invalid_key'],
    [{ action: 'scroll', x: 0, y: 0, deltaX: -2147483648, deltaY: 0 }, 'invalid_scroll'],
    [{ action: 'text', text: 'x'.repeat(4097) }, 'invalid_text'],
  ]) assert.equal(nativeRequest(request).error.code, code);
});
