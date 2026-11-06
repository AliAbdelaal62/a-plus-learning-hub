'use strict';
// H3 regression: changing a project's exchange rate never changes the historical (base) value of its payments - in the database, the server calculations and the page.
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { chromium = null; }
const assert = require('node:assert/strict'); const fs = require('fs'), os = require('os'), path = require('path');
const { open, migrate } = require('../src/db'); const { migrate: imp } = require('../src/importer'); const S = require('../src/save'); const { assemble } = require('../src/state'); const fin = require('../src/finance'); const { forState } = require('../src/ledger-server');
const { start } = require('../src/server');
const raw = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'synthetic-v5.json'), 'utf8'); const J = x => JSON.parse(JSON.stringify(x)); let n = 0; const ok = () => n++;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aplus-fxr-')), file = path.join(dir, 'a.sqlite'); imp(raw, { mode: 'apply', target: file });
const db = open(file); migrate(db); const save = (st, confirm) => S.applySave(db, { baseRev: S.getRev(db), state: st, confirm });
let st = J(assemble(db)); const base = st.set.base;
// 1. legacy payments: base-currency => identity (rate 1, bamt = amt); foreign => missing, with NO invented base amount
for (const x of st.pp) { if (x.cur === base) { assert.deepEqual([x.fxs, x.rx, x.bamt, x.bc], ['identity', 1, x.amt, base]); } else { assert.deepEqual([x.fxs, x.bamt == null, x.rx == null], ['missing', true, true]); } ok(); }
const kw = st.pr.find(p => p.cur === base && st.pp.some(x => x.pr === p.id)), fo = st.pr.find(p => p.cur !== base && st.pp.some(x => x.pr === p.id)); assert.ok(kw && fo); ok();
const snapPP = a => JSON.stringify(a.pp.map(x => [x.id, x.amt, x.cur, x.rx, x.bamt, x.bc, x.fxs]));
const before = snapPP(st), sBefore = fin.SS(st, kw.s).rem;
// 2. change both parent rates (a typed reason is demanded because project money exists? no: rate edits are allowed) and save
const s2 = J(st); s2.pr.find(p => p.id === kw.id).rx = 7; s2.pr.find(p => p.id === fo.id).rx = 0.5;
let need = null; try { save(s2); } catch (e) { need = e; }
if (need) { assert.equal(need.code, 409); save(s2, (need.detail.needsConfirm || []).map(x => ({ k: x.k, id: x.id, reason: 'regression test' }))); }
const a = assemble(db); assert.equal(snapPP(a), before, 'no payment changed after the parent rates changed'); ok();
// 3. server calculation: only the undated opening part follows the project rate

// student paid-in-base for the project part is identical before and after a rate change when the project has no opening paid
{ const s3 = J(a); const p3 = s3.pr.find(p => p.id === kw.id); const x1 = fin.SS(s3, kw.s).paid; p3.rx = 123; const x2 = fin.SS(s3, kw.s).paid; assert.equal(x2 - x1, fin.k_(p3.paid0 || 0, 123) - fin.k_(p3.paid0 || 0, 7), 'only the undated opening part follows the project rate; dated payments do not'); ok(); }
// 4. ledger views: FX status counts and the foreign payment is listed as missing, not revalued
{ const L = forState(a), rep = L.fxReport(a); assert.ok(rep.identity.length >= 1 && rep.missing.some(x => x.kind === 'project payment' && a.pp.find(p => p.id === x.id).pr === fo.id)); ok(); }
// 5. an audited correction is the only way to give the missing payment a rate; it needs a reason, is labelled 'corrected', and later parent-rate edits still do not touch it
{ const mp = a.pp.find(p => p.pr === fo.id && p.fxs === 'missing'); const s4 = J(a); const row = s4.pp.find(p => p.id === mp.id); row.rx = 0.0064; row.bc = base; row.bamt = fin.k_(row.amt, 0.0064);
  let e1 = null; try { save(s4); } catch (e) { e1 = e; } assert.ok(e1 && e1.code === 409, 'a correction demands a typed reason'); ok();
  save(s4, [{ k: 'pp', id: mp.id, reason: 'rate from bank slip 2026-10-02' }]); let b = assemble(db); const fixed = b.pp.find(p => p.id === mp.id); assert.deepEqual([fixed.fxs, fixed.rx, fixed.bamt], ['corrected', 0.0064, fin.k_(mp.amt, 0.0064)]); ok();
  const au = db.prepare("SELECT reason, before_json, after_json FROM audit_log WHERE action='fx-correction' AND entity_id=? ORDER BY id DESC LIMIT 1").get(mp.id); assert.match(au.reason, /bank slip/); ok();
  const s5 = J(b); s5.pr.find(p => p.id === fo.id).rx = 9; try { save(s5); } catch (e) { save(s5, (e.detail.needsConfirm || []).map(x => ({ k: x.k, id: x.id, reason: 'regression test' }))); } b = assemble(db); assert.equal(b.pp.find(p => p.id === mp.id).bamt, fixed.bamt); ok(); }
(async () => {
  if (!chromium) { console.log('FX REGRESSION (server part) OK: ' + n + ' checks. PAGE PART SKIPPED: Playwright is not installed. This is NOT a pass for the page.'); process.exit(77); }
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'aplus-fxp-')), f2 = path.join(d2, 'a.sqlite'); imp(raw, { mode: 'apply', target: f2 });
  const s = await start({authRequired:false, port: 0, dbFile: f2, backupDir: path.join(d2, 'b') }); const br = await chromium.launch(); const pg = await br.newPage(); const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  await pg.goto(s.url); await pg.waitForSelector('#nv');
  // the page's cash-flow helpers read each payment's own base amount, not the project rate
  const r = await pg.evaluate(() => { const p = db.pr.find(x => x.cur === B() && db.pp.some(y => y.pr === x.id)), E = '9999-12-31'; const pick = () => ({ out: JSON.stringify(cfOutS(E, {}).map(z => [z.id, z.pay]) ), pp: db.pp.filter(y => y.pr === p.id).map(y => PPB(y)) });
    const a = pick(); p.rx = 11; const b = pick(); return { a, b, payHeld: db.pp.filter(y => y.pr === p.id).every(y => y.bamt === y.amt) }; });
  assert.deepEqual(r.a.pp, r.b.pp); assert.ok(r.payHeld); ok();
  const out = await pg.evaluate(() => { const p = db.pr.find(x => x.cur === B() && db.pp.some(y => y.pr === x.id) && !x.paid0); if (!p) return null; const E = '9999-12-31', get = () => (cfOutS(E, { s: p.s }).find(z => z.id == p.s) || {}).pay; const a = get(); p.rx = 13; const b = get(); return { a, b }; });
  if (out) { assert.equal(out.a, out.b, 'student paid in base for dated project payments does not follow the project rate'); ok(); }
  // the project page shows each payment's own rate and base value and the missing one is flagged with a way to correct it
  const t = await pg.evaluate(() => { const p = db.pr.find(x => x.cur !== B() && db.pp.some(y => y.pr === x.id)); V.nav = 'Projects'; V.prid = p.id; render(); return document.querySelector('#v').innerText; });
  assert.match(t, /Exchange rate of each payment/); assert.match(t, /FX missing/); assert.match(t, /set rate/); ok();
  assert.deepEqual(errs, [], errs.join(' | ')); ok();
  await br.close(); await s.close(); fs.rmSync(d2, { recursive: true, force: true }); fs.rmSync(dir, { recursive: true, force: true });
  console.log('FX REGRESSION TEST OK: ' + n + ' checks (identity/missing back-fill, parent-rate edits leave every payment untouched, correction needs reason + audited, page cash-flow helpers use the payment\'s own base amount, missing payment flagged on the project page)');
})().catch(e => { console.error(e); process.exit(1); });
