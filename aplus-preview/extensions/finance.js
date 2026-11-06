'use strict';
const F = require('../original/src/finance');
const {forState} = require('../original/src/ledger-server');
const T = require('../original/src/teacher-portal');
const B = require('../original/src/teacher-batches');
const rules = require('../original/src/rules');
function range(from='',to='') {
 if ((from&&!rules.isDate(from))||(to&&!rules.isDate(to))||(from&&to&&from>to)) throw Object.assign(new Error('Choose a valid date range.'),{code:422});
 return {from,to};
}
// Only original KWD or a documented historical KWD base value qualifies. Settings rates are NEVER read here.
function kwd(row, original, currency, baseValue, rate) {
 if(currency==='KWD'&&Number.isSafeInteger(original))return {value:original,basis:'original KWD'};
 if(row.bc==='KWD'&&row.fxs!=='missing'&&Number.isSafeInteger(baseValue)&&Number.isFinite(rate)&&rate>0&&Number.isSafeInteger(original)&&Math.abs(Math.round(original*rate)-baseValue)<=1)
  return {value:baseValue,basis:'saved transaction rate',rate};
 return {value:null,basis:'missing historical KWD conversion'};
}
function student(st,sid,opt={}) {
 const {from,to}=range(opt.from,opt.to),name=(a,id)=>a.find(x=>x.id===id)?.name||'',events=[],services=new Map();
 const service=(key,title,kind,extra={})=>{if(!services.has(key))services.set(key,{key,title,kind,charge:0,paid:0,hours:0,history:[],...extra});return services.get(key)};
 const add=(kind,row,date,amount,cur,base,rx,key,description)=>{
  const v=kwd(row,amount,cur,base,rx),e={id:row.id,kind,date:date||'',description,amount:v.value,converted:cur!=='KWD',basis:v.basis,rate:v.rate,service:key||null};events.push(e);
  if(key){const s=services.get(key);if(s){if(kind==='Charge')s.charge=s.charge===null||e.amount===null?null:s.charge+e.amount;else if(kind==='Payment')s.paid=s.paid===null||e.amount===null?null:s.paid+e.amount;s.history.push(e);}}
  return e;
 };
 const ownedLessons=st.l.filter(l=>l.s===sid),projects=st.pr.filter(p=>p.s===sid),enrollments=st.re.filter(e=>e.s===sid);
 for(const l of ownedLessons)if(l.st==='Completed'){
  const key='live:'+l.sub,s=service(key,name(st.sub,l.sub)||'Live lessons','Live');s.hours+=l.d;
  add('Charge',l,l.date,F.O(l).chg,l.sc,l.bchg,l.srx,key,'Lesson #'+l.id+' · '+s.title);
 }
 for(const p of projects){const key='project:'+p.id;service(key,p.name,'Project',{status:p.status});if(p.status!=='Cancelled')add('Charge',p,p.start,p.rev,p.cur,Math.round(p.rev*p.rx),p.rx,key,p.name);
  if(p.paid0)add('Payment',p,'',p.paid0,p.cur,Math.round(p.paid0*p.rx),p.rx,key,'Opening payment · '+p.name);
  for(const r of st.pp.filter(r=>r.pr===p.id))add('Payment',r,r.date,r.amt,r.cur||p.cur,r.bamt,r.rx,key,'Project payment #'+r.id);
 }
 for(const e of enrollments){const c=st.rc.find(c=>c.id===e.rc);if(!c)continue;const key='enrollment:'+e.id;service(key,c.name,'Recorded');add('Charge',c,e.date||c.date,e.price,c.cur,Math.round(e.price*c.rx),c.rx,key,c.name);
  const receipts=st.cp.filter(p=>p.re===e.id),opening=(e.paid||0)-receipts.reduce((s,p)=>s+p.amt,0);
  if(opening)add('Payment',c,'',opening,c.cur,Math.round(opening*c.rx),c.rx,key,'Opening payment · '+c.name);
  for(const p of receipts)add('Payment',p,p.date,p.amt,p.cur||c.cur,p.bamt,p.rx,key,'Course payment #'+p.id);
 }
 const unallocated=[];
 for(const p of st.sp.filter(p=>p.p===sid)){
  const e=add('Payment',p,p.date,p.amt,p.cur,p.bamt,p.rx,null,'Student payment #'+p.id),allocs=st.al.filter(a=>a.sp===p.id),parts=[];
  for(const a of allocs){let key=null;if(a.tk==='lesson'){const l=ownedLessons.find(l=>l.id===a.tid);if(l)key='live:'+l.sub;}
   else if(a.tk==='project'&&projects.some(x=>x.id===a.tid))key='project:'+a.tid;
   else if(a.tk==='enrollment'&&enrollments.some(x=>x.id===a.tid))key='enrollment:'+a.tid;
   else if(!a.tk)key='attributed:'+a.wt;
   if(key){if(!services.has(key))service(key,a.wt+' · explicitly attributed',a.wt);parts.push({key,amount:a.amt,date:a.date});}
  }
  // Original agreement receipts attribute existing cash once; never create an extra statement payment.
  const contract=(opt.contracts||[]).find(c=>(opt.receipts||[]).some(r=>r.contract_id===c.id&&r.payment_kind==='sp'&&r.payment_id===p.id));
  if(contract&&parts.length===0){const lessons=ownedLessons.filter(l=>(opt.usage||[]).some(u=>u.lesson_id===l.id&&u.contract_id===contract.id));const key=lessons.length?'live:'+lessons[0].sub:'agreement:'+contract.id;if(!services.has(key))service(key,contract.title||'Live agreement #'+contract.id,'Live');parts.push({key,amount:p.amt,date:p.date});}
  let assigned=0;
  for(const part of parts){const s=services.get(part.key),v=e.amount===null?null:Math.round(e.amount*part.amount/p.amt);assigned+=part.amount;s.paid=s.paid===null||v===null?null:s.paid+v;s.history.push({...e,amount:v,date:part.date||e.date,attribution:true});}
  const left=p.amt-assigned;if(left){unallocated.push({...e,amount:e.amount===null?null:Math.round(e.amount*left/p.amt)});}
 }
 for(const a of st.ad.filter(a=>a.s===sid)){
  if(a.kind==='credit')continue;const paid=a.kind==='credit-used'?a.amt:-a.amt;
  const e=add('Adjustment',a,a.date,paid,a.cur,a.bamt==null?null:(a.kind==='credit-used'?a.bamt:-a.bamt),a.rx,null,a.kind+' #'+a.id);
  if(a.kind==='refund'){let key=a.pr?'project:'+a.pr:null;const cp=a.ok==='cp'&&st.cp.find(p=>p.id===a.oid);if(cp)key='enrollment:'+cp.re;
   if(key&&services.has(key)){const s=services.get(key);s.paid=s.paid===null||e.amount===null?null:s.paid+e.amount;s.history.push(e);}}
 }
 events.sort((a,b)=>a.date.localeCompare(b.date)||a.id-b.id);
 const before=e=>from&&(!e.date||e.date<from),included=e=>!to||!e.date||e.date<=to,selected=events.filter(e=>included(e)&&!before(e));
 const total=(arr,fn)=>arr.some(e=>e.amount===null)?null:arr.reduce((s,e)=>s+fn(e),0),delta=e=>e.kind==='Charge'?e.amount:-e.amount;
 const earlier=events.filter(e=>included(e)&&before(e)),opening=total(earlier,delta),charges=total(selected.filter(e=>e.kind==='Charge'),e=>e.amount),payments=total(selected.filter(e=>e.kind==='Payment'),e=>e.amount),adjustments=total(selected.filter(e=>e.kind==='Adjustment'),e=>e.amount);
 const closing=total(events.filter(included),delta),native=forState(st).studentRows(st,{only:sid,...(to?{upTo:to}:{})}),kwdNative=native.find(r=>r.cur==='KWD');
 const account=F.SS(st,sid),complete=closing!==null;
 // Original account remains authoritative: require parity whenever all source values have a valid saved KWD basis.
 const parity=st.set.base!=='KWD'||from||to||!complete?null:closing===account.rem;
 const rows=[...services.values()].map(s=>({...s,remaining:s.charge===null||s.paid===null?null:s.charge-s.paid,paymentStatus:s.charge===null||s.paid===null?'Incomplete':s.paid===0?'Unpaid':s.paid<s.charge?'Partially paid':s.paid===s.charge?'Paid':'Credit'}));
 const allServiceRemaining=rows.some(s=>s.remaining===null)?null:rows.reduce((q,s)=>q+s.remaining,0),allClosing=total(events,delta),unalloc=total(unallocated,e=>e.amount);
 return {studentId:sid,student:name(st.s,sid),currency:'KWD',from,to,generatedAt:new Date().toISOString(),opening,charges,payments,adjustments,closing,complete:complete&&parity!==false,parity,entries:selected,services:rows,unallocated,
  confirmedCredit:kwdNative&&kwdNative.net<0?-kwdNative.net:0,outstanding:closing!==null&&closing>0?closing:0,credit:closing!==null&&closing<0?-closing:0,
  reconciliation:{serviceRemaining:allServiceRemaining,unallocated:unalloc,otherAdjustments:allClosing===null||allServiceRemaining===null||unalloc===null?null:allClosing-(allServiceRemaining-unalloc),accountClosing:allClosing},
  basis:'Original KWD amounts or each transaction’s saved KWD conversion. No current exchange rate. Service balances are all-time; statement entries follow the selected period.',
  missing:events.filter(e=>included(e)&&e.amount===null).map(e=>({id:e.id,kind:e.kind,description:e.description})),currencyCreditCaution:native.some(r=>r.cur!=='KWD')};
}
function teacher(db,st,tid,opt={}){
 range(opt.from,opt.to);const scoped={...st,teacherBatches:B.details(db,tid)},a=T.account(scoped,tid,opt);
 const entries=a.entries.map(e=>{const out={...e};if(e.kind==='Live'){const l=st.l.find(l=>l.id===e.id);out.hourlyRateEGP=l?.tc==='EGP'?l.tr:null;out.recordedEarnedEGP=e.recordedCostEGP;}
  if(e.kind==='Project'){const p=st.pr.find(p=>p.id===e.id);out.agreedPercent=p?.share;out.recordedEarnedEGP=p?.cur==='EGP'?F.pj(st,p).share:null;}
  if(e.kind==='Recorded'){const c=st.rc.find(c=>c.id===e.id);out.agreedPercent=c?.share;out.recordedEarnedEGP=c?.cur==='EGP'?F.rcc(c).share:null;}
  // Batch native amounts may be KWD: project only EGP equivalent using the SAME display conversion.
  if(out.allocations)out.allocations=out.allocations.map(x=>({student:x.student,hours:x.hours,startsOn:x.startsOn,endsOn:x.endsOn}));
  return out;});
 return {...a,entries,teacher:st.t.find(t=>t.id===tid)?.name||'',generatedAt:new Date().toISOString(),displayOnly:true,settingsRate:st.set.base==='EGP'?1:st.rates.EGP?.r||null};
}
module.exports={student,teacher,kwd,range};