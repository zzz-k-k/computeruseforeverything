import { mkdir, open, readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

export const defaultStateDir = fileURLToPath(new URL('../../.state/', import.meta.url));
export function parseOptions(argv) {
  const options = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) { positional.push(arg); continue; }
    const equal = arg.indexOf('=');
    const key = arg.slice(2, equal === -1 ? undefined : equal);
    if (!key || ['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Invalid option');
    if (equal !== -1) options[key] = arg.slice(equal + 1);
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) options[key] = argv[++i];
    else options[key] = true;
  }
  return { options, positional };
}
export function paths(options = {}) {
  const stateDir = resolve(String(options['state-dir'] || process.env.COMPUTER_USE_STATE_DIR || defaultStateDir));
  return { stateDir, tokenFile: resolve(String(options['token-file'] || process.env.COMPUTER_USE_TOKEN_FILE || resolve(stateDir, 'token'))) };
}
export async function readToken(tokenFile) {
  const token = (await readFile(tokenFile, 'utf8')).trim();
  if (!token || /\s/.test(token)) throw new Error('Token file is empty or invalid');
  return token;
}
export async function ensureToken(tokenFile) {
  await mkdir(dirname(tokenFile), { recursive: true, mode: 0o700 });
  let file;
  try {
    file = await open(tokenFile, 'wx', 0o600);
    await file.writeFile(`${randomBytes(32).toString('hex')}\n`);
  } catch (error) { if (error.code !== 'EEXIST') throw error; }
  finally { await file?.close(); }
  return readToken(tokenFile);
}
