import {copyFile,chmod,mkdir,rename,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {buildNative} from './build-native.mjs';
const root=new URL('../',import.meta.url);
await mkdir(new URL('bin/',root),{recursive:true});
// Never overwrite a mapped Mach-O inode: macOS may kill the next launch due
// to cached code-signing pages. Validate a fresh file, then atomically replace.
const staged=new URL(`bin/.node-${randomUUID()}`,root);
try {
 await copyFile(process.execPath,staged);
 await chmod(staged,0o755);
 await promisify(execFile)(fileURLToPath(staged),['--version'],{timeout:10000});
 await rename(staged,new URL('bin/node',root));
} finally {await rm(staged,{force:true});}
await buildNative();
console.log('Built local distribution at '+fileURLToPath(root));
