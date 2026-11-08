import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));const token=(await readFile(root+'.state/token','utf8')).trim();
const report={at:new Date().toISOString(),checks:[]};
for(const kind of ['http','stdio']){
 const client=new Client({name:'browser-acceptance',version:'1.0'});
 const transport=kind==='http'?new StreamableHTTPClientTransport(new URL('http://127.0.0.1:8766/mcp'),{requestInit:{headers:{Authorization:`Bearer ${token}`,'x-computer-use-session':'browser-transport-check'}}}):new StdioClientTransport({command:root+'bin/computer-use',args:['mcp','--session','browser-transport-check']});
 try{await client.connect(transport);const list=await client.listTools();assert.ok(list.tools.some(t=>t.name==='browser_attach'));const status=await client.callTool({name:'browser_status',arguments:{}});assert.ok(!status.isError);const data=JSON.parse(status.content[0].text);assert.ok(data.connected);const tabs=await client.callTool({name:'browser_tabs',arguments:{connection_id:data.connections[0].connection_id}});assert.ok(!tabs.isError);assert.ok(Array.isArray(JSON.parse(tabs.content[0].text).tabs));report.checks.push({transport:kind,tools:list.tools.length,extension_request:'passed'});}finally{await client.close();}
}
await writeFile(root+'artifacts/browser-transports.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
