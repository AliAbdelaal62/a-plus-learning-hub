'use strict';
// Technical stabilization - real Chromium: reports, filters, exports and forms are exercised through the page code AND saved/downloaded.
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { chromium = null; }
const assert = require('node:assert/strict'); const fs = require('fs'), os = require('os'), path = require('path');
const { open, migrate: mig } = require('../src/db'); const { migrate: imp } = require('../src/importer'); const S = require('../src/save'); const { assemble } = require('../src/state'); const { start } = require('../src/server');
const base = require('../fixtures/synthetic-v5.json'); const J = x => JSON.parse(JSON.stringify(x)); let n = 0; const ok = () => n++;
(async () => {
  if (!chromium) { console.log('STABILIZATION BROWSER TEST: NOT RUN - Playwright is not installed. This is NOT a pass.'); process.exit(77); }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aplus-sb-')), dbFile = path.join(dir, 'a.sqlite'); imp(JSON.stringify(base), { mode: 'apply', target: dbFile });
  // ---- seed (through the real save path): student 103 receives money in and out of the period; teacher 100 gets an EGP advance against KWD work
  { const db = open(dbFile); mig(db); const st = assemble(db); const id = () => st.id++;
    st.sp.push({ id: id(), p: 103, date: '2026-10-05', cur: 'KWD', amt: 5000, rx: 1, rt: 'Same', bamt: 5000, bc: 'KWD', meth: 'Cash', notes: 'in period', fxs: 'identity' });
    st.pp.push({ id: id(), pr: 130, date: '2026-10-10', cur: 'KWD', amt: 2000, rx: 1, rt: 'Same', bamt: 2000, bc: 'KWD', meth: 'Bank', notes: 'in period' }, { id: id(), pr: 130, date: '2026-08-30', cur: 'KWD', amt: 3000, rx: 1, rt: 'Same', bamt: 3000, bc: 'KWD', meth: 'Bank', notes: 'OUT of period' });
    const tp = { id: id(), p: 100, date: '2026-10-12', cur: 'EGP', amt: 500000, rx: 0.0064, rt: 'Manual', bamt: 3200, bc: 'KWD', meth: 'Bank', notes: 'EGP advance', src: 'Project', srcd: '', lk: 0 }; st.tp.push(tp);
    S.applySave(db, { baseRev: S.getRev(db), state: st, confirm: [{ k: 'tp', id: tp.id, reason: 'advance in EGP' }] }); db.close(); }
  const s = await start({authRequired:false, port: 0, dbFile, backupDir: path.join(dir, 'b') }); const br = await chromium.launch(); const pg = await br.newPage(); await pg.clock.setFixedTime(new Date('2026-10-20T09:00:00+03:00')); const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  await pg.goto(s.url); await pg.waitForSelector('#nv');
  const raw = await (await fetch(s.url + 'api/state')).json(); const R = raw.state; const A = '2026-10-01', Z = '2026-10-31', inP = d => d >= A && d <= Z;
  // 1. student "Dated Payments in Period": only payments dated inside the period; undated openings in their own column
  const stu = await pg.evaluate(([a, b]) => { const D = ds(a, b, { s: 103 }); return { h: D.student.h, r: D.student.r }; }, [A, Z]);
  const hi = stu.h.findIndex(x => /Dated Payments in Period/.test(x)), oi = stu.h.findIndex(x => /Undated Opening/.test(x)); assert.ok(hi > 0 && oi > 0, stu.h.join('|'));
  const expDated = R.sp.filter(p => p.p === 103 && inP(p.date)).reduce((q, p) => q + p.bamt, 0) + R.pp.filter(p => (R.pr.find(x => x.id === p.pr) || {}).s === 103 && inP(p.date)).reduce((q, p) => q + p.bamt, 0);
  assert.equal(stu.r[0][hi], expDated, 'dated payments in period'); assert.ok(expDated >= 7000); ok();
  assert.ok(stu.r[0][oi] > 0, 'undated opening amounts are shown separately (project 130 opened with 10.000)'); ok();
  // 2. payment report: student filter includes project receipts; unallocated receipts are labelled; method filter applies; work-type filter is not silently ignored
  const pay = await pg.evaluate(([a, b]) => { const f = F => ds(a, b, F).pay.r; return { s: f({ s: 103 }), meth: f({ meth: 'Bank' }), wt: f({ wt: 'Project' }), h: ds(a, b, {}).pay.h }; }, [A, Z]);
  assert.ok(pay.s.some(r => r[0] === 'Project payment' && r[1] === '2026-10-10'), 'project receipt of the filtered student is present'); assert.ok(!pay.s.some(r => r[1] === '2026-08-30'), 'out-of-period payment is absent'); ok();
  assert.ok(pay.s.filter(r => r[0] === 'Teacher payment').length === 0, 'student filter shows no teacher payments'); ok();
  assert.ok(pay.meth.length > 0 && pay.meth.every(r => r[3] === 'Bank'), 'method filter applies to every payment type'); ok();
  const app = pay.h.indexOf('Work-type applicability'); assert.ok(app > 0); assert.ok(pay.wt.filter(r => r[0] === 'Student payment').every(r => /Allocated|UNALLOCATED/.test(r[app])), 'unallocated receipts are labelled, not given a category'); assert.ok(pay.wt.every(r => r[0] !== 'Teacher payment' || r[app] === 'Source: Project' || /NO SOURCE/.test(r[app])), 'teacher payments follow the work-type filter'); ok();
  // 3. teacher report: opening + earned - paid = closing for every row, and the closing balance equals the shared ledger
  const api = await (await fetch(s.url + 'api/ledger/teachers')).json();
  const trep = await pg.evaluate(([a, b]) => { const D = ds(a, b, {}); return { h: D.teacher.h, r: D.teacher.r }; }, [A, Z]); const col = re => trep.h.findIndex(x => re.test(x));
  const [co, ce, cp, cc] = [col(/Opening Balance/), col(/Earned in Period/), col(/Paid in Period/), col(/Closing Balance/)]; assert.ok(co > 0 && ce > 0 && cp > 0 && cc > 0);
  for (const r of trep.r) assert.equal(r[co] + r[ce] - r[cp], r[cc], 'teacher row reconciles: ' + r[0]); ok();
  const all = await pg.evaluate(() => { const D = ds('', '', {}); return D.teacher.r.map(r => [r[0], r[D.teacher.h.findIndex(x => /Closing Balance/.test(x))]]); });
  for (const [name, closing] of all) { const t = api.teachers.find(x => x.name === name); assert.equal(closing, t.base.remaining.total, 'all-time closing = ledger for ' + name); } ok();
  const t100 = trep.r.find(r => r[0] === 'DEV Teacher 01'); assert.match(t100[trep.h.length - 1], /EGP credit/, 'currency detail shows the EGP credit'); ok();
  // 4. Dashboard per-currency table foots: revenue - costs = profit + (mixed revenue - mixed cost)
  const dash = await pg.evaluate(() => { V.nav = 'Dashboard'; V.F = {}; render(); const t = document.querySelector('#v table'); return [...t.querySelectorAll('tr')].map(r => [...r.children].map(c => c.innerText.trim())); });
  const num = v => parseFloat(String(v).replace(/,/g, '')); assert.match(dash[0].join('|'), /Mixed-currency lessons: revenue/);
  for (const r of dash.slice(1)) assert.ok(Math.abs(num(r[1]) - num(r[2]) - (num(r[5]) + num(r[3]) - num(r[4]))) < 0.0015, 'row foots: ' + r.join('|')); ok();
  // 5. downloads match what is displayed; a failing download is reported on screen
  const cap = fn => pg.evaluate(async fn => { window.__b = []; const o = URL.createObjectURL; URL.createObjectURL = b => { window.__b.push(b); return 'blob:x'; }; await (0, eval)(fn); URL.createObjectURL = o; const wb = XLSX.read(await window.__b[0].arrayBuffer()); return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: true, defval: '' }); }, fn);
  const exp = await pg.evaluate(() => { V.nav = 'Reports'; V.MODE.RP = 'conv'; V.RP.p = 'custom'; V.RP.a = '2026-10-01'; V.RP.b = '2026-10-31'; V.RP.f = { s: 103 }; render(); return ds('2026-10-01', '2026-10-31', { s: 103 }).pay.r.map(r => [r[0], r[1], r[2]]); });
  const sh = await cap("xp('pay')"); assert.deepEqual(sh.slice(1).map(r => [r[0], r[1], r[2]]), exp, 'exported rows are exactly the displayed rows (type, date, name): ' + JSON.stringify(sh.slice(0, 3))); ok();
  await pg.evaluate(() => { window.claude = { use: async () => ({ save: async () => { throw new Error('disk full'); } }) }; }); await pg.evaluate(() => xp('pay')); await pg.waitForTimeout(300);
  assert.match(await pg.evaluate(() => document.body.innerText), /could not be saved/i, 'a failed download shows a visible error'); ok(); await pg.evaluate(() => { delete window.claude; });
  // the default (original-currency) report export and the original-currency cash-flow export report failures too (AUD2-015)
  for (const call of ["V.MODE.RP = 'orig'; V.nav = 'Reports'; render(); return xp('work')", "V.MODE.CF = 'orig'; V.nav = 'Cash Flow'; render(); return xpCF()"]) {
    await pg.evaluate(() => { window.claude = { use: async () => ({ save: async () => { throw new Error('disk full'); } }) }; document.querySelectorAll('.toast,#toast').forEach(e => e.remove()); }); await pg.evaluate(new Function(call)); await pg.waitForTimeout(300);
    assert.match(await pg.evaluate(() => document.body.innerText), /could not be saved/i, 'visible error: ' + call); await pg.evaluate(() => { delete window.claude; }); ok(); }
  // 6. free / waived lesson form: a real save through the page
  await pg.evaluate(() => { V.nav = 'Lessons'; render(); edL(0); }); await pg.waitForSelector('#f_fr');
  await pg.evaluate(() => { $('#f_sr').value = 0; $('#f_fr').value = 'free'; $('#f_frr').value = ''; }); await pg.click('#sv'); await pg.waitForTimeout(300);
  assert.match(await pg.evaluate(() => document.querySelector('#md').innerText), /reason/i, 'a free session without a reason is refused in the form'); ok();
  const before = (await (await fetch(s.url + 'api/state')).json()).state.l.length;
  await pg.evaluate(() => { $('#f_frr').value = 'trial session offered by the owner'; $('#f_tr').value = 0; const o = [...$('#f_sub').options].find(x => x.value); if (o) { $('#f_sub').value = o.value; $('#f_sub').dispatchEvent(new Event('change')); } }); await pg.click('#sv'); await pg.waitForTimeout(800); const msg = await pg.evaluate(() => (document.querySelector('#md') || {}).innerText || ''); if (/Select a subject|not linked|rate/i.test(msg)) console.log('form says:', msg.slice(-200));
  const st2 = (await (await fetch(s.url + 'api/state')).json()).state; assert.equal(st2.l.length, before + 1); const nl = st2.l.reduce((a, b) => a.id > b.id ? a : b); assert.equal(nl.free, 1); assert.equal(nl.freeReason, 'trial session offered by the owner'); assert.equal(nl.bchg, 0); ok();
  // 7. settlement form: a real save through the page, then conservation is enforced on the server
  const out = await pg.evaluate(() => { edTS(100); return !!document.querySelector('#f_tp'); }); assert.ok(out); await pg.waitForSelector('#f_ob');
  const obs = await pg.evaluate(() => [...document.querySelectorAll('#f_ob option')].map(o => [o.value, o.textContent])); const kwdOb = obs.find(o => /KWD still unsettled/.test(o[1])); assert.ok(kwdOb, JSON.stringify(obs));
  await pg.evaluate(v => { const eg = [...$('#f_tp').options].find(o => /EGP/.test(o.textContent)); $('#f_tp').value = eg.value; $('#f_ob').value = v; $('#f_pamt').value = 100; $('#f_rx').value = 0.0065; $('#f_date').value = '2026-10-15'; }, kwdOb[0]); await pg.click('#sv'); await pg.waitForTimeout(800); const m3 = await pg.evaluate(() => (document.querySelector('#md') || {}).innerText || ''); if (m3.trim()) console.log('settlement form says:', m3.slice(-250));
  const st3 = (await (await fetch(s.url + 'api/state')).json()).state; assert.equal(st3.ts.length, 1); assert.deepEqual([st3.ts[0].pamt, st3.ts[0].samt, st3.ts[0].pcur, st3.ts[0].scur], [100000, 650, 'EGP', 'KWD']); ok();
  const un = await (await fetch(s.url + 'api/ledger/settlements-unresolved')).json(); assert.equal(un.settlements.length, 1); ok();
  const ti = await (await fetch(s.url + 'api/timetable/integrity')).json(); assert.ok(ti.readOnly && Array.isArray(ti.doneWithoutLesson)); ok();
  // 7b. the backup file's summary carries the shared-ledger teacher figures per original currency
  { const bk = await pg.evaluate(() => JSON.parse(mkBackup(JSON.parse(JSON.stringify(db))))); const api2 = await (await fetch(s.url + 'api/ledger/teachers')).json(); const exp = {}; api2.teachers.forEach(t => t.rows.forEach(r => { exp[r.cur] = (exp[r.cur] || 0) + r.remaining.total; }));
    assert.deepEqual(Object.fromEntries(Object.entries(bk.ledger.teachersByCurrency).map(([c, v]) => [c, v.remaining])), exp); assert.ok(bk.totals && 'teacherPaid' in bk.totals, 'legacy totals unchanged'); ok(); }
  // 8. rate freshness setting is on the Settings screen
  const setTxt = await pg.evaluate(() => { V.nav = 'Settings'; render(); return document.querySelector('#v').innerText; }); assert.match(setTxt, /out of date after \(hours\)/); ok();
  assert.deepEqual(errs, [], 'no page errors: ' + errs.join('; ')); ok();
  await br.close(); await s.close(); console.log('STABILIZATION BROWSER TEST OK: ' + n + ' checks (real Chromium: student paid-in-period, payment report filters + labels, teacher report reconciliation, dashboard footing, export = display, visible download error, free/waived lesson saved through the form, cross-currency settlement saved through the form).');
})().catch(e => { console.error(e); process.exit(1); });
