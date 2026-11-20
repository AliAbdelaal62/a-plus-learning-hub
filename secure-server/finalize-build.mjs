import {readFile,writeFile,copyFile,access} from 'node:fs/promises';
import {existsSync} from 'node:fs';
// Local nitro builds emit .output/; the Lovable cloudflare-module build emits dist/. Finalize whichever exists.
const out=existsSync('.output/server/wrangler.json')?'.output':existsSync('dist/server/wrangler.json')?'dist':null;
if(!out)throw Error('No server build output found (.output or dist).');
await copyFile('secure-server/generated/engine.wasm',out+'/server/engine.wasm');
const file=out+'/server/wrangler.json',config=JSON.parse(await readFile(file,'utf8'));config.find_additional_modules=true;config.rules||=[];if(!config.rules.some(r=>r.type==='CompiledWasm'))config.rules.push({type:'CompiledWasm',globs:['**/*.wasm'],fallthrough:true});await writeFile(file,JSON.stringify(config,null,2));
for(const path of [out+'/public/aplus/runtime.js',out+'/public/aplus/sql-wasm-debug.wasm',out+'/public/aplus/index.html',out+'/client/aplus/runtime.js',out+'/client/aplus/sql-wasm-debug.wasm',out+'/client/aplus/index.html']){try{await access(path);throw Error('Browser database asset survived secure build: '+path);}catch(e){if(e.code!=='ENOENT')throw e;}}
console.log('Secure artifact finalized ('+out+'): engine/WASM server-only; old browser database absent.');
