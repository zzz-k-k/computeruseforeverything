import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createRuntime} from '../src/runtime.mjs';
const path=fileURLToPath(new URL('./fixtures/sample.mp4',import.meta.url));
test('real FFmpeg exact frame and seenow file lifecycle',async()=>{
 const runtime=await createRuntime();
 const call=(a)=>runtime.call('see_now',a,{sessionId:'media'});
 try{
  const frame=await runtime.call('video_frame',{path,frame_index:0});
  assert.equal(frame.result.frame_index,0);assert.equal(frame.images[0].bytes.subarray(1,4).toString(),'PNG');
  await assert.rejects(runtime.call('video_frame',{path,frame_index:99999}),e=>e.code==='frame_out_of_range');
  await call({action:'start',source:'file',path,realtime:false});
  const watched=await call({action:'watch',seconds:5});
  assert.ok(watched.images.length>0,JSON.stringify(watched.result));
  assert.equal(watched.images[0].bytes.subarray(1,4).toString(),'PNG');
  assert.ok(watched.result.sheets[0].frames.length>0);
  assert.equal('png' in watched.result.sheets[0],false);
  await call({action:'peek'});
  const status=await call({action:'status'});assert.ok(status.result.frames>0);
  await call({action:'stop'});
  await assert.rejects(call({action:'watch',seconds:2}),e=>e.code==='capture_stopped');
 }finally{await runtime.dispose();}
});

test('completed fast file still delivers tail frames on a later watch exactly once',async()=>{
 const r=await createRuntime();const call=a=>r.call('see_now',a,{sessionId:'eof'});
 try{
 await call({action:'start',source:'file',path});
 for(let i=0;i<100;i++){if((await call({action:'status'})).result.endedFile)break;await new Promise(r=>setTimeout(r,20));}
 const end=await call({action:'watch',seconds:2});assert.ok(end.images.length>0,JSON.stringify(end.result));
 const next=await call({action:'watch',seconds:2});assert.equal(next.result.reason,'file-ended');assert.equal(next.images.length,0);
 }finally{await r.dispose();}
});
