import net from 'node:net';
import {chmod,unlink,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
export const failure=(code,message=code)=>Object.assign(new Error(message),{code});
export function createBroker({stateDir}) {
 const uncertain=new Set();
 const connections=new Map(), pending=new Map(), leases=new Map(), queues=new Map();
 let server;
 const path=join(stateDir,'chrome.sock');
 function invalidate(id){for(const [key,value] of leases)if(value.connection===id)leases.delete(key);}
 async function start(){
  if(server)return;
  // Never unlink an active or unknown socket owned by another runtime.
  try {
   const info=await lstat(path);if(!info.isSocket()||info.uid!==process.getuid())throw failure('browser_socket_conflict');
   const live=await new Promise((resolve,reject)=>{const probe=net.createConnection(path);probe.once('connect',()=>{probe.destroy();resolve(true);});probe.once('error',e=>e.code==='ECONNREFUSED'?resolve(false):reject(e));});
   if(live)throw failure('browser_socket_busy');await unlink(path);
  }catch(e){if(e.code!=='ENOENT')throw e;}
  server=net.createServer(socket=>{
   const id=randomUUID(); let buffer='',ready=false;
   socket.setEncoding('utf8');
   socket.on('data',chunk=>{buffer+=chunk;if(buffer.length>40*1024*1024){socket.destroy();return;}
    let pos;while((pos=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,pos);buffer=buffer.slice(pos+1);try{
     const msg=JSON.parse(line);
     if(!ready){if(msg.type!=='hello'||msg.version!==1)throw Error('protocol');ready=true;connections.set(id,{socket,version:msg.version,label:String(msg.label??'Chrome').slice(0,120)});socket.write(JSON.stringify({type:'welcome',connection_id:id})+'\n');continue;}
     if(msg.type==='detached'){leases.delete(`${id}:${msg.tab_id}`);continue;}
     const p=pending.get(msg.request_id);if(!p||p.connection!==id)continue;
     pending.delete(msg.request_id);p.finish(msg.error?failure(msg.error.code||'browser_error',msg.error.message):null,msg.result);
    }catch{socket.destroy();}}
   });
   socket.on('error',()=>{});
   socket.on('close',()=>{connections.delete(id);invalidate(id);for(const [key,p] of pending)if(p.connection===id){pending.delete(key);p.finish(failure('browser_result_unknown','Connection lost; observe before retrying.'));}});
  });
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(path,resolve);});await chmod(path,0o600);}catch(e){server=undefined;throw e;}
 }
 function request(connection,operation,args,session,signal){
  signal?.throwIfAborted();const c=connections.get(connection);if(!c)throw failure('browser_disconnected');
  const request_id=randomUUID();
  return new Promise((resolve,reject)=>{
   const finish=(error,result)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(result);};
   const abort=()=>{pending.delete(request_id);finish(failure('browser_result_unknown','Cancelled after dispatch; operation may have executed.'));};
   const timer=setTimeout(()=>{pending.delete(request_id);finish(failure('browser_result_unknown','Browser operation timed out; do not retry input automatically.'));},20000);
   pending.set(request_id,{connection,finish});signal?.addEventListener('abort',abort,{once:true});
   c.socket.write(JSON.stringify({version:1,request_id,session_id:session,operation,arguments:args})+'\n');
  });
 }
 async function call(operation,args,ctx){
  const {sessionId,signal}=ctx;const id=args.target?.connection_id??args.connection_id;
  const tab=args.target?.tab_id;const key=`${id}:${tab}`;
  const prior=queues.get(key)??Promise.resolve();
  const work=prior.catch(()=>{}).then(async()=>{
   signal?.throwIfAborted();const lease=leases.get(key);
   if(tab!==undefined&&lease&&lease.session!==sessionId)throw failure('browser_tab_busy');
   if(tab!==undefined&&!['browser_attach'].includes(operation)&&!lease)throw failure('browser_attach_required');
   if(uncertain.has(key)&&!['browser_state','browser_detach','browser_close'].includes(operation))throw failure('browser_result_unknown','Detach and reattach before further input.');
   let result;try{result=await request(id,operation,args,sessionId,signal);}catch(e){if(e.code==='browser_result_unknown')uncertain.add(key);throw e;}
   if(operation==='browser_detach'||operation==='browser_close')uncertain.delete(key);
   if(operation==='browser_attach')leases.set(key,{connection:id,session:sessionId});
   if(operation==='browser_detach'||operation==='browser_close')leases.delete(key);
   if(operation==='browser_open')result.connection_id=id;
   return result;
  });queues.set(key,work);try{return await work;}finally{if(queues.get(key)===work)queues.delete(key);}
 }
 return {start,call,status:()=>({connected:connections.size>0,connections:[...connections].map(([connection_id,c])=>({connection_id,label:c.label,protocol_version:c.version})),leases:[...leases].map(([target,v])=>({target,session_id:v.session})),focus_policy:'browser_internal_no_activation'}),async dispose(){for(const c of connections.values())c.socket.destroy();if(server){await new Promise(resolve=>server.close(resolve));await unlink(path).catch(()=>{});server=undefined;}}};
}
