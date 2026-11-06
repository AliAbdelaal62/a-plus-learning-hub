'use strict';
// This launcher can only create/open its named synthetic demonstration database.
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..'),file=path.join(root,'data','management-demo.sqlite');
const {start}=require('../src/server'),{open}=require('../src/db'),{assemble}=require('../src/state'),O=require('../src/operations'),cairo=require('../src/cairo');
if(!fs.existsSync(file)){
 const sample=JSON.parse(JSON.stringify(require('../fixtures/synthetic-v5.json')));
 sample.set.name='A+ Hub - Management Preview (DEMO)';
 const source=sample.l.filter(l=>l.st==='Completed').slice(0,2),today=cairo.today();
 for(const l of source){const copy={...l,id:sample.id++,date:today};delete copy.tt;delete copy.od;sample.l.push(copy);}
 require('../src/importer').migrate(JSON.stringify(sample),{mode:'apply',target:file});
 const db=open(file),st=assemble(db),lessons=st.l.filter(l=>l.date===today),lesson=lessons[0];
 const write=(kind,record)=>O.write(db,{baseRev:require('../src/save').getRev(db),kind,record});
 const reg=write('registration',{student_id:lesson.s,teacher_id:lesson.t,subject_id:lesson.sub,title:'Demo: exam preparation',starts_on:today,status:'Active',goal:'Review topics and practise exam questions.',billing_basis:'Package',agreed_price:120000,currency:'KWD',planned_sessions:4}).record;
 write('task',{title:'Demo: confirm next lesson',owner:'Academy coordinator',due_on:today,priority:'High',status:'Open',student_id:lesson.s,registration_id:reg.id,detail:'Contact the student and record the agreed lesson time.',result:''});
 if(lessons[1])write('attendance',{lesson_id:lessons[1].id,status:'Absent',note:'Demonstration only: follow-up required.'});

 const T=require('../src/team');
 if(!st.s.every(s=>s.name.startsWith('DEV ')))throw Error('Demo accounts may only be seeded in the synthetic database.');
 const users=[['demo.admin','Demo administrator','Admin',null,'DemoAdmin#2026!'],['demo.coordinator','Demo coordinator','Coordinator',null,'DemoCoord#2026!'],['demo.accounts','Demo accountant','Accountant',null,'DemoAccounts#2026!'],['demo.teacher','Demo teacher','Teacher',lesson.t,'DemoTeacher#2026!']];
 for(const [username,display_name,role,teacher_id,password] of users)T.createUser(db,{username,display_name,role,teacher_id,password},'synthetic-demo-setup');
 const M=require('../src/management'),actor={id:1,username:'demo.admin',role:'Admin'},mw=(kind,record)=>M.write(db,{baseRev:require('../src/save').getRev(db),kind,record},actor).record;
 mw('availability',{teacher_id:lesson.t,weekday:new Date(today+'T12:00:00Z').getUTCDay(),starts_at:'09:00',ends_at:'17:00',active:1});
 mw('session',{teacher_id:lesson.t,student_id:lesson.s,subject_id:lesson.sub,date:today,starts_at:'11:00',ends_at:'12:00',status:'Proposed',kind:'Lesson',note:'Demo booking - confirm with both parties.'});
 const contract=mw('contract',{registration_id:reg.id,total:120000,currency:'KWD',sessions:4,starts_on:today});
 mw('installment',{contract_id:contract.id,due_on:today,amount:60000,note:'First installment'});
 mw('installment',{contract_id:contract.id,due_on:cairo.addDays(today,14),amount:60000,note:'Second installment'});
 const project=st.pr.find(p=>p.status!=='Cancelled');if(project)mw('stage',{project_id:project.id,title:'Demo: first draft',owner:'Project teacher',due_on:cairo.addDays(today,3),status:'In Progress',url:'',note:'Deliver draft for academy review.'});
 const enrollment=st.re[0];if(enrollment)mw('delivery',{enrollment_id:enrollment.id,title:'Demo: lecture materials',planned_on:today,status:'Planned',url:'',note:'Record the actual sent date after delivery.'});
 console.log('DEMO ACCOUNTS ONLY: demo.admin / DemoAdmin#2026! | demo.coordinator / DemoCoord#2026! | demo.accounts / DemoAccounts#2026! | demo.teacher / DemoTeacher#2026!');
 db.close();
}
start({port:3004,dbFile:file,backupDir:path.join(root,'backups-demo'),scheduler:false,authRequired:true,log:console.error}).then(s=>{
 console.log('DEMONSTRATION ONLY - real academy data is not connected.');console.log('Open '+s.url);console.log('Database: '+file);
 for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>s.close().then(()=>process.exit(0)));
}).catch(e=>{console.error(e.code==='EADDRINUSE'?'Port 3004 is already in use. Open http://localhost:3004/ or close its previous demo session.':e.message);process.exitCode=1});
