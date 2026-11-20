const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const reference=fs.readFileSync(require('node:path').join(__dirname,'../original/public/index.html'),'utf8');
const adapterModule={exports:{}};vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../extensions/cashflow-original-adapt.js'),'utf8'),{module:adapterModule});const adapter=adapterModule.exports;
const html=adapter.adapt(reference);
const helper=html.slice(html.indexOf('const PPB='),html.indexOf('\nconst fxPill='));
const rows=html.slice(html.indexOf('function cfRows('),html.indexOf('\nconst cfGrp='));
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
function engine(db,old=false){const c={db,B:()=>db.set.base,g:(a,id)=>a.find(x=>x.id==id),sn:()=>'',tn:()=>'',srcName:()=>'',lkName:()=>''};vm.createContext(c);vm.runInContext((old?'const PPB=x=>x.bamt==null?0:x.bamt;':helper)+'\n'+rows+'\nglobalThis.base=PPB;globalThis.rows=cfRows;',c);return c;}
const db={set:{base:'KWD'},pr:[{id:1,s:10,cur:'KWD',rx:7},{id:2,s:11,cur:'USD',rx:999}],rc:[{id:3,cur:'KWD'}],re:[{id:4,rc:3,s:10}],s:[{id:10},{id:11}],t:[],sp:[],tp:[],ad:[],cp:[],pp:[]};
const e=engine(db);
eq(e.base({pr:1,amt:187000}),187000);eq(e.base({pr:1,amt:50000}),50000);
eq(e.base({pr:2,amt:50000}),0);eq(e.base({pr:2,cur:'KWD',amt:50000}),50000);
eq(e.base({pr:1,cur:'USD',amt:50000}),0);eq(e.base({amt:100}),0);
eq(e.base({pr:1,amt:100,bamt:0}),0);eq(e.base({pr:2,amt:100,bamt:310}),310);
eq(e.base({pr:1,amt:-100}),-100);eq(e.base({re:4,amt:2000}),2000);
eq(e.base({cur:'KWD',amt:0}),0);eq(e.base({pr:2,amt:100,rx:0.3}),0);
db.pp=[{id:1,pr:1,amt:187000,date:'2026-11-12',meth:'Cash'},{id:2,pr:1,amt:50000,date:'2026-11-12',meth:'Bank'},{id:3,pr:2,amt:100,date:'2026-10-12',bamt:30}];
eq(e.rows('2026-11',{}).st.reduce((s,r)=>s+r.base,0),237000);
eq(e.rows('2026-11',{wt:'Project'}).st.length,2);eq(e.rows('2026-11',{wt:'Live'}).st.length,0);
eq(e.rows('2026-11',{s:11}).st.length,0);eq(e.rows('2026-11',{cur:'USD'}).st.length,0);
eq(e.rows('2026-11',{meth:'Cash'}).st.reduce((s,r)=>s+r.base,0),187000);
eq(e.rows('2026-10',{}).st.reduce((s,r)=>s+r.base,0),30);
assert.throws(()=>adapter.adapt('unexpected source'));checks++;assert.equal(fs.readFileSync(require('node:path').join(__dirname,'../original/public/index.html'),'utf8'),reference);checks++;
console.log('CASH FLOW IDENTITY OK:',checks,'synthetic checks; preserved original source, saved rates, month/work/student/currency/method filters.');

(async()=>{
 const {createRuntime}=require('../../secure-server/generated/engine.cjs');
 const rt=await createRuntime({locateFile:()=>require('node:path').resolve('secure-server/generated/engine.wasm'),log:()=>{}});
 try{const login=rt.dispatch('POST','/api/auth/login',{'content-type':'application/json','x-aplus-token':rt.server.token},JSON.stringify({username:'dev.admin',password:'DevPreview-2026!'}));assert.equal(login.status,200);const page=rt.dispatch('GET','/').text();assert(page.includes('cur===B()?x.amt:0'));const start=page.indexOf('const PPB='),end=page.indexOf('\nconst fxPill=',start);const rstart=page.indexOf('function cfRows('),rend=page.indexOf('\nconst cfGrp=',rstart);const test={db,B:()=>db.set.base,g:(a,id)=>a.find(x=>x.id==id),sn:()=>'',tn:()=>'',srcName:()=>'',lkName:()=>''};vm.createContext(test);vm.runInContext(page.slice(start,end)+'\n'+page.slice(rstart,rend)+'\nglobalThis.rows=cfRows;',test);assert.equal(test.rows('2026-11',{wt:'Project'}).st.reduce((s,r)=>s+r.base,0),237000);console.log('CASH FLOW RUNTIME OK: original server serves the corrected receipt helper; synthetic project receipts included.');}finally{await rt.stop();}
})().catch(e=>{console.error(e);process.exitCode=1;});
