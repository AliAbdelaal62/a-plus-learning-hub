'use strict';
const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'..'),file=path.join(root,'data','treasury-ui-synthetic.sqlite');
if(!fs.existsSync(file)){
 const st=structuredClone(require('../fixtures/synthetic-v5.json'));st.set.name='Treasury UI — SYNTHETIC TEST ONLY';st.tp=[];st.l=st.l.filter(l=>l.st==='Completed').slice(0,2).map((l,i)=>({...l,t:100,s:103,sub:108,date:'2026-10-'+(10+i),d:2,tr:500000,tc:'EGP',trx:.0064,bc:'KWD',bcost:6400,oc:1000000}));
 require('../src/importer').migrate(JSON.stringify(st),{mode:'apply',target:file});const db=require('../src/db').open(file),T=require('../src/team');for(const [username,role,teacher_id]of [['ui.admin','Admin',null],['ui.accounts','Accountant',null],['ui.teacher','Teacher',100],['ui.coord','Coordinator',null]])T.createUser(db,{username,display_name:username,role,teacher_id,password:'SyntheticOnly#2026!'},'synthetic-ui-test');db.close();
}
require('../src/server').start({port:3007,dbFile:file,backupDir:path.join(root,'backups-ui'),authRequired:true,scheduler:false,log:console.error}).then(s=>console.log('Synthetic UI tests only: '+s.url)).catch(e=>{console.error(e.message);process.exit(1)});
