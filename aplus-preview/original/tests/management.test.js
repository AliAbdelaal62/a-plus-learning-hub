'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {migrate:imp}=require('../src/importer'),{open}=require('../src/db'),{assemble}=require('../src/state'),S=require('../src/save'),O=require('../src/operations'),M=require('../src/management'),T=require('../src/team'),B=require('../src/backup'),L=require('../src/ledger-server'),F=require('../src/finance'),{start}=require('../src/server');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aplus-next-')),file=path.join(dir,'data/a.sqlite');imp(JSON.stringify(require('../fixtures/synthetic-v5.json')),{mode:'apply',target:file});let db=open(file),n=0;const now=new Date('2026-11-01T10:00:00Z'),admin={id:null,username:'test.admin',display_name:'Admin',role:'Admin'},coordinator={...admin,username:'test.coord',role:'Coordinator'},teacher={...admin,username:'test.teacher',role:'Teacher',teacher_id:100},accountant={...admin,username:'test.accounts',role:'Accountant'};
const check=fn=>{fn();n++},write=(kind,record,u=admin,rev=S.getRev(db))=>M.write(db,{kind,record,baseRev:rev},u,now).record,op=(kind,record)=>O.write(db,{kind,record,baseRev:S.getRev(db)},now,'test.admin').record;
const rejected=(kind,r,u=admin,code=422)=>assert.throws(()=>write(kind,r,u),e=>e instanceof M.ManagementError&&e.code===code);
const ava={teacher_id:100,weekday:0,starts_at:'09:00',ends_at:'17:00',active:1};let a,session;
check(()=>{a=write('availability',ava);assert.ok(a.id)});
check(()=>rejected('availability',{...ava,starts_at:'10:00'},admin));
check(()=>rejected('availability',{...ava,teacher_id:101},teacher,403));
const other=write('availability',{...ava,teacher_id:101});
check(()=>rejected('availability',{...ava,id:other.id},teacher,403));
const booking={teacher_id:100,student_id:103,subject_id:108,date:'2026-11-01',starts_at:'10:00',ends_at:'11:00',status:'Proposed',kind:'Lesson',note:''};
check(()=>{session=write('session',booking,coordinator);assert.equal(session.status,'Proposed')});
check(()=>rejected('session',{...booking,student_id:104,starts_at:'10:30',ends_at:'11:30'}));
check(()=>rejected('session',{...booking,starts_at:'08:00',ends_at:'09:00'}));
check(()=>rejected('session',booking,teacher,403));
check(()=>{const slots=M.suggestions(db,{student:103,subject:108,date:'2026-11-01',duration:60},admin);assert.ok(slots.length);assert.ok(!slots.some(s=>s.starts_at<'11:00'&&s.ends_at>'10:00'))});
check(()=>rejected('session',{...booking,id:session.id,status:'Completed',lesson_id:111}));
check(()=>{write('confirmation',{session_id:session.id,party:'Student'},coordinator);assert.equal(M.read(db,admin,now).confirmations.length,1);session=write('session',{...booking,id:session.id,starts_at:'11:00',ends_at:'12:00'});assert.equal(M.read(db,admin,now).confirmations.length,0)});
check(()=>rejected('confirmation',{session_id:session.id,party:'Student'},teacher));
check(()=>{session=write('session',{...session,status:'Cancelled'});const makeup=write('session',{...booking,kind:'Makeup',replaces_id:session.id,starts_at:'13:00',ends_at:'14:00'});assert.ok(makeup.id);rejected('session',{...booking,kind:'Makeup',replaces_id:session.id,starts_at:'14:00',ends_at:'15:00'})});
check(()=>{const w=write('waitlist',{student_id:103,subject_id:108,preferred_days:'Sunday',status:'Waiting',note:''},coordinator);assert.equal(w.status,'Waiting')});
// Recurring legacy timetable: Mondays 16:00–18:00 must block a new appointment too.
check(()=>{write('availability',{...ava,weekday:1});rejected('session',{...booking,date:'2026-11-02',starts_at:'16:00',ends_at:'17:00'})});
const reg=op('registration',{student_id:103,teacher_id:100,subject_id:108,title:'Package test',starts_on:'2026-11-01',status:'Active',goal:'Exam prep',billing_basis:'Package',agreed_price:100000,currency:'KWD',planned_sessions:3});
let contract,receipt,lesson;
const contractInput={registration_id:reg.id,total:100000,currency:'KWD',sessions:3,starts_on:'2026-11-01',ends_on:'2026-12-01'};
check(()=>{contract=write('contract',contractInput,accountant);assert.equal(contract.source_kind,'Live')});
check(()=>rejected('contract',contractInput));
check(()=>rejected('contract',contractInput,coordinator,403));
check(()=>{write('installment',{contract_id:contract.id,amount:40000,due_on:'2026-11-01',note:'First'});write('installment',{contract_id:contract.id,amount:60000,due_on:'2026-11-15',note:'Second'});rejected('installment',{contract_id:contract.id,amount:1,due_on:'2026-11-15'})});
const paidBefore=F.fin(assemble(db)).studentPaid,spBefore=db.prepare('SELECT count(*) n FROM student_payments').get().n;
check(()=>{receipt=write('receipt',{contract_id:contract.id,amount:40000,date:'2026-11-01',rx:1,method:'Cash'},accountant);assert.match(receipt.number,/AP-/);assert.equal(db.prepare('SELECT count(*) n FROM student_payments').get().n,spBefore+1);assert.equal(F.fin(assemble(db)).studentPaid,paidBefore+40000);const c=M.read(db,admin,now).contracts.find(c=>c.id===contract.id);assert.equal(c.received,40000);assert.equal(c.installments[0].remaining,0);assert.equal(c.installments[1].remaining,60000)});
check(()=>rejected('receipt',{contract_id:contract.id,amount:60001,date:'2026-11-01',rx:1,method:'Cash'}));
const deliver={contract_id:contract.id,date:'2026-11-01',hours:1,teacher_cost:10000,teacher_currency:'KWD',teacher_rx:1,student_rx:1};
check(()=>{const before=F.fin(assemble(db)).charged;lesson=write('package-lesson',deliver,accountant);assert.equal(lesson.charge,33333);assert.equal(F.fin(assemble(db)).charged,before+33333);assert.equal(M.read(db,admin).contracts.find(c=>c.id===contract.id).remaining_sessions,2)});
check(()=>{const l2=write('package-lesson',{...deliver,date:'2026-11-01'}),l3=write('package-lesson',{...deliver,date:'2026-11-01'});assert.equal(lesson.charge+l2.charge+l3.charge,100000);rejected('package-lesson',{...deliver,date:'2026-11-04'})});
check(()=>{const balanceBefore=F.SS(assemble(db),103).rem;write('refund',{contract_id:contract.id,receipt_id:receipt.id,amount:10000,date:'2026-11-01',reason:'Student requested partial refund'},accountant);assert.equal(M.read(db,admin).contracts.find(c=>c.id===contract.id).received,30000);assert.equal(F.SS(assemble(db),103).rem,balanceBefore+10000);const rows=L.forState(assemble(db)).studentRows(assemble(db),{only:103});assert.ok(rows.find(r=>r.cur==='KWD').refunded>=10000)});
check(()=>rejected('refund',{contract_id:contract.id,receipt_id:receipt.id,amount:30001,date:'2026-11-01',reason:'Too much'}));
check(()=>{const reference=db.prepare("SELECT * FROM billing_receipts WHERE id=?").get(receipt.id);assert.throws(()=>db.prepare('DELETE FROM student_payments WHERE id=?').run(reference.payment_id),/cannot be deleted/)});
// Existing-project agreement collects into the original project-payment ledger exactly once.
const p=assemble(db).pr.find(p=>p.s&&p.status!=='Cancelled'),preg=op('registration',{student_id:p.s,teacher_id:p.t,subject_id:p.subj,title:'Project plan',starts_on:'2026-11-01',status:'Active',goal:'Deliver project',billing_basis:'Project'});
check(()=>{const c=write('contract',{registration_id:preg.id,total:p.rev,currency:p.cur,sessions:1,starts_on:'2026-11-01',target_id:p.id});const before=db.prepare('SELECT count(*) n FROM project_payments').get().n;write('receipt',{contract_id:c.id,amount:100,date:'2026-11-01',rx:1,method:'Cash'});assert.equal(db.prepare('SELECT count(*) n FROM project_payments').get().n,before+1)});
let stage;
check(()=>{stage=write('stage',{project_id:p.id,title:'First draft',owner:'Project teacher',due_on:'2026-11-02',status:'Review',url:'https://example.com/draft',note:''},coordinator);assert.ok(stage.id)});
check(()=>rejected('stage',{...stage,url:'javascript:alert(1)'},admin));
check(()=>{write('revision',{stage_id:stage.id,description:'Revise chapter one',due_on:'2026-11-03',status:'Open'},coordinator);rejected('stage',{...stage,status:'Approved'},coordinator)});
check(()=>{const revision=M.read(db,admin).revisions[0];write('revision',{...revision,status:'Done'},coordinator);stage=write('stage',{...stage,status:'Approved'},coordinator);assert.equal(stage.status,'Approved')});
const en=assemble(db).re[0],course=assemble(db).rc.find(c=>c.id===en.rc);
check(()=>{const d=write('delivery',{enrollment_id:en.id,title:'Lecture 1',planned_on:'2026-11-01',delivered_on:'2026-11-01',status:'Sent',url:'https://example.com/lecture',note:''},coordinator);assert.equal(d.status,'Sent')});
check(()=>rejected('delivery',{enrollment_id:en.id,title:'Missing actual date',planned_on:'2026-11-01',status:'Sent',url:'',note:''}));
check(()=>{const a=M.read(db,accountant);assert.equal(a.contracts.length,2);const t=M.read(db,teacher);assert.equal(t.receipts.length,0);assert.ok(t.availability.every(a=>a.teacher_id===100))});
check(()=>{const rev=S.getRev(db);write('waitlist',{student_id:103,subject_id:108,status:'Waiting'});assert.throws(()=>write('waitlist',{student_id:103,subject_id:108,status:'Waiting'},admin,rev),e=>e.code===409)});
check(()=>{const before=M.read(db,admin,now);db.exec("CREATE TRIGGER fail_mgmt_audit BEFORE INSERT ON audit_log WHEN NEW.entity LIKE 'management-%' BEGIN SELECT RAISE(ABORT,'audit failed'); END");assert.throws(()=>write('waitlist',{student_id:103,subject_id:108,status:'Waiting'}),/audit failed/);assert.deepEqual(M.read(db,admin,now),before);db.exec('DROP TRIGGER fail_mgmt_audit')});
const ctx={db,file,backupDir:path.join(dir,'backups')};check(()=>{const before=M.read(db,admin,now),b=B.create(ctx,'management');write('waitlist',{student_id:103,subject_id:108,status:'Waiting'});B.restore(ctx,b.name);db=ctx.db;const after=M.read(db,admin,now);for(const key of ['contracts','receipts','availability','sessions','stages','deliveries','waitlist'])assert.deepEqual(after[key],before[key])});

check(()=>{const ref=db.prepare('SELECT payment_id FROM billing_receipts WHERE id=?').get(receipt.id),st=assemble(db);st.sp.find(p=>p.id===ref.payment_id).notes='Corrected receipt note';S.applySave(db,{baseRev:S.getRev(db),state:st});assert.equal(assemble(db).sp.find(p=>p.id===ref.payment_id).notes,'Corrected receipt note')});
check(()=>{const st=assemble(db),ref=db.prepare('SELECT payment_id FROM billing_receipts WHERE id=?').get(receipt.id);st.al.push({id:st.id++,sp:ref.payment_id,wt:'Project',amt:1000,date:'2026-11-01',reason:'Wrong category'});assert.throws(()=>S.applySave(db,{baseRev:S.getRev(db),state:st}),e=>e.code===422)});
check(()=>{const st=assemble(db),ref=db.prepare('SELECT payment_id FROM billing_receipts WHERE id=?').get(receipt.id);st.sp.find(p=>p.id===ref.payment_id).amt+=100;st.sp.find(p=>p.id===ref.payment_id).bamt+=100;assert.throws(()=>S.applySave(db,{baseRev:S.getRev(db),state:st}),/immutable/)});
check(()=>{assert.throws(()=>op('registration',{...reg,student_id:104}),e=>e.code===422)});
check(()=>{assert.throws(()=>write('availability',{...ava,id:a.id,active:0}),e=>e.code===422)});
check(()=>{const cstate=assemble(db),e=cstate.re.find(e=>e.price>e.paid),c=cstate.rc.find(c=>c.id===e.rc),r=op('registration',{student_id:e.s,teacher_id:c.inst,subject_id:c.subj,title:'Recorded collection plan',starts_on:'2026-11-01',status:'Active',billing_basis:'Course'}),contract=write('contract',{registration_id:r.id,total:e.price,currency:c.cur,sessions:1,starts_on:'2026-11-01',target_id:e.id});const beforePaid=e.paid,beforeCount=cstate.cp.length;write('receipt',{contract_id:contract.id,amount:100,date:'2026-11-01',rx:c.cur==='KWD'?1:c.rx,method:'Cash'});const after=assemble(db);assert.equal(after.cp.length,beforeCount+1);assert.equal(after.re.find(x=>x.id===e.id).paid,beforePaid+100)});
check(()=>{const data=M.read(db,teacher);assert.ok(data.teacherStatement.every(r=>r.t===100));assert.equal(data.receipts.length,0);const accountData=M.read(db,accountant);assert.equal(accountData.stages.length,0);assert.equal(accountData.deliveries.length,0);assert.equal(accountData.sessions.length,0)});


check(()=>rejected('receipt',{contract_id:contract.id,amount:40000,date:'2026-11-01',rx:1,method:'Cash'}));
check(()=>{write('receipt',{contract_id:contract.id,amount:40000,date:'2026-11-01',rx:1,method:'Cash',duplicate_reason:'Separate second installment paid in cash'});assert.equal(M.read(db,admin).contracts.find(c=>c.id===contract.id).received,70000)});
check(()=>{const reg=op('registration',{student_id:103,teacher_id:100,subject_id:108,title:'Precision test package',starts_on:'2026-11-01',status:'Active',billing_basis:'Package'}),c=write('contract',{registration_id:reg.id,total:1000,currency:'KWD',sessions:1,starts_on:'2026-11-01'});rejected('package-lesson',{contract_id:c.id,date:'2026-11-01',hours:1,teacher_cost:1000000000000,teacher_currency:'USD',teacher_rx:10000000,student_rx:1})});


check(()=>{const old=assemble(db).sp.find(p=>p.p===103&&p.cur==='KWD'),before=F.fin(assemble(db)).studentPaid,count=db.prepare('SELECT count(*) n FROM student_payments').get().n;const applied=write('link-receipt',{contract_id:contract.id,payment_id:old.id,reason:'Student requested applying this receipt to the package'});assert.match(applied.number,/AL-/);assert.equal(F.fin(assemble(db)).studentPaid,before);assert.equal(db.prepare('SELECT count(*) n FROM student_payments').get().n,count);assert.equal(M.read(db,admin).contracts.find(c=>c.id===contract.id).received,90000);rejected('link-receipt',{contract_id:contract.id,payment_id:old.id,reason:'Duplicate link'})});
check(()=>{write('contract',{id:contract.id,status:'Completed'});write('receipt',{contract_id:contract.id,amount:1000,date:'2026-11-01',rx:1,method:'KNET'});assert.equal(M.read(db,admin).contracts.find(c=>c.id===contract.id).received,91000)});

// Authentication, server-enforced authorization and per-teacher data isolation.
const auth=T.service(db,{setupCode:'setup-code-for-tests',clock:()=>now});let adminUser;
check(()=>{assert.throws(()=>auth.setup({setupCode:'bad'}),e=>e.code===403);adminUser=auth.setup({setupCode:'setup-code-for-tests',username:'admin.test',display_name:'Administrator',password:'Admin-Test-Password-2026'});assert.equal(adminUser.role,'Admin')});
let teacherUser,coordUser,accountUser;
check(()=>{teacherUser=auth.update({username:'teacher.test',display_name:'Teacher',role:'Teacher',teacher_id:100,password:'Teacher-Test-Password-2026'},adminUser);coordUser=auth.update({username:'coord.test',display_name:'Coordinator',role:'Coordinator',password:'Coord-Test-Password-2026'},adminUser);accountUser=auth.update({username:'accounts.test',display_name:'Accounts',role:'Accountant',password:'Accounts-Test-Password-2026'},adminUser);assert.ok(auth.users().every(u=>!('password_hash' in u)))});
check(()=>assert.throws(()=>auth.update({...adminUser,active:0},adminUser),e=>e.code===409));
check(()=>{assert.throws(()=>auth.login({username:'teacher.test',password:'wrong'}),e=>e.code===401);const login=auth.login({username:'teacher.test',password:'Teacher-Test-Password-2026'});assert.match(login.cookie,/HttpOnly/);assert.match(login.cookie,/SameSite=Strict/);assert.equal(auth.current({headers:{cookie:login.cookie}}).id,teacherUser.id);auth.update({...teacherUser,active:0},adminUser);assert.equal(auth.current({headers:{cookie:login.cookie}}),null);auth.update({...teacherUser,active:1},adminUser)});
db.close();
(async()=>{const server=await start({port:0,dbFile:file,backupDir:path.join(dir,'backups'),clock:()=>now,authRequired:true});try{
 const request=(p,method='GET',body,cookie)=>fetch(server.url+p,{method,headers:{...(body?{'content-type':'application/json','x-aplus-token':server.token}:{}),...(cookie?{cookie}: {})},body:body?JSON.stringify(body):undefined});
 assert.equal((await request('api/state')).status,401);n++;
 const page=await request('');assert.match(await page.text(),/Team sign in/);n++;
 const login=async(username,password)=>{const r=await request('api/auth/login','POST',{username,password});assert.equal(r.status,200,await r.clone().text());return r.headers.get('set-cookie')};
 const tc=await login('teacher.test','Teacher-Test-Password-2026'),cc=await login('coord.test','Coord-Test-Password-2026'),ac=await login('accounts.test','Accounts-Test-Password-2026'),ad=await login('admin.test','Admin-Test-Password-2026');
 const ts=await request('api/state','GET',null,tc).then(r=>r.json());assert.ok(ts.state.l.every(l=>l.t===100));assert.equal(ts.state.sp.length,0);assert.ok(ts.state.l.every(l=>l.bchg===0));n++;
 assert.equal((await request('api/ledger/students','GET',null,tc)).status,403);assert.equal((await request('api/export','GET',null,tc)).status,403);n++;
 assert.equal((await request('api/team/users','GET',null,cc)).status,403);assert.equal((await request('api/backups','GET',null,ac)).status,403);n++;
 const coordinatorOps=await request('api/operations','GET',null,cc).then(r=>r.json());assert.ok(coordinatorOps.registrations.every(r=>r.agreed_price===null));n++;
 const teacherOps=await request('api/operations','GET',null,tc).then(r=>r.json());assert.ok(teacherOps.registrations.every(r=>r.teacher_id===100));n++;
 const finance=await request('api/management','GET',null,ac).then(r=>r.json());assert.ok(finance.contracts.some(c=>c.total===100000));n++;
 const tamper=await request('api/operations','POST',{baseRev:ts.rev,kind:'attendance',record:{lesson_id:113,status:'Present',note:''}},tc);assert.equal(tamper.status,403);n++;
 const current=await request('api/state','GET',null,cc).then(r=>r.json());assert.equal((await request('api/save','POST',{baseRev:current.rev,state:current.state},cc)).status,403);n++;
 const acctState=await request('api/state','GET',null,ac).then(r=>r.json());acctState.state.t[0].rate=999999;assert.equal((await request('api/save','POST',{baseRev:acctState.rev,state:acctState.state},ac)).status,403);n++;
 const allowed=await request('api/state','GET',null,ac).then(r=>r.json());allowed.state.sp.push({id:allowed.state.id++,p:103,date:'2026-11-01',cur:'KWD',amt:1234,rx:1,rt:'Same',bamt:1234,bc:'KWD',fxs:'identity',meth:'Cash',notes:'Accountant positive authorization check'});const allowedResponse=await request('api/save','POST',{baseRev:allowed.rev,state:allowed.state},ac);assert.equal(allowedResponse.status,200,await allowedResponse.clone().text());n++;
 const users=await request('api/team/users','GET',null,ad).then(r=>r.json());assert.equal(users.users.length,4);assert.ok(users.users.every(u=>!('password_hash' in u)));n++;
 const backupResponse=await request('api/backups','POST',{label:'auth-restore-test'},ad);assert.equal(backupResponse.status,200);const backupName=(await backupResponse.json()).backup.name;const restored=await request('api/restore','POST',{name:backupName,confirm:true},ad);assert.equal(restored.status,200,await restored.clone().text());assert.equal((await request('api/state','GET',null,ad)).status,200);n++;
 assert.equal((await request('api/auth/logout','POST',{},tc)).status,200);assert.equal((await request('api/state','GET',null,tc)).status,401);n++;
 }finally{await server.close()}
 console.log(`MANAGEMENT TEST OK: ${n} checks (availability/conflicts/makeup/confirmation, native receipts/refunds, exact package pricing, installments, delivery approval, audit rollback, restore, authentication and role isolation).`);fs.rmSync(dir,{recursive:true,force:true});
})().catch(e=>{console.error(e);process.exit(1)});
