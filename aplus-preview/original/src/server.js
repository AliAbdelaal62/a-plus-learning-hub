'use strict';
// A+ Hub local server. Binds to the loopback interface only. No dependencies.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const log_ = require('./log'); const REM = require('./reminders'); const RATES = require('./rates'); const cairo = require('./cairo');
const { SCHEMA_VERSION } = require('./db'); const { openApp } = require('./boot'); const { StartupRefused } = require('./guard'); const { makeScheduler } = require('./scheduler'); const config = require('./config'); const S = require('./save'); const B = require('./backup'); const fin = require('./finance'); const { makeOrig } = require('./orig'); const { forState } = require('./ledger-server'); const { assemble, neutralize } = require('./state'); const view = db => neutralize(assemble(db));
const ROOT = path.join(__dirname, '..'), PUB = path.join(ROOT, 'public');
const OPS = require('./operations');
const TEAM=require('./team'),ACCESS=require('./access'),MAN=require('./management'),TREASURY=require('./treasury'),BATCH=require('./teacher-batches');
const MAX_BODY = 8 * 1024 * 1024;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.map': 'application/json' };
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://open.er-api.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

function start(opts) { try { return start_(opts); } catch (e) { return Promise.reject(e); } }
function start_({ port = 3000, dbFile = path.join(ROOT, 'data', 'aplus.sqlite'), backupDir = path.join(ROOT, 'backups'), log = () => {}, scheduler = false, clock = () => new Date(), authRequired=true, authSetupCode } = {}) {
  if(port===3000)throw new Error('This review build cannot run on port 3000. Use scripts/start-review.js on 3005.');
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  log_.setSink((...x) => log(...x)); const booted = openApp(dbFile, backupDir, { log }); // throws StartupRefused for a damaged/zero-byte/missing-but-used database: nothing is replaced
  const ctx = { file: dbFile, backupDir, db: booted.db }; const sched = makeScheduler(ctx, log); if (scheduler) sched.start();
  // Restore replaces ctx.db. Authentication must follow the replacement connection too.
  const sessionCookie='aplus_session_'+(port||crypto.randomBytes(6).toString('hex'));
  const AUTH=TEAM.service({prepare:(...args)=>ctx.db.prepare(...args),exec:(...args)=>ctx.db.exec(...args)},{required:authRequired,setupCode:authSetupCode,clock,cookieName:sessionCookie});if(authRequired&&AUTH.needsSetup())log('First administrator setup code: '+AUTH.bootstrap);
  const token = crypto.randomBytes(24).toString('hex'); let boundPort = port;
  const hostOk = h => { if (!h) return false; const m = /^(localhost|127\.0\.0\.1|\[::1\]):(\d+)$/.exec(h); return !!m && +m[2] === boundPort; };
  const send = (res, code, body, type = 'application/json', extra = {}) => { const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)); res.writeHead(code, { 'Content-Type': type, 'Content-Length': buf.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': CSP, ...extra }); res.end(buf); };
  const fail = (res, code, msg, detail) => send(res, code, { ok: false, error: msg, detail });
  const readBody = req => new Promise((resolve, reject) => {
    const len = +req.headers['content-length'] || 0; if (len > MAX_BODY) { const e = new Error('request too large'); e.code = 413; return reject(e); }
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > MAX_BODY) { const e = new Error('request too large'); e.code = 413; req.destroy(); return reject(e); } chunks.push(c); });
    req.on('end', () => { try { resolve(n ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { const x = new Error('body is not valid JSON'); x.code = 400; reject(x); } });
    req.on('error', reject);
  });
  async function api(req, res, url) {
    const m = req.method, p = url.pathname;
    if (m === 'POST' || m === 'PUT' || m === 'DELETE') {
      if (req.headers['x-aplus-token'] !== token) return fail(res, 403, 'missing or wrong session token; reload the page');
      const o = req.headers.origin; if (o && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):(\d+)$/.test(o)) return fail(res, 403, 'cross-origin request refused');
      if (!/^application\/json/.test(req.headers['content-type'] || '')) return fail(res, 415, 'content-type must be application/json');
    }
    if (m === 'GET') { // H7: reads are not state-changing, but a foreign web page must still not be able to read the database through the user's browser
      const o = req.headers.origin, sf = req.headers['sec-fetch-site'];
      if (o && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):(\d+)$/.test(o)) return fail(res, 403, 'cross-origin request refused');
      if (sf && !['same-origin', 'none'].includes(sf)) return fail(res, 403, 'cross-site request refused');
    }
    const user=AUTH.current(req);
    if(m==='GET'&&p==='/api/auth/status')return send(res,200,{ok:true,user,needsSetup:AUTH.needsSetup()});
    if(m==='POST'&&p==='/api/auth/setup'){const b=await readBody(req);try{return send(res,200,{ok:true,user:AUTH.setup(b)});}catch(e){if(e instanceof TEAM.TeamError)return fail(res,e.code,e.message);throw e;}}
    if(m==='POST'&&p==='/api/auth/login'){const b=await readBody(req);try{const r=AUTH.login(b);return send(res,200,{ok:true,user:r.user},'application/json',{'Set-Cookie':r.cookie});}catch(e){if(e instanceof TEAM.TeamError)return fail(res,e.code,e.message);throw e;}}
    if(m==='POST'&&p==='/api/auth/logout'){AUTH.logout(req);return send(res,200,{ok:true},'application/json',{'Set-Cookie':sessionCookie+'=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});}
    if(p!=='/api/health'&&!user)return fail(res,401,'Sign in to access academy data.');
    if(p==='/api/treasury'){TREASURY.allowed(user);if(m==='GET')return send(res,200,{ok:true,...TREASURY.read(ctx.db,user)});if(m==='POST')return send(res,200,{ok:true,...TREASURY.write(ctx.db,await readBody(req),user,clock())});}
    if(p==='/api/teacher-batches'){TREASURY.allowed(user);if(m==='GET'){const r={teacher_id:+url.searchParams.get('teacher_id'),student_id:+url.searchParams.get('student_id'),starts_on:url.searchParams.get('starts_on'),ends_on:url.searchParams.get('ends_on')};return send(res,200,{ok:true,...BATCH.query(ctx.db,r,user,clock())});}if(m==='POST')return send(res,200,{ok:true,...BATCH.write(ctx.db,await readBody(req),user,clock())});}
    if(m==='GET'&&p==='/api/teacher/portal'){
      if(!['Admin','Teacher'].includes(user.role))return fail(res,403,'Teacher portal permission required.');
      const tid=user.role==='Teacher'?user.teacher_id:+url.searchParams.get('teacher');
      if(user.role==='Teacher'&&url.searchParams.has('teacher')&&+url.searchParams.get('teacher')!==tid)return fail(res,403,'You may only view your own portal.');
      const st=assemble(ctx.db);st.teacherBatches=BATCH.details(ctx.db,tid);if(!st.t.some(t=>t.id===tid))return fail(res,422,'Choose an existing teacher.');
      const opts={};for(const key of ['from','to','accountFrom','accountTo'])if(url.searchParams.has(key))opts[key]=url.searchParams.get(key);
      return send(res,200,{ok:true,...require('./teacher-portal').portal(st,tid,ctx.db.prepare('SELECT * FROM managed_sessions WHERE teacher_id=?').all(tid),opts)});
    }
    if(p.startsWith('/api/team/')){if(user.role!=='Admin')return fail(res,403,'Administrator access required.');if(m==='GET'&&p==='/api/team/users')return send(res,200,{ok:true,users:AUTH.users()});if(m==='GET'&&p==='/api/team/audit')return send(res,200,{ok:true,rows:ctx.db.prepare('SELECT at,actor,action,entity,entity_id,detail FROM audit_log ORDER BY rowid DESC LIMIT 200').all()});if(m==='POST'&&p==='/api/team/users'){const b=await readBody(req);try{return send(res,200,{ok:true,user:AUTH.update(b,user)});}catch(e){if(e instanceof TEAM.TeamError)return fail(res,e.code,e.message);throw e;}}}
    if(m==='GET'&&p==='/api/management')return send(res,200,{ok:true,...MAN.read(ctx.db,user,clock())});
    if(m==='GET'&&p==='/api/management/suggestions'){if(!['Admin','Coordinator','Teacher'].includes(user.role))return fail(res,403,'Scheduling permission required.');try{return send(res,200,{ok:true,slots:MAN.suggestions(ctx.db,{student:+url.searchParams.get('student'),subject:+url.searchParams.get('subject'),date:url.searchParams.get('date'),duration:+url.searchParams.get('duration')||60},user)});}catch(e){if(e instanceof MAN.ManagementError)return fail(res,e.code,e.message);throw e;}}
    if(m==='POST'&&p==='/api/management'){const b=await readBody(req);try{return send(res,200,{ok:true,...MAN.write(ctx.db,b,user,clock())});}catch(e){if(e instanceof MAN.ManagementError)return fail(res,e.code,e.message);throw e;}}
    if(user&&!['Admin','Accountant'].includes(user.role)&&(/^\/api\/(ledger|reports|backups|config|export)/.test(p)))return fail(res,403,'Financial permission required.');
    if(user&&user.role!=='Admin'&&(/^\/api\/(backups|config|export|restore|impact|timetable\/integrity)/.test(p)))return fail(res,403,'Administrator permission required.');
    if (m === 'GET' && p === '/api/operations') return send(res, 200, {ok:true,...ACCESS.operations(OPS.read(ctx.db,clock()),ctx.db,user)});
    if (m === 'GET' && p === '/api/operations/export') {if(user.role!=='Admin')return fail(res,403,'Administrator permission required.');return send(res,200,{format:'aplus-operations-export',formatVersion:1,exportedAt:clock().toISOString(),...OPS.read(ctx.db,clock())},'application/json',{'Content-Disposition':'attachment; filename="aplus-operations.json"'});}
    if (m === 'POST' && p === '/api/operations') {const b=await readBody(req);try{return send(res,200,{ok:true,...OPS.write(ctx.db,ACCESS.operationWrite(b,ctx.db,user),clock(),user.username)});}catch(e){if(e instanceof OPS.OperationsError||e instanceof TEAM.TeamError)return fail(res,e.code,e.message);throw e;}}
    if (m === 'GET' && p === '/api/rates/status') return send(res, 200, { ok: true, now: clock().toISOString(), staleAfterHours: RATES.hoursOf(assemble(ctx.db)), base: assemble(ctx.db).set.base, rates: RATES.report(assemble(ctx.db), clock().getTime()) });
    if (m === 'GET' && p === '/api/reminders') { const st = ACCESS.state(assemble(ctx.db),user,ctx.db),due=user.role==='Accountant'?[]:REM.due(ctx.db, st, clock()).filter(r=>user.role!=='Teacher'||st.rm.some(m=>m.id===r.id&&st.rc.some(c=>c.id===m.rc)));return send(res, 200, { ok: true, today: cairo.today(clock()), timezone: cairo.TZ, due, note: 'Reminders are shown while A+ Hub is open. Nothing is delivered while it is closed; use /api/reminders.ics with a calendar app for that.' }); }
    if (m === 'GET' && p === '/api/reminders.ics') {if(user.role==='Accountant')return fail(res,403,'Scheduling permission required.'); const st = ACCESS.state(assemble(ctx.db),user,ctx.db); return send(res, 200, REM.ics(st, st.rc, clock()), 'text/calendar; charset=utf-8', { 'Content-Disposition': 'attachment; filename="aplus-reminders.ics"' }); }
    if (m === 'POST' && p === '/api/reminders/ack') { const b = await readBody(req);if(user.role==='Accountant')return fail(res,403,'Reminder permission required.');if(user.role==='Teacher'){const st=assemble(ctx.db),rem=st.rm.find(r=>r.id===b.id);if(!rem||!st.rc.some(c=>c.id===rem.rc&&c.inst===user.teacher_id))return fail(res,403,'This reminder belongs to another teacher.');} try { return send(res, 200, { ok: true, ...REM.ack(ctx.db, b.id, b.date, clock()) }); } catch (e) { if (e.code === 400 || e.code === 404) return fail(res, e.code, e.message); throw e; } }
    if (m === 'POST' && p === '/api/client-log') { const b = await readBody(req); log_.warn('page: ' + String(b.where || '').replace(/[^\w .:-]/g, '').slice(0, 60), String(b.message || '').slice(0, 300)); return send(res, 200, { ok: true }); }
    if (m === 'GET' && p === '/api/health') { const ic = ctx.db.prepare('PRAGMA quick_check').get().quick_check; return send(res, 200, { ok: ic === 'ok', schemaVersion: SCHEMA_VERSION, rev: S.getRev(ctx.db), database: ic, hasHistory: S.hasHistory(ctx.db) }); }
    if (m === 'GET' && p === '/api/state') {const s=S.getState(ctx.db);return send(res, 200, { ok: true, ...s,state:ACCESS.state(s.state,user,ctx.db) });}
    if (m === 'POST' && p === '/api/save') {
      const b = await readBody(req); if (!b || typeof b.state !== 'object' || !Number.isInteger(b.baseRev)) return fail(res, 400, 'baseRev and state are required');
      try { return send(res, 200, { ok: true, ...S.applySave(ctx.db, { baseRev: b.baseRev, state: ACCESS.saveState(b.state,ctx.db,user), actor:user.username,confirm: b.confirm, reqId: typeof b.reqId === 'string' ? b.reqId : undefined }) }); }
      catch (e) { if (e instanceof S.SaveError||e instanceof TEAM.TeamError) return fail(res, e.code, e.message, e.detail); throw e; }
    }
    if (m === 'GET' && p === '/api/impact') { const k = url.searchParams.get('e'), id = +url.searchParams.get('id'); if (!['t', 's', 'pr', 'rc', 're', 'sp', 'sub'].includes(k) || !Number.isInteger(id)) return fail(res, 400, 'bad parameters'); return send(res, 200, { ok: true, ...S.impact(ctx.db, k, id) }); }
    if (m === 'GET' && p === '/api/reports/original-currency') {
      const st = view(ctx.db), O = makeOrig({ O: fin.O, pj: x => fin.pj(st, x), rcc: fin.rcc }), W = O.work(fin.all(st)), C = O.cash(st, {}, null), sl = O.studentLedger(st, ''), tl = O.teacherLedger(st, '');
      return send(res, 200, { ok: true, mode: 'original-currency', note: 'Every amount is in the currency it was recorded in. Different currencies are never added together and no exchange rate is used.', byCurrency: W.byCurrency, mixedCurrencyLessons: W.mixedCurrencyLessons, datedCash: C.dated, undatedOpeningBalances: C.undatedOpening, studentBalances: sl, teacherBalances: tl, studentsWithCrossCurrencyPayments: O.crossCurrency(sl) });
    }
    // Phase 2: read-only views of the shared ledger (the page computes the same figures with the same source text)
    if (m === 'GET' && p === '/api/timetable/integrity') return send(res, 200, { ok: true, readOnly: true, note: 'Nothing is changed or linked automatically. Proposals are unambiguous matches for the owner to review.', ...require('./timetable').integrity(view(ctx.db)) });
    if (m === 'GET' && p === '/api/ledger/settlements-unresolved') { const st = view(ctx.db); return send(res, 200, { ok: true, note: 'Historical cross-currency payments are never settled automatically; they stay as recorded in their own currency until a settlement is recorded.', unresolved: forState(st).crossCurrencyUnresolved(st), settlements: st.ts || [] }); }
    if (m === 'GET' && p.startsWith('/api/ledger/')) {
      const st = view(ctx.db), L = forState(st), what = p.slice(12);
      if (what === 'teachers') return send(res, 200, { ok: true, base: st.set.base, note: 'earned - paid = remaining; per-currency rows are never added together; the base figure uses the base amount stored on each record', teachers: st.t.map(t => ({ id: t.id, name: t.name, status: t.status, ...L.teacherBalance(st, t.id) })) });
      if (what === 'students') return send(res, 200, { ok: true, base: st.set.base, students: L.studentRows(st) });
      if (what === 'fx') return send(res, 200, { ok: true, ...L.fxReport(st) });
      if (what === 'projects') return send(res, 200, { ok: true, projects: L.projectRows(st) });
      if (what === 'courses') return send(res, 200, { ok: true, courses: L.courseRows(st) });
      return fail(res, 404, 'unknown ledger view');
    }
    if (m === 'GET' && p === '/api/reports/converted') return send(res, 200, { ok: true, mode: 'converted-saved-rates', ...fin.convertedSaved(view(ctx.db)) });
    if (m === 'GET' && p === '/api/backups') return send(res, 200, { ok: true, backups: B.list(ctx), status: sched.status, config: config.load(ctx.file) });
    if (m === 'GET' && p === '/api/config') return send(res, 200, { ok: true, config: config.load(ctx.file) });
    if (m === 'POST' && p === '/api/config') { const b = await readBody(req); try { return send(res, 200, { ok: true, config: config.save(ctx.file, b || {}) }); } catch (e) { return fail(res, 422, e.message, e.problems); } }
    if (m === 'POST' && p === '/api/backups/run') { try { return send(res, 200, { ok: true, backup: sched.runNow('manual'), status: sched.status }); } catch (e) { return fail(res, 500, e.message); } }
    if (m === 'POST' && p === '/api/backups') { const b = await readBody(req); try { return send(res, 200, { ok: true, backup: B.create(ctx, typeof b.label === 'string' ? b.label : '') }); } catch (e) { return fail(res, 500, e.message); } }
    if (m === 'POST' && p === '/api/restore') { const b = await readBody(req); if (b.confirm !== true || typeof b.name !== 'string') return fail(res, 400, 'name and confirm:true are required'); try { return send(res, 200, { ok: true, ...(()=>{const restored=B.restore(ctx,b.name);if(authRequired&&AUTH.needsSetup())log('First administrator setup code after restore: '+AUTH.bootstrap);return restored})(), rev: S.getRev(ctx.db) }); } catch (e) { return fail(res, e.rolledBack ? 500 : 422, e.message, e.problems); } }
    if (m === 'GET' && p === '/api/export') return send(res, 200, JSON.stringify({ format: 'aplus-localhost-export', formatVersion: 1, exportedAt: new Date().toISOString(), data: assemble(ctx.db) }), 'application/json', { 'Content-Disposition': 'attachment; filename="aplus-export.json"' });
    return fail(res, 404, 'unknown endpoint');
  }
  function serveStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'method not allowed');
    let rel; try { rel = decodeURIComponent(url.pathname); } catch (_) { return fail(res, 400, 'bad path'); }
    if (rel === '/') rel = '/index.html';
    const user=AUTH.current(req);if(rel==='/index.html'&&!user)rel='/team-login.html';
    if (rel.includes('\0') || rel.split('/').some(s => s.startsWith('.') || s === '..')) return fail(res, 404, 'not found');
    const full = path.resolve(PUB, '.' + rel); if (!full.startsWith(PUB + path.sep)) return fail(res, 404, 'not found');
    let st; try { st = fs.statSync(full); } catch (_) { return fail(res, 404, 'not found'); } if (!st.isFile()) return fail(res, 404, 'not found');
    const ext = path.extname(full).toLowerCase(); if (!MIME[ext]) return fail(res, 404, 'not found');
    let body = fs.readFileSync(full);
    if (rel === '/index.html') body = Buffer.from(body.toString('utf8').replace('<head>', `<head><meta name="aplus-token" content="${token}">`));
    if(rel==='/index.html')body=Buffer.from(body.toString('utf8').replace('<head>','<head><script>const CURRENT_USER='+JSON.stringify(user).replace(/</g,'\\u003c')+';</script>'));
    if(rel==='/team-login.html')body=Buffer.from(body.toString('utf8').replace('<head>',`<head><meta name="aplus-token" content="${token}">`));
    send(res, 200, body, MIME[ext]);
  }
  const server = http.createServer(async (req, res) => {
    try {
      if (!hostOk(req.headers.host)) return fail(res, 421, 'unexpected Host header');
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      return serveStatic(req, res, url);
    } catch (e) { if (e instanceof TEAM.TeamError||e instanceof MAN.ManagementError||e instanceof TREASURY.TreasuryError||e instanceof BATCH.BatchError||e.code === 413 || e.code === 400) return fail(res, e.code, e.message); log('error', e); if (!res.headersSent) fail(res, 500, 'internal error'); }
  });
  server.requestTimeout = 30000; server.headersTimeout = 10000; server.maxHeadersCount = 50;
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => { boundPort = server.address().port; resolve({ server, ctx, token, sched, port: boundPort, url: `http://localhost:${boundPort}/`, close: () => new Promise(r => { sched.stop(); server.close(() => { try { ctx.db.close(); } catch (_) {} r(); }); }) }); });
  });
}
module.exports = { start };
if (require.main === module) {
  const port = +(process.env.APLUS_PORT || 3000), dbFile = process.env.APLUS_DB ? path.resolve(process.env.APLUS_DB) : undefined, backupDir = process.env.APLUS_BACKUP_DIR ? path.resolve(process.env.APLUS_BACKUP_DIR) : dbFile ? path.join(path.dirname(dbFile), '..', 'backups') : undefined;
  start({ port, dbFile, backupDir, scheduler: true, log: (...a) => console.error(...a) }).then(s => { console.log('A+ Hub is running at ' + s.url + '  (this computer only; press Ctrl+C to stop)'); console.log('Database: ' + s.ctx.file); for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => s.close().then(() => process.exit(0))); })
    .catch(e => { if (e instanceof StartupRefused) { console.error('A+ Hub did not start (' + e.code + '):\n' + e.message); process.exit(13); } console.error(e.code === 'EADDRINUSE' ? `Port ${port} is already in use. Set APLUS_PORT to another number, or close the other program.` : 'Could not start: ' + e.message); process.exit(1); });
}
