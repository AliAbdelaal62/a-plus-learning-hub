'use strict';
const {TeamError}=require('./team');
const deny=()=>{throw new TeamError(403,'Your account does not have permission for this action.');};
const financialKeys=['sp','tp','pp','cp','al','ad','ts'];
function state(st,u,db){if(u.role==='Admin')return st;const d=JSON.parse(JSON.stringify(st));if(u.role==='Accountant'){d.l.forEach(l=>l.notes='');d.t.forEach(t=>t.notes='');d.s.forEach(s=>s.notes='');return d;}
 if(u.role==='Teacher'){
  const id=u.teacher_id;d.l=d.l.filter(l=>l.t===id);d.tt=d.tt.filter(t=>t.t===id);d.pr=d.pr.filter(p=>p.t===id);d.rc=d.rc.filter(c=>c.inst===id);d.re=d.re.filter(e=>d.rc.some(c=>c.id===e.rc));d.sub=d.sub.filter(s=>s.inst===id||d.pr.some(p=>p.subj===s.id)||d.rc.some(c=>c.subj===s.id));const students=new Set([...d.l.map(l=>l.s),...d.tt.flatMap(t=>t.s||[]),...d.pr.map(p=>p.s),...d.re.map(e=>e.s),...d.sub.flatMap(s=>s.studs||[])]);if(db)for(const r of db.prepare('SELECT student_id FROM service_registrations WHERE teacher_id=?').all(id))students.add(r.student_id);d.s=d.s.filter(s=>students.has(s.id));d.rm=d.rm.filter(r=>d.rc.some(c=>c.id===r.rc));d.t=d.t.filter(t=>t.id===id);
 }
 for(const k of financialKeys)d[k]=[];d.rates={};d.set={...d.set,tr:'0',sr:'0'};delete d.set.teacherEgpView;
 d.t.forEach(t=>{t.rate=0;t.notes=''});d.s.forEach(s=>s.notes='');d.sub.forEach(s=>{s.tr=0;s.sr=0});d.l.forEach(l=>{for(const k of ['tr','sr','oc','og','bcost','bchg'])l[k]=0;l.trx=l.srx=1;});d.pr.forEach(p=>{delete p.teacherFee;p.rev=p.share=p.paid0=0;p.rx=1});d.rc.forEach(c=>{delete c.teacherFee;c.price=c.share=c.cost=0;c.rx=1});d.re.forEach(e=>{e.price=e.paid=e.paid_open=0});return d;
}
function operations(data,db,u){if(u.role==='Admin')return data;if(u.role==='Accountant')return {...data,registrations:data.registrations.map(r=>({...r,goal:''})),attendance:[],journals:[],tasks:[],summary:{...data.summary,openTasks:0,overdue:0,dueToday:0}};let out=JSON.parse(JSON.stringify(data));out.registrations=out.registrations.map(r=>({...r,agreed_price:null,currency:null}));if(u.role==='Teacher'){out.registrations=out.registrations.filter(r=>r.teacher_id===u.teacher_id);const ids=new Set(db.prepare('SELECT id FROM lessons WHERE t=?').all(u.teacher_id).map(l=>l.id));out.attendance=out.attendance.filter(a=>ids.has(a.lesson_id));out.journals=out.journals.filter(a=>ids.has(a.lesson_id));out.tasks=out.tasks.filter(t=>t.teacher_id===u.teacher_id);out.summary={activeRegistrations:out.registrations.filter(r=>r.status==='Active').length,openTasks:out.tasks.filter(t=>!['Done','Cancelled'].includes(t.status)).length,overdue:out.tasks.filter(t=>!['Done','Cancelled'].includes(t.status)&&t.due_on<out.today).length,dueToday:out.tasks.filter(t=>!['Done','Cancelled'].includes(t.status)&&t.due_on===out.today).length};}return out;}
function operationWrite(input,db,u){if(!input||!input.record||typeof input.record!=='object')throw new TeamError(400,'A valid record is required.');const r=input.record;if(u.role==='Accountant')deny();if(u.role==='Teacher'){
 if(['attendance','journal'].includes(input.kind)){const l=db.prepare('SELECT t FROM lessons WHERE id=?').get(r.lesson_id||0);if(!l||l.t!==u.teacher_id)deny();}
 else if(input.kind==='task'){const old=r.id&&db.prepare('SELECT * FROM followup_tasks WHERE id=?').get(r.id);if(r.teacher_id!==u.teacher_id||(old&&old.teacher_id!==u.teacher_id))deny();if(r.student_id){const scope=state(require('./state').assemble(db),u,db);if(!scope.s.some(s=>s.id===r.student_id))deny();}}
 else deny();
 }
 if(input.kind==='registration'&&u.role==='Coordinator'){const old=r.id&&db.prepare('SELECT agreed_price,currency FROM service_registrations WHERE id=?').get(r.id);r.agreed_price=old?.agreed_price??null;r.currency=old?.currency??null;}
 return input;
}
function saveState(input,db,u){if(u.role==='Admin')return input;if(u.role!=='Accountant')deny();const current=require('./save').getState(db).state,visible=state(current,u),stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort()):x);for(const key of Object.keys(current)){if(key!=='id'&&!financialKeys.includes(key)&&stable(input[key])!==stable(visible[key]))deny();}return {...current,id:input.id,...Object.fromEntries(financialKeys.map(k=>[k,input[k]]))};}
module.exports={state,operations,operationWrite,saveState,deny};
