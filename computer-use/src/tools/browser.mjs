import {failure} from '../browser/broker.mjs';
export async function browserCall(name,args,ctx,broker){
 if(name==='browser_status')return {result:broker.status(),images:[]};
 if(args.mode==='foreground'||args.allow_foreground)throw failure('browser_foreground_unsupported');
 if(['click','scroll'].includes(name)){
  const frame=ctx.frames.get(ctx.sessionId,args.frame_id);
  if(!frame||frame.kind!=='browser'||frame.expiresAt<=Date.now())throw failure('stale_frame');
  if(JSON.stringify(frame.target)!==JSON.stringify(args.target))throw failure('target_mismatch');
  if(args.x<0||args.y<0||args.x>=frame.width||args.y>=frame.height)throw failure('coordinate_out_of_bounds');
  args={...args,frame:{width:frame.width,height:frame.height,metrics:frame.metrics,epoch:frame.epoch}};
 }
 const result=await broker.call(name,args,ctx);
 if(name==='screenshot'){
  const bytes=Buffer.from(result.png,'base64');if(bytes.length<24||bytes.subarray(1,4).toString()!=='PNG')throw failure('invalid_browser_image');
  const frame={kind:'browser',target:args.target,width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),metrics:result.metrics,epoch:result.epoch};
  const frame_id=ctx.frames.add(ctx.sessionId,frame);return {result:{...frame,frame_id},images:[{mime_type:'image/png',bytes}]};
 }
 if(name==='click'&&args.capture_after){try{const capture=await browserCall('screenshot',{target:args.target},ctx,broker);return {...capture,result:{...capture.result,...result}};}catch(e){result.capture_error=e.code??'capture_failed';}}
 return {result,images:[]};
}
