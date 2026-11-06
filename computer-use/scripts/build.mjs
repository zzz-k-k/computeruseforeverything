import {copyFile,chmod,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {buildNative} from './build-native.mjs';
const root=new URL('../',import.meta.url);
await mkdir(new URL('bin/',root),{recursive:true});
await copyFile(process.execPath,new URL('bin/node',root));
await chmod(new URL('bin/node',root),0o755);
await buildNative();
console.log('Built local distribution at '+fileURLToPath(root));
