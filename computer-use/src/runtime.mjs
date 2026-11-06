import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { randomUUID } from 'node:crypto';
import { realpath, stat, mkdir } from 'node:fs/promises';
import { resolve, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as desktop from './tools/desktop.mjs';
import {videoFrame} from './tools/video-frame.mjs';
import {loadSeeNow} from './tools/see-now.mjs';
import {pickRegion} from '../vendor/dsh-see-now-package/src/region.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const int=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const point={frame_id:z.string().min(1),x:int,y:int};
const object=shape=>z.object(shape).strict();
const definitions={
 screenshot:['Capture a display and return a scoped frame reference',object({display_id:int.optional()})],
 click:['Click an observed pixel',object({...point,button:z.enum(['left','right']).default('left'),capture_after:z.boolean().default(false)})],
 type:['Type Unicode text into the focused field',object({text:z.string().max(4096)})],
 press_key:['Press a key or modifier combination',object({key:z.string().min(1).max(80)})],
 scroll:['Scroll at an observed pixel',object({...point,delta_x:z.number().int().min(-2147483647).max(2147483647).default(0),delta_y:z.number().int().min(-2147483647).max(2147483647)})],
 video_frame:['Extract an exact displayed video frame',object({path:z.string().min(1),timestamp_ms:z.number().finite().min(0).optional(),frame_index:int.optional()}).refine(a=>(a.timestamp_ms===undefined)!==(a.frame_index===undefined),'exactly one frame selector required')],
 see_now:['Observe video or desktop continuously',object({action:z.enum(['start','watch','peek','stop','status','window','region']).default('watch'),source:z.enum(['screen','file','camera','obs']).optional(),path:z.string().optional(),realtime:z.boolean().optional(),seconds:z.number().finite().min(2).max(860).optional(),minFrames:z.number().int().min(1).max(100).optional(),quality:z.enum(['low','standard','high','ultra']).optional(),pace:z.enum(['calm','normal','dense']).optional(),scene:z.boolean().optional(),region:z.string().optional(),show:z.boolean().optional()})],
};
export function fail(code,message=code){return Object.assign(new Error(message),{code});}
export async function createRuntime({stateDir=join(root,'.state'),ffmpegPath=join(root,'bin/ffmpeg'),ffprobePath=join(root,'bin/ffprobe')}={}) {
 await mkdir(stateDir,{recursive:true,mode:0o700});
 let macos;
 const getMac=async()=>macos??=(await import('./native/macos.mjs')).createMacOS();
 const bridge=new Proxy({}, {get:(_,name)=>async(...args)=>(await getMac())[name](...args)});
 const frameStore=new Map(); const sessions=new Set(); let tail=Promise.resolve(); let closed=false;
 const frames={
  get:(session,id)=>{const v=frameStore.get(id);return v?.session===session?v:undefined;},
  add:(session,frame)=>{for(const [k,v] of frameStore)if(v.expiresAt<=Date.now())frameStore.delete(k);if(frameStore.size>=256)frameStore.delete(frameStore.keys().next().value);const id=randomUUID();frameStore.set(id,{...frame,session,expiresAt:Date.now()+60000});return id;},
 };
 const inputQueue={run(work){const next=tail.then(work);tail=next.catch(()=>{});return next;}};
 const authorizeFile=async path=>{if(typeof path!=='string'||!isAbsolute(path))throw fail('invalid_path','Use an absolute local file path');const file=await realpath(path);if(!(await stat(file)).isFile())throw fail('invalid_path');return file;};
 const windowEnv={...process.env,DSH_HOME:join(resolve(stateDir),'dsh')};
 const observer=await loadSeeNow({ffmpegPath,windowEnv,pickRegion:()=>pickRegion({env:windowEnv}),enableWindow:false,enableAudio:false});
 const handlers={...desktop,press_key:desktop.pressKey,video_frame:(args,ctx)=>videoFrame(args,{ffmpegPath,ffprobePath,authorizeFile,signal:ctx.signal}),see_now:(args,ctx)=>observer.call(args,ctx)};
 return {
  list:()=>Object.entries(definitions).map(([name,[description,schema]])=>({name,description,inputSchema:zodToJsonSchema(schema,{$refStrategy:'none'})})),
  async call(name,args={}, {sessionId='local',signal}={}) {
   if(closed)throw fail('runtime_closed');
   if(!Object.hasOwn(definitions,name))throw fail('unknown_tool');
   if(typeof sessionId!=='string'||!sessionId.length||sessionId.length>128)throw fail('invalid_session');
   const parsed=definitions[name][1].safeParse(args);if(!parsed.success)throw fail('invalid_arguments',parsed.error.message);
   signal?.throwIfAborted();sessions.add(sessionId);
   let main;
   const requirePermission=name=>{if(!['screen','control','local_ui'].includes(name))throw fail('permission_denied');};
   const ctx={sessionId,signal,frames,inputQueue,macos:bridge,require:requirePermission,
    async authorizeSource(source){
     if(source.kind==='file')return {...source,path:await authorizeFile(source.path)};
     if(source.kind==='screen'){
      const p=await bridge.permissions();if(!p.screenRecording)throw fail('screen_permission_denied');
      const layout=await bridge.displayLayout();main=layout.displays.find(d=>d.id===layout.mainDisplayId);
     }
     return source;
    },
    validateRegion(r){if(!r||![r.x,r.y,r.w,r.h].every(Number.isInteger)||r.x<0||r.y<0||r.w<=0||r.h<=0||!main||r.x+r.w>main.width||r.y+r.h>main.height)throw fail('bad_region');return r;},
   };
   return handlers[name](parsed.data,ctx);
  },
  async dispose(){closed=true;await Promise.all([...sessions].map(id=>observer.dispose(id)));await tail;frameStore.clear();},
 };
}
