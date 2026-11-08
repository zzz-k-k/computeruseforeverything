import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {createPipeline} from '../../vendor/dsh-see-now-package/src/pipeline.js';
import {PACES,SCENE_OPTS,SIZES} from '../../vendor/dsh-see-now-package/src/runner.js';
const fail=code=>Object.assign(new Error(code),{code});
const result=(data,sheets=[])=>({result:{...data,sheets:sheets.map(({png,...m})=>m)},images:sheets.map(s=>({mime_type:'image/png',bytes:s.png}))});
export function createWindowObserver({spawnNative=spawn}={}){
 const sessions=new Map(); const starts=new Map(); let disposed=false;
 async function stop(id){await starts.get(id)?.catch(()=>{});const s=sessions.get(id);if(!s)return result({stopped:true});s.stopped=true;s.child.kill('SIGTERM');await s.closed;return result({stopped:true});}
 async function start(args,ctx){
  if(args.region!==undefined||args.minFrames>1||args.path!==undefined||args.realtime!==undefined)throw fail('unsupported_window_option');
  if(!args.target)throw fail('target_required');
  const old=sessions.get(ctx.sessionId);if(old&&!old.stopped)throw fail('capture_active');
  const target=await ctx.macos.windowInfo(args.target);ctx.signal?.throwIfAborted();if(disposed)throw fail('runtime_closed');
  const child=spawnNative(fileURLToPath(new URL('../../bin/desktop-bridge',import.meta.url)),[],{stdio:['pipe','pipe','pipe']});
  const s={child,target,stopped:false,error:null,frames:0,pipeline:null,queue:[],watching:false,lastAt:Date.now()};
  sessions.set(ctx.sessionId,s);
  let ready,failed;const startup=new Promise((r,j)=>{ready=r;failed=j});
  s.closed=new Promise(resolve=>child.once('close',()=>{if(!s.stopped&&!s.error)s.error='capture_stopped';failed(fail(s.error??'capture_stopped'));resolve();}));
  child.on('error',()=>{s.error='native_bridge_unavailable';failed(fail(s.error));});child.stderr.resume();child.stdin.on('error',()=>{});
  const lines=createInterface({input:child.stdout});
  lines.on('line',line=>{try{
   const data=JSON.parse(line);
   if(data.error||data.ok===false)throw fail(data.error?.code??'capture_failed');
   if(data.ready){s.pipeline=createPipeline({width:data.width,height:data.height,fps:6,region:{w:data.width,h:data.height},...(PACES[args.pace??'normal'].pipeline),...(args.scene?SCENE_OPTS:{}),cutAbs:PACES[args.pace??'normal'].cutAbs});ready();}
   if(data.frame){
    if(!s.pipeline)return; // A callback can precede the ready record; never kill a valid stream.
    const buf=Buffer.from(data.rgb,'base64');if(!s.pipeline||buf.length!==data.width*data.height*3)throw fail('invalid_frame');
    s.pipeline.push({t:data.t,buf});s.frames++;s.capture_backend=data.capture_backend;s.lastAt=Date.now();
    let sheet;while((sheet=s.pipeline.take())){s.queue.push(sheet);if(s.queue.length>4)s.queue.shift();}
   }
  }catch(error){s.error=error.code??'capture_failed';failed(fail(s.error));child.kill('SIGTERM');}});
  child.stdin.end(JSON.stringify({action:'window_stream',target,width:SIZES[args.quality??'low'][0]}));
  const timer=setTimeout(()=>{s.error='capture_timeout';child.kill('SIGTERM');failed(fail(s.error));},15000);
  const cancel=()=>{s.stopped=true;child.kill('SIGTERM');failed(fail('cancelled'));};ctx.signal?.addEventListener('abort',cancel,{once:true});
  try{await startup;return result({running:true,source:'window',target,sample_fps:6});}finally{clearTimeout(timer);ctx.signal?.removeEventListener('abort',cancel);}
 }
 async function startOnce(args,ctx){
  if(starts.has(ctx.sessionId))throw fail('capture_busy');
  const task=start(args,ctx);starts.set(ctx.sessionId,task);
  try{return await task;}finally{starts.delete(ctx.sessionId);}
 }
 return {
  owns:id=>sessions.has(id)||starts.has(id),
  async call(args,ctx){
   const action=args.action??'watch';let s=sessions.get(ctx.sessionId);
   if(action==='stop')return stop(ctx.sessionId);
   if(action==='start')return startOnce(args,ctx);
   if(action==='status')return result({running:starts.has(ctx.sessionId)||!!s&&!s.stopped&&!s.error,starting:starts.has(ctx.sessionId),source:'window',target:s?.target,frames:s?.frames??0,capture_backend:s?.capture_backend,pending:s?.queue.length??0,explicitly_stopped:s?.stopped??false,error:s?.error});
   const existing=!!s;
   if(!s){await startOnce(args,ctx);s=sessions.get(ctx.sessionId);}
   if(existing && (args.quality!==undefined||args.pace!==undefined||args.scene!==undefined||args.region!==undefined||args.minFrames>1))throw fail('capture_settings_require_restart');
   if(s.stopped)throw fail('capture_stopped');if(s.error)throw fail(s.error);
   if(args.target&&(args.target.window_id!==s.target.window_id||args.target.pid&&args.target.pid!==s.target.pid))throw fail('capture_active');
   if(s.watching)throw fail('capture_busy');
   if(action==='peek'){return result({source:'window',target:s.target,status:s.queue.length?'ready':'empty'},s.queue.splice(0));}
   if(action!=='watch')throw fail('action_unsupported');
   s.watching=true;
   try{
    const until=Date.now()+(args.seconds??5)*1000;
    while(Date.now()<until&&!s.queue.length){ctx.signal?.throwIfAborted();if(s.stopped)return result({ok:false,reason:'cancelled'});if(s.error)throw fail(s.error);await delay(50);}
    ctx.signal?.throwIfAborted();if(s.stopped)return result({ok:false,reason:'cancelled'});if(s.error)throw fail(s.error);
    if(!s.queue.length){const sheet=s.pipeline.flushNow();if(sheet)s.queue.push(sheet);}
    return result({source:'window',target:s.target,frames:s.frames,capture_backend:s.capture_backend,status:s.queue.length?'ready':'empty'},s.queue.splice(0));
   }finally{s.watching=false;}
  },
  async forget(id){await stop(id);sessions.delete(id);},
  async dispose(){disposed=true;await Promise.allSettled([...starts.values()]);await Promise.all([...sessions.keys()].map(stop));sessions.clear();},
 };
}
