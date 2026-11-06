const fs=require('fs'),path=require('path');const {mkStore,boot,sha}=require('./harness');const snap=require('./snapshot');
const root=path.join(__dirname,'..');
function run(build,fixture){const raw=fs.readFileSync(path.join(root,'fixtures',fixture),'utf8');const st=mkStore({[build.key]:raw});return JSON.parse(boot(path.join(root,build.file),st,snap))}
const builds={production:{file:'production-reference/aplus-hub-academy-v8.html',key:'aplus'},dev:{file:'dev/index.html',key:'aplusDEV'}};
module.exports={run,builds,root};
if(require.main===module){const r=run(builds.production,'synthetic-v5.json');
 const out={note:'Regression baseline from SYNTHETIC fixture only, computed by the untouched v8 production reference.',source:'production-reference/aplus-hub-academy-v8.html',fixture:'fixtures/synthetic-v5.json',fixtureSha:sha(fs.readFileSync(path.join(root,'fixtures/synthetic-v5.json'),'utf8')),fixedClock:'2026-10-26T12:00:00Z',snapshot:r};
 fs.writeFileSync(path.join(root,'baselines/baseline-v8.json'),JSON.stringify(out,null,1));console.log('baseline written; counts',JSON.stringify(r.counts),'orphans',r.orphans.length,'idsUnique',r.idsUnique,'backupRoundTrip',r.backupRoundTrip)}
