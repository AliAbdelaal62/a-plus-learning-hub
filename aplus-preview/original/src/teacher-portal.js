'use strict';
const F=require('./finance'),cairo=require('./cairo'),rules=require('./rules'),{TeamError}=require('./team');
const validDate=v=>!v||rules.isDate(v);
function window(from,to){if(!validDate(from)||!validDate(to)||(from&&to&&from>to)){throw new TeamError(422,'Choose a valid date range.');}}
const own=(st,tid)=>({lessons:st.l.filter(l=>l.t===tid),projects:st.pr.filter(p=>p.t===tid),courses:st.rc.filter(c=>c.inst===tid),payments:st.tp.filter(p=>p.p===tid)});
function configuration(){return {mode:'admin-equivalent'};}
// Read-only projection of the EXISTING administration TSum / tFin calculations.
// Each column is converted separately, including remaining, exactly like conv(n,'EGP').
function account(st,tid,{from='',to=''}={}){
 window(from,to);const b=require('./ledger-server').forState(st).teacherBase(st,tid),base=st.set.base,rate=base==='EGP'?{r:1}:st.rates.EGP,available=!!(rate&&Number.isFinite(rate.r)&&rate.r>0),conv=n=>available?Math.round(n/rate.r):null;
 const cats=[['Live','Live Sessions'],['Recorded','Recorded Courses'],['Project','Projects'],['Other','Other']],byType={},paidByType={},missingEarnedByType={},missingPaidByType={},rows=[];
 for(const [key,label]of cats){byType[key]=conv(b.earned[key]);paidByType[key]=conv(b.paid[key]);if(!available){missingEarnedByType[key]=true;missingPaidByType[key]=true;}rows.push({key,label,earned:conv(b.earned[key]),paid:conv(b.paid[key]),remaining:conv(b.remaining[key]),note:b.remaining[key]<0?'Excess paid':''});}
 const nUn=st.tp.filter(p=>p.p===tid&&!cats.some(([key])=>key===p.src)).length;paidByType.Unassigned=conv(b.unassigned);if(nUn)rows.push({key:'Unassigned',label:'Unassigned (older payments)',earned:conv(0),paid:conv(b.unassigned),remaining:conv(-b.unassigned),note:nUn+' payment(s) — edit them to choose a Payment Source'});
 rows.push({key:'TOTAL',label:'TOTAL',earned:conv(b.earned.total),paid:conv(b.paid.total),remaining:conv(b.remaining.total),note:b.remaining.total<0?'Overpaid overall':'',total:true});
 const mine=own(st,tid),events=[],label=(a,id)=>a.find(x=>x.id===id)?.name||'',sameBase=r=>!r.bc||r.bc===base,add=(kind,r,date,value,description,extra={})=>events.push({id:r.id,kind,date:date||'',description,...extra,_earned:kind==='Payment'?0:value,_paid:kind==='Payment'?value:0});
 for(const l of mine.lessons)if(l.st==='Completed'&&sameBase(l))add('Live',l,l.date,l.bcost,label(st.sub,l.sub)||'Live lesson',{student:label(st.s,l.s),hours:l.d,recordedCostEGP:l.tc==='EGP'?F.O(l).cost:null});
 for(const p of mine.projects)if(p.status!=='Cancelled'&&sameBase(p))add('Project',p,p.start,F.pj(st,p).bshare,p.name);
 for(const c of mine.courses)if(sameBase(c))add('Recorded',c,c.date,F.rcc(c).bshare,c.name);
 for(const p of mine.payments)if(sameBase(p))add('Payment',p,p.date,p.bamt,'Recorded teacher payment',{method:p.meth||'',workType:cats.some(([key])=>key===p.src)?p.src:'Unassigned',recordedPaymentEGP:p.cur==='EGP'?p.amt:null});
 events.sort((a,b)=>a.date.localeCompare(b.date)||(a.kind==='Payment')-(b.kind==='Payment')||a.id-b.id);
 let opening=0,running=0,periodEarned=0,periodPaid=0;const entries=[];
 for(const e of events){if(to&&e.date&&e.date>to)continue;if(from&&(!e.date||e.date<from)){opening+=e._earned-e._paid;continue;}entries.push(e);}
 running=opening;for(const e of entries){periodEarned+=e._earned;periodPaid+=e._paid;running+=e._earned-e._paid;e.earned=conv(e._earned);e.paid=conv(e._paid);e.balance=conv(running);delete e._earned;delete e._paid;if(e.kind==='Payment')e.allocations=(st.teacherBatches||[]).filter(x=>x.payment_id===e.id).map(x=>({student:label(st.s,x.student_id),hours:x.hours_micros/1e6,amount:x.amount,startsOn:x.starts_on,endsOn:x.ends_on}));}
 const date=base!=='EGP'&&rate&&typeof rate.t==='string'&&Number.isFinite(Date.parse(rate.t))?rate.t:null;
 return {teacherId:tid,currency:'EGP',from,to,mode:'admin-equivalent',scope:'all-time',rows,earned:conv(b.earned.total),paid:conv(b.paid.total),closing:conv(b.remaining.total),byType,paidByType,missingEarnedByType,missingPaidByType,opening:conv(opening),periodEarned:conv(periodEarned),periodPaid:conv(periodPaid),periodClosing:conv(running),entries,valuedAt:date,rateDates:date?[date]:[],unknownRateDate:base!=='EGP'&&available&&!date,displayHasForeignAmounts:base!=='EGP',complete:available&&b.mismatch.length===0,missingCount:(!available?1:0)+b.mismatch.length,nUn,note:'The same all-time totals and category calculations as the existing administration Financial Summary. Only its EGP columns are exposed here. This display conversion does not change recorded payments or create a currency settlement.'};
}
function schedule(st,tid,bookings,{from=cairo.today(),to=cairo.addDays(cairo.today(),13)}={}){
 window(from,to);if(!from||!to||Math.round((Date.parse(to)-Date.parse(from))/864e5)>62){throw new TeamError(422,'Choose up to 63 calendar days.');}
 const rows=[],seen=new Set(),inRange=d=>d>=from&&d<=to,label=(a,id)=>a.find(x=>x.id===id)?.name||'';
 for(const e of st.tt.filter(t=>t.t===tid)){
  const emit=(date,x,original)=>{if(!inRange(date))return;const key=e.id+'|'+original;if(seen.has(key))return;seen.add(key);rows.push({source:'Timetable',id:e.id,date,startsAt:x.st||e.st||'',endsAt:x.en||e.en||'',subject:e.sub||'',students:(e.s||[]).map(id=>label(st.s,id)).join('، '),status:x.cancelled?'Cancelled':x.skipped?'Skipped':x.done?'Completed':x.moved?'Rescheduled':'Scheduled',workType:e.wt||'Live',originalDate:original});};
  if(e.sched==='one'){const x=e.ex||{};if(!x.deleted)emit(e.date,x,e.date);continue;}
  for(let date=from;date<=to;date=cairo.addDays(date,1)){if(new Date(date+'T12:00:00Z').getUTCDay()!==e.dw||(e.a&&date<e.a)||(e.b&&date>e.b))continue;const x=(e.ex||{})[date]||{};if(x.deleted||x.moved)continue;emit(date,x,date);}
  for(const [original,x]of Object.entries(e.ex||{}))if(x.moved&&!x.deleted)emit(x.moved.date,{...x,...x.moved},original);
 }
 for(const s of bookings.filter(s=>s.teacher_id===tid&&inRange(s.date)))rows.push({source:'Booking',id:s.id,date:s.date,startsAt:s.starts_at,endsAt:s.ends_at,subject:label(st.sub,s.subject_id),students:label(st.s,s.student_id),status:s.status,workType:s.kind,originalDate:s.date,lessonId:s.lesson_id||null});
 for(const l of st.l.filter(l=>l.t===tid&&inRange(l.date))){if(rows.some(r=>r.lessonId===l.id||(r.source==='Timetable'&&r.id===l.tt&&r.originalDate===(l.od||l.date))))continue;rows.push({source:'Lesson record',id:l.id,date:l.date,startsAt:l.ts||'',endsAt:l.te||'',subject:label(st.sub,l.sub),students:label(st.s,l.s),status:l.st,workType:'Live',originalDate:l.date});}
 return rows.sort((a,b)=>a.date.localeCompare(b.date)||a.startsAt.localeCompare(b.startsAt)||a.id-b.id);
}
function portal(st,tid,bookings,opt={}){
 const mine=own(st,tid),label=(a,id)=>a.find(x=>x.id===id)?.name||'',subjectIds=new Set(mine.lessons.map(l=>l.sub));mine.projects.forEach(p=>subjectIds.add(p.subj));mine.courses.forEach(c=>subjectIds.add(c.subj));
 return {today:cairo.today(),timezone:'Africa/Cairo',schedule:schedule(st,tid,bookings,opt),subjects:st.sub.filter(s=>s.inst===tid||subjectIds.has(s.id)).map(s=>({id:s.id,name:s.name,type:s.type,level:s.lv||'',lessonCount:mine.lessons.filter(l=>l.sub===s.id&&l.st==='Completed').length,studentCount:new Set([...mine.lessons.filter(l=>l.sub===s.id).map(l=>l.s),...(s.inst===tid?s.studs||[]:[])]).size})),projects:mine.projects.map(p=>({id:p.id,name:p.name,subject:label(st.sub,p.subj)||p.sub||'',student:label(st.s,p.s),status:p.status,startsOn:p.start||'',dueOn:p.due||''})),account:account(st,tid,{from:opt.accountFrom||'',to:opt.accountTo||''})};
}
module.exports={account,schedule,portal,configuration};
