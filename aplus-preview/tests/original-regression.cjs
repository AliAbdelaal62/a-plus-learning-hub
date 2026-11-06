'use strict';
const {spawnSync}=require('node:child_process'),path=require('node:path');
const root=path.resolve(__dirname,'../original');
const suites=['schema','finance','save','backup','currency-reports','ledger','fx-regression','operations','management','teacher-portal','teacher-batches','treasury','startup-guard','data-protection','session-isolation'];
let failed=0,skipped=0;
for(const suite of suites){
 const r=spawnSync(process.execPath,['--no-warnings',path.join(root,'tests',suite+'.test.js')],{cwd:root,encoding:'utf8'});
 if(r.status===77){skipped++;console.log(suite+': PARTIAL / BROWSER SKIPPED (not a pass)\n'+r.stdout);}
 else if(r.status!==0){failed++;console.error(suite+': FAILED\n'+r.stdout+'\n'+r.stderr);}else console.log(suite+': PASS');
}
console.log('Original regression: '+(suites.length-failed-skipped)+' passed, '+skipped+' partial/skipped, '+failed+' failed.');process.exitCode=failed?1:0;
