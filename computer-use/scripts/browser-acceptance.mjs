// Real extension test; no Codex browser tools, AppleScript, or global input.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
const root=fileURLToPath(new URL('../',import.meta.url));const run=promisify(execFile);
const cli=async(name,args={})=>JSON.parse((await run(root+'bin/computer-use',[name,'--args',JSON.stringify(args),'--session','browser-acceptance','--json','--out-dir',root+'artifacts/browser'],{maxBuffer:32*1024*1024})).stdout);
await mkdir(root+'artifacts',{recursive:true});
await run('xcrun',['swiftc',root+'tests/probes/FocusMonitor.swift','-o',root+'artifacts/FocusMonitor']);
const events=[];
const html=`<!doctype html><meta charset="utf-8"><title>Computer Use Browser Acceptance</title><style>body{margin:0;font:20px sans-serif;background:white}input{position:absolute;left:40px;top:60px;width:320px;height:40px}button{position:absolute;left:40px;top:140px;width:320px;height:48px}.bottom{position:absolute;top:1800px;height:200px}</style><input aria-label="Acceptance input" id="input"><button id="button">Click test</button><div class="bottom">Scroll target</div><script>const log=(kind,data)=>fetch('/event',{method:'POST',body:JSON.stringify({kind,data})});input.addEventListener('input',()=>log('input',input.value));input.addEventListener('keydown',e=>log('key',e.key));button.onclick=()=>{button.textContent='Clicked';log('click',true)};window.onscroll=()=>log('scroll',scrollY);log('loaded',location.pathname);</script>`;
const server=createServer((req,res)=>{if(req.url==='/event'){let text='';req.on('data',c=>text+=c);req.on('end',()=>{events.push(JSON.parse(text));res.end('ok');});}else{res.setHeader('content-type','text/html');setTimeout(()=>res.end(html),750);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
const report={at:new Date().toISOString(),checks:[],foreground_samples:[],events};let target,timer,busy=false,focusProcess,focusReport;
async function startFocus(){focusProcess=spawn(root+'artifacts/FocusMonitor',[],{stdio:['pipe','pipe','pipe']});let buffer='';return new Promise((resolve,reject)=>{focusProcess.on('error',reject);focusProcess.stdout.on('data',chunk=>{buffer+=chunk;let i;while((i=buffer.indexOf('\n'))>=0){const value=JSON.parse(buffer.slice(0,i));buffer=buffer.slice(i+1);if(value.kind==='ready')resolve(value.initial);else focusReport=value;}});focusProcess.on('exit',code=>{if(code!==0)reject(Error('Focus monitor failed'));});});}
async function stopFocus(){if(!focusProcess)return;focusProcess.stdin.end('stop\n');for(let i=0;i<100&&!focusReport;i++)await delay(20);assert.ok(focusReport,'Focus monitor report missing');report.focus_monitor=focusReport;focusProcess=undefined;}
const sample=async()=>{const result=(await cli('list-apps')).result;report.foreground_samples.push({at:Date.now(),pid:result.frontmost_pid});return result;};
async function waitFor(predicate){for(let i=0;i<50;i++){if(predicate())return;await delay(100);}throw Error('Page event timeout');}
try{
 report.focus_initial=await startFocus();
 const front=await sample();const chrome=front.apps.find(a=>a.app==='com.google.Chrome');assert.ok(chrome);assert.notEqual(front.frontmost_pid,chrome.pid,'Chrome must be background before acceptance');report.foreground_before=front.frontmost_pid;report.chrome_pid=chrome.pid;
 timer=setInterval(async()=>{if(busy)return;busy=true;try{await sample();}catch(e){report.monitor_error=e.message;}finally{busy=false;}},100);
 const connection=(await cli('browser-status')).result.connections[0];assert.ok(connection,'Load the local Chrome extension first');
 const opened=(await cli('browser-open',{connection_id:connection.connection_id,url})).result;target={kind:'browser',connection_id:connection.connection_id,tab_id:opened.tab_id};report.target=target;
 await cli('browser-attach',{target});report.checks.push('attach_focus_emulation');
 await waitFor(()=>events.some(e=>e.kind==='loaded'));report.checks.push('background_open');
 const first=await cli('screenshot',{target});report.first_capture=first.images;
 const point=(frame,x,y)=>({target,frame_id:frame.result.frame_id,x:Math.floor(x*frame.result.width/frame.result.metrics.visual.clientWidth),y:Math.floor(y*frame.result.height/frame.result.metrics.visual.clientHeight)});
 await cli('click',point(first,120,80));await cli('type',{target,text:'后台输入 Chrome 测试'});await waitFor(()=>events.some(e=>e.kind==='input'&&e.data==='后台输入 Chrome 测试'));report.checks.push('unicode_input');
 await cli('press-key',{target,key:'Enter'});await waitFor(()=>events.some(e=>e.kind==='key'&&e.data==='Enter'));report.checks.push('page_key');
 const second=await cli('screenshot',{target});await cli('click',point(second,120,160));await waitFor(()=>events.some(e=>e.kind==='click'));report.checks.push('coordinate_click');
 const third=await cli('screenshot',{target});await cli('scroll',{...point(third,400,350),delta_y:500});await waitFor(()=>events.some(e=>e.kind==='scroll'&&e.data>0));report.checks.push('scroll');
 await assert.rejects(cli('click',point(third,120,160)),/stale_frame/);report.checks.push('stale_scroll_frame_rejected');
 await cli('browser-navigate',{target,url:url+'/next'});await waitFor(()=>events.some(e=>e.kind==='loaded'&&e.data==='/next'));report.checks.push('navigate');
 const state=(await cli('browser-state',{target})).result;assert.ok(state.url.endsWith('/next'));assert.ok(state.nodes.length);report.checks.push('accessibility_state');
 report.final_capture=(await cli('screenshot',{target})).images;
 await cli('browser-close',{target});target=undefined;report.checks.push('close');await delay(300);await sample();
 assert.ok(!report.monitor_error);assert.ok(report.foreground_samples.every(s=>s.pid===report.foreground_before),'Foreground changed during test (could include user activity)');report.checks.push('foreground_unchanged');await stopFocus();assert.equal(report.focus_monitor.initial.frontmost_pid,report.focus_monitor.initial.keyboard_pid);assert.ok(Object.entries(report.focus_monitor.initial).filter(([k])=>k.endsWith('status')).every(([,v])=>v===0));assert.equal(report.focus_monitor.changes.length,0,'Foreground or keyboard focus changed');assert.equal(report.focus_monitor.activations.length,0,'Application activation observed');report.checks.push('keyboard_focus_unchanged');report.status='passed';
}catch(e){report.status='failed';report.error=e.message;process.exitCode=1;}finally{
 await stopFocus().catch(e=>{report.monitor_cleanup_error=e.message;});clearInterval(timer);while(busy)await delay(20);if(target)await cli('browser-close',{target}).catch(()=>{});server.closeAllConnections();await new Promise(r=>server.close(r));await mkdir(root+'artifacts',{recursive:true});await writeFile(root+'artifacts/browser-acceptance.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
