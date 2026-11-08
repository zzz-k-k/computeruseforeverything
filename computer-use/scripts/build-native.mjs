import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export async function buildNative() {
  if (process.platform !== 'darwin') throw Object.assign(new Error('Building the desktop bridge requires macOS and Xcode Command Line Tools.'), { code: 'unsupported_platform' });
  const root = fileURLToPath(new URL('../', import.meta.url));
  const binary = resolve(root, 'bin/desktop-bridge');
  await mkdir(resolve(root, 'bin'), { recursive: true });
  await promisify(execFile)('xcrun', ['swiftc', '-parse-as-library', '-O', '-target', `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-macosx14.0`, resolve(root, 'src/native/macos.swift'), resolve(root, 'src/native/window-control.swift'), resolve(root, 'src/native/background-input.swift'), '-o', binary], { maxBuffer: 4 * 1024 * 1024 });
  return binary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildNative().then(path => console.log(`Built ${path}`)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
