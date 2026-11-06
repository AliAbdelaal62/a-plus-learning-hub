'use strict';
const { tx } = require('./db');
const { isDate, plain } = require('./rules');
const audit = require('./audit');
const cairo = require('./cairo');
const tables = { registration:'service_registrations', attendance:'lesson_attendance', journal:'lesson_journals', task:'followup_tasks' };
class OperationsError extends Error { constructor(code,message){super(message);this.code=code;} }
const bad = message => {throw new OperationsError(422,message);};
function read(db,now=new Date()) {
 const rows=table=>db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
 const registrations=rows(tables.registration),attendance=rows(tables.attendance),journals=rows(tables.journal),tasks=rows(tables.task);
 const today=cairo.today(now),open=tasks.filter(t=>!['Done','Cancelled'].includes(t.status));
 return {rev:require('./save').getRev(db),today,timezone:cairo.TZ,registrations,attendance,journals,tasks,
 summary:{activeRegistrations:registrations.filter(r=>r.status==='Active').length,overdue:open.filter(t=>t.due_on<today).length,dueToday:open.filter(t=>t.due_on===today).length,openTasks:open.length}};
}
function write(db,input,now=new Date(),actor='local') {
 if(!input||!Number.isInteger(input.baseRev)||!tables[input.kind]||!input.record||typeof input.record!=='object'||Array.isArray(input.record))throw new OperationsError(400,'A valid record, kind and baseRev are required.');
 return tx(db,()=>{
  const rev=require('./save').getRev(db);
  if(input.baseRev!==rev)throw new OperationsError(409,'The data changed in another tab. Refresh this page before saving.');
  const r=input.record,kind=input.kind,table=tables[kind],at=now.toISOString();
  const text=(k,max=200,required=false)=>{const v=r[k]??'';if(typeof v!=='string'||!plain(v,max)||(required&&!v.trim()))bad(`${k}: enter valid plain text${required?' (required)':''}.`);return v.trim();};
  const choice=(k,list)=>{if(!list.includes(r[k]))bad(`${k}: choose one of ${list.join(', ')}.`);return r[k];};
  const date=(k,required=false)=>{const v=r[k];if(!v&&!required)return null;if(!isDate(v))bad(`${k}: enter a valid date.`);return v;};
  const ref=(key,target,required=false)=>{const v=r[key];if((v===null||v===undefined||v==='')&&!required)return null;if(!Number.isInteger(v)||v<=0||!db.prepare(`SELECT id FROM ${target} WHERE id=?`).get(v))bad(`${key}: the selected record does not exist.`);return v;};
  const rowKey=kind==='attendance'||kind==='journal'?'lesson_id':'id';
  let id=r[rowKey];if(id!==undefined&&(!Number.isInteger(id)||id<=0))bad('Invalid record identifier.');
  let before=id?db.prepare(`SELECT * FROM ${table} WHERE ${rowKey}=?`).get(id):null;
  if(id&&!before&&rowKey==='id')throw new OperationsError(404,'This record no longer exists.');
  let data;
  if(kind==='registration'){
   data={student_id:ref('student_id','students',true),teacher_id:ref('teacher_id','teachers'),subject_id:ref('subject_id','subjects',true),title:text('title',200,true),starts_on:date('starts_on',true),ends_on:date('ends_on'),status:choice('status',['Active','Paused','Completed','Cancelled']),goal:text('goal',2000),billing_basis:choice('billing_basis',['Per lesson','Package','Course','Project']),agreed_price:r.agreed_price??null,currency:r.currency||null,planned_sessions:r.planned_sessions??null};
   if(data.ends_on&&data.ends_on<data.starts_on)bad('End date must not be before the start date.');
   if(data.agreed_price!==null&&(!Number.isSafeInteger(data.agreed_price)||data.agreed_price<0||data.agreed_price>1e12))bad('Agreed price must be a valid non-negative amount.');
   if(data.currency&&!db.prepare('SELECT code FROM currencies WHERE code=?').get(data.currency))bad('Choose an existing currency.');
   if(data.agreed_price!==null&&!data.currency)bad('Choose a currency for the agreed price.');
   if(data.planned_sessions!==null&&(!Number.isInteger(data.planned_sessions)||data.planned_sessions<1||data.planned_sessions>10000))bad('Planned sessions must be a whole number from 1 to 10000.');
   const sub=db.prepare('SELECT inst,type FROM subjects WHERE id=?').get(data.subject_id);
   if(sub.inst&&data.teacher_id&&sub.inst!==data.teacher_id)bad('The teacher must match the instructor assigned to this subject.');
   if(before&&db.prepare('SELECT id FROM billing_contracts WHERE registration_id=?').get(id)&&['student_id','teacher_id','subject_id','agreed_price','currency','planned_sessions'].some(k=>before[k]!==data[k]))bad('This registration has an activated agreement. Its student, teacher, subject and financial terms are fixed; use a new registration for a new agreement.');
  }else if(kind==='task'){
   data={title:text('title',200,true),owner:text('owner',100,true),due_on:date('due_on',true),priority:choice('priority',['Normal','High']),status:choice('status',['Open','In Progress','Done','Cancelled']),student_id:ref('student_id','students'),teacher_id:ref('teacher_id','teachers'),registration_id:ref('registration_id','service_registrations'),detail:text('detail',3000),result:text('result',2000)};
   if(data.status==='Done'&&!data.result)bad('Record the result before completing the task.');
   if(data.registration_id){const reg=db.prepare('SELECT student_id,teacher_id FROM service_registrations WHERE id=?').get(data.registration_id);if(data.student_id&&reg.student_id!==data.student_id)bad('The registration belongs to another student.');if(data.teacher_id&&reg.teacher_id&&reg.teacher_id!==data.teacher_id)bad('The registration belongs to another teacher.');}
  }else{
   id=ref('lesson_id','lessons',true);
   if(kind==='attendance'){
    data={status:choice('status',['Present','Late','Excused','Absent']),note:text('note',2000)};
    const lesson=db.prepare('SELECT st FROM lessons WHERE id=?').get(id);
    if(['Present','Late'].includes(data.status)&&lesson.st!=='Completed')bad('Present or Late attendance requires a Completed lesson. Review the lesson status first.');
   }else data={taught:text('taught',3000),next_step:text('next_step',2000),homework:text('homework',2000)};
  }
  data.updated_at=at;
  if(before){const keys=Object.keys(data);db.prepare(`UPDATE ${table} SET ${keys.map(k=>k+'=?').join(',')} WHERE ${rowKey}=?`).run(...Object.values(data),id);}
  else{if(rowKey==='id')data.created_at=at;else data.lesson_id=id;const keys=Object.keys(data);const result=db.prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...Object.values(data));if(rowKey==='id')id=Number(result.lastInsertRowid);}
  const after=db.prepare(`SELECT * FROM ${table} WHERE ${rowKey}=?`).get(id);
  audit.log(db,{at,actor,action:before?'update':'create',entity:'operations-'+kind,id,before,after,detail:'Administrative record; no financial charge or payment created.'});
  db.prepare("INSERT OR REPLACE INTO schema_meta(key,value) VALUES('rev',?)").run(String(rev+1));
  return {rev:rev+1,record:after};
 });
}
module.exports={read,write,OperationsError};
