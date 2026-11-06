'use strict';
// Full-file transfers for the browser preview. Never touches the local academy server.
const fs = require('../runtime/shims/fs');
const crypto = require('../runtime/shims/crypto');
const {open, migrate, SCHEMA_VERSION} = require('../original/src/db');
const B = require('../original/src/backup');
const TEAM = require('../original/src/team');
const AUDIT = require('../original/src/audit');
const {assemble} = require('../original/src/state');
const {forState} = require('../original/src/ledger-server');
const {response} = require('./service');
const MAX = 16 * 1024 * 1024;
const FORMAT = 'aplus-full-database';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const uid = () => crypto.randomBytes(16).toString('hex');
const fail = (status, message) => { throw Object.assign(new Error(message), {code: status}); };
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const admin = u => { if (!u || u.role !== 'Admin') fail(u ? 403 : 401, 'Administrator access required.'); };

function install(getCtx, schema, {actor, token, clock = () => new Date()} = {}) {
  let staged = null;
  const ctx = () => getCtx();
  const fingerprint = () => sha(JSON.stringify(B.fingerprint(ctx().db)));
  const has = (db,t) => !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t);
  const activeAdmins = db => has(db,'team_users') ? db.prepare("SELECT id,username FROM team_users WHERE role='Admin' AND active=1").all() : [];
  const check = db => {
    if (db.prepare('PRAGMA integrity_check').all().some(r => r.integrity_check !== 'ok') || db.prepare('PRAGMA foreign_key_check').all().length)
      fail(422, 'Database integrity or foreign-key verification failed.');
  };
  const summary = db => {
    const st=assemble(db), ledger=forState(st);
    return {counts:Object.fromEntries(Object.entries(B.fingerprint(db)).map(([name,table])=>[name,table.rows])),schemaVersion:db.prepare('SELECT max(version) v FROM schema_migrations').get().v,
      currencies:ledger.studentRows(st).map(r=>({student:r.s, currency:r.cur, charged:r.charged.total, received:r.received.total, net:r.net})),
      teachers:ledger.teacherRows(st).map(r=>({teacher:r.t,currency:r.cur,earned:r.earned.total,paid:r.paid.total,remaining:r.remaining.total})),
      accounts:has(db,'team_users')?db.prepare('SELECT role,count(*) count FROM team_users GROUP BY role').all():[],
      studentAccounts:has(db,'preview_student_accounts')?db.prepare('SELECT count(*) n FROM preview_student_accounts').get().n:0};
  };
  const historyPath = () => ctx().backupDir+'/transfer-history.json';
  const history = () => {try{return JSON.parse(fs.readFileSync(historyPath(),'utf8'));}catch(_){return [];}};
  const recordHistory = event => fs.writeFileSync(historyPath(),JSON.stringify([...history(),event]));
  const captureSidecars = file => {
    const configFile=ctx().file+'.config.json',sidecars={};
    if(fs.existsSync(configFile))sidecars.config=JSON.parse(fs.readFileSync(configFile,'utf8'));
    sidecars.transferHistory=history();
    fs.writeFileSync(file+'.sidecars.json',JSON.stringify(sidecars));
    return sidecars;
  };
  function packageFile(file, manifest) {
    const sidecars=fs.existsSync(file+'.sidecars.json')?JSON.parse(fs.readFileSync(file+'.sidecars.json','utf8')):{};
    return {format:FORMAT,formatVersion:1,manifest:{...manifest,applicationVersion:'3.0.0',extensionVersion:1,sidecarsSha256:sha(JSON.stringify(sidecars)),externalFilesIncluded:false,
      exclusions:['External attachments are links, not embedded files.','Older backup files and server deployment secrets are not included.','Browser UI preferences and active sessions are not portable login credentials.']},
      database:fs.readFileSync(file).toString('base64'),sidecars};
  }
  function exportFull(u) {
    admin(u);
    const manifest=B.create(ctx(),'transfer',{noAudit:true}), file=ctx().backupDir+'/'+manifest.name;
    captureSidecars(file);
    const data=packageFile(file,manifest);
    if(fs.statSync(file).size>MAX)fail(413,'Database exceeds the 16 MiB preview transfer limit. Use server-backed migration tools.');
    AUDIT.log(ctx().db,{actor:u.username,action:'export',entity:'preview-database',detail:manifest.name,after:{sha256:manifest.sha256}});
    return {ok:true,filename:manifest.name.replace('.sqlite','.aplus-backup.json'),package:data};
  }
  function validate(u,input) {
    admin(u);
    if(staged){try{fs.rmSync(staged.file,{force:true});}catch(_){} staged=null;}
    let bytes, manifest=null, sidecars={};
    if(input.format===FORMAT){
      if(input.formatVersion!==1)fail(422,'Unsupported backup package version.');
      if(typeof input.database!=='string'||input.database.length>Math.ceil(MAX/3)*4)fail(413,'Backup exceeds the preview limit.');
      if(!/^[A-Za-z0-9+/]*={0,2}$/.test(input.database)||input.database.length%4)fail(422,'Invalid database encoding.');
      bytes=Buffer.from(input.database,'base64'); manifest=input.manifest; sidecars=input.sidecars||{};
      if(!manifest||manifest.bytes!==bytes.length||manifest.sha256!==sha(bytes))fail(422,'Backup checksum or size mismatch. Nothing was changed.');
      if(manifest.extensionVersion!==1)fail(422,'Unsupported preview extension version.');
      if(Object.keys(sidecars).some(k=>!['config','transferHistory'].includes(k)))fail(422,'Unknown backup sidecar.');
      if(manifest.sidecarsSha256!==sha(JSON.stringify(sidecars)))fail(422,'Backup settings checksum mismatch.');
      if(sidecars.config&&require('../original/src/config').validate(sidecars.config).length)fail(422,'Invalid backup configuration.');
      if(sidecars.transferHistory&&(!Array.isArray(sidecars.transferHistory)||sidecars.transferHistory.length>10000))fail(422,'Invalid transfer history.');
    } else if(input.format==='sqlite'&&typeof input.database==='string'){
      if(input.database.length>Math.ceil(MAX/3)*4)fail(413,'Backup exceeds the preview limit.');
      bytes=Buffer.from(input.database,'base64');
    } else fail(422,'Choose a full A+ Hub backup package or a SQLite backup, not a JSON state export or ZIP archive.');
    if(!bytes.length||bytes.length>MAX||bytes.subarray(0,16).toString('latin1')!=='SQLite format 3\0')fail(422,'Not a supported SQLite database.');
    const file='/tmp/aplus-import-'+uid()+'.sqlite'; fs.writeFileSync(file,bytes);
    let d;
    try {
      // Validate an isolated copy; source bytes are retained intact until confirmation.
      const v=B.validate(file,{expectTables:manifest?.tables});
      if(!v.ok)fail(422,'Backup validation failed: '+v.problems.join('; '));
      d=open(file); check(d);
      // Portable backups contain data, not executable code. Only shipped migrations run.
      const sourceTables=B.fingerprint(d),sourceVersion=d.prepare('SELECT max(version) v FROM schema_migrations').get().v;
      if(sourceVersion>SCHEMA_VERSION)fail(422,'This backup needs a newer application version.');
      const missingExtensions=!has(d,'preview_student_accounts');
      migrate(d);d.exec(schema);check(d);
      const incoming=summary(d),needsAdmin=activeAdmins(d).length===0;
      // An unusable hash is not an administrator recovery mechanism.
      const invalid=has(d,'team_users')?d.prepare('SELECT password_hash FROM team_users').all().some(a=>!/^([a-f0-9]{32}):([a-f0-9]{128})$/i.test(a.password_hash)):false;
      if(invalid)fail(422,'An imported staff password hash is invalid.');
      const missingLink=d.prepare('SELECT a.id FROM preview_student_accounts a LEFT JOIN students s ON s.id=a.student_id WHERE s.id IS NULL').all();
      if(missingLink.length)fail(422,'Student account links are invalid.');
      if(d.prepare("SELECT u.id FROM team_users u LEFT JOIN teachers t ON t.id=u.teacher_id WHERE u.role='Teacher' AND t.id IS NULL").all().length)fail(422,'Teacher account links are invalid.');
      if(d.prepare('SELECT a.id FROM preview_student_accounts a JOIN team_users u ON u.username=a.username').all().length)fail(422,'Staff and student usernames must be distinct.');
      if(d.prepare('SELECT password_hash FROM preview_student_accounts').all().some(a=>!/^([a-f0-9]{32}):([a-f0-9]{128})$/i.test(a.password_hash)))fail(422,'An imported student password hash is invalid.');
      staged={file,checksum:sha(bytes),input,validationId:uid(),baseline:fingerprint(),until:clock().getTime()+600000,actor:u.username,sourceTables,sourceVersion,summary:incoming,sidecars,needsAdmin};
      return {ok:true,validationId:staged.validationId,checksum:staged.checksum,sourceVersion,targetVersion:SCHEMA_VERSION,needsMigration:sourceVersion<SCHEMA_VERSION,needsAdmin,
        missingExtensions,sourceTables,current:summary(ctx().db),incoming,warnings:[
          'REPLACE: this replaces the current browser database; no merge is performed.',
          'This preview stores data in this browser only. Other devices will not receive it.',
          'All imported sessions will be invalidated. Existing account passwords will be preserved.',
          ...(missingExtensions?['New portal tables are added empty. No DEV records will be added.']:[]),
          ...(sidecars.config?['Machine-specific backup-directory settings are excluded from browser activation.']:[])]};
    } catch(e){fs.rmSync(file,{force:true});throw e;} finally {if(d)d.close();}
  }
  function prepare(u,r) {
    admin(u);
    if(!staged||r.validationId!==staged.validationId||staged.actor!==u.username||staged.until<clock().getTime())fail(409,'Validation expired. Validate the backup again.');
    if(r.confirm!==true||r.replace!=='REPLACE')fail(422,'Explicit replacement confirmation is required.');
    if(staged.sourceVersion<SCHEMA_VERSION&&r.allowMigration!==true)fail(422,'Approve migration of the staging copy before continuing.');
    if(fingerprint()!==staged.baseline)fail(409,'Current data changed since validation. Validate again before replacing it.');
    let d=open(staged.file);
    try {
      if(staged.needsAdmin){
        const a=r.administrator||{};
        TEAM.createUser(d,{username:a.username,display_name:a.display_name,password:a.password,role:'Admin',active:1},u.username);
      }
      if(!activeAdmins(d).length)fail(422,'The restored database needs an active administrator.');
      // Disallow demo seeding after a real import, including imports of older schemas.
      d.prepare("INSERT OR REPLACE INTO preview_meta VALUES('student-demo-v1','1')").run();
      d.prepare("INSERT OR REPLACE INTO preview_meta VALUES('imported-database','1')").run();
      d.exec('DELETE FROM user_sessions; DELETE FROM preview_student_sessions;');
      d.prepare("DELETE FROM preview_meta WHERE key LIKE 'login:%'").run();
      check(d);
      const current=summary(d);
      if(!same(current.currencies,staged.summary.currencies)||!same(current.teachers,staged.summary.teachers))fail(422,'Financial verification failed.');
    } finally {d.close();}
    const safety=B.create(ctx(),'preimport',{noAudit:true});
    captureSidecars(ctx().backupDir+'/'+safety.name);
    const safetyPackage=packageFile(ctx().backupDir+'/'+safety.name,safety);
    return {stage:staged,safety,safetyPackage,u};
  }
  function replace(prepared) {
    const {stage,safety,u}=prepared,live=ctx().file,hold='/tmp/aplus-hold-'+uid()+'.sqlite';
    if(stage!==staged)fail(409,'Staging data changed.');
    ctx().db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    fs.copyFileSync(live,hold);
    const configFile=live+'.config.json',oldConfig=fs.existsSync(configFile)?fs.readFileSync(configFile):null;
    const oldHistory=fs.existsSync(historyPath())?fs.readFileSync(historyPath()):null;
    let switched=false;
    const undo=()=>{
      try{ctx().db.close();}catch(_){}
      for(const suffix of ['-wal','-shm'])fs.rmSync(live+suffix,{force:true});
      fs.copyFileSync(hold,live);ctx().db=open(live);
      if(oldConfig)fs.writeFileSync(configFile,oldConfig);else fs.rmSync(configFile,{force:true});
      if(oldHistory)fs.writeFileSync(historyPath(),oldHistory);else fs.rmSync(historyPath(),{force:true});
    };
    try {
      ctx().db.close();
      for(const suffix of ['-wal','-shm'])fs.rmSync(live+suffix,{force:true});
      fs.copyFileSync(stage.file,live);ctx().db=open(live);switched=true;check(ctx().db);
      // Preserve portable settings, but never activate source-computer absolute paths.
      if(stage.sidecars.config){const config={...stage.sidecars.config};delete config.secondBackupDir;fs.writeFileSync(configFile,JSON.stringify(config));}
      else fs.rmSync(configFile,{force:true});
      const event={at:clock().toISOString(),actor:u.username,action:'restore',checksum:stage.checksum,sourceVersion:stage.sourceVersion,targetVersion:SCHEMA_VERSION,safetyBackup:safety.name};
      AUDIT.log(ctx().db,{actor:u.username,action:'restore',entity:'preview-database',detail:'Validated full database replacement',after:event});
      fs.writeFileSync(historyPath(),JSON.stringify(stage.sidecars.transferHistory||[]));
      recordHistory(event);
    } catch(e){try{undo();}catch(rollback){e.message+='; rollback failed: '+rollback.message;}throw e;}
    return {rollback:()=>{if(switched){undo();switched=false;}},commit:()=>{staged=null;for(const file of [hold,stage.file])try{fs.rmSync(file,{force:true});}catch(_){}},
      result:{ok:true,safetyBackup:safety.name,checksum:stage.checksum,signInRequired:true}};
  }
  function handler(method,path,headers,body) {
    if(!path.startsWith('/api/preview/backups'))return null;
    try{
      const u=actor(headers);admin(u);
      if(method==='GET'&&path==='/api/preview/backups')return response({ok:true,history:history(),backups:B.list(ctx()),limitBytes:MAX});
      if(method!=='POST')fail(405,'Method not allowed.');
      if(headers['x-aplus-token']!==token||!/^application\/json/.test(headers['content-type']||''))fail(403,'Reload before transferring data.');
      if(typeof body==='string'&&body.length>24*1024*1024)fail(413,'Backup package is too large.');
      const r=typeof body==='string'?JSON.parse(body):{};
      if(path==='/api/preview/backups/export')return response(exportFull(u));
      if(path==='/api/preview/backups/validate')return response(validate(u,r));
      if(path==='/api/preview/backups/download'){
        if(!B.NAME.test(r.name))fail(422,'Invalid backup name.');
        const f=ctx().backupDir+'/'+r.name;if(!fs.existsSync(f))fail(404,'Backup not found.');
        const v=B.validate(f);if(!v.ok)fail(422,'Backup failed verification.');
        const manifest=fs.existsSync(f+'.json')?JSON.parse(fs.readFileSync(f+'.json','utf8')):{sha256:sha(fs.readFileSync(f)),bytes:fs.statSync(f).size,tables:v.tables,schemaVersion:v.schemaVersion};
        return response({ok:true,filename:r.name.replace('.sqlite','.aplus-backup.json'),package:packageFile(f,manifest)});
      }
      fail(404,'Unknown database transfer operation.');
    }catch(e){return response({ok:false,error:e.message},Number.isInteger(e.code)?e.code:422);}
  }
  return {handler,prepare,replace,history};
}
module.exports={install,MAX,FORMAT};
