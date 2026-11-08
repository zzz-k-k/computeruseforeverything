const attached=new Map();let port,connectionId,stopped=false;
const fail=(code,message=code)=>Object.assign(new Error(message),{code});
const cdp=(tabId,method,params={})=>chrome.debugger.sendCommand({tabId},method,params);
function emit(msg){if(!port)return;const data=JSON.stringify(msg);if(data.length<200000)return port.postMessage(msg);const id=crypto.randomUUID();for(let i=0;i<data.length;i+=200000)port.postMessage({type:'chunk',id,index:i/200000,data:data.slice(i,i+200000),last:i+200000>=data.length});}
async function stop(){stopped=true;for(const id of attached.keys())await chrome.debugger.detach({tabId:id}).catch(()=>{});attached.clear();}
function connect(){if(stopped)return;port=chrome.runtime.connectNative('local.computeruse.chrome');port.postMessage({type:'hello',version:1,label:'Chrome'});port.onMessage.addListener(async msg=>{if(msg.type==='welcome'){connectionId=msg.connection_id;return;}try{emit({request_id:msg.request_id,result:await execute(msg.operation,msg.arguments)});}catch(e){emit({request_id:msg.request_id,error:{code:e.code||'browser_error',message:e.message}});}});port.onDisconnect.addListener(()=>{void chrome.runtime.lastError;port=undefined;connectionId=undefined;stop().finally(()=>{stopped=false;setTimeout(connect,1500);});});}
chrome.runtime.onMessage.addListener((msg,_sender,reply)=>{if(msg.action==='status')reply({connected:!!connectionId,connection_id:connectionId,tabs:[...attached.keys()]});if(msg.action==='stop')stop().then(()=>reply({stopped:true}));return true;});
chrome.debugger.onDetach.addListener(({tabId},reason)=>{attached.delete(tabId);emit({type:'detached',tab_id:tabId,reason});});
chrome.debugger.onEvent.addListener((source,method)=>{if(method==='Page.frameNavigated'){const s=attached.get(source.tabId);if(s)s.epoch++;}});
function safeURL(url){let u;try{u=new URL(url);}catch{throw fail('invalid_url');}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw fail('unsupported_url');return u.href;}
async function metrics(id){const m=await cdp(id,'Page.getLayoutMetrics');return {layout:m.cssLayoutViewport,visual:m.cssVisualViewport};}
async function capture(id){const before=JSON.stringify(await metrics(id));const state=attached.get(id),epoch=state.epoch;const image=await cdp(id,'Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});const after=JSON.stringify(await metrics(id));if(before!==after||state.epoch!==epoch)throw fail('page_changed');return {png:image.data,metrics:JSON.parse(after),epoch};}
async function execute(op,a){
 if(op==='browser_tabs')return {tabs:(await chrome.tabs.query({})).map(({id,windowId,url,title,active})=>({tab_id:id,window_id:windowId,url,title,active}))};
 if(op==='browser_open'){const tab=await chrome.tabs.create({url:safeURL(a.url),active:false,...(a.window_id?{windowId:a.window_id}:{})});return {tab_id:tab.id,window_id:tab.windowId};}
 const id=a.target.tab_id;
 if(op==='browser_attach'){
  const tab=await chrome.tabs.get(id);safeURL(tab.pendingUrl??tab.url);
  if(!attached.has(id)){await chrome.debugger.attach({tabId:id},'1.3');try{await cdp(id,'Emulation.setFocusEmulationEnabled',{enabled:true});await cdp(id,'Page.enable');attached.set(id,{epoch:0});}catch(e){await chrome.debugger.detach({tabId:id}).catch(()=>{});throw fail('focus_emulation_unavailable',e.message);}}
  return {attached:true,focus_emulation:true,background:true,iframe_support:'viewport_coordinates_only'};
 }
 if(!attached.has(id))throw fail('browser_attach_required');
 if(op==='browser_detach'){await chrome.debugger.detach({tabId:id});attached.delete(id);return {detached:true};}
 if(op==='browser_close'){await chrome.tabs.remove(id);attached.delete(id);return {closed:true};}
 if(op==='browser_navigate'){
  const result=await cdp(id,'Page.navigate',{url:safeURL(a.url)});if(result.errorText)throw fail('navigation_failed',result.errorText);
  return {navigated:true,load_state:'dispatched',...result};
 }
 if(op==='browser_state'){const tab=await chrome.tabs.get(id);const tree=await cdp(id,'Accessibility.getFullAXTree');return {url:tab.url,title:tab.title,epoch:attached.get(id).epoch,metrics:await metrics(id),nodes:tree.nodes.slice(0,1000),truncated:tree.nodes.length>1000};}
 if(op==='screenshot')return capture(id);
 if(a.mode==='foreground'||a.allow_foreground)throw fail('browser_foreground_unsupported');
 if(op==='click'||op==='scroll'){
  if(attached.get(id).epoch!==a.frame.epoch||JSON.stringify(await metrics(id))!==JSON.stringify(a.frame.metrics))throw fail('stale_frame');
  const v=a.frame.metrics.visual;const x=(a.x+0.5)*v.clientWidth/a.frame.width,y=(a.y+0.5)*v.clientHeight/a.frame.height;
  if(op==='scroll'){await cdp(id,'Input.dispatchMouseEvent',{type:'mouseWheel',x,y,deltaX:a.delta_x??0,deltaY:a.delta_y});return {status:'dispatched'};}
  const button=a.button??'left';await cdp(id,'Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
  try{await cdp(id,'Input.dispatchMouseEvent',{type:'mousePressed',x,y,button,clickCount:1,buttons:button==='right'?2:1});}finally{await cdp(id,'Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button,clickCount:1,buttons:0});}
  return {status:'dispatched'};
 }
 if(op==='type'){await cdp(id,'Input.insertText',{text:a.text});return {status:'dispatched'};}
 if(op==='press_key'){
  const keys={Enter:13,Tab:9,Escape:27,Backspace:8,Delete:46,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,Home:36,End:35,PageUp:33,PageDown:34};
  if(!(a.key in keys))throw fail('unsupported_browser_key','Only page keys are supported; use browser_open instead of browser shortcuts.');
  const args={key:a.key,code:a.key,windowsVirtualKeyCode:keys[a.key],nativeVirtualKeyCode:keys[a.key]};
  try{await cdp(id,'Input.dispatchKeyEvent',{...args,type:'keyDown',...(a.key==='Enter'?{text:'\r'}:{})});}finally{await cdp(id,'Input.dispatchKeyEvent',{...args,type:'keyUp'});}return {status:'dispatched'};
 }
 throw fail('unknown_browser_operation');
}
connect();
