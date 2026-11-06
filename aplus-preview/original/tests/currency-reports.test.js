'use strict';
// Decision A: original-currency totals are the default and currencies are never combined.
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { chromium = null; }
const assert = require('node:assert/strict'); const fs = require('fs'), os = require('os'), path = require('path');
const { makeOrig } = require('../src/orig'); const f = require('../src/finance'); const { start } = require('../src/server'); const { migrate } = require('../src/importer');
const base = require('../fixtures/synthetic-v5.json'); const J = x => JSON.parse(JSON.stringify(x)); let n = 0; const ok = () => n++;
const mk = d => makeOrig({ O: f.O, pj: p => f.pj(d, p), rcc: f.rcc });
// 1. brute-force expectation per currency, computed independently of makeOrig
{ const d = J(base), o = mk(d), W = o.work(f.all(d)).byCurrency, exp = {};
  const A = (c, k, v) => { (exp[c] = exp[c] || {})[k] = ((exp[c] || {})[k] || 0) + v; };
  d.l.filter(l => l.st === 'Completed').forEach(l => { A(l.sc, 'liveRevenue', l.og != null ? l.og : Math.round(l.d * l.sr)); A(l.tc, 'liveCost', l.oc != null ? l.oc : Math.round(l.d * l.tr)); });
  d.pr.filter(p => p.status !== 'Cancelled').forEach(p => { A(p.cur, 'projectRevenue', p.rev); A(p.cur, 'projectShare', Math.round(p.rev * p.share / 100)); });
  d.rc.forEach(c => { const rev = Math.round(c.price * c.n); A(c.cur, 'courseRevenue', rev); A(c.cur, 'courseShare', Math.round(rev * c.share / 100)); A(c.cur, 'courseCost', c.cost || 0); });
  for (const c of Object.keys(exp)) for (const k of Object.keys(exp[c])) assert.equal(W[c][k], exp[c][k], c + ' ' + k); ok();
  assert.ok(Object.keys(W).length >= 3, 'fixture really has several currencies'); ok();
  // the sum of a mixed set is NOT a meaningful number: per-currency rows are never merged
  const rowsSum = Object.values(W).reduce((q, r) => q + (r.liveRevenue || 0), 0); const KWDonly = W.KWD.liveRevenue; assert.notEqual(rowsSum, KWDonly); ok(); }
// 2. the result does not depend on any exchange rate
{ const d = J(base), a = JSON.stringify(mk(d).work(f.all(d))), b = J(base); b.rates = {}; b.l.forEach(l => { l.trx = 999; l.srx = 0; l.bcost = 1; l.bchg = 1; }); b.pr.forEach(p => p.rx = 0); b.rc.forEach(c => c.rx = 0); b.sp.forEach(p => { p.rx = 0; p.bamt = 1; }); b.tp.forEach(p => { p.rx = 0; p.bamt = 1; });
  assert.equal(JSON.stringify(mk(b).work(f.all(b))), a); assert.equal(JSON.stringify(mk(b).cash(b, {}, null)), JSON.stringify(mk(d).cash(d, {}, null))); assert.equal(JSON.stringify(mk(b).studentLedger(b, '')), JSON.stringify(mk(d).studentLedger(d, ''))); ok(); }
// 3. one-currency data: per-currency totals equal the legacy base-currency totals exactly
{ const d = J(base); const one = c => { c.cur = 'KWD'; c.rx = 1; }; d.t.forEach(t => t.cur = 'KWD'); d.l.forEach(l => { l.tc = l.sc = l.bc = 'KWD'; l.trx = l.srx = 1; l.bcost = l.oc != null ? l.oc : Math.round(l.d * l.tr); l.bchg = l.og != null ? l.og : Math.round(l.d * l.sr); });
  d.pr.forEach(one); d.rc.forEach(one); d.sp.forEach(p => { p.cur = 'KWD'; p.rx = 1; p.bamt = p.amt; }); d.tp.forEach(p => { p.cur = 'KWD'; p.rx = 1; p.bamt = p.amt; });
  const Z = f.TOT(d, f.all(d)), W = mk(d).work(f.all(d)).byCurrency.KWD; assert.equal(W.liveRevenue + W.projectRevenue + W.courseRevenue, Z.rev); assert.equal(W.liveCost + W.projectShare + W.courseShare + W.courseCost, Z.cost); assert.equal(W.liveProfit + W.projectProfit + W.courseProfit, Z.p); ok(); }
// 4. mixed-currency lesson: revenue and cost go to their own currencies; profit is NOT invented
{ const d = J(base), l0 = d.l.find(l => l.st === 'Completed'); l0.tc = 'KWD'; l0.sc = 'EGP'; const r = mk(d).work(f.all(d)); assert.ok(r.mixedCurrencyLessons.includes(l0.id)); const o = mk(d).work({ ls: [l0], pr: [], rc: [] }).byCurrency; assert.equal(o.EGP.liveProfit, undefined); assert.equal(o.KWD.liveProfit, undefined); assert.ok(o.EGP.liveRevenue > 0 && o.KWD.liveCost > 0); ok(); }
// 5. No Show / Cancelled / Rescheduled lessons add nothing
{ const d = J(base); const before = JSON.stringify(mk(d).work(f.all(d))); d.l.forEach(l => { if (l.st !== 'Completed') { l.st = 'No Show'; l.bchg = 123456; l.og = 777777; } }); assert.equal(JSON.stringify(mk(d).work(f.all(d))), before); ok(); }
// 6. undated opening balances are never dated receipts
{ const d = J(base), o = mk(d), c = o.cash(d, { a: '2026-01-01', b: '2026-12-31' }, null); const dated = Object.values(c.dated).reduce((q, r) => q + (r.studentReceived || 0) + (r.projectReceived || 0), 0); const direct = d.sp.reduce((q, p) => q + p.amt, 0) + d.pp.reduce((q, p) => q + p.amt, 0); assert.equal(dated, direct); assert.ok(c.undatedOpening.KWD.projectOpeningPaid > 0); assert.ok(c.undatedOpening.KWD.courseEnrolmentPaid > 0); ok();
  const nowin = o.cash(d, { a: '2030-01-01', b: '2030-12-31' }, null); assert.deepEqual(nowin.dated, {}); assert.ok(Object.keys(nowin.undatedOpening).length > 0, 'opening balances stay reported separately, not as receipts'); ok(); }
// 7. cross-currency payer detected, nothing netted
{ const d = J(base), o = mk(d), s = d.s[0].id; d.sp.push({ id: 9001, p: s, date: '2026-09-01', cur: 'SAR', amt: 999000, rx: 0.082, rt: 'Manual', bamt: 81918, bc: 'KWD', meth: 'Cash', notes: '' }); const led = o.studentLedger(d, ''); assert.ok(led.find(r => r.s === s && r.cur === 'SAR').net < 0); assert.ok(led.find(r => r.s === s && r.cur === 'KWD').net > 0); assert.ok(o.crossCurrency(led).includes(s)); ok(); }
// 8. teacher ledger keeps unassigned payments identifiable
{ const d = J(base), t = mk(d).teacherLedger(d, ''); assert.ok(t.some(r => r.unassignedPaid > 0)); ok(); }
(async () => {
  if (!chromium) { console.log('CURRENCY REPORTS (unit part) OK: ' + n + ' checks. BROWSER PART SKIPPED: Playwright is not installed. This is NOT a pass for the screens.'); process.exit(77); }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aplus-cr-')), dbFile = path.join(dir, 'a.sqlite'); migrate(JSON.stringify(base), { mode: 'apply', target: dbFile });
  const s = await start({authRequired:false, port: 0, dbFile, backupDir: path.join(dir, 'b') }); const br = await chromium.launch(); const pg = await br.newPage(); await pg.clock.setFixedTime(new Date('2026-10-15T09:00:00+03:00')); /* Phase 3: the report period defaults to the current month, so the test must not depend on the day it is run */ const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  await pg.goto(s.url); await pg.waitForSelector('#nv');
  const text = async nav => pg.evaluate(nav => { V.nav = nav; V.CF.m = '2026-09'; render(); return document.querySelector('#v').innerText; }, nav);
  // default view = original currencies on Reports and Cash Flow
  let t = await text('Reports'); assert.match(t, /Original-currency view \(default\)/); assert.match(t, /Work by original currency/); assert.doesNotMatch(t, /Summary — Revenue, Costs, Profit/); assert.doesNotMatch(t, /Converted view\./); ok();
  for (const c of ['KWD', 'EGP', 'SAR', 'USD']) assert.match(t, new RegExp('\\b' + c + '\\b')); ok();
  t = await text('Cash Flow'); assert.match(t, /Original-currency view \(default\)/); assert.match(t, /Cash movement by currency/); assert.doesNotMatch(t, /Net cash movement \(before other expenses\)\s*\n?\s*\d/); ok();
  // page numbers = server numbers (single source of truth)
  const api = await (await fetch(s.url + 'api/reports/original-currency')).json();
  const pageWork = await pg.evaluate(() => JSON.parse(JSON.stringify(ORIG.work(FL({})).byCurrency))); assert.equal(JSON.stringify(pageWork), JSON.stringify(api.byCurrency)); ok();
  // the Work table on screen shows each currency's own number
  const rows = await pg.evaluate(() => { V.nav = 'Reports'; V.RP.p = 'custom'; V.RP.a = '2000-01-01'; V.RP.b = '2100-01-01'; render(); const t = [...document.querySelectorAll('#v table')][0]; return [...t.querySelectorAll('tr')].map(r => [...r.children].map(c => c.innerText.trim())); });
  const kwd = rows.find(r => r[0] === 'KWD'); assert.ok(kwd); assert.equal(kwd[1], (api.byCurrency.KWD.liveRevenue / 1000).toLocaleString('en-US', { minimumFractionDigits: 3 })); ok();
  assert.ok(!rows.some(r => /total/i.test(r[0])), 'no cross-currency TOTAL row'); ok();
  // converted view stays available, labelled, with the base-currency summary
  await pg.evaluate(() => { V.MODE.RP = 'conv'; render(); }); t = await pg.evaluate(() => document.querySelector('#v').innerText); assert.match(t, /Converted view\./); assert.match(t, /saved on that record/); assert.match(t, /Summary — Revenue, Costs, Profit/); ok();
  await pg.evaluate(() => { V.nav = 'Cash Flow'; V.MODE.CF = 'conv'; render(); }); t = await pg.evaluate(() => document.querySelector('#v').innerText); assert.match(t, /Converted view\./); assert.match(t, /Cash received from students/); ok();
  // a foreign-currency amount without a saved rate is disclosed, not hidden
  await pg.evaluate(() => { db.l.find(l => l.tc !== B()).trx = 0; V.MODE.RP = 'conv'; V.nav = 'Reports'; render(); }); t = await pg.evaluate(() => document.querySelector('#v').innerText); assert.match(t, /no saved rate; their converted value is unavailable/); ok();
  await pg.reload(); await pg.waitForSelector('#nv');
  // exports: original mode has the currency sheets, no combined TOTAL row on record sheets, and says so
  const capture = async fn => pg.evaluate(async fn => { window.__blobs = []; const o = URL.createObjectURL; URL.createObjectURL = b => { window.__blobs.push(b); return 'blob:x'; }; await (0, eval)(fn); URL.createObjectURL = o; const wb = XLSX.read(await window.__blobs[0].arrayBuffer()); return Object.fromEntries(wb.SheetNames.map(n => [n, XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1 })])); }, fn);
  const full = await pg.evaluate(async () => { window.__b = []; const o = URL.createObjectURL; URL.createObjectURL = b => { window.__b.push(b); return 'blob:x'; }; V.nav = 'Reports'; V.MODE.RP = 'orig'; await xp('full'); URL.createObjectURL = o; const wb = XLSX.read(await window.__b[0].arrayBuffer()); return Object.fromEntries(wb.SheetNames.map(n => [n, XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1 })])); });
  assert.ok(full['Work by currency'] && full['Cash by currency'] && full['About this export']); assert.ok(!full['Summary']); assert.ok(!full['Lesson Report'] || !full['Lesson Report'].some(r => r[0] === 'TOTAL')); for (const [nme, rowsx] of Object.entries(full)) assert.ok(!rowsx.some(r => r[0] === 'TOTAL'), nme + ' has a TOTAL row'); ok();
  assert.ok(full['Work by currency'].some(r => r[0] === 'KWD') && full['Work by currency'].some(r => r[0] === 'EGP')); ok();
  const cf = await pg.evaluate(async () => { window.__c = []; const o = URL.createObjectURL; URL.createObjectURL = b => { window.__c.push(b); return 'blob:x'; }; V.nav = 'Cash Flow'; V.MODE.CF = 'orig'; V.CF.m = '2026-09'; await xpCF(); URL.createObjectURL = o; const wb = XLSX.read(await window.__c[0].arrayBuffer()); return wb.SheetNames; });
  assert.ok(cf.includes('Summary by currency') && cf.includes('Outstanding students')); ok();
  // dashboard strip + links
  t = await text('Dashboard'); assert.match(t, /Totals by original currency/); await pg.evaluate(() => { V.nav = 'Dashboard'; render(); }); await pg.click('text=Open Cash Flow'); assert.equal(await pg.evaluate(() => V.nav), 'Cash Flow'); ok();
  assert.deepEqual(errs, [], errs.join(' | ')); ok();
  await br.close(); await s.close(); fs.rmSync(dir, { recursive: true, force: true });
  console.log('CURRENCY REPORTS TEST OK: ' + n + ' checks (independent per-currency totals, rate-independent, one-currency parity, mixed-currency lessons, No Show, undated openings, cross-currency payers; in Chromium: default view, server=page numbers, no TOTAL row, converted view + disclosure, exports, dashboard links)');
})().catch(e => { console.error(e); process.exit(1); });
