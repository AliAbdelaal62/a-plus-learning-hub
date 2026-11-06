const {spawnSync}=require("child_process");let bad=0,ran=[];
const run=(args,label)=>{const r=spawnSync("node",args,{stdio:"inherit"});const s=r.status===77?" SKIPPED (not a pass)":(r.error||r.status!==0)?" FAILED":" ok";ran.push(label+s);if(r.error||(r.status!==0&&r.status!==77))bad=1};
// 1. original checks (unchanged): generate dev copy, baseline reproduction, production-key isolation
for(const f of ["make-dev.js","check.js","isolation-test.js"])run([__dirname+"/"+f],"tools/"+f);
// 2. localhost build: generated page, schema, finance parity, migration, save, backup, HTTP, real browser, page guarantees, scale
run([__dirname+"/make-public.js"],"tools/make-public.js");
for(const t of ["schema","finance","migration","migration-gate","migration-target","save","backup","http","browser","public-page","launchers","currency-reports","teacher-archive","scale","startup-guard","data-protection","ledger","fx-regression","ledger-ui","reconcile","injection","phase3-server","phase3-browser","phase3-preapply","stabilization","stabilization-browser","operations","management","teacher-portal","treasury","teacher-batches","session-isolation"])run(["--no-warnings",__dirname+"/../tests/"+t+".test.js"],"tests/"+t);
console.log("\nSUMMARY: "+ran.join(" | "));process.exit(bad)
