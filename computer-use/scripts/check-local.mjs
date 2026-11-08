// Read-only local installation check. Does not inject input or request permissions.
import {access, mkdir, readFile, stat, writeFile} from 'node:fs/promises';
import {constants, createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {createMacOS} from '../src/native/macos.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const run=promisify(execFile);
const report={at:new Date().toISOString(),platform:process.platform,arch:process.arch,checks:[],status:'passed'};
async function check(name,work) {
 try {report.checks.push({name,status:'passed',...await work()});}
 catch(error){report.status='failed';report.checks.push({name,status:'failed',error:error.message});}
}
for(const [name,args] of [['node',['--version']],['ffmpeg',['-version']],['ffprobe',['-version']]]) {
 await check(name,async()=>{
  const path=root+'bin/'+name;await access(path,constants.X_OK);
  const {stdout}=await run(path,args,{timeout:10000,maxBuffer:1024*1024});
  const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);
  return {path,bytes:(await stat(path)).size,version:stdout.split('\n')[0],sha256:hash.digest('hex')};
 });
}
await check('node_dependencies',async()=>{await import('zod');await import('@modelcontextprotocol/sdk/client/index.js');return {};});
await check('vendor_notices',async()=>{
 for(const file of ['ORIGIN.md','dsh-see-now-package/LICENSE','dsh-see-now-package/NOTICE'])await readFile(root+'vendor/'+file);
 return {note:'Checks upstream notices exist, not a redistribution license audit.'};
});
await check('native_bridge',async()=>({permissions:await createMacOS().permissions()}));
report.notes=['Permissions=false requires user configuration; no prompt was requested.',
 'Binary presence and hashes describe this local installation, not an offline installer or cross-platform release.'];
await mkdir(root+'artifacts',{recursive:true});
await writeFile(root+'artifacts/local-check.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(report.status!=='passed')process.exitCode=1;
