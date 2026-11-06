// Generates public/index.html from the READ-ONLY production reference. Each change is an exact, single-occurrence text replacement; the build fails loudly if the source ever changes shape.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'production-reference', 'aplus-hub-academy-v8.html'), 'utf8');
const want = fs.readFileSync(path.join(root, 'docs', 'prod-reference.sha256'), 'utf8').trim().split(/\s+/)[0];
const got = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'production-reference', 'aplus-hub-academy-v8.html'))).digest('hex');
if (want && got !== want) throw new Error('production reference does not match its recorded hash; refusing to build');
let h = src; const log = [];
function rep(from, to, name) { const n = h.split(from).length - 1; if (n !== 1) throw new Error(`patch "${name}" matched ${n} times (expected 1)`); h = h.replace(from, () => to); log.push(name); }
function repRange(startMark, endMark, to, name) { const a = h.indexOf(startMark), b = h.indexOf(endMark, a); if (a < 0 || b < 0 || h.indexOf(startMark, a + 1) >= 0) throw new Error(`range patch "${name}" not found uniquely`); h = h.slice(0, a) + to + h.slice(b); log.push(name); }

rep('<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>', '<script src="/vendor/chart.umd.min.js"></script>', 'chart.js served locally');
rep('<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>', '<script src="/vendor/xlsx.full.min.js"></script>', 'xlsx served locally');
rep('<title>A+ Hub Academy Management System</title>', '<title>A+ Hub Academy</title>', 'title');
// ---- load / save through the local server instead of browser storage
const API = `/* ---- localhost build: data comes from the local server, not from browser storage ---- */
function apiX(m,u,b){const x=new XMLHttpRequest();x.open(m,u,false);x.setRequestHeader('X-APlus-Token',(document.querySelector('meta[name=aplus-token]')||{}).content||'');if(b!==undefined)x.setRequestHeader('Content-Type','application/json');x.send(b===undefined?null:JSON.stringify(b));let j;try{j=JSON.parse(x.responseText)}catch(e){throw new Error('the server gave an unreadable answer (HTTP '+x.status+')')}if(x.status<200||x.status>=300||j.ok===false){const e=new Error(j.error||('HTTP '+x.status));e.detail=j.detail;e.status=x.status;throw e}return j}
let REV=0;
`;
rep("let db=null,LOCK='',RAW=null,LASTGOOD='',SAVEBAD='';\ntry{RAW=localStorage.getItem('aplus')}catch(e){LOCK='Browser storage is blocked or unavailable ('+(e&&e.message||e)+').'}",
  API + "let db=null,LOCK='',RAW=null,LASTGOOD='',SAVEBAD='';\ntry{const r=apiX('GET','/api/state');REV=r.rev;RAW=JSON.stringify(r.state)}catch(e){LOCK='The A+ Hub server could not be reached, or its data could not be read ('+(e&&e.message||e)+'). Start the server and reload this page.'}", 'load from /api/state');
rep("localStorage.setItem('aplus',s);if(localStorage.getItem('aplus')!==s)throw new Error('the browser did not keep the data');LASTGOOD=s;", "let r;try{r=apiX('POST','/api/save',{baseRev:REV,state:db})}catch(e){const nc=e&&e.detail&&e.detail.needsConfirm;if(!nc)throw e;const names=nc.map(x=>x.label||(x.k+' '+x.id)).slice(0,8).join('; ');const why=window.PREASON||window.prompt('A typed reason is required for this financial change ('+nc.length+'): '+names+'\\n\\nType the reason (at least 3 characters), or Cancel to undo the change. The reason is saved in the audit log.');if(!why||why.trim().length<3){location.reload();throw new Error('Change cancelled: nothing was changed')}r=apiX('POST','/api/save',{baseRev:REV,state:db,confirm:nc.map(x=>({k:x.k,id:x.id,reason:why.trim()}))})}REV=r.rev;LASTGOOD=s;", 'save to /api/save (with typed-reason flow)');
rep("SAVEBAD='The browser refused the save ('+(e&&e.message||e)+').';", "SAVEBAD='The server did not save this change ('+(e&&e.message||e)+(e&&e.detail?' — '+JSON.stringify(e.detail).slice(0,500):'')+').';", 'save error text');
rep("function setBase(v){if(v==B())return;ask(", "function setBase(v){if(v==B())return;try{const st=apiX('GET','/api/health');if(st&&st.hasHistory!==false){return note('<b class=neg>The base currency is locked.</b> This academy already has recorded history, and changing the base currency would silently change every total. The server will refuse the change. A safe conversion workflow is an owner decision (see the remediation report).')}}catch(e){}ask(", 'setBase UI warns when history exists');
rep("curO().map(o=>`<option value=\"${o[0]}\" ${o[0]==B()?'selected':''}>${o[1]}</option>`)", "curO().map(o=>`<option value=\"${E(o[0])}\" ${o[0]==B()?'selected':''}>${E(o[1])}</option>`)", 'L7: escape base-currency option labels');
rep('Free up browser storage or allow site data, then repeat the change.', 'Read the reason above. If the server is not running, start it and reload the page; if the data changed in another tab, reload first.', 'banner text');
rep("const storageOK=()=>{if(LOCK||!LASTGOOD)return false;try{localStorage.setItem('aplus',LASTGOOD);return localStorage.getItem('aplus')===LASTGOOD}catch(e){return false}};", "const storageOK=()=>{if(LOCK)return false;try{apiX('GET','/api/health');return true}catch(e){return false}};", 'storage check = server health');
repRange('function recoveryPage(){', 'async function dlRaw(){', "function recoveryPage(){return `<h2 class=neg>Cannot load the data</h2><div class=cd style=\"max-width:760px\"><p><b>${E(LOCK)}</b></p><p><b>Nothing has been changed or deleted.</b> Your data is in the database file on this computer. Start the server (start-aplus.cmd), then reload this page.</p></div>`}\n", 'recovery page');
// ---- backups UI (SQLite backups on this computer + the old JSON export)
const BK = `function bkUI(){let L=[];try{L=apiX('GET','/api/backups').backups}catch(e){}
 return \`<h3>Backups (on this computer)</h3><div class=cd style="max-width:760px"><p>Your data lives in the database file on this computer. A backup is a verified copy of the whole database (integrity and foreign-key checks run on every backup). <b>Copy backups to another drive</b> — a backup beside the database does not protect against a disk failure.</p><div class=bar><button class=b onclick="srvBackup()">Create backup now</button><button class=b2 onclick="doBackup()">Download JSON export</button></div>\${L.length?T(['Backup','Created','Records',''],L.map(b=>[E(b.name),E(fmtD(b.createdAt)),E(b.counts?Object.entries(b.counts).filter(a=>a[1]).map(a=>a[1]+' '+a[0]).join(', '):''),\`<button class=lk onclick="srvRestore('\${b.name}')">Restore…</button>\`])):'<p class=mut><b class=neg>No backups have been made yet.</b></p>'}<p class=mut>Restore first makes a safety backup of the current data, verifies the chosen backup, and rolls everything back if a step fails.</p></div>\${origCurPanel()}\`}
function srvBackup(){try{const r=apiX('POST','/api/backups',{label:'manual'});note('<b>Backup created and verified.</b> '+E(r.backup.name));render()}catch(e){note('<b class=neg>Backup failed.</b> '+E(e.message))}}
function srvRestore(n){ask(\`Restore <b>\${E(n)}</b>? This REPLACES all current data. A safety backup of the current data is made first.\`,()=>{try{const r=apiX('POST','/api/restore',{name:n,confirm:true});note('<b>Restored.</b> Safety backup of the previous data: '+E(r.safetyBackup)+'. Reloading…');setTimeout(()=>location.reload(),900)}catch(e){note('<b class=neg>Restore did not complete.</b> '+E(e.message)+'<br>Your current data is unchanged.')}},'Restore')}
function origCurPanel(){let r;try{r=apiX('GET','/api/reports/original-currency')}catch(e){return ''}
 const cs=Object.keys(r.byCurrency).sort(),F=[['lessonRevenue','Lesson revenue'],['lessonCost','Lesson teacher cost'],['projectRevenue','Project revenue'],['projectShare','Project teacher share'],['courseRevenue','Course revenue'],['courseShare','Course share'],['courseCost','Course cost'],['studentPayments','Student payments'],['teacherPayments','Teacher payments'],['projectPayments','Project payments']];
 return \`<h3>Totals by original currency</h3><p class=mut>\${E(r.note)} Elsewhere in the app, amounts shown in \${E(B())} are converted with the rate saved on each record, never today's rate.</p>\${T(['Currency',...F.map(x=>x[1])],cs.map(c=>[c,...F.map(x=>n3(r.byCurrency[c][x[0]]))]))}\`}
`;
repRange('function bkUI(){', 'async function pickRestore', BK, 'backup panel');
repRange('async function pickRestore', 'function recoveryPage(){', '', 'remove browser-storage restore code');
// ---- Decision B: new-work teacher selectors exclude Inactive teachers (current value of an existing record is kept)
rep("${x.o.map(o=>`<option value=\"${E(o[0])}\" ${(x.t=='multi'", "${fo(x,v).map(o=>`<option value=\"${E(o[0])}\" ${(x.t=='multi'", "form options honour tch flag");
rep("{k:'t',l:dn?'Instructor':'Teacher',t:'sel',o:tO(),q:1}", "{k:'t',l:dn?'Instructor':'Teacher',t:'sel',o:tO(),q:1,tch:1}", "lesson teacher selector");
rep("{k:'t',l:'Teacher',t:'sel',o:[['','—'],...tO()]}", "{k:'t',l:'Teacher',t:'sel',o:[['','—'],...tO()],tch:1}", "timetable teacher selector");
rep("{k:'t',l:'Teacher / Engineer',t:'sel',o:[['','—'],...tO()]}", "{k:'t',l:'Teacher / Engineer',t:'sel',o:[['','—'],...tO()],tch:1}", "project teacher selector");
rep("{k:'inst',l:'Instructor / Engineer',t:'sel',o:[['','—'],...tO()]}", "{k:'inst',l:'Instructor / Engineer',t:'sel',o:[['','—'],...tO()],tch:1}", "course instructor selector");
rep("{k:'inst',l:'Instructor',t:'sel',o:[['','— Select —'],...tO()],r:1,q:1}", "{k:'inst',l:'Instructor',t:'sel',o:[['','— Select —'],...tO()],r:1,q:1,tch:1}", "subject instructor selector");
rep("t:'sel',o:tc?tO():sO()}", "t:'sel',o:tc?tOL():sO()}", "teacher payment selector keeps all teachers, labelled");
rep("{k:'inst',l:'Instructor / Engineer',t:'sel',o:[['','—'],...tO()],q:1}", "{k:'inst',l:'Instructor / Engineer',t:'sel',o:[['','—'],...tO()],q:1,tch:1}", "new-subject instructor selector");
// ---- Decision A: original-currency default for Reports, Cash Flow and a Dashboard strip (originals are kept as ...Conv and used for the converted view)
rep('function vDash(){', 'function vDashConv(){', 'keep converted dashboard');
rep('function vRep(){', 'function vRepConv(){', 'keep converted reports');
rep('function vCF(){', 'function vCFConv(){', 'keep converted cash flow');
rep('async function xp(k){', 'async function xpConv(k){', 'keep converted report export');
rep('async function xpCF(){', 'async function xpCFConv(){', 'keep converted cash-flow export');
const { makeOrig } = require('../src/orig');
const origUi = fs.readFileSync(path.join(root, 'src', 'client', 'orig-ui.js'), 'utf8');
rep('function vSP(){', 'function vSP0(){', 'student details wrapper');
rep('function vPRD(){', 'function vPRD0(){', 'project details wrapper');
rep('function vRCD(){', 'function vRCD0(){', 'course details wrapper');
const { makeLedger } = require('../src/ledger');
const ledgerUi = fs.readFileSync(path.join(root, 'src', 'client', 'ledger-ui.js'), 'utf8');
rep('/* ---- Phase 1: data protection', '/* ---- shared financial ledger (src/ledger.js, injected) ---- */\nconst makeLedger=' + makeLedger.toString() + ';\n/* ---- original-currency reporting (src/orig.js, injected) ---- */\nconst makeOrig=' + makeOrig.toString() + ';\n' + origUi + '\n' + ledgerUi + '\n/* ---- Phase 1: data protection', 'original-currency reports (Decision A) + shared ledger (Phase 2)');
// ---- Phase 2 display sites: every teacher balance reads the shared ledger; payments are dated; cancellation needs a resolution
rep("pd=k_((p.paid0||0)+db.pp.filter(x=>x.pr==p.id&&x.date<=E).reduce((q,x)=>q+x.amt,0),p.rx)", "pd=k_(p.paid0||0,p.rx)+db.pp.filter(x=>x.pr==p.id&&x.date<=E).reduce((q,x)=>q+PPB(x),0)", 'H3 outstanding students: project payments at their own frozen base amount');
rep("pp=db.pp.filter(p=>inM(p.date)).reduce((q,p)=>q+k_(p.amt,(g(db.pr,p.pr)||{rx:1}).rx||1),0)", "pp=db.pp.filter(p=>inM(p.date)).reduce((q,p)=>q+PPB(p),0)", 'H3 cash flow: project payments at their own frozen base amount');
rep("rx:j.rx||1,base:k_(p.amt,j.rx||1)", "rx:p.rx||0,base:PPB(p)", 'H3 cash-flow list: own rate and base amount');
rep("p.amt,j.rx,k_(p.amt,j.rx||1),p.notes", "p.amt,p.rx==null?'':p.rx,p.bamt==null?'':p.bamt,p.notes", 'H3 export: own rate and base amount');
rep("card('Owed to Teacher',f(s.cost))+card('Paid to Teacher',f(s.paid))+card('Remaining Owed',f(s.rem),s.rem>0?'neg':'pos')", "card('Total Earned (all work)',f(TSum(t.id).earn))+card('Lesson earnings only',f(s.cost))+card('Paid to Teacher',f(TSum(t.id).paid))+card('Remaining, net in '+B()+(TSum(t.id).netted?' (mixed currencies)':''),f(TSum(t.id).rem),TSum(t.id).rem>0?'neg':'pos')", 'H1 teacher details use the shared ledger');
rep('+tFin(t.id)+twk(t.id)', "+`<h3>Balance by original currency</h3><p>${tCur(t.id)}</p><p>${tNet(t.id)}</p>`+tSettle(t.id)+tFin(t.id)+twk(t.id)", 'H1 teacher details: per-currency balance');
rep("T(['Teacher','Earned','Paid','Remaining'],db.t.map(x=>{const s=TS(x.id);return[E(x.name),f(s.cost),f(s.paid),`<b class=${s.rem>0?'neg':'pos'}>${f(s.rem)}</b>`]}))", "T(['Teacher','Earned (all work)','Paid','Remaining ('+B()+')','By original currency'],db.t.map(x=>{const s=TSum(x.id);return[E(x.name),f(s.earn),f(s.paid),`<b class=${s.rem>0?'neg':'pos'}>${f(s.rem)}</b>`,tCur(x.id)+(s.netted?'<br>'+tNet(x.id):'')]}))+`<div class=bar><button class=b2 onclick=ledgerChecks()>Ledger checks…</button></div>`", 'H1 payments page uses the shared ledger');
rep('TS(t.id).rem]', 'TSum(t.id).rem]', 'H1 reports balance uses the shared ledger');
rep(",{k:'paid',l:'Amount Paid',t:'number'}]", "]", 'H5 enrolment form: money is recorded as dated course payments');
rep("x?{...x,price:x.price/1000,paid:x.paid/1000}:{date:today(),price:c.price/1000,paid:0},o=>{const d={rc:c.id,s:+o.s,date:o.date,price:m(o.price),paid:m(o.paid)};", "x?{...x,price:x.price/1000}:{date:today(),price:c.price/1000},o=>{const d={rc:c.id,s:+o.s,date:o.date,price:m(o.price),paid:x?x.paid:0};", 'H5 enrolment save keeps paid');
rep("const d={name:o.name,sub:o.sub,uni:o.uni,t:+o.t||0,s:+o.s||0,lv:o.lv,status:o.status,", "if(o.status=='Cancelled'&&(!x||x.status!='Cancelled')&&LEDGER.projectResolution(db,x?x.id:-1).received>0)return 'This project has received money. Close this form and use \\u201cCancel project\\u2026\\u201d on the project page so the money is refunded, kept as credit, or explicitly resolved.';const d={name:o.name,sub:o.sub,uni:o.uni,t:+o.t||0,s:+o.s||0,lv:o.lv,status:o.status,", 'M2 project form cannot cancel a paid project');
// ---- safer deletion: impact preview, archive instead of delete when there is history
const GUARD = `function guardDel(k,id,what,archive,hard){let im;try{im=apiX('GET','/api/impact?e='+k+'&id='+id)}catch(e){return note('Could not check what depends on this '+what+' ('+E(e.message)+'). Nothing was deleted.')}
 if(!im.total)return ask('Delete this '+what+'? Nothing else depends on it.',hard);
 const rows=Object.entries(im.dependants).map(a=>'<li>'+a[1]+' '+E(a[0])+'</li>').join('');
 modal(\`<h3 style="margin-top:0">This \${what} has history and will not be deleted</h3><p>Deleting it would destroy or orphan:</p><ul>\${rows}</ul><p>\${E(im.advice)}</p><div class=r><button class=b2 onclick=close()>Keep it</button>\${archive?\`<button class=b id=arch>\${archive[0]}</button>\`:''}</div>\`);
 if(archive)$('#arch').onclick=()=>{close();archive[1]()}}
`;
const del = (name, old, neu) => { const a = h.indexOf('const ' + name + '='); if (a < 0 || h.indexOf('const ' + name + '=', a + 1) >= 0) throw new Error('delete fn ' + name); const b = h.indexOf('\n', a); h = h.slice(0, a) + neu + h.slice(b); log.push('safer delete: ' + name); };
del('dlT', 0, GUARD + "const dlT=id=>guardDel('t',id,'teacher',['Archive (set Inactive)',()=>{g(db.t,id).status='Inactive';V.tid=null;save();render()}],()=>{db.t=db.t.filter(x=>x.id!=id);V.tid=null;save();render()});");
del('dlS', 0, "const dlS=id=>guardDel('s',id,'student',['Archive (set Inactive)',()=>{g(db.s,id).status='Inactive';V.sid=null;save();render()}],()=>{db.s=db.s.filter(x=>x.id!=id);V.sid=null;save();render()});");
del('dlPR', 0, "const dlPR=id=>guardDel('pr',id,'project',['Cancel the project (kept; money received must be resolved)',()=>{edCancelPrj(id)}],()=>{{const p0=g(db.pr,id);if(p0)db.sub=db.sub.filter(z=>z.id!=p0.subj)}db.pr=db.pr.filter(p=>p.id!=id);V.prid=null;save();render()});");
del('dlRC', 0, "const dlRC=id=>guardDel('rc',id,'course',null,()=>{{const c0=g(db.rc,id);if(c0)db.sub=db.sub.filter(z=>z.id!=c0.subj)}db.rc=db.rc.filter(c=>c.id!=id);db.rm=db.rm.filter(r=>r.rc!=id);V.rcid=null;save();render()});");
del('dlSub', 0, "const dlSub=id=>guardDel('sub',id,'subject',null,()=>{db.sub=db.sub.filter(z=>z.id!=id);save();render()});");
// ---- Phase 3 (stabilisation) --------------------------------------------------------------------------------------------------------------------------
function repAll(from, to, name, expected) { const n = h.split(from).length - 1; if (n !== expected) throw new Error(`patch "${name}" matched ${n} times (expected ${expected})`); h = h.split(from).join(to); log.push(name); }
const p3Ui = fs.readFileSync(path.join(root, 'src', 'client', 'phase3-ui.js'), 'utf8');
rep('/* ---- Phase 1: data protection', p3Ui + '\n/* ---- Phase 1: data protection', 'Phase 3 page module');
// M4: the business date is the Africa/Cairo calendar date, not the UTC date
rep("const today=()=>new Date().toISOString().slice(0,10);", "const CAIRO_F=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'});const today=d=>{const p={};CAIRO_F.formatToParts(d||new Date()).forEach(x=>p[x.type]=x.value);return p.year+'-'+p.month+'-'+p.day};", 'M4: today() is the Africa/Cairo date');
rep("r?new Date(r.t).toLocaleString():'—'", "r?(isNaN(Date.parse(r.t))?'unknown':new Date(r.t).toLocaleString('en-GB',{timeZone:'Africa/Cairo'})+' (Cairo)'):'—'", 'M4: rate time shown in Cairo time');
rep("db.rst='Updated '+new Date().toLocaleString()+' ('+n+' rates)'", "db.rst='Updated '+new Date().toLocaleString('en-GB',{timeZone:'Africa/Cairo'})+' Cairo time ('+n+' rates)'", 'M4: refresh time shown in Cairo time');
// M5: Live is only ever shown for a recently refreshed rate
rep("const rty=(c,r,keep)=>c==B()?'Same':keep||(rate(c)&&rate(c).r==r?rate(c).type:'Manual');", "const rty=(c,r,keep)=>c==B()?'Same':keep||(rate(c)&&rate(c).r==r?rst_(c):'Manual');", 'M5: a stale rate is recorded as Stale, not Live');
rep("const ty=(a,b)=>a=='Manual'||b=='Manual'?'Manual':a=='Live'||b=='Live'?'Live':", "const ty=(a,b)=>a=='Manual'||b=='Manual'?'Manual':a=='Stale'||b=='Stale'?'Stale':a=='Live'||b=='Live'?'Live':", 'M5: combined rate type keeps Stale');
rep("c.c==B()?'Base':r?r.type:'No rate'", "c.c==B()?'Base':r?(rst_(c.c)=='Stale'?'<span class=neg><b>Stale</b> — not live; refresh</span>':E(r.type)):'No rate'", 'M5: settings table status');
rep("Data is stored in this browser.", "Data is stored in the local A+ Hub database on this computer.", 'G: settings text no longer says browser');
// M10: configurable profit recognition (default = existing behaviour)
rep("value=\"${E(s.sr)}\"></label></div>", "value=\"${E(s.sr)}\"></label><label class=w>Project profit is recognised<select id=s_recog><option value=booking ${s.recog!='delivered'?'selected':''}>when the project is booked (default, existing behaviour)</option><option value=delivered ${s.recog=='delivered'?'selected':''}>only when the project is Completed</option></select></label><label class=w>Exchange rates count as out of date after (hours)<input id=s_rfh type=number min=1 max=720 step=1 value=\"${E(s.rfh||36)}\"></label></div>", 'M10: recognition setting (form)');
rep("Object.assign(db.set,{name:$('#s_name').value||'A+ Hub Academy',tr:$('#s_tr').value,sr:$('#s_sr').value})", "Object.assign(db.set,{name:$('#s_name').value||'A+ Hub Academy',tr:$('#s_tr').value,sr:$('#s_sr').value,recog:$('#s_recog').value,rfh:String(Math.min(720,Math.max(1,parseInt($('#s_rfh').value)||36)))})", 'M10: recognition setting (save)');
// filters: L3 (intended currency dimension), L4 (undated projects / courses), M10 (recognition)
rep("(!F.cur||l.tc==F.cur||l.sc==F.cur)", "(!F.cur||(F.cr=='t'?l.tc:l.sc)==F.cur)", 'L3: lesson currency filter targets one dimension');
rep("p.status!='Cancelled'&&(!F.sub||p.subj==F.sub)&&inD(F,p.start)&&(!F.t||p.t==F.t)", "p.status!='Cancelled'&&(db.set.recog!='delivered'||p.status=='Completed')&&(!F.sub||p.subj==F.sub)&&(p.start?inD(F,p.start):(F.ud=='1'||!(F.a||F.b)))&&(!F.t||p.t==F.t)", 'L4+M10: undated projects handled explicitly');
rep("&&inD(F,c.date)&&(!F.t||c.inst==F.t)", "&&(c.date?inD(F,c.date):(F.ud=='1'||!(F.a||F.b)))&&(!F.t||c.inst==F.t)", 'L4: undated courses handled explicitly');
const CRSEL = (o, k) => `[['s','Student charge currency'],['t','Teacher cost currency']]`;
rep("${fs('F','cur',cF(),'All currencies')}", "${fs('F','cur',cF(),'All currencies')}${fs('F','cr',[['s','Student charge currency'],['t','Teacher cost currency']],'Currency applies to: student charge')}", 'L3: dashboard currency dimension selector');
rep("${fs('LF','cur',cF(),'All currencies')}", "${fs('LF','cur',cF(),'All currencies')}${fs('LF','cr',[['s','Student charge currency'],['t','Teacher cost currency']],'Currency applies to: student charge')}", 'L3: lessons currency dimension selector');
repAll("${fsr('cur',cF(),'All currencies')}", "${fsr('cur',cF(),'All currencies')}${fsr('cr',[['s','Student charge currency'],['t','Teacher cost currency']],'Currency applies to: student charge')}", 'L3: reports currency dimension selector', 2);
// M3: the Payments report filters project payments by their project's student / teacher / currency and includes dated course payments
rep("...(F.s||F.t||F.wt&&F.wt!='Project'?[]:db.pp.filter(p=>inR(p.date)).map(p=>{const j=g(db.pr,p.pr)||{};return['Project payment',p.date,j.name||'',p.meth,j.cur,p.amt,p.rx==null?'':p.rx,p.bamt==null?'':p.bamt,p.notes,'','']}))]",
    "...(F.wt&&F.wt!='Project'?[]:db.pp.filter(p=>{const j=g(db.pr,p.pr)||{};return inR(p.date)&&(!F.s||j.s==F.s)&&(!F.t||j.t==F.t)&&(!F.cur||(p.cur||j.cur)==F.cur)}).map(p=>{const j=g(db.pr,p.pr)||{};return['Project payment',p.date,j.name||'',p.meth,p.cur||j.cur,p.amt,p.rx==null?'':p.rx,p.bamt==null?'':p.bamt,p.notes,'','']})),...(F.t||F.wt&&F.wt!='Recorded'?[]:db.cp.filter(p=>{const e=g(db.re,p.re)||{};return inR(p.date)&&(!F.s||e.s==F.s)&&(!F.cur||p.cur==F.cur)}).map(p=>{const e=g(db.re,p.re)||{},c=g(db.rc,e.rc)||{};return['Course payment',p.date,sn(e.s)+' — '+(c.name||''),p.meth,p.cur,p.amt,p.rx==null?'':p.rx,p.bamt==null?'':p.bamt,p.notes,'',''] }))]", 'M3: payments report filters project payments and lists course payments');
// cash flow: dated course payments and refunds were missing from the monthly cash movement
rep("const a=ym+'-01',b=ym+'-31',inM=d=>(d||'')>=a&&(d||'')<=b,st=[],tc=[];", "const a=ym+'-01',b=ym+'-31',inM=d=>(d||'')>=a&&(d||'')<=b,st=[],tc=[]; db.cp.forEach(p=>{if(!inM(p.date))return;const e=g(db.re,p.re)||{},c=g(db.rc,e.rc)||{};st.push({date:p.date,who:e.s?sn(e.s):'—',sid:e.s||0,wt:'Recorded',svc:'Course: '+(c.name||'(course deleted)'),amt:p.amt,cur:p.cur||c.cur||B(),rx:p.rx||0,base:PPB(p),meth:p.meth||'',notes:p.notes||'',bad:!e.id})}); db.ad.forEach(r=>{if(r.kind!='refund'||!inM(r.date))return;st.push({date:r.date,who:sn(r.s),sid:r.s,wt:r.pr?'Project':'Live',svc:'REFUND paid to student'+(r.pr?' · project: '+((g(db.pr,r.pr)||{}).name||''):''),amt:-r.amt,cur:r.cur,rx:r.rx||0,base:r.bamt==null?0:-r.bamt,meth:'',notes:r.reason||'',bad:!g(db.s,r.s)})});", 'M3/H5: cash flow includes dated course payments and refunds');
// L5: credits are shown separately and never netted against other students' balances
rep("os=cfOutS(E,F).reduce((q,z)=>q+z.out,0)", "os=cfOutS(E,F).reduce((q,z)=>q+Math.max(z.out,0),0)", 'L5: outstanding receivables are not reduced by other students\' credit');
rep("const sOut=OS.reduce((q,z)=>q+z.out,0),sOd=", "const sOut=OS.reduce((q,z)=>q+Math.max(z.out,0),0),sOd=", 'L5: outstanding summary excludes credits');
rep("flags=[];\n const recU=", "flags=[];  {const crd=OS.filter(z=>z.out<0);if(crd.length)flags.push(`Student credit / over-payment: ${crd.length} student(s) have paid more than they were charged (${f(crd.reduce((q,z)=>q-z.out,0))} in total). This is money held for them, shown separately and NOT subtracted from other students' outstanding balances.`)} const recU=", 'L5: credits listed separately in cash flow');
// M8 / M7: lesson status in the timetable and subject list
rep("db.l.filter(l=>l.sub==z.id).length+' lessons'", "db.l.filter(l=>l.sub==z.id&&l.st=='Completed').length+' completed lessons'+(db.l.some(l=>l.sub==z.id&&l.st!='Completed')?' (+'+db.l.filter(l=>l.sub==z.id&&l.st!='Completed').length+' cancelled / no-show / rescheduled, not counted)':'')", 'M8: subject list counts completed lessons only');
rep("<h3 style=\"margin-top:0\">Session already recorded</h3><p class=mut>This session was already completed and saved in Lessons. No new lesson, charge or earning was created.</p>", "<h3 style=\"margin-top:0\">${cv.ln.some(l=>l.st=='Completed')?'Session already recorded':'Session closed — NOT delivered'}</h3><p class=mut>${cv.ln.some(l=>l.st=='Completed')?'This session was already completed and saved in Lessons. No new lesson, charge or earning was created.':'This session was recorded as '+[...new Set(cv.ln.map(l=>l.st))].join(' / ')+'. It was not delivered: it is not counted as a completed lesson and nothing was charged or earned.'}</p>", 'M8: timetable says when a closed session was not delivered');
rep("`<button class=b onclick=\"doneFlow(${oa(o)})\">DONE</button> <button class=b2 onclick=\"rsOc(${oa(o)})\" title=\"Reschedule this session (nothing is deleted)\">DELETE</button>`", "`<button class=b onclick=\"doneFlow(${oa(o)})\">DONE</button> <button class=b2 onclick=\"rsOc(${oa(o)})\" title=\"Reschedule this session (nothing is deleted)\">RESCHEDULE</button>`", 'L2: the button that reschedules is labelled RESCHEDULE');
// M7: the timetable subject is chosen from the subject list and stored as a reference
rep("lv:o.lv,s:o.s?o.s.split(',').map(Number):[],sub:o.sub,notes:o.notes};", "lv:o.lv,s:o.s?o.s.split(',').map(Number):[],sub:o.sub,notes:o.notes};{const zs=db.sub.filter(z=>z.name.trim().toLowerCase()==String(o.sub).trim().toLowerCase());if(zs.length!=1)return zs.length?'Several subjects share this name; rename one first.':'Choose a subject from the list (add it under Subjects first if it is new).';d.sub=zs[0].name;d.subj=zs[0].id}", 'M7: timetable stores the subject reference');
// L1: university suggestions
repAll("{k:'uni',l:'University'}", "{k:'uni',l:'University (pick one already used, or type a new one)',d:'unis'}", 'L1: university suggestions', 5);
rep("let busy=0;$('#sv').onclick=()=>{", "$('#md').insertAdjacentHTML('beforeend',uniDL());let busy=0;$('#sv').onclick=()=>{", 'L1: university list attached to every form');
// M9: every save carries a request id; a transport failure is retried once with the SAME id, so the server can answer with the first result instead of applying it twice
rep("try{const s=JSON.stringify(db);let r;try{r=apiX('POST','/api/save',{baseRev:REV,state:db})}", "try{const s=JSON.stringify(db);let r;const rq=P3rq();try{r=P3save({baseRev:REV,state:db,reqId:rq})}", 'M9: save carries a request id');
rep("r=apiX('POST','/api/save',{baseRev:REV,state:db,confirm:", "r=P3save({reqId:rq,baseRev:REV,state:db,confirm:", 'M9: confirmed save carries the same request id');
// M11: no silent failures
repAll("dl=await claude.use('downloads')}catch(e){}", "dl=await claude.use('downloads')}catch(e){LOGE('downloads connector',e)}", 'M11: download connector errors are logged', 5);
repAll("if(dl){try{await dl.save({filename:fn,data:blob})}catch(e){}}", "if(dl){try{await dl.save({filename:fn,data:blob})}catch(e){LOGE('download',e);toast('The file could not be saved: '+(e.message||e),1)}}", 'M11: a failed download is reported', 2);
rep("try{db=JSON.parse(LASTGOOD)}catch(x){}sbn();", "try{db=JSON.parse(LASTGOOD)}catch(x){LOGE('restore last good state',x)}sbn();", 'M11: failed rollback is logged');
rep("try{L=apiX('GET','/api/backups').backups}catch(e){}", "try{L=apiX('GET','/api/backups').backups}catch(e){LOGE('backup list',e)}", 'M11: backup list failure is logged');
// M11: rendering twice quickly (e.g. a reminder poll and a click) must not throw "Canvas is already in use"
rep("let CH=[];\nconst ch=(id,type,lab,data,name,col)=>CH.push(new Chart($('#'+id),", "let CH=[]; const ch=(id,type,lab,data,name,col)=>CH.push(new Chart((()=>{const c=$('#'+id);const o=c&&Chart.getChart(c);if(o)o.destroy();return c})(),", 'M11: chart canvas reuse is safe');

// ===== Technical stabilization (F): report scope, filters and labels ===================================================================================================
// (the replacement texts are plain files in tools/patch-src so that their ${...} page code is never interpreted by this build script)
const PS = f => fs.readFileSync(path.join(__dirname, 'patch-src', f), 'utf8').replace(/\r?\n$/, '');
repAll("${fsr('cur',cF(),'All currencies')}${fsr('cr',", "${fsr('cur',cF(),'All currencies')}${fsr('meth',[...new Set([...db.sp,...db.tp,...db.pp,...db.cp].map(p=>p.meth).filter(Boolean))].map(x=>[x,x]),'All payment methods')}${fsr('cr',", 'F: payment-method filter in Reports', 2);
repRange("teacher:{n:'Teachers',tot:1,h:['Teacher','Lessons'", "\nstudent:{n:'Students'", PS('report-teacher.txt'), 'F: teacher report - one scope per row, reconciling opening + earned - paid = closing');
repRange("const stRows=db.s.filter(", "\nreturn{\nfin:", PS('report-student-rows.txt'), 'F: student report - dated payments in period only');
rep("student:{n:'Students',tot:1,h:['Student','Academic Level','Lessons','Hours',M('Charges'),M('Paid in Period'),M('Balance All-Time')],r:stRows},", "student:{n:'Students',tot:1,h:['Student','Academic Level','Lessons','Hours',M('Charges'),M('Dated Payments in Period (student + course + project)'),M('Undated Opening Amounts (all-time, not in period)'),M('Balance All-Time')],r:stRows},", 'F: student report headers');
repRange("pay:{n:'Payments',h:['Type','Date','Name','Method'", "\nconst isM=h=>", PS('report-pay.txt'), 'F: payment report - every filter applies, applicability labelled');


// G: a Live occurrence is delivered only by a Completed lesson for EVERY required student that is linked to this occurrence, taught by the scheduled teacher on the occurrence date
rep("function coverage(e,od){const ln=db.l.filter(l=>l.tt==e.id&&l.od==od),need=(e.s||[]).length?e.s:[0],miss=need.filter(s=>s?!ln.some(l=>l.s==s):!ln.length);return{ln,miss,all:!miss.length}}", "function coverage(e,od){const dt=occInfo(e,od).date,ln=db.l.filter(l=>l.tt==e.id&&l.od==od&&(!e.t||l.t==e.t)&&l.date==dt),need=(e.s||[]).length?e.s:[0],miss=need.filter(s=>s?!ln.some(l=>l.s==s):!ln.length),del=need.every(s=>s?ln.some(l=>l.s==s&&l.st=='Completed'):ln.some(l=>l.st=='Completed'));return{ln,miss,all:!miss.length,del}}", 'G: coverage requires a qualifying lesson (teacher and date match) and reports delivered separately');
repAll("cv.ln.some(l=>l.st=='Completed')", "cv.del", 'G: delivered only when every required student has a Completed lesson', 2);


// H: complete UI flow for free / waived lessons (the backend requires the flag AND a typed reason of at least 3 characters when the student charge or the teacher cost is zero)
rep("notes:x.notes,ts:x.ts||'',te:x.te||'',og:", "notes:x.notes,fr:x.free?'free':x.waived?'waived':'',frr:x.freeReason||'',ts:x.ts||'',te:x.te||'',og:", 'H: free/waived lesson form - edit values');
rep("notes:pre.notes||'',ts:pre.ts||'',te:pre.te||'',og:'',oc:''};", "notes:pre.notes||'',fr:'',frr:'',ts:pre.ts||'',te:pre.te||'',og:'',oc:''};", 'H: free/waived lesson form - new values');
rep(" {k:'notes',l:'Notes',w:1}];\nconst ov=a=>", " {k:'fr',l:'Free / waived session (leave as normal for a paid session)',t:'sel',o:[['','Normal - charged and paid as above'],['free','FREE session - student is not charged and the teacher is not paid'],['waived','WAIVED teacher cost - student is charged, teacher is not paid for it']],w:1},{k:'frr',l:'Reason for the free / waived session (required, kept in the audit log)',w:1},\n {k:'notes',l:'Notes',w:1}];\nconst ov=a=>", 'H: free/waived lesson form - fields');
rep(" const tr=m(o.tr),sr=m(o.sr),oc=ov(o.oc),og=ov(o.og),", " if(o.fr&&String(o.frr||'').trim().length<3)return 'A reason (at least 3 characters) is required for a free or waived session';\n const tr=m(o.tr),sr=m(o.sr),oc=ov(o.oc),og=ov(o.og),", 'H: free/waived lesson form - reason check');
rep(" if(showT){d.ts=o.ts||'';d.te=o.te||''}if(og!=null)d.og=og;if(oc!=null)d.oc=oc;\n if(x){if(og==null)delete x.og;if(oc==null)delete x.oc;Object.assign(x,d);return}", " if(showT){d.ts=o.ts||'';d.te=o.te||''}if(og!=null)d.og=og;if(oc!=null)d.oc=oc;\n if(o.fr){d.freeReason=String(o.frr).trim();if(o.fr=='free')d.free=1;else d.waived=1}\n if(x){if(og==null)delete x.og;if(oc==null)delete x.oc;if(!o.fr){delete x.free;delete x.waived;delete x.freeReason}else{delete x.free;delete x.waived}Object.assign(x,d);return}", 'H: free/waived lesson form - save');


// G: a lesson recorded from the timetable must be for the scheduled date and instructor; otherwise it cannot satisfy the occurrence (move the session with RESCHEDULE, or change the instructor on the timetable entry)
rep("  if(db.l.some(q=>q.tt==pre.tt&&q.od==pre.od&&q.s==+o.s))return 'This session is already recorded for this student — see Lessons.'}", "  if(db.l.some(q=>q.tt==pre.tt&&q.od==pre.od&&q.s==+o.s))return 'This session is already recorded for this student — see Lessons.';\n  {const te_=g(db.tt,pre.tt);if(te_){if(o.date!=occInfo(te_,pre.od).date)return 'The lesson date must be the scheduled date of this session ('+occInfo(te_,pre.od).date+'). To teach it on another day use RESCHEDULE first.';if(te_.t&&+o.t!=te_.t)return 'The instructor must be the one scheduled for this session. To change the instructor, edit the timetable entry first.'}}}", 'G: DONE form keeps the scheduled date and instructor');


rep("['Payments in period','pay']", "['Payments in period (with a student filter: that student\\'s receipts and the teacher payments linked to that student\\'s lessons only; with a work-type filter, receipts without an allocation and payments without a source are listed and labelled)','pay']", 'F: payment report scope is stated');
rep("['B. Teacher Report','teacher']", "['B. Teacher Report (Live columns cover lessons only; the money columns cover all work and reconcile: opening + earned - paid = closing)','teacher']", 'F: teacher report scope is stated');
rep("['C. Student Report (Live + Recorded + Projects)','student']", "['C. Student Report (Live + Recorded + Projects; payments are those dated inside the period, undated opening amounts are separate)','student']", 'F: student report scope is stated');


// H: the reminders' real delivery scope, stated where they are managed
rep("`<h3>Reminders (e.g. Send Recorded Lectures)</h3><div class=bar><button class=b onclick=edRM()>+ Add Reminder</button></div>`", "`<h3>Reminders (e.g. Send Recorded Lectures)</h3><p class=mut><b>What reminders do:</b> a reminder appears on this screen while A+ Hub is open in your browser (checked about once a minute, using the Africa/Cairo time and date). Nothing is sent by e-mail, SMS or phone notification, and nothing is delivered while the app or the computer is closed; a reminder that came due within the last 7 days while the app was closed is shown once when you next open it. For alerts outside the app, import the calendar file <a class=lk href=/api/reminders.ics>reminders.ics</a> into your own calendar application.</p><div class=bar><button class=b onclick=edRM()>+ Add Reminder</button></div>`", 'H: reminders delivery scope is stated');


// A: the backup file's summary also carries the authoritative per-currency teacher figures (extra, un-verified field: older backups stay restorable). `totals.teacherCost` is lessons only by design; `totals.teacherPaid` is all sources.
rep("totals:fin_(d),checksum:hash(JSON.stringify(d))", "totals:fin_(d),ledger:ledgerSummary_(d),checksum:hash(JSON.stringify(d))", 'A: backup summary carries the shared-ledger teacher figures');
rep("function mkBackup(d){", "function ledgerSummary_(d){const o={};LEDGER.teacherRows(d).forEach(r=>{const z=o[r.cur]||(o[r.cur]={earnedAllWork:0,paidAllSources:0,remaining:0});z.earnedAllWork+=r.earned.total;z.paidAllSources+=r.paid.total;z.remaining+=r.remaining.total});return{note:'teachers, per ORIGINAL currency (never added across currencies); earned covers live lessons + recorded courses + projects; totals.teacherCost is lesson earnings only',teachersByCurrency:o}}\nfunction mkBackup(d){", 'A: backup summary helper');

// startup
rep("save();render();sbn();\nif(!LOCK&&!Object.keys(db.rates).length)refreshRates();", "P3_INSTALL();save();render();sbn();P3_BOOT();\nif(!LOCK&&!Object.keys(db.rates).length)refreshRates();", 'Phase 3 install + reminder polling');
// Keep the operations extension in a source file; rebuilding must preserve it.
rep('Download JSON export</button>', 'Download financial JSON export</button><a class=b2 href=/api/operations/export download>Download administrative JSON</a>', 'separate administrative export');
rep('Restore first makes a safety backup of the current data, verifies the chosen backup, and rolls everything back if a step fails.', 'SQLite backups include registrations, attendance, lesson summaries and follow-up tasks. The older financial JSON export does not include those records; administrative JSON is a reference export, not a database restore. Restore first makes a safety backup of the current data, verifies the chosen backup, and rolls everything back if a step fails.', 'complete backup scope disclosure');
rep("'Cash Flow','Settings'],VW=", "'Cash Flow','Settings','Daily Desk','Registrations','Attendance & Notes','Follow-up Tasks'],VW=", 'operations navigation');
rep("Settings:vSet};", "Settings:vSet,'Daily Desk':()=>OPSUI.daily(),'Registrations':()=>OPSUI.registrations(),'Attendance & Notes':()=>OPSUI.attendance(),'Follow-up Tasks':()=>OPSUI.tasks()};", 'operations views');
rep('/* ---- shell ---- */',fs.readFileSync(path.join(root,'src','client','operations-ui.js'),'utf8')+'\n/* ---- shell ---- */','operations source');
rep("'Follow-up Tasks'],VW=", "'Follow-up Tasks','Scheduling','Billing','Delivery','Team','My Dues'],VW=",'management navigation');
rep("'Follow-up Tasks':()=>OPSUI.tasks()};", "'Follow-up Tasks':()=>OPSUI.tasks(),'Scheduling':()=>MUI.scheduling(),'Billing':()=>MUI.billing(),'Delivery':()=>MUI.deliveries(),'Team':()=>MUI.team(),'My Dues':()=>MUI.dues()};",'management screens');
rep('/* ---- shell ---- */',fs.readFileSync(path.join(root,'src','client','management-ui.js'),'utf8')+'\n/* ---- shell ---- */','management UI source');
rep('+NAV.map(n=>', '+TEAM_UI.identity()+NAV.filter(n=>TEAM_UI.allowed(n)).map(n=>','role navigation');
rep('P3_INSTALL();save();render();sbn();P3_BOOT();','TEAM_UI.install();P3_INSTALL();if(TEAM_UI.user.role===\'Admin\')save();render();sbn();P3_BOOT();','role-aware initial screen');
rep('if(!LOCK&&!Object.keys(db.rates).length)refreshRates();',"if(TEAM_UI.user.role==='Admin'&&!LOCK&&!Object.keys(db.rates).length)refreshRates();",'only administrators refresh rates automatically');
repAll("OPSUI.tab('Timetable')", "OPSUI.tab('Scheduling')",'daily desk opens managed scheduling',1);
repRange('const SS=id=>', '\nconst k_=', 'const STUDENT_ACCOUNT='+require('../src/student-account').studentAccount.toString()+';\nconst SS=id=>STUDENT_ACCOUNT(db,id);','shared student account includes dated course receipts and refunds');
rep('</style>', '@media print{body:has(.receipt-print) #app{display:none!important}body:has(.receipt-print) #m .mb{position:static;background:white;display:block;padding:0}body:has(.receipt-print) #m .md{max-height:none;width:auto;max-width:none;box-shadow:none;border:none;background:white;color:black}body:has(.receipt-print) #m button,body:has(.receipt-print) #tst{display:none!important}}\n</style>','receipt print layout');
// Teacher workspace and agreed EGP compensation use the same finance functions as the server.
rep("'Team','My Dues'],VW=", "'Team','My Dues','My Schedule','My Subjects','My Projects','Teacher Preview'],VW=",'teacher navigation');
rep("'My Dues':()=>MUI.dues()};", "'My Dues':()=>MUI.dues(),'My Schedule':()=>TP.schedule(),'My Subjects':()=>TP.subjects(),'My Projects':()=>TP.projects(),'Teacher Preview':()=>TP.preview()};",'teacher views');
rep('/* ---- shell ---- */',fs.readFileSync(path.join(root,'src','client','teacher-ui.js'),'utf8')+'\n/* ---- shell ---- */','teacher workspace source');
repRange('function pj(p){','\nfunction rcc(c){','const PROJECT_FIN='+require('../src/finance').pj.toString()+';\nfunction pj(p){return PROJECT_FIN(db,p)}','shared project teacher fee');
rep(src.split('\n').find(line=>line.startsWith('function rcc(c){')).trim(),require('../src/finance').rcc.toString(),'shared course teacher fee');
repAll('fm(j.share,p.cur)+` (${p.share}%)`', "fm(j.teacherShare,j.teacherCurrency)+(j.fixedTeacherFee?' (agreed EGP)':` (${p.share}%)`)",'project agreed fee display',1);
repAll('fm(j.share,c.cur)+` (${c.share}%)`', "fm(j.teacherShare,j.teacherCurrency)+(j.fixedTeacherFee?' (agreed EGP)':` (${c.share}%)`)",'course agreed fee display',1);
rep("card('Engineer Share ('+p.share+'%)',fm(j.share,p.cur))", "card(j.fixedTeacherFee?'Agreed teacher fee (EGP)':'Engineer Share ('+p.share+'%)',fm(j.teacherShare,j.teacherCurrency))",'project agreed fee detail');
rep("card('Instructor Share ('+c.share+'%)',fm(j.share,c.cur))", "card(j.fixedTeacherFee?'Agreed teacher fee (EGP)':'Instructor Share ('+c.share+'%)',fm(j.teacherShare,j.teacherCurrency))",'course agreed fee detail');
// Finance workspace: navigation is filtered and every endpoint enforces the same roles.
rep("'My Projects','Teacher Preview'],VW=", "'My Projects','Teacher Preview','Treasury','Batch Payments'],VW=",'treasury and batch navigation');
rep("'Teacher Preview':()=>TP.preview()};", "'Teacher Preview':()=>TP.preview(),'Treasury':()=>TRUI.view(),'Batch Payments':()=>TBUI.view()};",'treasury and batch screens');
rep('/* ---- shell ---- */',fs.readFileSync(path.join(root,'src','client','treasury-ui.js'),'utf8')+'\n/* ---- shell ---- */','treasury source');
rep("'Team','My Dues','My Schedule'", "'Team','Financial Summary','My Schedule'",'teacher financial summary navigation');
rep("'My Dues':()=>MUI.dues()", "'Financial Summary':()=>MUI.dues()",'teacher financial summary screen');
rep('Dashboard:vDash,','Dashboard:()=>TRUI.dashboard(vDash()),','dashboard operating expense disclosure');
rep('Teachers:vTeachers,','Teachers:()=>TBUI.teacherContext(vTeachers()),','batch payment entry from teacher details');
const reviewBanner='<div id="review-banner" dir="rtl" style="position:fixed;bottom:8px;left:8px;z-index:99999;background:#fef3c7;color:#713f12;border:1px solid #d97706;border-radius:8px;padding:8px 12px;font:14px system-ui;pointer-events:none">نسخة تجربة — 3005 — التعديلات هنا لا تصل لنسخة الشغل على 3000</div>';
rep('</body>',reviewBanner+'</body>','persistent review banner');
// Avoid the browser's native window.close in inline cancel handlers.
h=h.replaceAll('onclick=close()','onclick=MUI.cancel()').replaceAll('onclick="close()"','onclick="MUI.cancel()"');
// UI/UX redesign is a presentation-only layer, built from shared sources.
rep('</style>',fs.readFileSync(path.join(root,'src/client/redesign.css'),'utf8')+'\n</style>','shared SaaS design tokens and responsive components');
rep('<div id="app"><nav id="nv"></nav><main id="v"></main></div><div id="m"></div>', '<div id="app"><a class="ui-skip" href="#v">Skip to content</a><nav id="nv" aria-label="Main navigation"></nav><div id="workspace"><header id="topbar"></header><main id="v" tabindex="-1"></main></div></div><div id="m"></div>', 'accessible application shell');
rep('/* ---- shell ---- */',fs.readFileSync(path.join(root,'src/client/preferences-ui.js'),'utf8')+'\nUI_PREFS.pairs='+JSON.stringify(JSON.parse(fs.readFileSync(path.join(root,'src/client/ui-translations.json'),'utf8')))+';\n'+fs.readFileSync(path.join(root,'src/client/redesign-ui.js'),'utf8')+'\n/* ---- shell ---- */','shared presentation enhancements');
rep("$('#v').innerHTML=VW[V.nav]();", "$('#v').innerHTML=VW[V.nav]();UX.enhance();",'enhance existing views without changing business calculations');
rep('TEAM_UI.install();P3_INSTALL();', 'UX.install();TEAM_UI.install();P3_INSTALL();','install accessible presentation interactions');
rep('class="${x.w?\'w\':\'\'}" ${x.v?', 'class="${x.w?\'w\':\'\'}" data-required="${!!x.r}" ${x.v?', 'required field indications');
const out = path.join(root, 'public', 'index.html'); fs.mkdirSync(path.dirname(out), { recursive: true });
const banner = '<!-- GENERATED by tools/make-public.js from production-reference (read-only). Do not edit by hand. -->\n';
h = h.replace('<!DOCTYPE html>', '<!DOCTYPE html>\n' + banner);
fs.writeFileSync(out, h);
console.log('public/index.html written (' + h.length + ' bytes), ' + log.length + ' patches: ' + log.join('; '));
