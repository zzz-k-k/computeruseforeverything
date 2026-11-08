import {createBroker} from './browser/broker.mjs';
import {browserCall} from './tools/browser.mjs';
import {createWindowObserver} from './tools/window-observer.mjs';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { randomUUID } from 'node:crypto';
import { realpath, stat, mkdir } from 'node:fs/promises';
import { resolve, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as windows from './tools/windows.mjs';
import * as desktop from './tools/desktop.mjs';
import {videoFrame} from './tools/video-frame.mjs';
import {loadSeeNow} from './tools/see-now.mjs';
import {pickRegion} from '../vendor/dsh-see-now-package/src/region.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const int=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const point={frame_id:z.string().min(1),x:int,y:int};
const object=shape=>z.object(shape).strict();
const nativeTarget=object({pid:z.number().int().positive().max(2147483647).optional(),app:z.string().min(1).optional(),window_id:z.number().int().positive().max(4294967295)}).refine(a=>a.pid!==undefined||a.app!==undefined,'pid or app required');
const browserTarget=object({kind:z.literal('browser'),connection_id:z.string().uuid(),tab_id:z.number().int().positive()});
const target=z.union([nativeTarget,browserTarget]);
const targeting={target:target.optional(),mode:z.enum(['background','foreground','auto']).optional().describe('With target, defaults to background. Background input is conditional on application support; foreground explicitly permits activation.'),allow_foreground:z.boolean().default(false)};
const element={element_path:z.array(int).max(11).optional(),element_token:z.string().length(64).optional()};
const definitions={
 browser_status:['Browser bridge connection status',object({})],
 browser_tabs:['List Chrome tabs',object({connection_id:z.string().uuid()})],
 browser_open:['Create a background Chrome tab',object({connection_id:z.string().uuid(),url:z.string().url(),window_id:int.optional()})],
 ...Object.fromEntries(['attach','detach','close','state'].map(action=>['browser_'+action,['Browser '+action,object({target:browserTarget})]])),
 browser_navigate:['Navigate a Chrome tab; returns after dispatch, use browser_state to observe loading',object({target:browserTarget,url:z.string().url()})],
 list_apps:['List running applications',object({})],
 list_windows:['List application windows',object({pid:int.optional(),app:z.string().optional()})],
 get_app_state:['Read AX elements in a target window',object({target})],
 capabilities:['Report target window capabilities',object({target})],
 set_value:['Replace an AX element value without typing',object({...targeting,...element,element_path:z.array(int).max(11),element_token:z.string().length(64),text:z.string().max(4096),target})],
 screenshot:['Capture a display or target window and return a scoped frame reference',object({display_id:int.optional(),target:target.optional()}).refine(a=>!(a.target&&a.display_id!==undefined),'choose target or display_id')],
 click:['Click an observed pixel or AX element; target enables directed background window input',object({...point,frame_id:z.string().optional(),x:int.optional(),y:int.optional(),...targeting,...element,button:z.enum(['left','right']).default('left'),capture_after:z.boolean().default(false)}).refine(a=>a.element_path!==undefined ? !!a.target&&!!a.element_token&&a.frame_id===undefined&&a.x===undefined&&a.y===undefined : !!a.frame_id&&a.x!==undefined&&a.y!==undefined&&a.element_token===undefined,'provide coordinates and frame_id, or target and AX path/token')],
 type:['Type Unicode text into the focused field; target defaults to background, at most 512 grapheme clusters per background call',object({...targeting,text:z.string().max(4096)})],
 press_key:['Press a key or modifier combination; target defaults to background with foreground-change interruption',object({...targeting,key:z.string().min(1).max(80)})],
 scroll:['Scroll at an observed pixel',object({...point,...targeting,delta_x:z.number().int().min(-2147483647).max(2147483647).default(0),delta_y:z.number().int().min(-2147483647).max(2147483647)})],
 video_frame:['Extract an exact displayed video frame',object({path:z.string().min(1),timestamp_ms:z.number().finite().min(0).optional(),frame_index:int.optional()}).refine(a=>(a.timestamp_ms===undefined)!==(a.frame_index===undefined),'exactly one frame selector required')],
 see_now:['Observe video or desktop continuously',object({action:z.enum(['start','watch','peek','stop','status','window','region']).default('watch'),source:z.enum(['screen','file','camera','obs','window']).optional(),target:target.optional(),path:z.string().optional(),realtime:z.boolean().optional(),seconds:z.number().finite().min(2).max(860).optional(),minFrames:z.number().int().min(1).max(100).optional(),quality:z.enum(['low','standard','high','ultra']).optional(),pace:z.enum(['calm','normal','dense']).optional(),scene:z.boolean().optional(),region:z.string().optional(),show:z.boolean().optional()})],
};
export function fail(code,message=code){return Object.assign(new Error(message),{code});}
export async function createRuntime({stateDir=join(root,'.state'),ffmpegPath=join(root,'bin/ffmpeg'),ffprobePath=join(root,'bin/ffprobe')}={}) {
 await mkdir(stateDir,{recursive:true,mode:0o700});
 const browser=createBroker({stateDir});
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
 const windowObserver=createWindowObserver();
 const handlers={...desktop,list_apps:windows.listApps,list_windows:windows.listWindows,get_app_state:windows.getAppState,capabilities:windows.capabilities,set_value:windows.setValue,press_key:desktop.pressKey,video_frame:(args,ctx)=>videoFrame(args,{ffmpegPath,ffprobePath,authorizeFile,signal:ctx.signal}),see_now:async(args,ctx)=>{
   if(args.source==='window') {
    const status=await observer.call({action:'status'},ctx);if(status.result.running)throw fail('capture_active');
    return windowObserver.call(args,ctx);
   }
   if(windowObserver.owns(ctx.sessionId)) {
    if(args.source){const state=await windowObserver.call({action:'status'},ctx);if(state.result.running)throw fail('capture_active');await windowObserver.forget(ctx.sessionId);}
    else return windowObserver.call(args,ctx);
   }
   return observer.call(args,ctx);
  }};
 return {
  startBrowserBridge:()=>browser.start(),
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
   if(name.startsWith('browser_')||parsed.data.target?.kind==='browser'){
    if(!name.startsWith('browser_')&&!['screenshot','click','type','press_key','scroll'].includes(name))throw fail('unsupported_browser_tool');
    if(parsed.data.element_path)throw fail('unsupported_browser_element');
    return browserCall(name,parsed.data,ctx,browser);
   }
   return handlers[name](parsed.data,ctx);
  },
  async dispose(){closed=true;await browser.dispose();await windowObserver.dispose();await Promise.all([...sessions].map(id=>observer.dispose(id)));await tail;frameStore.clear();},
 };
}
