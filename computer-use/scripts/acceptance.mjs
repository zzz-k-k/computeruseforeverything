import {readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const token=(await readFile(root+'.state/token','utf8')).trim();
const headers={authorization:`Bearer ${token}`,'content-type':'application/json'};
const client=new Client({name:'real-acceptance',version:'1.0'});
await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:8766/mcp'),{requestInit:{headers:{...headers,'x-computer-use-session':'acceptance'}}}));
const guard=async(name)=>{if(['click','type','press_key','press-key','scroll'].includes(name)) {const current=JSON.parse(await readFile(root+'artifacts/desktop-fixture.json','utf8'));await promisify(execFile)(root+'artifacts/FocusGuard',[String(current.pid)]);}};
const cli=async(...args)=>{await guard(args[0]);return JSON.parse((await promisify(execFile)(root+'bin/computer-use',[...args,'--session','acceptance','--out-dir',root+'artifacts','--json'])).stdout);};
const http=async(name,args)=>{await guard(name);const r=await fetch('http://127.0.0.1:8766/v1/tools/'+name,{method:'POST',headers,body:JSON.stringify({arguments:args,session_id:'acceptance'})});const x=await r.json();assert.equal(r.status,200,JSON.stringify(x));return x;};
const mcp=async(name,args)=>{await guard(name);const x=await client.callTool({name,arguments:args});assert.ok(!x.isError,JSON.stringify(x));return {result:JSON.parse(x.content[0].text),images:x.content.filter(i=>i.type==='image')};};
const state=async()=>JSON.parse(await readFile(root+'artifacts/desktop-fixture.json','utf8'));
const wait=async(check)=>{for(let i=0;i<30;i++){const s=await state();if(check(s))return s;await delay(100);}throw Error('Fixture did not receive expected input: '+JSON.stringify(await state()));};
const report={at:new Date().toISOString(),checks:[]};
try {
 const names=tools=>tools.map(t=>t.name).sort();
 const mcpNames=names((await client.listTools()).tools);
 const expected=['browser_attach','browser_close','browser_detach','browser_navigate','browser_open','browser_state','browser_status','browser_tabs','capabilities','click','get_app_state','list_apps','list_windows','press_key','screenshot','scroll','see_now','set_value','type','video_frame'];
 assert.deepEqual(mcpNames,expected);
 assert.deepEqual(names((await cli('list')).tools),expected);
 const catalog=await fetch('http://127.0.0.1:8766/v1/tools',{headers});
 assert.equal(catalog.status,200);
 assert.deepEqual(names((await catalog.json()).tools),expected);
 report.checks.push({tool_catalog:'passed',count:expected.length,transports:['cli','http','mcp']});
 if (!process.argv.includes('--desktop')) {
  report.checks.push({desktop:'not_run',reason:'Requires explicit --desktop and dedicated foreground fixture; no input injected in this run'});
 } else {
 const shot=await mcp('screenshot',{});assert.ok(shot.images.length===1);
 const initial=await state();
 // Dedicated fixture locations confirmed in screenshot before this opt-in script.
 const point=p=>({frame_id:shot.result.frame_id,x:Math.round(p.x*2),y:Math.round(p.y*2)});
 await http('click',point(initial.points.text));
 await mcp('press_key',{key:'Meta+A'});
 await cli('type','--text','Computer Use 实测 123');
 await wait(s=>s.text==='Computer Use 实测 123' && s.textChanges>initial.textChanges);
 await http('click',{...point(initial.points.button),capture_after:true});
 await wait(s=>s.leftClicks>initial.leftClicks);
 await mcp('click',{...point(initial.points.button),button:'right'});
 await wait(s=>s.rightClicks>initial.rightClicks);
 await cli('scroll','--frame-id',shot.result.frame_id,'--x',String(Math.round(initial.points.scroll.x*2)),'--y',String(Math.round(initial.points.scroll.y*2)),'--delta-y','250');
 const final=await wait(s=>s.scrollY>initial.scrollY);
 report.checks.push({desktop:'passed',text:final.text,leftClicks:final.leftClicks,rightClicks:final.rightClicks,scrollY:final.scrollY});
 }
 const frame=await mcp('video_frame',{path:root+'tests/fixtures/sample.mp4',frame_index:0});assert.ok(frame.images.length);
 report.checks.push({video_frame:'passed',...frame.result});
 await cli('see-now','--action','start','--source','file','--path',root+'tests/fixtures/sample.mp4');
 const watched=await mcp('see_now',{action:'watch',seconds:5});assert.ok(watched.images.length);
 await http('see_now',{action:'peek'});
 await cli('see-now','--action','stop');
 const stopped=await mcp('see_now',{action:'status'});assert.equal(stopped.result.explicitly_stopped,true);
 report.checks.push({see_now_file:'passed',images:watched.images.length,shared_session:true});
 await http('see_now',{action:'start',source:'screen'});
 const screen=await mcp('see_now',{action:'watch',seconds:5});assert.ok(screen.images.length,JSON.stringify(screen.result));
 await cli('see-now','--action','stop');
 report.checks.push({see_now_screen:'passed',images:screen.images.length});
 report.window=(await http('see_now',{action:'window'})).result;
 report.region=(await http('see_now',{action:'region',region:'off'})).result;
 report.status='passed';
} catch(e){report.status='failed';report.error=e.message;throw e;}finally{
 // Release only this script's observation session, including on assertion failure.
 try {await http('see_now',{action:'stop'});} catch(e){report.cleanup_error=e.message;}
 await client.close();await writeFile(root+'artifacts/acceptance.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
