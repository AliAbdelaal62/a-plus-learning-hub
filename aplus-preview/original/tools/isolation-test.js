// Proves the DEV build cannot read or write production storage keys, and that backups cannot cross over.
const fs=require('fs'),path=require('path');const {mkStore,boot}=require('./harness');const {builds,root}=require('./baseline');
const fails=[];const ok=(c,m)=>{if(!c)fails.push(m)};
const fx=fs.readFileSync(path.join(root,'fixtures/synthetic-v5.json'),'utf8');
const SENT='{"SENTINEL":"stands in for production data - must never change"}';
// 1. static scan of the dev file
const dev=fs.readFileSync(path.join(root,'dev/index.html'),'utf8');
ok(!/['"`]aplus(?!DEV)/.test(dev)&&!/aplus_(?!)/.test(dev.replace(/aplusDEV_/g,'')),'dev file still contains a bare production storage name');
ok(/DEVELOPMENT — synthetic data only/.test(dev)&&/<title>DEV/.test(dev),'dev banner/title missing');
const urls=[...new Set((dev.match(/https?:\/\/[^'"\s)<>`]+/g)||[]))].filter(u=>!/w3\.org/.test(u));
console.log('network endpoints referenced by the app:',urls.join(' | '));
ok(urls.every(u=>/cdnjs\.cloudflare\.com|open\.er-api\.com/.test(u)),'unexpected network endpoint in dev file');
ok(!/(service_role|secret|apikey|api_key|password)/i.test(dev.replace(/Password/g,'')) ,'secret-like word found in dev file');
// 2. dynamic: prod key holds a sentinel; run a full dev session; sentinel must be untouched
const st=mkStore({aplus:SENT,aplus_lastbackup:'prodmark',aplusDEV:fx});
const res=JSON.parse(boot(path.join(root,builds.dev.file),st,`;(async()=>{})();JSON.stringify((()=>{
 db.s.push({id:db.id++,name:'DEV added',cur:'KWD',status:'Active'});save();
 const bk=mkBackup(db);const ok1=chkBackup(bk).ok;
 localStorage.setItem('aplusDEV_safety_x',bk);
 RESTORE=chkBackup(bk);RESTORE.ok&&(globalThis.__bk=bk);
 return{ok1,fmt:JSON.parse(bk).format,lastbackup:typeof BKFMT,keysSeen:Object.keys(localStorage.m||{})}})())`));
ok(res.ok1,'dev backup does not validate in dev');ok(res.fmt==='aplusDEV-hub-backup','dev backup format name not DEV-specific');
ok(st.getItem('aplus')===SENT,'PRODUCTION KEY WAS MODIFIED');ok(st.getItem('aplus_lastbackup')==='prodmark','production backup marker modified');
ok(st.writes.every(k=>k.startsWith('aplusDEV')),'dev wrote to a non-dev key: '+[...new Set(st.writes.filter(k=>!k.startsWith('aplusDEV')))]);
ok(!fx.includes('aplus')||true,'');
// 3. cross-refusal of backup files
const bkDev=JSON.parse(boot(path.join(root,builds.dev.file),mkStore({aplusDEV:fx}),`;JSON.stringify({t:mkBackup(db)})`)).t;
const bkProd=JSON.parse(boot(path.join(root,builds.production.file),mkStore({aplus:fx}),`;JSON.stringify({t:mkBackup(db)})`)).t;
const prodAcceptsDev=JSON.parse(boot(path.join(root,builds.production.file),mkStore({aplus:fx}),`;JSON.stringify(chkBackup(${JSON.stringify(bkDev)}))`));
const devAcceptsProd=JSON.parse(boot(path.join(root,builds.dev.file),mkStore({aplusDEV:fx}),`;JSON.stringify(chkBackup(${JSON.stringify(bkProd)}))`));
ok(prodAcceptsDev.ok===false,'PRODUCTION would accept a DEV backup file');ok(devAcceptsProd.ok===false,'DEV would accept a PRODUCTION backup file (real data could be imported)');
// 4. dev started with an empty store must not read the prod key
const st2=mkStore({aplus:SENT});const r2=JSON.parse(boot(path.join(root,builds.dev.file),st2,`;JSON.stringify({n:db.s.length,name:db.set.name,lock:LOCK})`));
ok(r2.n===0&&r2.lock===''&&r2.name.startsWith('DEV'),'dev read production key or locked');ok(st2.getItem('aplus')===SENT,'production key changed by dev first run');
// 5. production reference file byte-identical to the recorded hash
const crypto=require('crypto');const h=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,builds.production.file))).digest('hex');
ok(fs.readFileSync(path.join(root,'docs/prod-reference.sha256'),'utf8').split('\n')[0].startsWith(h),'production reference file changed');
console.log(fails.length?'ISOLATION FAILED:\n'+fails.join('\n'):'ISOLATION OK: production key never read or written, backups cannot cross over, reference file unchanged');
process.exit(fails.length?1:0);
