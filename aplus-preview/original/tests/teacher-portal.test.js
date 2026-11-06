'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const P=require('../src/teacher-portal'),F=require('../src/finance'),L=require('../src/ledger-server'),M=require('../src/management'),A=require('../src/access'),S=require('../src/save'),T=require('../src/team'),{assemble}=require('../src/state'),{open}=require('../src/db'),{start}=require('../src/server');
let n=0;const check=f=>{f();n++};
const minimal={set:{base:'KWD'},cur:[{c:'EGP'},{c:'KWD'}],rates:{EGP:{r:.005}},t:[{id:1},{id:2}],s:[{id:10,name:'Own student'},{id:11,name:'Other student'}],sub:[{id:20,inst:1,name:'Own subject',type:'Live'},{id:21,inst:2,name:'Other subject',type:'Live'}],l:[{id:30,t:1,s:10,sub:20,date:'2026-11-01',d:1.5,tr:500000,tc:'EGP',bc:'KWD',bcost:3750,st:'Completed'},{id:31,t:2,s:11,sub:21,date:'2026-11-01',d:1,tr:999000,tc:'EGP',bcost:4995,st:'Completed'}],pr:[],rc:[],tp:[{id:40,p:1,date:'2026-11-02',cur:'EGP',amt:250000,bamt:1250,bc:'KWD',meth:'Cash'}],tt:[],pp:[],re:[],sp:[],al:[],ad:[],cp:[],ts:[]};

const cats=['Live','Recorded','Project','Other'];
function parity(st,tid=1){const before=JSON.stringify(st),a=P.account(st,tid),b=L.forState(st).teacherBase(st,tid),r=st.set.base==='EGP'?1:st.rates.EGP?.r,cv=v=>r>0?Math.round(v/r):null;for(const k of cats){const row=a.rows.find(x=>x.key===k);assert.equal(row.earned,cv(b.earned[k]));assert.equal(row.paid,cv(b.paid[k]));assert.equal(row.remaining,cv(b.remaining[k]));}assert.equal(a.earned,cv(b.earned.total));assert.equal(a.paid,cv(b.paid.total));assert.equal(a.closing,cv(b.remaining.total));assert.equal(JSON.stringify(st),before);return a;}
const project={id:50,t:1,s:10,subj:20,name:'Own project',cur:'KWD',rev:100000,share:30,rx:1,bc:'KWD',start:'2026-10-01',status:'In Progress'};
check(()=>{const a=parity(minimal);assert.equal(a.earned,750000);assert.equal(a.closing,500000);assert.ok(a.complete)});
check(()=>{const a=P.account(minimal,1,{from:'2026-11-02',to:'2026-11-02'});assert.equal(a.earned,750000);assert.equal(a.periodEarned,0);assert.equal(a.opening,750000);assert.equal(a.entries.length,1);assert.equal(a.entries[0].balance,500000)});
check(()=>{const s=structuredClone(minimal);s.rates.EGP={r:.01,t:'2026-11-02T18:12:03.974Z'};const a=parity(s);assert.equal(a.earned,375000);assert.equal(a.valuedAt,s.rates.EGP.t);assert.equal(a.entries[0].recordedCostEGP,750000);assert.equal(a.entries[1].recordedPaymentEGP,250000)});
check(()=>{const a=parity({...minimal,pr:[project]});assert.equal(a.byType.Project,6000000);assert.ok(a.complete)});
check(()=>{const a=parity({...minimal,pr:[{...project,status:'Cancelled'}]});assert.equal(a.byType.Project,0)});
check(()=>parity({...minimal,rc:[{id:60,inst:1,name:'Course',cur:'KWD',price:100000,n:3,share:20,cost:10000,rx:1,bc:'KWD'}]}));
check(()=>{const a=parity({...minimal,pr:[{...project,share:0}]});assert.equal(a.byType.Project,0)});
check(()=>{const a=parity({...minimal,rates:{}});assert.equal(a.earned,null);assert.equal(a.rows[0].remaining,null);assert.equal(a.complete,false)});
check(()=>{const a=parity({...minimal,set:{base:'EGP'},rates:{},l:[{...minimal.l[0],bc:'EGP'}],tp:[{...minimal.tp[0],bc:'EGP'}]});assert.equal(a.earned,3750);assert.equal(a.valuedAt,null)});
check(()=>{const a=parity({...minimal,rates:{EGP:{r:3}},l:[{...minimal.l[0],bcost:2}],tp:[{...minimal.tp[0],src:'Live',bamt:1}]});const row=a.rows[0];assert.equal(row.earned,1);assert.equal(row.paid,0);assert.equal(row.remaining,0)});
check(()=>{const a=parity(minimal);assert.equal(a.rows.at(-2).key,'Unassigned');assert.equal(a.rows.at(-1).key,'TOTAL')});
check(()=>{const a=parity({...minimal,l:[{...minimal.l[0],st:'No Show'}]});assert.equal(a.earned,0)});
check(()=>{assert.throws(()=>P.account(minimal,1,{from:'bad'}),e=>e.code===422);assert.throws(()=>P.account(minimal,1,{from:'2026-12-01',to:'2026-11-01'}),e=>e.code===422)});
const recurring={id:70,t:1,s:[10],sub:'Own subject',sched:'rec',dw:0,a:'2026-01-01',b:'2026-12-31',st:'10:00',en:'11:00',ex:{'2026-11-01':{moved:{date:'2026-11-02',st:'12:00',en:'13:00'}},'2026-11-08':{cancelled:1},'2026-10-25':{moved:{date:'2026-11-03',st:'14:00',en:'15:00'}}}};
check(()=>{const s={...minimal,l:[],tt:[recurring,{...recurring,id:71,t:2,sub:'Other secret'}]},rows=P.schedule(s,1,[],{from:'2026-11-01',to:'2026-11-08'});assert.equal(rows.length,3);assert.ok(!rows.some(r=>r.date==='2026-11-01'));assert.ok(rows.some(r=>r.date==='2026-11-03'));assert.equal(rows.find(r=>r.date==='2026-11-08').status,'Cancelled');assert.ok(rows.every(r=>r.id===70))});
check(()=>{const s={...minimal,tt:[{...recurring,ex:{},id:70}],l:[{...minimal.l[0],tt:70,od:'2026-11-01'}]},rows=P.schedule(s,1,[],{from:'2026-11-01',to:'2026-11-01'});assert.equal(rows.length,1)});
check(()=>{const rows=P.schedule(minimal,1,[{id:80,teacher_id:1,student_id:10,subject_id:20,date:'2026-11-01',starts_at:'11:00',ends_at:'12:00',status:'Confirmed',kind:'Lesson',lesson_id:30}],{from:'2026-11-01',to:'2026-11-01'});assert.equal(rows.length,1);assert.equal(rows[0].source,'Booking')});
check(()=>assert.throws(()=>P.schedule(minimal,1,[],{from:'2026-01-01',to:'2026-12-31'}),e=>e.code===422));
check(()=>{const d=P.portal({...minimal,pr:[project,{...project,id:51,t:2,name:'Secret project'}]},1,[]);assert.equal(d.subjects.length,1);assert.equal(d.projects.length,1);assert.ok(!JSON.stringify(d).includes('Secret project'));assert.ok(!JSON.stringify(d).includes('999000'))});

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aplus-tp-')),file=path.join(dir,'data/test.sqlite');require('../src/importer').migrate(JSON.stringify(require('../fixtures/synthetic-v5.json')),{mode:'apply',target:file});const db=open(file),admin={id:null,username:'fee.admin',role:'Admin'},teacher={...admin,role:'Teacher',teacher_id:100},state0=assemble(db);
check(()=>{for(const role of ['Admin','Teacher','Accountant']){const before=assemble(db);assert.throws(()=>M.write(db,{kind:'teacher-fee',record:{},baseRev:S.getRev(db)},{...admin,role}),e=>e.code===(role==='Admin'?410:403));assert.deepEqual(assemble(db),before)}});
check(()=>{for(const t of state0.t)parity(state0,t.id)});
(async()=>{
 T.createUser(db,{username:'portal.admin',display_name:'Portal admin',role:'Admin',password:'PortalAdmin#2026!'},'test');T.createUser(db,{username:'portal.teacher',display_name:'Portal teacher',role:'Teacher',teacher_id:100,password:'PortalTeacher#2026!'},'test');db.close();
 const server=await start({port:0,dbFile:file,backupDir:path.join(dir,'backups'),authRequired:true});
 try{const html=await fetch(server.url).then(r=>r.text()),token=html.match(/name="aplus-token" content="([^"]+)/)[1];const login=await fetch(server.url+'api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-APlus-Token':token},body:JSON.stringify({username:'portal.teacher',password:'PortalTeacher#2026!'})}),cookie=login.headers.get('set-cookie').split(';')[0];
  const req=q=>fetch(server.url+'api/teacher/portal'+q,{headers:{cookie}});
  const page=await fetch(server.url,{headers:{cookie}}).then(r=>r.text());assert.ok(page.includes('نفس بيانات جدول الإدارة لنفس المدرس'));assert.ok(!page.includes('TP.fees()'));n++;
  let r=await req('?from=2026-11-01&to=2026-11-10');assert.equal(r.status,200);const data=await r.json();assert.ok(data.projects.every(p=>state0.pr.some(x=>x.id===p.id&&x.t===100)));assert.equal(data.account.currency,'EGP');assert.ok(!JSON.stringify(data.account).includes('KWD'));n++;
  const al=await fetch(server.url+'api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-APlus-Token':token},body:JSON.stringify({username:'portal.admin',password:'PortalAdmin#2026!'})}),ac=al.headers.get('set-cookie').split(';')[0];const ar=await fetch(server.url+'api/teacher/portal?teacher=100&from=2026-11-01&to=2026-11-10',{headers:{cookie:ac}});assert.equal(ar.status,200);assert.deepEqual((await ar.json()).account,data.account);n++;
  assert.equal((await req('?teacher=101')).status,403);n++;
  assert.equal((await req('?from=bad')).status,422);n++;
  assert.equal((await fetch(server.url+'api/teacher/portal')).status,401);n++;
  assert.equal((await fetch(server.url+'api/ledger/teachers',{headers:{cookie}})).status,403);n++;
 }finally{await server.close();fs.rmSync(dir,{recursive:true,force:true});}
 console.log('TEACHER PORTAL TEST OK: '+n+' checks (admin parity, separate column rounding, current FX display, immutable source amounts, own-account scopes and recurring dates).');
})().catch(e=>{console.error(e);process.exit(1)});
