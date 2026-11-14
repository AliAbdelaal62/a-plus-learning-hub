'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{JSDOM}=require('jsdom'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../extensions');let n=0;
const check=(v,m)=>{assert.ok(v,m);n++;};
function harness(role,lang='en'){
 const routes=role==='Admin'?['Dashboard','Daily Desk','Timetable','Scheduling','Students','Teachers','Subjects','Lessons','Recorded Courses','Projects','Payments','Reports','Cash Flow','Billing','Treasury','Batch Payments','Team','Settings','Delivery','Registrations']:role==='Teacher'?['My Schedule','My Subjects','My Projects','Financial Summary','Daily Desk','Scheduling','Registrations','Attendance & Notes','Follow-up Tasks','Delivery']:role==='Accountant'?['Dashboard','Payments','Reports','Cash Flow','Billing','Treasury']:role==='Coordinator'?['Daily Desk','Scheduling','Registrations','Attendance & Notes','Follow-up Tasks','Delivery']:[];
 const dom=new JSDOM('<!doctype html><html lang="'+lang+'"><head><meta name="aplus-token" content="test-token"></head><body><div id="app"><nav id="nv">'+(role!=='Student'?'<div class="ui-nav-scroll"><div class="ui-nav-group">'+routes.map(r=>'<a href="#" data-route="'+r+'">'+r+'</a>').join('')+'</div></div>':'')+'</nav><div id="workspace"><header id="topbar"><div class="ui-breadcrumb"><strong>Dashboard</strong></div></header><main id="v"><h2>Original screen</h2></main></div></div></body></html>',{url:'http://localhost:3011/'});
 const w=dom.window,user={role,id:1,username:'test.'+role,display_name:'Test account',student_id:103,teacher_id:100},posts=[];
 if(role==='Student')w.APLUS_STUDENT=user;
 w.localStorage.setItem('aplus-ui-language',lang);
 const choice={key:'Timetable:140:2026-11-09',subject:'Math',teacher:'Teacher',date:'2026-11-09',startsAt:'16:00',endsAt:'18:00',group:false};
 let reject=false;
 const student={student:{name:'Test Student'},timezone:'Africa/Cairo',schedule:[],rescheduleChoices:[choice,{...choice,key:'Timetable:140:2026-11-16',date:'2026-11-16'}],subjects:[],projects:[],courses:[],lessons:[],shares:[],submissions:[]};
 w.__APLUS_PREVIEW__={dispatch(method,p,headers,body){let data;if(p==='/api/auth/status')data={ok:true,user};else if(p==='/api/preview/student')data={ok:true,...student};else if(p.startsWith('/api/preview/student-statement'))data={ok:true,installments:[]};else if(p==='/api/preview/timezone'){student.timezone=JSON.parse(body).timezone;data={ok:true,timezone:student.timezone};}else if(p==='/api/preview/reschedule'){posts.push(JSON.parse(body));data=reject?{ok:false,error:'A change request for this lesson is already awaiting approval.'}:{ok:true,request:{id:20,status:'Pending'}};}else if(p==='/api/preview/course-withdrawals')data={ok:true,rows:[{id:10,student:'Student',course:'Course',currency:'KWD',price:100000,recordedPaid:20000,withdrawal:null}]};else if(p==='/api/preview/requests')data={ok:true,rows:[]};else data={ok:true,rows:[]};return {text:()=>JSON.stringify(data),status:data.ok?200:422};}};
 w.__APLUS_SAVE__=()=>Promise.resolve();
 const globals={window:w,document:w.document,localStorage:w.localStorage,history:w.history,location:w.location,FormData:w.FormData,MutationObserver:w.MutationObserver,NodeFilter:w.NodeFilter,crypto,console,queueMicrotask};
 function load(name){const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(root,name),'utf8'),{...globals,module,exports:module.exports,require:id=>{if(id==='./course-withdrawal-ui')return load('course-withdrawal-ui.js');if(id==='./navigation')return load('navigation.js');if(id==='./timezones')return load('timezones.js');if(id==='../runtime/shims/fs')return {readFileSync:()=>fs.readFileSync(path.join(root,'presentation.css'),'utf8')};throw Error('Unexpected module '+id);}});return module.exports;}
 const original=new Map([...w.document.querySelectorAll('[data-route]')].map(a=>[a.dataset.route,a]));let nativeClicks=0;
 for(const a of original.values())a.onclick=()=>{nativeClicks++;w.document.getElementById('v').innerHTML='<h2>Original '+a.dataset.route+'</h2>';};
 load('ui.js').mount();
 return {w,posts,choice,original,get nativeClicks(){return nativeClicks;},reject:()=>{reject=true;},close:()=>w.close()};
}
(async()=>{
 for(const role of ['Admin','Accountant','Coordinator','Teacher','Student'])for(const lang of ['en','ar']){
  const h=harness(role,lang),d=h.w.document;
  try{
   check(!d.querySelector('#extension-nav'),'no catch-all added sections for '+role);
   check(!d.body.textContent.includes('الأقسام المضافة')&&!d.body.textContent.includes('Added sections'),'obsolete section label removed');
   const group=key=>d.querySelector('[data-extension="'+key+'"]')?.closest('[data-nav-section]')?.dataset.navSection;
   check(group('requests')==='schedule','requests belong to scheduling for '+role);
   if(['Admin','Accountant'].includes(role)){check(group('student-statement')==='finance','student statements grouped in finance');check(group('plans')==='finance','plans grouped in finance');}
   if(role==='Teacher')check(group('teacher-statement')==='finance','teacher statement grouped in finance');
   if(role==='Admin')check(group('accounts')==='administration','student identity grouped in administration');
   check(!d.querySelector('[data-extension=withdrawals]'),'withdrawals have no standalone navigation destination');
   if(['Admin','Coordinator','Teacher'].includes(role))check(group('education')==='academy','learning grouped in academy');
   if(['Coordinator','Student','Teacher'].includes(role))check(!d.querySelector('[data-extension="accounts"]'),'restricted Admin link absent');
   check([...d.querySelectorAll('[data-extension]')].every(a=>a.querySelector('svg')),'consistent extension icons');
   for(const [route,link]of h.original){check(d.querySelector('[data-route="'+route+'"]')===link,'native handler node retained: '+route);}
   const links=[...d.querySelectorAll('[data-extension]')];check(new Set(links.map(a=>a.dataset.extension)).size===links.length,'no duplicate destinations');
   if(role!=='Student'){
    const req=d.querySelector('[data-extension="requests"]');req.click();await Promise.resolve();
    check(req.classList.contains('on'),'active extension link marked');
    check(!d.querySelector('[data-route].on'),'native route not falsely active');
    check(d.querySelector('#extension-view .extension-description')?.textContent.length>0,'shared heading description');
    const first=h.original.values().next().value;first.click();check(h.nativeClicks===1,'native route handler still runs once');
   }
  }finally{h.close();}
 }
 for(const lang of ['en','ar']){
  const h=harness('Student',lang),d=h.w.document;
  try{
   d.querySelector('[data-extension="schedule"]').click();await Promise.resolve();
   const form=d.querySelector('#extension-reschedule-form');form.elements.reason.value='Test request';
   await form.onsubmit(new h.w.Event('submit',{cancelable:true}));
   check(h.posts.length===0,'unchanged time rejected before dispatch');
   check(d.querySelector('#extension-reschedule-result').dataset.kind==='error','error appears beside send button');
   check(d.querySelector('#extension-reschedule-result').textContent.includes(lang==='ar'?'مختلف':'different'),'clear localized same-time explanation');
   check(form.elements.reason.value==='Test request','failed submit retains entered reason');
   form.elements.date.value='2026-11-10';form.elements.date.onchange();await form.onsubmit(new h.w.Event('submit',{cancelable:true}));
   check(h.posts.length===1,'valid changed time submitted once');
   check(d.querySelector('#extension-reschedule-result').dataset.kind==='success','visible local success confirmation');
   check(!!d.querySelector('#extension-reschedule-result [data-extension="requests"]'),'success links to approvals');
   await form.onsubmit(new h.w.Event('submit',{cancelable:true}));check(h.posts.length===1,'success disables repeat submit');
  }finally{h.close();}
  const denied=harness('Student',lang);try{
   const d=denied.w.document;d.querySelector('[data-extension="schedule"]').click();await Promise.resolve();const form=d.querySelector('#extension-reschedule-form');form.elements.reason.value='Keep this reason';form.elements.date.value='2026-11-10';form.elements.date.onchange();denied.reject();await form.onsubmit(new denied.w.Event('submit',{cancelable:true}));
   check(form.elements.reason.value==='Keep this reason','backend refusal preserves fields');check(!form.querySelector('[type="submit"]').disabled,'backend refusal allows correcting and retrying');check(form.querySelector('.extension-feedback').textContent.includes(lang==='ar'?'بانتظار':'awaiting'),'backend refusal translated beside button');
  }finally{denied.close();}
 }
 const timezone=harness('Student');try{
  const d=timezone.w.document;d.querySelector('[data-extension="schedule"]').click();await Promise.resolve();let form=d.querySelector('#extension-reschedule-form');
  check(d.querySelector('#extension-timezone').options.length===3,'three primary countries available');
  const lesson=d.querySelector('#extension-reschedule-lesson');lesson.value='Timetable:140:2026-11-16';lesson.onchange();
  form.elements.reason.value='Retain draft while changing country';
  const select=d.querySelector('#extension-timezone');select.value='Asia/Kuwait';await select.onchange();form=d.querySelector('#extension-reschedule-form');
  check(form.elements.date.value==='2026-11-16','selected lesson retained after country change');
  check(form.elements.starts_at.value==='17:00','draft time converts to Kuwait');
  check(form.elements.reason.value==='Retain draft while changing country','draft reason preserved');
  form.elements.date.value='2026-11-17';form.elements.date.onchange();
  check(form.elements.end_date.value==='2026-11-17','end date follows the selected lesson correctly');
 }finally{timezone.close();}
 console.log('PRESENTATION REGRESSION OK: '+n+' checks across five roles and both languages');
})().catch(e=>{console.error(e);process.exitCode=1;});
