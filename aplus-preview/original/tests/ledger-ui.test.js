'use strict';
// Phase 2 UI: every screen shows the SAME teacher balance as the server ledger; cancellation / allocation / correction flows in real Chromium.
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { chromium = null; }
if (!chromium) { console.log('LEDGER UI TEST SKIPPED: Playwright is not installed. This is NOT a pass.'); process.exit(77); }
const assert = require('node:assert/strict'); const fs = require('fs'), os = require('os'), path = require('path');
const { start } = require('../src/server'); const { migrate } = require('../src/importer');
const fixture = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'synthetic-v5.json'), 'utf8'); let n = 0; const ok = () => n++;
const fmt = v => (v / 1000).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aplus-lui-')), dbFile = path.join(dir, 'a.sqlite'); migrate(fixture, { mode: 'apply', target: dbFile });
  const s = await start({authRequired:false, port: 0, dbFile, backupDir: path.join(dir, 'b') }); const br = await chromium.launch(); const pg = await br.newPage(); const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  await pg.goto(s.url); await pg.waitForSelector('#nv');
  const api = await (await fetch(s.url + 'api/ledger/teachers')).json(); assert.ok(api.teachers.length >= 3); ok();
  const body = nav => pg.evaluate(nav => { V.nav = nav; render(); return document.querySelector('#v').innerText; }, nav);
  // 1. the page's own ledger equals the server ledger for every teacher (same source text)
  for (const t of api.teachers) { const r = await pg.evaluate(id => TSum(id).rem, t.id); assert.equal(r, t.base.remaining.total, 'page vs server ' + t.name); ok(); }
  // 2. the Payments page row, the teacher details card and the Reports balance all show that number
  const payTxt = await body('Payments');
  for (const t of api.teachers.filter(x => x.status === 'Active')) { assert.ok(payTxt.includes(fmt(t.base.remaining.total)), 'Payments page shows ' + t.name + ' ' + fmt(t.base.remaining.total)); ok(); }
  for (const t of api.teachers.filter(x => x.status === 'Active')) { const txt = await pg.evaluate(id => { V.nav = 'Teachers'; V.tid = id; render(); return document.querySelector('#v').innerText; }, t.id); assert.ok(txt.includes(fmt(t.base.remaining.total)), 'teacher details show ' + t.name); assert.match(txt, /Balance by original currency/); ok(); }
  const cf = await pg.evaluate(() => cfLiab('9999-12-31', {}).map(x => [x.id, x.rem])); for (const [id, rem] of cf) { const t = api.teachers.find(x => x.id === id); if (t) assert.equal(rem, t.base.remaining.total, 'cash-flow liability ' + id); } ok();
  // 3. negative balance is shown, not hidden: overpay a teacher through the real save path and re-read every screen
  const tid = api.teachers[0].id;
  const r1 = await pg.evaluate(id => { const tot = TSum(id).rem; db.tp.push({ id: db.id++, p: id, date: '2026-09-30', cur: B(), amt: tot + 5000, rx: 1, rt: 'Same', bamt: tot + 5000, bc: B(), meth: 'Cash', notes: '', src: 'Live', srcd: '', lk: 0 }); window.PREASON = 'advance confirmed by the owner'; let r; try { r = save(); } finally { delete window.PREASON; } return { r, bad: SAVEBAD }; }, tid);
  assert.ok(!r1.bad, 'overpayment saved: ' + r1.bad); ok();
  const api2 = await (await fetch(s.url + 'api/ledger/teachers')).json(); const t2 = api2.teachers.find(x => x.id === tid);
  assert.equal(t2.base.remaining.total, -5000); assert.equal(t2.base.overpaid, true); ok();
  const pay2 = await body('Payments'); assert.ok(pay2.includes('-5.000') || pay2.includes('−5.000'), 'negative balance visible on Payments'); ok();
  // 4. cancelled project with money received cannot be cancelled through the plain status field
  const pr = api2 && await pg.evaluate(() => { const p = db.pr.find(x => x.status !== 'Cancelled' && LEDGER.projectResolution(db, x.id).received > 0); return p ? { id: p.id, name: p.name, cur: p.cur, rec: LEDGER.projectResolution(db, p.id).received } : null; });
  assert.ok(pr, 'fixture has a paid project'); ok();
  const blocked = await pg.evaluate(id => { const x = db.pr.find(p => p.id === id); V.nav = 'Projects'; V.prid = id; render(); edPR(id); document.querySelector('#f_status').value = 'Cancelled'; document.querySelector('#sv').click(); const e = document.querySelector('#er') && document.querySelector('#er').textContent; const st = db.pr.find(p => p.id === id).status; close(); return { e, st }; }, pr.id);
  assert.match(blocked.e || '', /received money/); assert.notEqual(blocked.st, 'Cancelled'); ok();
  // 5. proper cancel flow: amounts must sum exactly, reason required, nothing automatic
  const sumErr = await pg.evaluate(id => { V.nav = 'Projects'; V.prid = id; render(); edCancelPrj(id); document.querySelector('#f_refund').value = '0'; document.querySelector('#f_credit').value = '0'; document.querySelector('#f_retained').value = '0'; document.querySelector('#f_reason').value = 'client withdrew'; document.querySelector('#sv').click(); const e = document.querySelector('#er').textContent; close(); return e; }, pr.id);
  assert.match(sumErr, /must add up to exactly/); ok();
  const done = await pg.evaluate(async ({ id, rec }) => { V.nav = 'Projects'; V.prid = id; render(); edCancelPrj(id); document.querySelector('#f_refund').value = '0'; document.querySelector('#f_credit').value = String(rec / 1000); document.querySelector('#f_retained').value = '0'; document.querySelector('#f_reason').value = 'client withdrew; kept as credit'; document.querySelector('#sv').click(); await new Promise(r => setTimeout(r, 900)); return { st: db.pr.find(p => p.id === id).status, ad: db.ad.filter(a => a.pr === id).map(a => [a.kind, a.amt]) }; }, pr);
  assert.equal(done.st, 'Cancelled'); assert.deepEqual(done.ad, [['credit', pr.rec]]); ok();
  const chk = await (await fetch(s.url + 'api/ledger/projects')).json(); const row = chk.projects.find(p => p.id === pr.id); assert.equal(row.unresolved, 0); assert.equal(row.received, pr.rec); ok();
  const prTxt = await pg.evaluate(id => { V.nav = 'Projects'; V.prid = id; render(); return document.querySelector('#v').innerText; }, pr.id); assert.match(prTxt, /Money received and its resolution/); assert.match(prTxt, /client withdrew; kept as credit/); ok();
  // 6. the ledger checks screen lists unallocated payments and the FX states, with no success claim
  const lc = await pg.evaluate(() => { V.nav = 'Payments'; render(); ledgerChecks(); const t = document.querySelector('#md').innerText; close(); return t; }); assert.match(lc, /Student payments not allocated/); assert.match(lc, /Exchange rate status/); ok();
  // 7. a failed save shows the error banner and does not report success (server refuses an allocation above the payment)
  const bad = await pg.evaluate(() => { const p = db.sp[0]; db.al.push({ id: db.id++, sp: p.id, kind: 'Live', amt: p.amt + 1000 }); const r = save(); const stillThere = db.al.some(a => a.amt === p.amt + 1000); return { r, stillThere, banner: SAVEBAD }; });
  assert.equal(bad.r, false); assert.equal(bad.stillThere, false, 'rejected change was reverted in the page'); assert.match(bad.banner, /did not save/); ok();
  assert.deepEqual(errs.filter(e => !/Saving|Change cancelled|Deletion cancelled/.test(e)), [], errs.join(' | ')); ok();
  await br.close(); await s.close(); fs.rmSync(dir, { recursive: true, force: true });
  console.log('LEDGER UI TEST OK: ' + n + ' checks (page ledger = server ledger for every teacher; Payments page, teacher details, cash-flow liability equal; negative balance visible; paid project cannot be cancelled via status; cancel needs exact resolution + reason; resolution shown; checks screen; rejected change reverted)');
})().catch(e => { console.error(e); process.exit(1); });
