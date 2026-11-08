// Explicit live acceptance: opens one requested profile in a new Chrome tab.
// Does not activate Chrome or restore any user's foreground selection.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
const root=fileURLToPath(new URL('../',import.meta.url));
const run=promisify(execFile);
const cli=async(name,args={})=>JSON.parse((await run(root+'bin/computer-use',[name,'--args',JSON.stringify(args),'--json','--out-dir',root+'artifacts'],{maxBuffer:16*1024*1024})).stdout);
const report={at:new Date().toISOString(),checks:[],foreground_samples:[]};
let monitor,watching=false;
try {
 const windows=(await cli('list-windows',{app:'com.google.Chrome'})).result.windows;
 const w=windows.find(w=>w.on_screen&&w.bounds.width>500&&w.title);
 assert.ok(w,'Chrome must already have a visible, non-minimized window');
 const target={pid:w.pid,window_id:w.window_id};
 const front=(await cli('list-apps')).result.frontmost_pid;
 assert.notEqual(front,target.pid,'Chrome is currently foreground: no input sent. Switch to your working app first.');
 report.target=target;report.foreground_before=front;
 const sample=async()=>{const p=(await cli('list-apps')).result.frontmost_pid;report.foreground_samples.push(p);return p;};
 monitor=setInterval(async()=>{if(watching)return;watching=true;try{await sample();}catch{report.monitor_error=true;}finally{watching=false;}},100);
 const input=async(name,args)=>{
  assert.equal(await sample(),front,'Foreground changed before action; stopped');
  const out=(await cli(name,{target,mode:'background',...args})).result;
  report.checks.push({name,...out});assert.equal(out.focus_changed,false);assert.equal(await sample(),front);
 };
 await input('press-key',{key:'Meta+T'});
 const blank=(await cli('get-app-state',{target})).result;
 assert.ok(blank.elements.some(e=>e.role==='AXTextField'&&e.title==='地址和搜索栏'&&(e.value??'')===''),'New-tab address field was not observed');
 await input('type',{text:'https://space.bilibili.com/517327498'});
 const entered=(await cli('get-app-state',{target})).result;
 assert.ok(entered.elements.some(e=>e.role==='AXTextField'&&e.value?.includes('space.bilibili.com/517327498')),'URL was not delivered');
 await input('press-key',{key:'Enter'});
 let state;
 for(let i=0;i<30;i++){
  assert.equal(await sample(),front);
  state=(await cli('get-app-state',{target})).result;
  if(state.elements.some(e=>e.role==='AXWebArea'&&e.title.includes('罗翔')))break;
  await delay(300);
 }
 assert.ok(state.elements.some(e=>e.role==='AXWebArea'&&e.title.includes('罗翔')),'Profile page did not finish loading');
 assert.ok(state.elements.some(e=>e.role==='AXTextField'&&e.value?.includes('space.bilibili.com/517327498')));
 report.page_title=state.elements.find(e=>e.role==='AXWebArea'&&e.title.includes('罗翔')).title;
 report.capture=await cli('screenshot',{target});
 report.foreground_after=await sample();assert.equal(report.foreground_after,front);
 assert.ok(report.foreground_samples.every(p=>p===front));assert.ok(!report.monitor_error);
 report.status='passed';
} catch(e){report.status='failed';report.error=e.message;process.exitCode=1;}
finally{clearInterval(monitor);while(watching)await delay(10);await writeFile(root+'artifacts/chrome-background-acceptance.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
