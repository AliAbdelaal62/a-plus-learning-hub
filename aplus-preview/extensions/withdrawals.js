 'use strict';
const {assemble}=require('../original/src/state'),{tx}=require('../original/src/db'),rules=require('../original/src/rules'),cairo=require('../original/src/cairo');
const fail=(code,message)=>{throw Object.assign(new Error(message),{code})};
function install(db,{clock,audit,notify}){
 const canManage=u=>['Admin','Coordinator'].includes(u.role);
 const find=id=>db().prepare('SELECT * FROM preview_course_withdrawals WHERE enrollment_id=?').get(id);
 function list(u){
  if(!canManage(u)&&u.role!=='Accountant')fail(403,'Administration or financial access required.');const st=assemble(db());
  return st.re.map(e=>{const c=st.rc.find(c=>c.id===e.rc);return {id:e.id,student:st.s.find(s=>s.id===e.s)?.name||'',course:c?.name||'',currency:c?.cur||'',price:e.price,recordedPaid:e.paid,withdrawal:find(e.id)||null};});
 }
 function create(u,r){
  if(!canManage(u))fail(403,'Administration access required.');
  if(!Number.isInteger(r.enrollment_id))fail(422,'Choose an existing course enrollment.');
  const st=assemble(db()),e=st.re.find(e=>e.id===r.enrollment_id);if(!e)fail(404,'Course enrollment not found.');
  if(typeof r.reason!=='string'||!rules.plain(r.reason,500)||r.reason.trim().length<3)fail(422,'Enter a withdrawal reason.');
  if(!rules.isDate(r.withdrawn_on)||r.withdrawn_on>cairo.today(clock())||e.date&&r.withdrawn_on<e.date)fail(422,'Choose a withdrawal date between enrollment and today.');
  if(r.acknowledge_finance!==true)fail(422,'Confirm that withdrawal does not settle or refund money.');
  if(typeof r.refund_requested!=='boolean')fail(422,'Choose whether a refund review is requested.');
  const old=find(e.id);if(old){if(old.withdrawn_on===r.withdrawn_on&&old.reason===r.reason.trim()&&old.refund_requested===Number(r.refund_requested))return old;fail(409,'This enrollment is already withdrawn.');}
  return tx(db(),()=>{
   const row={enrollment_id:e.id,withdrawn_on:r.withdrawn_on,reason:r.reason.trim(),actor:u.username,created_at:clock().toISOString(),refund_requested:Number(r.refund_requested)};
   db().prepare('INSERT INTO preview_course_withdrawals(enrollment_id,withdrawn_on,reason,actor,created_at,refund_requested) VALUES(?,?,?,?,?,?)').run(...Object.values(row));
   audit(u,'create','course-withdrawal',e.id,null,row);notify('course-withdrawal:'+e.id,'Student',e.s,'CourseWithdrawn',e.id);
   const c=st.rc.find(c=>c.id===e.rc);if(c?.inst)notify('course-withdrawal:'+e.id,'Teacher',c.inst,'CourseWithdrawn',e.id);
   return row;
  });
 }
 return {list,create,find};
}
module.exports={install};
