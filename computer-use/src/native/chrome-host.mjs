import net from 'node:net';
import {join} from 'node:path';
import {paths} from '../transports/config.mjs';
import {ensureLocalServer} from '../transports/client.mjs';
const config=paths({});
await ensureLocalServer({url:new URL('http://127.0.0.1:8766'),...config});
const socket=net.createConnection(join(config.stateDir,'chrome.sock'));
let input=Buffer.alloc(0),line='',parts=new Map();
function send(message){const bytes=Buffer.from(JSON.stringify(message));const header=Buffer.alloc(4);header.writeUInt32LE(bytes.length);process.stdout.write(Buffer.concat([header,bytes]));}
process.stdin.on('data',data=>{input=Buffer.concat([input,data]);while(input.length>=4){const size=input.readUInt32LE();if(size>1024*1024)process.exit(2);if(input.length<size+4)break;try{const msg=JSON.parse(input.subarray(4,size+4).toString());if(msg.type==='chunk'){
 const item=parts.get(msg.id)??{text:'',next:0};if(msg.index!==item.next||item.text.length+msg.data.length>32*1024*1024)throw Error('invalid chunk');item.text+=msg.data;item.next++;parts.set(msg.id,item);if(msg.last){socket.write(item.text+'\n');parts.delete(msg.id);}
 }else socket.write(JSON.stringify(msg)+'\n');}catch{process.exit(2);}input=input.subarray(size+4);}});
socket.setEncoding('utf8');socket.on('data',data=>{line+=data;if(line.length>1024*1024)process.exit(2);let i;while((i=line.indexOf('\n'))>=0){send(JSON.parse(line.slice(0,i)));line=line.slice(i+1);}});
socket.on('error',e=>{process.stderr.write(`chrome-host: ${e.code}\n`);process.exit(1);});socket.on('close',()=>process.exit(0));process.stdin.on('end',()=>socket.end());
