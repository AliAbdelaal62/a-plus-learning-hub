'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {migrate:imp}=require('../src/importer'),{open,migrate}=require('../src/db'),O=require('../src/operations'),S=require('../src/save'),B=require('../src/backup'),{assemble}=require('../src/state'),F=require('../src/finance'),{start}=require('../src/server');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aplus-ops-')),file=path.join(dir,'data/aplus.sqlite');
imp(JSON.stringify(require('../fixtures/synthetic-v5.json')),{mode:'apply',target:file});
let db=open(file);migrate(db);let checks=0;const check=(fn)=>{fn();checks++};const now=new Date('2026-11-01T10:00:00Z');
const write=(kind,record,rev=S.getRev(db))=>O.write(db,{kind,record,baseRev:rev},now);
const reject=(kind,record,code=422)=>assert.throws(()=>write(kind,record),e=>e instanceof O.OperationsError&&e.code===code);
const financialBefore=JSON.stringify(F.fin(assemble(db))),legacyBefore=JSON.stringify(assemble(db));
check(()=>{const r=O.read(db,now);assert.equal(r.today,'2026-11-01');assert.equal(r.registrations.length,0);assert.equal(r.attendance.length,0);assert.equal(r.summary.openTasks,0)});
const reg={student_id:103,teacher_id:100,subject_id:108,title:'Math weekly coaching',starts_on:'2026-11-01',ends_on:null,status:'Active',goal:'Exam preparation',billing_basis:'Package',agreed_price:120000,currency:'KWD',planned_sessions:8};
let registration;check(()=>{registration=write('registration',reg).record;assert.ok(registration.id);assert.equal(registration.agreed_price,120000)});
check(()=>reject('registration',{...reg,student_id:999999}));
check(()=>reject('registration',{...reg,ends_on:'2026-10-31'}));
check(()=>reject('registration',{...reg,teacher_id:101}));
check(()=>reject('registration',{...reg,agreed_price:12.5}));
check(()=>reject('registration',{...reg,currency:'ZZZ'}));
check(()=>reject('registration',{...reg,planned_sessions:1.5}));
check(()=>reject('registration',{...reg,title:'<img src=x onerror=alert(1)>'}));
check(()=>write('registration',{...reg,id:registration.id,status:'Paused'}));
check(()=>{write('attendance',{lesson_id:111,status:'Present',note:'On time'});assert.equal(O.read(db).attendance.length,1)});
check(()=>{write('attendance',{lesson_id:111,status:'Late',note:'10 minutes'});assert.equal(O.read(db).attendance.length,1);assert.equal(O.read(db).attendance[0].status,'Late')});
check(()=>reject('attendance',{lesson_id:999999,status:'Present',note:''}));
check(()=>{const cancelled=assemble(db).l.find(l=>l.st==='Cancelled');assert.ok(cancelled);reject('attendance',{lesson_id:cancelled.id,status:'Present',note:''})});
check(()=>{write('journal',{lesson_id:111,taught:'Linear equations',next_step:'Quadratic equations',homework:'Exercises 1-5'});assert.equal(O.read(db).journals[0].taught,'Linear equations')});
check(()=>assert.throws(()=>write('task',{title:'x',owner:'Admin',due_on:'2026-02-30',priority:'Normal',status:'Open'}),/date/));
let task;const taskInput={title:'Call student after absence',owner:'Coordinator',due_on:'2026-10-31',priority:'High',status:'Open',student_id:103,teacher_id:100,registration_id:registration.id,detail:'Arrange next session',result:''};
check(()=>{task=write('task',taskInput).record;assert.equal(O.read(db,now).summary.overdue,1)});
check(()=>reject('task',{...taskInput,status:'Done'}));
check(()=>reject('task',{...taskInput,student_id:104}));
check(()=>{write('task',{...taskInput,id:task.id,status:'Done',result:'Contacted; next lesson confirmed'});assert.equal(O.read(db,now).summary.openTasks,0)});
check(()=>{const rev=S.getRev(db);write('task',{...taskInput,title:'Second follow-up'});assert.throws(()=>write('task',taskInput,rev),e=>e.code===409)});
check(()=>{assert.equal(JSON.stringify(assemble(db)),legacyBefore);assert.equal(JSON.stringify(F.fin(assemble(db))),financialBefore)});
check(()=>{const state=assemble(db);state.rates.EGP={...state.rates.EGP,r:0.0065};S.applySave(db,{baseRev:S.getRev(db),state});assert.equal(O.read(db).registrations[0].currency,'KWD');assert.equal(assemble(db).rates.EGP.r,0.0065)});
check(()=>{assert.equal(S.impact(db,'s',103).dependants['service registrations'],1);assert.equal(S.impact(db,'l',111).dependants['attendance records'],1);const state=assemble(db);state.l=state.l.filter(l=>l.id!==111);assert.throws(()=>S.applySave(db,{baseRev:S.getRev(db),state}),e=>e.code===409)});
check(()=>{const before=O.read(db,now);db.exec("CREATE TRIGGER fail_operations_audit BEFORE INSERT ON audit_log WHEN NEW.entity LIKE 'operations-%' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");assert.throws(()=>write('task',taskInput),/audit unavailable/);assert.deepEqual(O.read(db,now),before);db.exec('DROP TRIGGER fail_operations_audit')});
check(()=>{const state=assemble(db);state.t[0].notes='Ordinary save after operations';const before=O.read(db,now);S.applySave(db,{baseRev:S.getRev(db),state});const after=O.read(db,now);assert.deepEqual(after.tasks,before.tasks);assert.deepEqual(after.registrations,before.registrations)});
const ctx={db,file,backupDir:path.join(dir,'backups')};
check(()=>{const original=O.read(db,now),backup=B.create(ctx,'operations');write('task',{...taskInput,title:'Should be rolled back by restore'});B.restore(ctx,backup.name);db=ctx.db;const restored=O.read(db,now);for(const key of ['registrations','attendance','journals','tasks'])assert.deepEqual(restored[key],original[key]);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok')});
db.close();
(async()=>{const server=await start({authRequired:false,port:0,dbFile:file,backupDir:path.join(dir,'backups'),clock:()=>now});
 try{
 const get=await fetch(server.url+'api/operations');const snapshot=await get.json();assert.equal(snapshot.ok,true);checks++;
 const payload={baseRev:snapshot.rev,kind:'task',record:{...taskInput,title:'HTTP follow-up'}};
 const forbidden=await fetch(server.url+'api/operations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});assert.equal(forbidden.status,403);checks++;
 const create=await fetch(server.url+'api/operations',{method:'POST',headers:{'content-type':'application/json','x-aplus-token':server.token},body:JSON.stringify(payload)});assert.equal(create.status,200,await create.text());checks++;
 const replay=await fetch(server.url+'api/operations',{method:'POST',headers:{'content-type':'application/json','x-aplus-token':server.token},body:JSON.stringify(payload)});assert.equal(replay.status,409);checks++;
 const exp=await fetch(server.url+'api/operations/export');assert.equal(exp.status,200);const exported=await exp.json();assert.equal(exported.format,'aplus-operations-export');assert.ok(exported.tasks.some(t=>t.title==='HTTP follow-up'));checks++;
 }finally{await server.close()}
 // Reopen exercises persistence after a real shutdown.
 const reopened=open(file);assert.ok(O.read(reopened,now).tasks.some(t=>t.title==='HTTP follow-up'));checks++;reopened.close();
 if(process.platform==='win32'){
  const missing=path.join(dir,'never-created.sqlite');
  const run=require('child_process').spawnSync(process.env.ComSpec||'cmd.exe',['/d','/c',path.join(__dirname,'..','start-aplus.cmd')],{encoding:'utf8',windowsHide:true,timeout:10000,env:{...process.env,APLUS_DB:missing,APLUS_NO_PAUSE:'1'}});
  assert.equal(run.status,13,run.stdout+run.stderr);assert.equal(fs.existsSync(missing),false);checks++;
 }
 console.log(`OPERATIONS TEST OK: ${checks} checks (administrative CRUD, invalid data, stale writes, unchanged financial history, protected links, audit rollback, backup/restore, HTTP authorization, export, persistence).`);
 fs.rmSync(dir,{recursive:true,force:true});
})().catch(e=>{console.error(e);process.exit(1)});
