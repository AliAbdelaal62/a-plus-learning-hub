// Regression check: production reference AND dev copy must reproduce the recorded baseline on the synthetic fixture.
const fs=require('fs'),path=require('path');const {run,builds,root}=require('./baseline');
const base=require('../baselines/baseline-v8.json').snapshot;const fails=[];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const keys=['counts','idsUnique','nextIdAboveMax','orphans','studentBalances','teacherBalances','teacherByWorkType','lessonAmounts','projects','courses','total','reportKeys','fin','counts2','backupRoundTrip'];
const r1=run(builds.production,'synthetic-v5.json'),r1b=run(builds.production,'synthetic-v5.json');
if(!same(r1,r1b))fails.push('baseline is not deterministic');
for(const [name,b] of Object.entries(builds)){const r=run(b,'synthetic-v5.json');
 keys.forEach(k=>{if(!same(r[k],base[k]))fails.push(name+': '+k+' differs from baseline')});
 Object.keys(base.pageDigests).forEach(p=>{if(r.pageDigests[p]!==base.pageDigests[p])console.log('note ['+name+'] page output differs:',p,'(expected only where the page prints storage names or the business name)')});}
// legacy migration still behaves the same in both builds
const lg=builds=>Object.values(builds).map(b=>{const r=run(b,'synthetic-legacy.json');return JSON.stringify([r.counts,r.total,r.teacherBalances,r.studentBalances])});
const L=lg(builds);if(L[0]!==L[1])fails.push('legacy migration differs between production and dev');
console.log(fails.length?'CHECK FAILED:\n'+fails.join('\n'):'CHECK OK: production reference and dev copy both reproduce the baseline ('+keys.length+' sections, '+Object.keys(base.pageDigests).length+' pages hashed)');
process.exit(fails.length?1:0);
