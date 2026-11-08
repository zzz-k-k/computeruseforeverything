import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createMacOS} from '../src/native/macos.mjs';
import {createRuntime} from '../src/runtime.mjs';
const root=new URL('../',import.meta.url);const r=await createRuntime();const report={checks:[],at:new Date().toISOString()};
const state=()=>readFile(new URL('artifacts/background-fixture.json',root),'utf8').then(JSON.parse);
try{
 const before=await state();const pid=before.pid;
 const windows=(await r.call('list_windows',{pid})).result.windows;
 const target={pid,window_id:windows.find(w=>w.title.includes('Isolated Input Test')).window_id};
 const front=(await r.call('list_apps')).result.frontmost_pid;assert.notEqual(front,pid);report.foreground_pid=front;
 const shot=await r.call('screenshot',{target});const b=shot.result.target.bounds;
 const point=p=>({target,mode:'background',frame_id:shot.result.frame_id,x:Math.floor((p.x-b.left)*shot.result.width/b.width),y:Math.floor((p.y-b.top)*shot.result.height/b.height)});
 const click=await r.call('click',point(before.points.button));await delay(150);assert.equal((await state()).leftClicks,before.leftClicks+1);
 report.checks.push({name:'coordinate_click',...click.result});
 await r.call('click',point(before.points.text));await r.call('press_key',{target,mode:'background',key:'Meta+A'});
 const text='后台键盘实测 你好 123';const typed=await r.call('type',{target,mode:'background',text});await delay(150);assert.equal((await state()).text,text);
 report.checks.push({name:'unicode_and_shortcut',...typed.result});
 assert.equal((await r.call('list_apps')).result.frontmost_pid,front);
 const validState=await state();
 await assert.rejects(r.call('press_key',{target,mode:'background',key:'invalid-key'}),{code:'invalid_key'});
 await assert.rejects(r.call('type',{target,mode:'background',text:'a'.repeat(513)}),{code:'invalid_text'});
 const unchanged=await state();assert.equal(unchanged.text,validState.text);assert.equal(unchanged.leftClicks,validState.leftClicks);
 report.checks.push({name:'invalid_input_has_no_side_effects',passed:true});
 // Simulate an external foreground change using only this disposable fixture.
 const native=createMacOS();
 const pending=r.call('type',{target,mode:'background',text:'测'.repeat(500)}).then(()=>null,e=>e);
 for(let i=0;i<100;i++){if((await state()).text!==text)break;await delay(20);}
 try {
  await promisify(execFile)('swift',['-e',`import Cocoa; import ApplicationServices; let app=AXUIElementCreateApplication(${pid}); print(AXUIElementSetAttributeValue(app,kAXFrontmostAttribute as CFString,kCFBooleanTrue)); Thread.sleep(forTimeInterval:0.2)`]);
  const error=await pending;assert.equal(error?.code,'focus_changed');
  const interrupted=(await state()).text;assert.ok(interrupted.length<text.length+500);
  // Count only this test's payload: physical user typing after foreground change is unrelated.
  const count=value=>(value.match(/测/g)??[]).length;
  await delay(100);assert.equal(count((await state()).text),count(interrupted));
  report.checks.push({name:'foreground_change_aborts',code:error.code,partial_length:interrupted.length});
 } finally {
  await pending;
  if((await native.listApps()).frontmost_pid===pid){
   await promisify(execFile)('swift',['-e',`import Cocoa; _=NSRunningApplication(processIdentifier:${front})?.activate(options:[.activateIgnoringOtherApps]); Thread.sleep(forTimeInterval:0.2)`]);
  }
 }
 report.status='passed';
}catch(e){report.status='failed';report.error=e.message;throw e;}finally{await r.dispose();await writeFile(new URL('artifacts/background-input-acceptance.json',root),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
