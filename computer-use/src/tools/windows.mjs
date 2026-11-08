const fail=code=>Object.assign(new Error(code),{code});
const wrap=result=>({result,images:[]});
export const listApps=async(_args,ctx)=>wrap(await ctx.macos.listApps());
export async function listWindows({pid,app},ctx){const {windows}=await ctx.macos.listWindows();return wrap({windows:windows.filter(w=>(pid===undefined||w.pid===pid)&&(app===undefined||w.app===app))});}
export const getAppState=async({target},ctx)=>{ctx.require('control');return wrap(await ctx.macos.appState(target));};
export async function capabilities({target},ctx){
 const info=await ctx.macos.windowInfo(target);const permissions=await ctx.macos.permissions();
 return wrap({target:info,permissions,window_capture:permissions.screenRecording,window_stream:permissions.screenRecording,background:{ax_press:'per_element',set_value:'per_element',coordinate_click:"conditional",type:"conditional",press_key:"conditional",scroll:false,synthetic_focus:"scoped",focus_protection:"abort_on_foreground_change"},foreground:permissions.accessibility,virtual_cursor:'metadata_only'});
}
export async function targeted(args,ctx,operation){
 ctx.require('control');
 if(!args.target)throw fail('target_required');
 const requestedMode=args.mode??'background';
 const mode=requestedMode==='auto' && args.allow_foreground && operation==='scroll' ? 'foreground' : requestedMode;

 return ctx.inputQueue.run(async()=>{
  ctx.signal?.throwIfAborted();
  if(operation==='scroll' && mode!=='foreground')throw fail('background_unsupported');
  const target=await ctx.macos.windowInfo(args.target);
  let nativeArgs={...args,target,operation,mode:mode==='foreground'?'foreground':'background'};
  if(['click','scroll'].includes(operation)&&!args.element_path){
    const frame=ctx.frames.get(ctx.sessionId,args.frame_id);
    if(!frame||frame.expiresAt<=Date.now())throw fail('stale_frame');
    if(!frame.target||frame.target.window_id!==target.window_id||frame.target.pid!==target.pid)throw fail('target_mismatch');
    if(JSON.stringify(frame.desktopBounds)!==JSON.stringify(target.bounds))throw fail('stale_frame');
    if(!Number.isInteger(args.x)||!Number.isInteger(args.y)||args.x<0||args.y<0||args.x>=frame.width||args.y>=frame.height)throw fail('coordinate_out_of_bounds');
    nativeArgs={...nativeArgs,x:target.bounds.left+(args.x+0.5)*target.bounds.width/frame.width,y:target.bounds.top+(args.y+0.5)*target.bounds.height/frame.height,expected_bounds:frame.desktopBounds,right:args.button==='right',deltaX:args.delta_x??0,deltaY:args.delta_y};
  }
  ctx.signal?.throwIfAborted();
  const out=await ctx.macos.targetAction(nativeArgs);
  if(args.x!==undefined)out.virtual_cursor={x:args.x,y:args.y,space:'frame',frame_id:args.frame_id,visible:false};
  if(args.capture_after){try{const {png,...frame}=await ctx.macos.captureWindow(args.target);const frame_id=ctx.frames.add(ctx.sessionId,frame);return {result:{...out,frame_id},images:[{mime_type:'image/png',bytes:png}]};}catch(error){out.capture_error=error.code??'capture_failed';}}
  return wrap(out);
 });
}
export const setValue=(args,ctx)=>targeted(args,ctx,'set_value');
