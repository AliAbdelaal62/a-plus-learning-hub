// Deterministic SYNTHETIC dataset (schema v5). Every name starts with "DEV " so it cannot be mistaken for real data.
const fs=require('fs'),path=require('path');
let id=100;const nid=()=>id++;
const db={v:5,id:0,set:{name:'DEV A+ Hub (synthetic)',tr:'10',sr:'15',base:'KWD'},
 cur:[['EGP','Egyptian Pound'],['KWD','Kuwaiti Dinar'],['SAR','Saudi Riyal'],['USD','US Dollar']].map(a=>({c:a[0],n:a[1]})),
 rates:{EGP:{r:0.0064,t:'2026-01-01T00:00:00.000Z',type:'Manual'},SAR:{r:0.0820,t:'2026-01-01T00:00:00.000Z',type:'Manual'},USD:{r:0.3070,t:'2026-01-01T00:00:00.000Z',type:'Manual'}},
 t:[],s:[],sub:[],l:[],sp:[],tp:[],tt:[],pr:[],pp:[],rc:[],re:[],rm:[],rd:{}};
const T=(name,rate,cur)=>{const o={id:nid(),name,phone:'000',email:'',spec:'DEV',cur,rate,status:'Active',notes:''};db.t.push(o);return o};
const S=(name,cur,lv)=>{const o={id:nid(),name,uni:'DEV Univ',country:'',major:'',lv,cur,phone:'',email:'',status:'Active',notes:''};db.s.push(o);return o};
const t1=T('DEV Teacher 01',10000,'KWD'),t2=T('DEV Teacher 02',60000,'EGP'),t3=T('DEV Teacher 03',12500,'KWD');
const s1=S('DEV Student 01','KWD','Undergraduate'),s2=S('DEV Student 02','SAR','High School'),s3=S('DEV Student 03','EGP','Postgraduate'),s4=S('DEV Student 04','KWD','');
const s5=S('DEV Student 05','USD','High School');
const SUB=(name,type,o)=>{const z={id:nid(),name,type,uni:'DEV Univ',...o};db.sub.push(z);return z};
const m1=SUB('DEV Math','Live',{inst:t1.id,studs:[s1.id,s2.id]}),m2=SUB('DEV Physics','Live',{inst:t2.id,studs:[s3.id]}),m3=SUB('DEV Chemistry','Live',{inst:t3.id,studs:[s4.id,s1.id]});
const L=(date,t,s,sub,d,st,tc,sc,trx,srx,tr,sr,extra)=>{const cost=Math.round(d*tr),chg=Math.round(d*sr);
 const o={id:nid(),date,t:t.id,s:s.id,sub:sub.id,lv:'',d,tr,sr,st,tc,sc,trx,srx,bc:'KWD',bcost:Math.round(cost*trx),bchg:Math.round(chg*srx),rt:'Manual',notes:'',...extra};db.l.push(o);return o};
L('2026-08-03',t1,s1,m1,2,'Completed','KWD','KWD',1,1,10000,15000);
L('2026-08-10',t1,s2,m1,1.5,'Completed','KWD','SAR',1,0.082,10000,45000);
L('2026-08-12',t2,s3,m2,2,'Completed','EGP','EGP',0.0064,0.0064,60000,90000);
L('2026-09-02',t3,s4,m3,1,'Completed','KWD','KWD',1,1,12500,18000);
L('2026-09-04',t1,s1,m1,1,'Cancelled','KWD','KWD',1,1,10000,15000);
L('2026-09-06',t3,s1,m3,0.75,'Completed','KWD','KWD',1,1,12500,16000);
L('2026-09-09',t2,s3,m2,1,'No Show','EGP','EGP',0.0064,0.0064,60000,90000);
L('2026-10-07',t3,s5,m3,1.3,'Completed','KWD','USD',1,0.3070,12500,33333);
L('2026-10-01',t1,s2,m1,2,'Completed','KWD','SAR',1,0.081,10000,45000);
const P=(arr,p,date,cur,amt,rx,meth,extra)=>{db[arr].push({id:nid(),p:p.id,date,cur,amt,rx,rt:cur=='KWD'?'Same':'Manual',bamt:Math.round(amt*rx),bc:'KWD',meth,notes:'',...extra})};
P('sp',s1,'2026-08-05','KWD',20000,1,'Cash');P('sp',s2,'2026-08-11','SAR',60000,0.082,'Bank');P('sp',s3,'2026-08-13','EGP',100000,0.0064,'Cash');P('sp',s5,'2026-10-08','USD',12345,0.3070,'Bank');P('sp',s4,'2026-09-03','KWD',10000,1,'KNET');
P('tp',t1,'2026-08-15','KWD',10000,1,'Cash',{src:'Live',srcd:'',lk:0});P('tp',t2,'2026-08-20','EGP',120000,0.0064,'Bank',{src:'Live',srcd:'',lk:0});P('tp',t3,'2026-09-10','KWD',5000,1,'Cash',{src:'Other',srcd:'DEV bonus',lk:0});P('tp',t1,'2026-07-01','KWD',3000,1,'Cash');
const pj=(name,t,s,status,cur,rev,share,rx,start,paid0)=>{const z=SUB(name,'Project',{});const p={id:nid(),name,sub:'',subj:z.id,uni:'DEV Univ',t:t.id,s:s.id,lv:'',status,cur,rev,share,rx,rt:'Manual',bc:'KWD',start,due:'',paid0,notes:''};db.pr.push(p);return p};
const pr1=pj('DEV Project Alpha',t1,s1,'In Progress','KWD',100000,40,1,'2026-08-15',10000),pr2=pj('DEV Project Beta',t2,s3,'In Progress','EGP',500000,30,0.0064,'2026-09-01',0),pr3=pj('DEV Project Gamma',t3,s4,'Cancelled','KWD',50000,50,1,'2026-09-05',0);
const pr4=pj('DEV Project Delta',t3,s5,'In Progress','USD',12345,35,0.3070,'2026-10-03',1111);
db.pp.push({id:nid(),pr:pr1.id,date:'2026-09-12',amt:20000,meth:'Bank',notes:''},{id:nid(),pr:pr2.id,date:'2026-10-02',amt:100000,meth:'Cash',notes:''});
const rcz=(name,inst,cur,rx,cost,price,n,share,date)=>{const z=SUB(name,'Recorded',{});const c={id:nid(),name,sub:'',subj:z.id,uni:'DEV Univ',inst:inst.id,lv:'',cur,rx,rt:'Manual',bc:'KWD',cost,price,n,share,date,notes:''};db.rc.push(c);return c};
const c1=rcz('DEV Course A',t3,'KWD',1,5000,30000,3,30,'2026-08-20'),c2=rcz('DEV Course B',t2,'SAR',0.082,0,100000,2,25,'2026-09-15');
const c3=rcz('DEV Course C',t1,'USD',0.3070,777,12345,1,30,'2026-10-04');
db.re.push({id:nid(),rc:c3.id,s:s5.id,date:'2026-10-05',price:12345,paid:7777},{id:nid(),rc:c1.id,s:s1.id,date:'2026-08-21',price:30000,paid:30000},{id:nid(),rc:c1.id,s:s4.id,date:'2026-08-22',price:30000,paid:10000},{id:nid(),rc:c2.id,s:s2.id,date:'2026-09-16',price:100000,paid:0});
db.rm.push({id:nid(),name:'DEV send lectures',rc:c1.id,days:[1,4],time:'18:00',a:'2026-08-20',b:'',f:'weekly'});
db.rd[db.rm[0].id+'|2026-09-07']=1;
db.tt.push({id:nid(),sched:'rec',wt:'Live',date:'2026-08-03',day:'Monday',dw:1,a:'2026-08-03',b:'',st:'16:00',en:'18:00',t:t1.id,lv:'',s:[s1.id,s2.id],sub:'DEV Math',notes:'',ex:{'2026-08-10':{done:1},'2026-08-17':{cancelled:1}}},
 {id:nid(),sched:'one',wt:'Live',date:'2026-10-05',day:'Monday',st:'10:00',en:'11:00',t:t3.id,lv:'',s:[s4.id],sub:'DEV Chemistry',notes:'',ex:{},done:1});
db.id=id;
const out=path.join(__dirname,'..','fixtures');
fs.writeFileSync(path.join(out,'synthetic-v5.json'),JSON.stringify(db,null,1));
// legacy (pre-v2) shape: no v, no currencies/base/bcost/bamt -> exercises the existing migration only
const lg={t:[{id:1,name:'DEV Legacy Teacher',rate:10000}],s:[{id:2,name:'DEV Legacy Student'}],sub:[],l:[{id:3,date:'2026-01-05',t:1,s:2,sub:'x',d:2,tr:10000,sr:15000,st:'Completed',notes:''}],sp:[{id:4,p:2,date:'2026-01-06',amt:20000,meth:'Cash'}],tp:[{id:5,p:1,date:'2026-01-07',amt:5000,meth:'Cash'}],set:{name:'DEV Legacy',tr:'10',sr:'15'},id:6};
fs.writeFileSync(path.join(out,'synthetic-legacy.json'),JSON.stringify(lg,null,1));
console.log('records:',Object.fromEntries(['t','s','sub','l','sp','tp','tt','pr','pp','rc','re','rm'].map(k=>[k,db[k].length])));
