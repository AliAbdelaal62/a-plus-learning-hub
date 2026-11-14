import http from 'node:http';import path from 'node:path';import {readFile,mkdir,writeFile} from 'node:fs/promises';import {randomBytes} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {fileStore} from './snapshot-store.mjs';import {makeGateway} from './gateway.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),data=path.join(root,'.secure-data'),port=Number(process.env.APLUS_SECURE_PORT||3013);
if(!Number.isInteger(port)||port<1024||port>65535||port===3000)throw Error('Use a separate non-production port');
await mkdir(data,{recursive:true});const configPath=path.join(data,'local-test-config.json');let config;try{config=JSON.parse(await readFile(configPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;config={key:randomBytes(32).toString('hex'),csrfToken:randomBytes(32).toString('hex')};await writeFile(configPath,JSON.stringify(config),{mode:0o600});}
const origin='http://127.0.0.1:'+port;
const handler=makeGateway({store:fileStore(data,config.key),origin,csrfToken:config.csrfToken,locateFile:()=>path.join(root,'secure-server/generated/engine.wasm'),localTest:true,demo:true,requireMfa:false,onError:e=>console.error('Request failed',e)});
const server=http.createServer(async(req,res)=>{try{
 if(req.headers.host!=='127.0.0.1:'+port){res.writeHead(421).end();return;}
 const url=new URL(req.url,origin),staticPrefix=url.pathname.startsWith('/secure/')?'/secure/':url.pathname.startsWith('/vendor/')?'/vendor/':null;
 if(staticPrefix&&req.method==='GET'){const relative=decodeURIComponent(url.pathname),file=path.resolve(root,'public','.'+relative),allowed=path.resolve(root,'public',staticPrefix.slice(1))+path.sep;if(!file.startsWith(allowed)||!/\.(js|css|svg|png)$/.test(file)){res.writeHead(404).end();return;}try{const bytes=await readFile(file);res.writeHead(200,{'content-type':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'image/svg+xml','cache-control':'no-store','x-content-type-options':'nosniff'}).end(bytes);}catch{res.writeHead(404).end();}return;}
 const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:req,duplex:'half'}:{})});const result=await handler(request,{clientAddress:req.socket.remoteAddress});res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
 }catch{if(!res.headersSent)res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({ok:false,error:'The secure test server is unavailable.'}));}});
server.requestTimeout=30000;server.headersTimeout=10000;server.maxHeadersCount=50;server.listen(port,'127.0.0.1',()=>console.log('Secure synthetic staging: '+origin+' — server-held database; no production data.'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close());
