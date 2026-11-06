'use strict';
const {assemble}=require('../original/src/state'),M=require('../original/src/management'),S=require('../original/src/save');
const {tx}=require('../original/src/db'),store=require('../original/src/store'),T=require('../original/src/teacher-portal'),cairo=require('../original/src/cairo'),rules=require('../original/src/rules');
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const stamp=x=>JSON.stringify([x.source,x.id,x.originalDate,x.date,x.startsAt,x.endsAt,x.teacherId,x.subject,x.group,x.status]);
function install(getDb,{clock,request,audit,notify}){
 const db=()=>getDb(),today=()=>cairo.today(clock());
 function choices(student){
  const st=assemble(db()),bookings=db().prepare('SELECT * FROM managed_sessions WHERE student_id=?').all(student);
  const filtered={...st,s:st.s.filter(s=>s.id===student),l:st.l.filter(l=>l.s===student),tt:st.tt.filter(t=>(t.s||[]).includes(student))};
  const teachers=new Set([...filtered.tt.map(t=>t.t),...bookings.map(s=>s.teacher_id)]);
  return [...teachers].filter(Boolean).flatMap(id=>T.schedule(filtered,id,bookings,{from:today(),to:cairo.addDays(today(),62)})
   .filter(r=>['Timetable','Booking'].includes(r.source)&&!['Completed','Cancelled','Skipped'].includes(r.status)&&!(r.source==='Timetable'&&st.l.some(l=>l.tt===r.id&&(l.od||l.date)===r.originalDate)))
   .map(r=>{const group=r.source==='Timetable'&&(st.tt.find(t=>t.id===r.id)?.s||[]).length>1;
    return {key:r.source+':'+r.id+':'+r.originalDate,source:r.source,id:r.id,originalDate:r.originalDate,date:r.date,startsAt:r.startsAt,endsAt:r.endsAt,subject:r.subject,teacherId:id,teacher:st.t.find(t=>t.id===id)?.name||'',group,status:r.status};}));
 }
 function staffNotice(id,key,kind,reference){db().prepare('INSERT OR IGNORE INTO preview_staff_notifications(event_key,recipient_id,kind,reference,created_at) VALUES(?,?,?,?,?)').run(key,id,kind,String(reference),clock().toISOString());}
 function create(u,r){
  if(!['Student','Teacher'].includes(u.role))fail(403,'Only the assigned student or teacher can request a change.');
  let student=u.student_id;
  if(u.role==='Teacher'){const booking=db().prepare('SELECT * FROM managed_sessions WHERE id=?').get(r.session_id);if(!booking||booking.teacher_id!==u.teacher_id)fail(403,'This lesson is not assigned to you.');student=booking.student_id;r.lesson_key='Booking:'+booking.id+':'+booking.date;}
  const selected=choices(student).find(x=>x.key===r.lesson_key);if(!selected)fail(422,'Choose an upcoming lesson from your schedule.');
  if(!rules.isDate(r.date)||r.date<today()||!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.starts_at||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.ends_at||'')||r.ends_at<=r.starts_at)fail(422,'Choose a future date and valid start/end times.');
  if(r.date===selected.date&&r.starts_at===selected.startsAt&&r.ends_at===selected.endsAt)fail(422,'Choose a different time.');
  if(selected.group&&r.acknowledge_group!==true)fail(422,'This is a group lesson. Confirm that the requested change affects the whole group.');
  const reason=String(r.reason||'').trim();if(!reason||!rules.plain(reason,500))fail(422,'A short valid reason is required.');
  return tx(db(),()=>{
   const existing=db().prepare("SELECT * FROM preview_requests WHERE kind='reschedule' AND status='Pending'").all().find(q=>{const old=JSON.parse(q.record);return old.lesson_key===selected.key;});
   if(existing){if(existing.actor===u.username&&existing.request_key===r.request_key)return existing;fail(409,'A change request for this lesson is already awaiting approval.');}
   const q=request(u,'reschedule',{version:2,lesson_key:selected.key,teacher_id:selected.teacherId,student_id:student,subject:selected.subject,previous:selected,fingerprint:stamp(selected),proposed:{date:r.date,starts_at:r.starts_at,ends_at:r.ends_at}},r.request_key,reason,student);
   notify('reschedule-request:'+q.id,'Teacher',selected.teacherId,'RescheduleRequested',q.id);
   for(const a of db().prepare("SELECT id FROM team_users WHERE role='Admin' AND active=1").all())staffNotice(a.id,'reschedule-request:'+q.id,'RescheduleRequested',q.id);
   return q;
  });
 }
 function details(q,u){
  const record=JSON.parse(q.record),votes=db().prepare('SELECT vote_role,status,reason,created_at FROM preview_reschedule_votes WHERE request_id=?').all(q.id);
  const student=assemble(db()).s.find(s=>s.id===q.student_id)?.name||'';
  return {...q,record:JSON.stringify(record),studentName:u.role==='Student'?'':student,adminApproval:votes.find(v=>v.vote_role==='Admin')?.status||'Pending',teacherApproval:votes.find(v=>v.vote_role==='Teacher')?.status||'Pending',votes};
 }
 function visible(q,u){if(q.kind!=='reschedule')return false;if(u.role==='Admin')return true;const r=JSON.parse(q.record);return u.role==='Teacher'?r.teacher_id===u.teacher_id:u.role==='Student'?q.student_id===u.student_id:false;}
 function move(record,u){
  const current=choices(record.student_id).find(x=>x.key===record.lesson_key);
  if(!current||stamp(current)!==record.fingerprint)fail(409,'The original lesson changed. Submit a new request for its current time.');
  const st=assemble(db()),next=record.proposed;
  let affected=[record.student_id],entry;
  if(current.source==='Timetable'){
   entry=st.tt.find(e=>e.id===current.id);affected=entry.s||[];
   // Temporarily suppress ONLY this occurrence while original collision validation runs.
   const hidden=JSON.parse(JSON.stringify(entry));
   if(entry.sched==='rec')hidden.ex={...(hidden.ex||{}),[current.originalDate]:{...(hidden.ex||{})[current.originalDate],deleted:true}};
   else hidden.date='1900-01-01';
   store.updateRow(db(),'tt',hidden);
  }
  const draft={teacher_id:record.teacher_id,student_id:record.student_id,date:next.date,starts_at:next.starts_at,ends_at:next.ends_at};
  const hasAvailability=db().prepare('SELECT 1 FROM teacher_availability WHERE teacher_id=? AND active=1').get(record.teacher_id);
  if(hasAvailability&&!M.available(db(),draft))fail(422,'The requested time is outside teacher availability.');
  for(const student_id of affected){const conflicts=M.conflicts(db(),{...draft,student_id},current.source==='Booking'?current.id:undefined);if(conflicts.length)fail(422,'Time conflict: '+conflicts.join(', '));}
  if(entry){
   if(entry.sched==='rec')entry.ex={...(entry.ex||{}),[current.originalDate]:{...(entry.ex||{})[current.originalDate],moved:{date:next.date,st:next.starts_at,en:next.ends_at}}};
   else {entry.date=next.date;entry.st=next.starts_at;entry.en=next.ends_at;}
   store.updateRow(db(),'tt',entry);
  }else{
   db().prepare('UPDATE managed_sessions SET date=?,starts_at=?,ends_at=? WHERE id=?').run(next.date,next.starts_at,next.ends_at,current.id);
   db().prepare('DELETE FROM session_confirmations WHERE session_id=?').run(current.id);
  }
  db().prepare("INSERT OR REPLACE INTO schema_meta(key,value) VALUES('rev',?)").run(String(S.getRev(db())+1));
  audit(u,'update','approved-reschedule',current.id,record.previous,next);
  return affected;
 }
 function decide(u,r){
  const q=db().prepare("SELECT * FROM preview_requests WHERE id=? AND kind='reschedule'").get(r.id);
  if(!q)fail(404,'Change request not found.');
  if(!visible(q,u)||!['Admin','Teacher'].includes(u.role))fail(403,'Only administration and the assigned teacher may approve this request.');
  if(!['Approved','Rejected'].includes(r.status))fail(422,'Choose approved or rejected.');
  if(!r.reason||!rules.plain(r.reason,500))fail(422,'A decision reason is required.');
  return tx(db(),()=>{
   if(q.status!=='Pending')return details(q,u);
   const previous=db().prepare('SELECT status FROM preview_reschedule_votes WHERE request_id=? AND vote_role=?').get(q.id,u.role);
   if(previous){if(previous.status!==r.status)fail(409,'Your decision is already recorded.');return details(q,u);}
   db().prepare('INSERT INTO preview_reschedule_votes VALUES(?,?,?,?,?,?)').run(q.id,u.role,u.id,r.status,r.reason.trim(),clock().toISOString());
   const votes=db().prepare('SELECT status FROM preview_reschedule_votes WHERE request_id=?').all(q.id);
   let state=r.status==='Rejected'?'Rejected':votes.length===2&&votes.every(v=>v.status==='Approved')?'Approved':'Pending',affected=[];
   const record=JSON.parse(q.record);
   if(state==='Approved'){
    if(record.version!==2)fail(409,'This older request must be resubmitted using the lesson selector.');
    affected=move(record,u);
   }
   if(state!=='Pending')db().prepare('UPDATE preview_requests SET status=?,decided_at=?,decided_by=?,result=? WHERE id=?').run(state,clock().toISOString(),u.username,JSON.stringify({reason:r.reason,proposed:record.proposed}),q.id);
   audit(u,'update','reschedule-vote',q.id,null,{role:u.role,status:r.status,requestStatus:state,reason:r.reason});
   if(state!=='Approved')notify('reschedule-vote:'+q.id+':'+u.role,'Student',q.student_id,state==='Rejected'?'RescheduleRejected':'RescheduleAwaitingSecondApproval',q.id);
   if(state==='Approved')for(const student of affected)notify('reschedule-final:'+q.id,'Student',student,'ScheduleChanged',q.id);
   notify('reschedule-state:'+q.id+':'+u.role,'Teacher',record.teacher_id,state==='Approved'?'ScheduleChanged':state==='Rejected'?'RescheduleRejected':'RescheduleAwaitingSecondApproval',q.id);
   for(const a of db().prepare("SELECT id FROM team_users WHERE role='Admin' AND active=1").all())staffNotice(a.id,'reschedule-state:'+q.id+':'+u.role,state==='Approved'?'ScheduleChanged':state==='Rejected'?'RescheduleRejected':'RescheduleAwaitingSecondApproval',q.id);
   return details(db().prepare('SELECT * FROM preview_requests WHERE id=?').get(q.id),u);
  });
 }
 return {choices,create,decide,details,visible};
}
module.exports={install};
