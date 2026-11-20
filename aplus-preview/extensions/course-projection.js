 'use strict';
// Additive credit-note projection. Historical enrollment prices and course inputs remain untouched on disk.
function project(db,st){
 if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='preview_course_settlements'").get())return st;
 const rows=db.prepare('SELECT * FROM preview_course_settlements').all();
 for(const x of rows){const e=st.re.find(e=>e.id===x.enrollment_id),c=st.rc.find(c=>c.id===x.course_id);if(e){e.withdrawalOriginalPrice=x.original_price;e.price=x.retained;e.withdrawalClosedOn=x.settled_on;e.withdrawalRefund=st.ad.filter(a=>a.kind==='refund'&&(a.enrollment_id===e.id||a.ok==='re'&&a.oid===e.id||a.ok==='cp'&&st.cp.some(p=>p.id===a.oid&&p.re===e.id))).reduce((s,a)=>s+a.amt,0);e.withdrawalNetPaid=e.paid+st.al.filter(a=>a.tk==='enrollment'&&a.tid===e.id).reduce((s,a)=>s+a.amt,0)-e.withdrawalRefund;}if(c)c.withdrawalReduction=(c.withdrawalReduction||0)+x.waived;}
 return st;
}
module.exports={project};
