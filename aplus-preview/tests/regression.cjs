'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os');
const {createRuntime}=require(path.join(os.tmpdir(),'aplus-node-core.cjs'));
let n=0,rt;
const check=(condition,message)=>{assert.ok(condition,message);n++;};
const post=(p,b={})=>rt.dispatch('POST',p,{'content-type':'application/json','x-aplus-token':rt.server.token},JSON.stringify(b));
const get=p=>rt.dispatch('GET',p);
const json=r=>JSON.parse(r.text());
const login=(username,password='DevPreview-2026!')=>post('/api/auth/login',{username,password});
const logout=()=>post('/api/auth/logout');
const database=()=>rt.server.ctx.db;
const tables=()=>database().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
const fingerprint=()=>Object.fromEntries(tables().map(t=>[t,JSON.stringify(database().prepare('SELECT * FROM "'+t+'" ORDER BY rowid').all())]));
const validate=p=>post('/api/preview/backups/validate',p);
const restore=(v,extra={},persist=async()=>{})=>rt.restoreBackup({validationId:v.validationId,confirm:true,replace:'REPLACE',allowMigration:true,...extra},{'x-aplus-token':rt.server.token},persist);
(async()=>{
 rt=await createRuntime({locateFile:f=>path.resolve('node_modules/sql.js/dist',f),log:()=>{}});
 try{
  check(get('/api/preview/backups').status===401,'anonymous backup denied');
  for(const role of ['dev.student','dev.teacher','dev.coordinator','dev.accountant']){
   check(login(role).status===200,role+' login');
   check(get('/api/preview/backups').status===403,role+' backup listing denied');
   check(post('/api/preview/backups/export').status===403,role+' export denied');
   check(validate({}).status===403,role+' validate denied');logout();
  }
  check(login('dev.admin').status===200,'admin login');
  const student=database().prepare('SELECT id FROM students ORDER BY id LIMIT 1').get().id;
  const student2=database().prepare('SELECT id FROM students ORDER BY id LIMIT 1 OFFSET 1').get().id;
  check(post('/api/preview/accounts',{username:'dev.student2',display_name:'Second test student',student_id:student2,password:'SecondStudent-2026!',active:1}).status===200,'second scoped student created');
  const snapBefore=fingerprint();
  check(login('dev.student').status===200,'student sign in');
  check(get('/api/preview/student?student='+student2).status===403,'cross-student portal denied');
  check(get('/api/preview/student-statement?student='+student2).status===403,'cross-student statement denied');
  check(get('/api/state').status===403,'student cannot read broad staff data');
  const portal=json(get('/api/preview/student'));
  check(portal.student.id===student,'student identity comes from session');
  check(!JSON.stringify(portal).includes('password_hash'),'portal contains no password hash');
  check(get('/').text().includes('APLUS_STUDENT'),'original-style dedicated student page');logout();
  login('dev.teacher');const teacher=database().prepare('SELECT teacher_id FROM team_users WHERE username=?').get('dev.teacher').teacher_id;
  check(get('/api/preview/teacher-statement?teacher='+(teacher+9999)).status===403,'cross-teacher statement denied');
  const teacherReport=json(get('/api/preview/teacher-statement'));
  check(teacherReport.currency==='EGP','teacher statement currency EGP');logout();login('dev.admin');
  const studentReport=json(get('/api/preview/student-statement?student='+student));
  check(studentReport.currency==='KWD','student statement currency KWD');
  const exported=json(post('/api/preview/backups/export'));
  check(exported.ok&&exported.package.database.length>100,'full database exported');
  check(exported.package.manifest.tables.preview_student_accounts.rows===2,'portal accounts included');
  const originalHash=database().prepare("SELECT password_hash FROM team_users WHERE username='dev.admin'").get().password_hash;
  const beforeInvalid=fingerprint();
  check(validate({...exported.package,database:exported.package.database.slice(0,-8)}).status===422,'truncated package denied');
  check(validate({format:'sqlite',database:Buffer.from('not sqlite').toString('base64')}).status===422,'wrong file denied');
  check(validate({...exported.package,formatVersion:99}).status===422,'unknown package version denied');
  check(validate({...exported.package,sidecars:{config:{autoBackup:'invalid'}}}).status===422,'settings tampering denied');
  assert.deepEqual(fingerprint(),beforeInvalid);n++;
  let v=json(validate(exported.package));check(v.ok&&!v.needsMigration&&!v.needsAdmin,'current backup validated without activation');
  database().prepare("UPDATE students SET name=name||' changed' WHERE id=?").run(student);
  await assert.rejects(()=>restore(v),/changed since validation/);n++;
  database().prepare('UPDATE students SET name=? WHERE id=?').run(JSON.parse(snapBefore.students).find(s=>s.id===student).name,student);
  v=json(validate(exported.package));
  const beforeRestore=fingerprint();let persists=0;
  await assert.rejects(()=>restore(v,{},async()=>{if(++persists===2)throw Error('Simulated quota failure');}),/Simulated quota/);n++;
  assert.deepEqual(fingerprint(),beforeRestore);n++;
  check(json(get('/api/auth/status')).user?.role==='Admin','failed persistence restores previous login');
  v=json(validate(exported.package));
  const result=await restore(v);
  check(result.ok&&!!result.safetyPackage,'restore produces downloadable safety copy');
  check(rt.cookie()==='','restore signs out');
  check(database().prepare('SELECT count(*) n FROM user_sessions').get().n===0,'staff imported sessions invalidated');
  check(database().prepare('SELECT count(*) n FROM preview_student_sessions').get().n===0,'student imported sessions invalidated');
  check(database().prepare("SELECT password_hash FROM team_users WHERE username='dev.admin'").get().password_hash===originalHash,'password hashes preserved');
  check(login('dev.admin','wrong').status===401,'wrong password still denied');
  check(login('dev.admin').status===200,'original account signs in after restore');
  check(rt.imported(),'restored data marked imported');
  check(json(get('/api/preview/backups')).history.length===1,'restore history recorded');
  const after= fingerprint();
  for(const t of ['students','teachers','lessons','student_payments','teacher_payments','projects','course_enrollments','billing_installments','preview_student_accounts']){
   assert.equal(after[t],beforeRestore[t],t+' records unchanged');n++;
  }
  // Verify actual persistence/reboot, not just the current connection.
  const snapshot=rt.snapshot(),cookie=rt.cookie();await rt.stop();rt=await createRuntime({snapshot,cookie,locateFile:f=>path.resolve('node_modules/sql.js/dist',f),log:()=>{}});
  check(json(get('/api/auth/status')).user?.role==='Admin','account persists across runtime restart');
  check(database().prepare('SELECT count(*) n FROM preview_student_accounts').get().n===2,'no duplicate DEV seeding after import');
  const safety=json(post('/api/preview/backups/download',{name:result.safetyBackup}));
  check(safety.ok&&json(validate(safety.package)).ok,'downloaded safety copy can be validated');
  const legacy=require('./legacy-fixture.cjs')();
  try {
   const raw={format:'sqlite',database:legacy.bytes.toString('base64')};
   const oldValidation=json(validate(raw));
   check(oldValidation.ok&&oldValidation.sourceVersion===5&&oldValidation.needsMigration,'schema-5 backup staged and migration declared');
   check(oldValidation.needsAdmin&&oldValidation.missingExtensions,'legacy account provisioning and empty extensions declared');
   await assert.rejects(()=>restore(oldValidation,{allowMigration:false}),/Approve migration/);n++;
   await assert.rejects(()=>restore(oldValidation),/username|display name/i);n++;
   const legacyResult=await restore(oldValidation,{administrator:{username:'import.admin',display_name:'Imported administrator',password:'ImportOnly-2026!'}});
   check(legacyResult.ok,'legacy database restored with explicit administrator');
   check(database().prepare('SELECT count(*) n FROM preview_student_accounts').get().n===0,'no synthetic students added to imported legacy database');
   check(login('dev.admin').status===401,'DEV staff not seeded into legacy import');
   check(login('import.admin','ImportOnly-2026!').status===200,'explicit legacy administrator can sign in');
   const source=legacy.bytes;check(source.subarray(0,16).toString()==='SQLite format 3\0','legacy source bytes retained');
  } finally {legacy.cleanup();}
  console.log('PREVIEW REGRESSION OK: '+n+' checks');
 }finally{await rt.stop();}
})().catch(e=>{console.error(e);process.exitCode=1;});
