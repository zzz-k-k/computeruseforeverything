import test from 'node:test';
import assert from 'node:assert/strict';
import {createRuntime} from '../src/runtime.mjs';
import {createMacOS} from '../src/native/macos.mjs';
test('registry exposes window discovery and rejects an invalid target',async()=>{
 const r=await createRuntime();try {
 const names=r.list().map(x=>x.name);
 for(const name of ['list_apps','list_windows','get_app_state','set_value','capabilities'])assert.ok(names.includes(name),name);
 await assert.rejects(r.call('screenshot',{target:{pid:-1,window_id:1}}),{code:'invalid_arguments'});
 await assert.rejects(r.call('click',{frame_id:'missing',x:0,y:0,mode:'background'}),{code:'target_required'});
 }finally{await r.dispose();}
});
test('native discovery is read-only and missing window is rejected',async()=>{
 const m=createMacOS();const a=await m.listApps();assert.ok(Array.isArray(a.apps));
 const w=await m.listWindows();assert.ok(Array.isArray(w.windows));
 await assert.rejects(m.captureWindow({pid:2147483647,window_id:4294967295}),{code:'target_unavailable'});
});

import {targeted} from '../src/tools/windows.mjs';
const target={pid:123,window_id:456};
function context(frame){let sent=0;return {sessionId:'one',require(){},inputQueue:{run:f=>f()},frames:{get:()=>frame},macos:{windowInfo:async()=>({...target,bounds:{left:0,top:0,width:100,height:100}}),targetAction:async()=>{sent++;return {status:'dispatched'};},captureWindow:async()=>{throw Object.assign(new Error(),{code:'capture_failed'});}},get sent(){return sent;}};}
test('targeted coordinates reject stale geometry and mismatched targets before dispatch',async()=>{
 for(const [change,code] of [[{expiresAt:0},'stale_frame'],[{target:{pid:124,window_id:456}},'target_mismatch'],[{desktopBounds:{left:10,top:0,width:100,height:100}},'stale_frame']]){
  const ctx=context({target,expiresAt:Date.now()+60000,width:100,height:100,desktopBounds:{left:0,top:0,width:100,height:100},...change});
  await assert.rejects(targeted({target,mode:'foreground',frame_id:'f',x:1,y:1},ctx,'click'),{code});assert.equal(ctx.sent,0);
 }
});
test('background coordinate events stay background; capture failure preserves dispatch',async()=>{
 const ctx=context({target,expiresAt:Date.now()+60000,width:100,height:100,desktopBounds:{left:0,top:0,width:100,height:100}});
 await targeted({target,mode:'auto',allow_foreground:false,frame_id:'f',x:1,y:1},ctx,'click');assert.equal(ctx.sent,1);
 const out=await targeted({target,mode:'foreground',frame_id:'f',x:1,y:1,capture_after:true},ctx,'click');assert.equal(out.result.status,'dispatched');assert.equal(out.result.capture_error,'capture_failed');assert.equal(ctx.sent,2);
});
test('cancellation during target lookup prevents dispatch',async()=>{
 const controller=new AbortController();const ctx=context(null);ctx.signal=controller.signal;
 ctx.macos.windowInfo=async()=>{controller.abort();return {...target,bounds:{}};};
 await assert.rejects(targeted({target,mode:'background',element_path:[1],element_token:'x'},ctx,'click'),{name:'AbortError'});assert.equal(ctx.sent,0);
});
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createWindowObserver} from '../src/tools/window-observer.mjs';
function fakeSpawn(earlyFrame=false){return()=>{
 const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();
 child.kill=()=>{child.stdout.end();child.stderr.end();child.emit('close',0);};
 child.stdin.on('finish',()=>setImmediate(()=>{
  if(earlyFrame)child.stdout.write(JSON.stringify({frame:true,width:64,height:64,t:0,rgb:Buffer.alloc(64*64*3).toString('base64')})+'\n');
  child.stdout.write(JSON.stringify({ready:true,width:64,height:64})+'\n');
 }));return child;
};}
test('first window watch accepts initial settings without leaving an error session',async()=>{
 const observer=createWindowObserver({spawnNative:fakeSpawn()});const ctx={sessionId:'watch',macos:{windowInfo:async()=>target}};
 try{const out=await observer.call({action:'watch',target,quality:'high',seconds:0},ctx);assert.equal(out.result.status,'empty');}finally{await observer.dispose();}
});
test('early stream frame cannot terminate startup before ready',async()=>{
 const observer=createWindowObserver({spawnNative:fakeSpawn(true)});const ctx={sessionId:'early',macos:{windowInfo:async()=>target}};
 try{const out=await observer.call({action:'start',target},ctx);assert.equal(out.result.running,true);}finally{await observer.dispose();}
});
test('auto keeps supported input background even with foreground opt in',async()=>{
 const ctx=context({target,expiresAt:Date.now()+60000,width:100,height:100,desktopBounds:{left:0,top:0,width:100,height:100}});
 let actual;ctx.macos.targetAction=async args=>{actual=args.mode;return {status:'dispatched'};};
 await targeted({target,mode:'auto',allow_foreground:true,frame_id:'f',x:1,y:1},ctx,'click');assert.equal(actual,'background');
 await targeted({target,mode:'auto',allow_foreground:true,frame_id:'f',x:1,y:1,delta_y:1},ctx,'scroll');assert.equal(actual,'foreground');
});
test('incomplete AX and coordinate selectors are rejected by the shared schema',async()=>{
 const r=await createRuntime();try{for(const [name,args]of [['click',{}],['click',{target,element_path:[1]}],['set_value',{target,text:'x'}]])await assert.rejects(r.call(name,args),{code:'invalid_arguments'});}finally{await r.dispose();}
});
