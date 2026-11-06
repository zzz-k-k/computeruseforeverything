import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
test('runtime exposes exactly seven tools and rejects invalid args before side effects', async () => {
 assert.ok(existsSync(new URL('../src/runtime.mjs',import.meta.url)), 'runtime must exist');
 const {createRuntime}=await import('../src/runtime.mjs');
 const r=await createRuntime();
 try {
  assert.deepEqual(r.list().map(t=>t.name).sort(),['click','press_key','screenshot','scroll','see_now','type','video_frame']);
  for(const [name,args] of [['click',{frame_id:'missing',x:-1,y:0}],['scroll',{frame_id:'x',x:0,y:0,delta_y:1.5}],['type',{text:3}],['video_frame',{path:'/tmp/no.mp4'}],['see_now',{action:'bogus'}]]) {
   await assert.rejects(r.call(name,args,{sessionId:'test'}),e=>e.code==='invalid_arguments');
  }
  await assert.rejects(r.call('watch',{},{}),e=>e.code==='unknown_tool');
  const s=await r.call('see_now',{action:'status'},{sessionId:'a'});
  assert.equal(s.result.running,false);
  await r.call('see_now',{action:'stop'},{sessionId:'a'});
  await assert.rejects(r.call('see_now',{action:'watch'},{sessionId:'a'}),e=>e.code==='capture_stopped');
  assert.equal((await r.call('see_now',{action:'status'},{sessionId:'b'})).result.explicitly_stopped,false);
 } finally {await r.dispose();}
});
