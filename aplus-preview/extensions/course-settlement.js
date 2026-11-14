 'use strict';
const {assemble}=require('../original/src/state'),{tx}=require('../original/src/db'),store=require('../original/src/store'),{E}=require('../original/src/mapping'),AUDIT=require('../original/src/audit'),cairo=require('../original/src/cairo'),rules=require('../original/src/rules'),F=require('../original/src/finance'),TREASURY=require('../original/src/treasury'),crypto=require('../runtime/shims/crypto');
const fail=(code,msg)=>{throw Object.assign(new Error(msg),{code})};
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function install(db,{clock,audit,notify}){
 const rev=()=>Number(db().prepare("SELECT value FROM schema_meta WHERE key='rev'").get()?.value||0);
 const admin=u=>{if(u.role!=='Admin')fail(403,'Only Admin can execute a course withdrawal and refund.');};
 const integer=v=>Number.isSafeInteger(v)&&v>=0&&v<=1e12;
 const settled=id=>db().prepare('SELECT * FROM preview_course_settlements WHERE enrollment_id=?').get(id);
 function details(u,id){
  if(!['Admin','Accountant','Coordinator'].includes(u.role))fail(403,'Staff access required.');
  const st=assemble(db()),e=st.re.find(e=>e.id===id),c=e&&st.rc.find(c=>c.id===e.rc);if(!e||!c)fail(404,'Course enrollment not found.');
  const final=settled(id),payments=st.cp.filter(p=>p.re===id),alloc=st.al.filter(a=>a.tk==='enrollment'&&a.tid===id),sources=[];let blocked=c.teacherFee?'A fixed instructor fee needs a separate entitlement review before withdrawal.':'';
  const source=(kind,p,amt)=>{const adjustments=st.ad.filter(a=>a.ok===kind&&a.oid===p.id),used=adjustments.filter(a=>['refund','credit','retained'].includes(a.kind)).reduce((s,a)=>s+a.amt,0);if(adjustments.some(a=>a.kind!=='refund'))blocked='This enrollment has credit transfers or retained adjustments; reconcile them before withdrawal.';if(p.cur&&p.cur!==c.cur)blocked='This enrollment has mixed payment currencies; reconcile them before withdrawal.';sources.push({kind,id:p.id,amount:amt-used,date:p.date||e.date||c.date||'',rx:p.rx,bamt:p.bamt,bc:p.bc,fxs:p.fxs,cur:p.cur||c.cur});};
  const opening=e.paid-payments.reduce((s,p)=>s+p.amt,0);if(opening<0)blocked='The enrollment payment total does not match its receipts.';
  if(opening>0)source('re',{id:e.id,date:e.date||c.date,cur:c.cur,rx:c.rx,bamt:Math.round(opening*c.rx),bc:c.bc,fxs:c.rx>0?'stored':'missing'},opening);
  for(const p of payments)source('cp',p,p.amt);
  for(const a of alloc){const p=st.sp.find(p=>p.id===a.sp);if(!p){blocked='An allocated payment is missing.';continue;}if(st.al.some(b=>b.sp===p.id&&(b.tk!=='enrollment'||b.tid!==id)))blocked='A payment is shared with another service; reconcile its allocation before withdrawal.';if(sources.some(s=>s.kind==='sp'&&s.id===p.id)){blocked='Combine the repeated allocations before withdrawal.';continue;}source('sp',p,a.amt);}
  if(sources.some(s=>!integer(s.amount)))blocked='An earlier refund or adjustment needs financial reconciliation.';
  if(sources.some(s=>s.amount>0&&(!(s.rx>0)||s.fxs==='missing'||s.bc!==st.set.base)))blocked='A saved exchange rate in the current accounting currency is required before refunding.';
  const paid=sources.reduce((s,p)=>s+p.amount,0),accounts=db().prepare('SELECT id,name,currency,active FROM treasury_accounts WHERE currency=? AND active=1').all(c.cur).map(a=>({...a,balance:TREASURY.balance(db(),a.id)}));
  const data={id,student:st.s.find(s=>s.id===e.s)?.name||'',studentId:e.s,course:c.name,courseId:c.id,currency:c.cur,price:e.price,paid,remaining:e.price-paid,rev:rev(),today:cairo.today(clock()),earliestDate:[e.date||c.date||'2000-01-01',...sources.map(p=>p.date),...st.ad.filter(a=>sources.some(p=>p.kind===a.ok&&p.id===a.oid)).map(a=>a.date)].sort().at(-1),accounts,settlement:final||null,blocked,sources,share:c.share,courseRevenue:F.rcc(c).rev,teacherEarned:F.rcc(c).teacherShare,teacherPaid:st.tp.filter(p=>p.p===c.inst&&p.src==='Recorded').reduce((s,p)=>s+p.amt,0),teacherSettled:st.ts.filter(t=>t.ok==='course'&&t.oid===c.id).reduce((s,t)=>s+t.samt,0),rate:c.rx,baseCurrency:st.set.base,courseRate:c.rx};
  data.quote=digest({rev:data.rev,e,c,sources,final,alloc});return data;
 }
 function execute(u,r){
  admin(u);if(typeof r.request_key!=='string'||!/^[-a-zA-Z0-9_]{8,100}$/.test(r.request_key))fail(422,'A valid request identifier is required.');
  const prior=db().prepare('SELECT * FROM preview_operation_keys WHERE request_key=?').get(r.request_key),signature=digest(r);if(prior){const result=JSON.parse(prior.result);if(prior.actor!==u.username||result.signature!==signature)fail(409,'Request identifier already used.');return result;}
  const q=details(u,r.enrollment_id);if(q.settlement)fail(409,'This enrollment already has a completed withdrawal settlement.');if(q.blocked)fail(422,q.blocked);if(q.quote!==r.quote)fail(409,'Data changed. Reopen the withdrawal before confirming.');
  if(!integer(r.refund)||r.refund>q.paid)fail(422,'Refund exceeds the available paid amount.');const retained=q.paid-r.refund,waived=q.price-retained;if(!integer(retained)||!integer(waived))fail(422,'The retained amount cannot exceed the course fee. Increase the refund.');
  if(!rules.isDate(r.date)||r.date<q.earliestDate||r.date>q.today)fail(422,'Choose a date after enrollment and all related payments, no later than today.');
  if(typeof r.reason!=='string'||!rules.plain(r.reason,500)||r.reason.trim().length<3)fail(422,'Enter a withdrawal reason.');
  if(r.confirm!==true)fail(422,'Confirm the withdrawal, fee settlement and teacher impact.');
  if(r.refund>0&&(typeof r.method!=='string'||!rules.plain(r.method,80)||!r.method.trim()||!Number.isInteger(r.account_id)))fail(422,'Choose the refund method and a matching treasury account.');
  if(q.courseRevenue<waived)fail(422,'The declared course revenue is smaller than this settlement. Review the course figures first.');
  const newTeacher=Math.round((q.courseRevenue-waived)*q.share/100);if(q.teacherSettled>newTeacher)fail(422,'Existing teacher currency settlements exceed the revised entitlement. Correct those settlements before withdrawing.');
  return tx(db(),()=>{
   const st=assemble(db()),e=st.re.find(e=>e.id===q.id),c=st.rc.find(c=>c.id===q.courseId),stamp=clock().toISOString(),refundIds=[];let left=r.refund;
   const native=(row)=>{const id=Math.max(Number(db().prepare("SELECT value FROM schema_meta WHERE key='next_id'").get()?.value||1),db().prepare('SELECT coalesce(max(id),0) n FROM id_registry').get().n+1);db().prepare('INSERT INTO id_registry(id,kind) VALUES(?,?)').run(id,E.ad.kind);store.insertRow(db(),'ad',{id,...row},store.nextSeq(db(),'ad'));db().prepare("INSERT OR REPLACE INTO schema_meta VALUES('next_id',?)").run(String(id+1));AUDIT.log(db(),{actor:u.username,at:stamp,action:'create',entity:'ad',id,after:{id,...row},detail:'Course withdrawal refund; original receipt preserved.'});return id;};
   for(const source of q.sources){const amount=Math.min(left,source.amount);if(!amount)continue;const id=native({s:e.s,kind:'refund',date:r.date,cur:c.cur,amt:amount,rx:source.rx,bamt:Math.round(amount*source.rx),bc:source.bc,fxs:source.fxs||'stored',ok:source.kind,oid:source.id,reason:r.reason.trim(),enrollment_id:e.id,meth:r.method.trim()});TREASURY.attachNative(db(),{native_kind:'ad',native_id:id,account_id:r.account_id},u,clock());refundIds.push(id);left-=amount;}
   if(left)fail(422,'The available receipts changed. Reopen the withdrawal.');
   const contracts=db().prepare("SELECT * FROM billing_contracts WHERE source_kind='Recorded' AND target_id=?").all(e.id);for(const ct of contracts){db().prepare("UPDATE billing_contracts SET status='Cancelled' WHERE id=?").run(ct.id);audit(u,'update','course-agreement',ct.id,ct,{...ct,status:'Cancelled',reason:r.reason});db().prepare("UPDATE service_registrations SET status='Cancelled' WHERE id=?").run(ct.registration_id);}
   db().prepare('INSERT OR IGNORE INTO preview_course_withdrawals(enrollment_id,withdrawn_on,reason,actor,created_at,refund_requested) VALUES(?,?,?,?,?,?)').run(e.id,r.date,r.reason.trim(),u.username,stamp,Number(r.refund>0));
   db().prepare('INSERT INTO preview_course_settlements VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(e.id,c.id,e.price,waived,r.refund,retained,r.date,r.reason.trim(),u.username,r.refund>0?r.method.trim():'',JSON.stringify(refundIds),stamp,r.request_key);
   audit(u,'settle','course-withdrawal',e.id,{price:e.price,paid:q.paid,courseRevenue:q.courseRevenue},{price:retained,waived,refund:r.refund,remaining:0,refundIds,courseRevenue:q.courseRevenue-waived,teacherEarnedBefore:q.teacherEarned,teacherEarnedAfter:newTeacher,reason:r.reason});
   notify('course-settled:'+e.id,'Student',e.s,'CourseWithdrawn',e.id);if(c.inst)notify('course-settled:'+e.id,'Teacher',c.inst,'CourseWithdrawn',e.id);
   db().prepare("INSERT OR REPLACE INTO schema_meta VALUES('rev',?)").run(String(q.rev+1));const result={ok:true,signature,enrollment_id:e.id,refund:r.refund,waived,retained,remaining:0,refundIds,rev:q.rev+1};db().prepare('INSERT INTO preview_operation_keys VALUES(?,?,?)').run(r.request_key,u.username,JSON.stringify(result));return result;
  });
 }
 function guardSave(u,input){
  const st=assemble(db());for(const c of st.rc){const proposed=input?.state?.rc?.find(x=>x.id===c.id);if(proposed&&proposed.withdrawalReduction!==c.withdrawalReduction)fail(409,'Course withdrawal adjustments must be created through the Admin settlement form.');}for(const c of st.rc.filter(c=>c.withdrawalReduction)){const after=input?.state?.rc?.find(x=>x.id===c.id);if(!after||after.withdrawalReduction!==c.withdrawalReduction||after.price*after.n<c.withdrawalReduction||['cur','rx','bc','share','inst'].some(k=>after[k]!==c[k]))fail(409,'A course withdrawal settlement must be preserved. Reload the page.');}
  for(const e of st.re.filter(e=>e.withdrawalClosedOn)){const after=input?.state?.re?.find(x=>x.id===e.id);if(!after||['price','paid','paid_open','rc','s','date','withdrawalOriginalPrice','withdrawalClosedOn','withdrawalRefund','withdrawalNetPaid'].some(k=>after[k]!==e[k]))fail(409,'A settled enrollment is read-only. Its withdrawal history must be preserved.');}
  const closed=new Set(st.re.filter(e=>e.withdrawalClosedOn).map(e=>e.id));for(const p of input?.state?.cp||[]){if(closed.has(p.re)&&!st.cp.some(old=>old.id===p.id&&JSON.stringify(old)===JSON.stringify(p)))fail(409,'Payments of a settled enrollment cannot be changed.');}for(const p of st.cp.filter(p=>closed.has(p.re))){if(!input?.state?.cp?.some(after=>after.id===p.id&&JSON.stringify(after)===JSON.stringify(p)))fail(409,'Original settled receipts must be preserved.');}for(const a of input?.state?.ad||[]){if(st.ad.some(old=>old.id===a.id))continue;if(closed.has(a.enrollment_id)||(a.ok==='re'&&closed.has(a.oid))||(a.ok==='cp'&&st.cp.some(p=>p.id===a.oid&&closed.has(p.re))))fail(409,'Use a separate approved correction for an already settled withdrawal.');}
  const protectedIds=new Set(db().prepare('SELECT refund_ids FROM preview_course_settlements').all().flatMap(r=>JSON.parse(r.refund_ids)));for(const a of st.ad.filter(a=>protectedIds.has(a.id))){const after=input?.state?.ad?.find(x=>x.id===a.id);if(JSON.stringify(after)!==JSON.stringify(a))fail(409,'Withdrawal refunds cannot be edited or deleted.');}
 }
 return {details,execute,guardSave};
}
module.exports={install};
