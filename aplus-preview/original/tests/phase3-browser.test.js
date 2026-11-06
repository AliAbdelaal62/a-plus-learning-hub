'use strict';
// Phase 3 browser tests (real Chromium against the real server and a temporary synthetic database).
// M4 Cairo dates, M5 stale rates, L3/L4 filters, M3/H5 cash flow, M7/M8 timetable, L2 label, M9 request ids + retry, M11 failed saves, L1 universities, L6 reminders.
const assert = require('node:assert/strict'); const fs = require('fs'), os = require('os'), path = require('path');
let chromium = null; try { chromium = require('playwright').chromium; } catch (_) { /* reported below: a missing browser is SKIPPED (exit 77), never a pass */ }
const { migrate } = require('../src/importer'); const { start } = require('../src/server'); const { open } = require('../src/db');
const base = require('../fixtures/synthetic-v5.json'); let n = 0; const ok = () => n++;
(async () => {
  if (!chromium) { console.log('PHASE 3 BROWSER TEST SKIPPED: Playwright is not installed. This is NOT a pass.'); process.exit(77); }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aplus-p3b-')), dbFile = path.join(dir, 'a.sqlite'); migrate(JSON.stringify(base), { mode: 'apply', target: dbFile });
  const s = await start({authRequired:false, port: 0, dbFile, backupDir: path.join(dir, 'b'), clock: () => new Date('2026-10-29T16:05:00Z') }); const br = await chromium.launch();
  const mkPage = async (iso, tz = 'Pacific/Honolulu') => { const ctx = await br.newContext({ timezoneId: tz }); const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(String(e))); pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|rates unavailable|er-api/.test(m.text())) errs.push(m.text()); }); await pg.route(/open\.er-api\.com/, r => r.abort()); await pg.clock.setFixedTime(new Date(iso)); await pg.goto(s.url); await pg.waitForSelector('#nv'); pg.errs = errs; pg.ctx = ctx; return pg; };

  // ---------- M4: the business date is the Cairo date, whatever the computer's zone is ----------
  { for (const [iso, want] of [['2026-10-28T21:30:00Z', '2026-10-29'], ['2026-12-31T22:30:00Z', '2027-01-01'], ['2026-06-30T21:30:00Z', '2026-07-01'], ['2026-10-29T21:30:00Z', '2026-10-29']]) {
      const pg = await mkPage(iso); assert.equal(await pg.evaluate(() => today()), want, iso); assert.equal(await pg.evaluate(() => V.TT.d), want); assert.equal(await pg.evaluate(() => V.CF.m), want.slice(0, 7)); await pg.ctx.close(); }
    const pg = await mkPage('2026-10-28T21:30:00Z', 'America/Los_Angeles'); const dflt = await pg.evaluate(() => { edL(); return document.querySelector('#f_date').value; }); assert.equal(dflt, '2026-10-29', 'a new lesson form defaults to the Cairo date'); await pg.ctx.close(); ok(); }

  const pg = await mkPage('2026-10-15T09:00:00+03:00');
  // ---------- M5: a stale rate is never shown as Live ----------
  { const r = await pg.evaluate(() => { const old = new Date(Date.parse('2026-10-15T09:00:00+03:00') - 5 * 864e5).toISOString(), fresh = new Date(Date.parse('2026-10-15T09:00:00+03:00') - 3600e3).toISOString();
      db.rates.EGP = { r: 0.006, t: old, type: 'Live' }; db.rates.USD = { r: 0.31, t: fresh, type: 'Live' }; delete db.rates.SAR; V.nav = 'Settings'; render(); const t = document.querySelector('#v').innerText; return { t, egp: rty('EGP', 0.006), usd: rty('USD', 0.31), sar: rst_('SAR'), both: ty('Live', 'Stale') }; });
    assert.equal(r.egp, 'Stale'); assert.equal(r.usd, 'Live'); assert.equal(r.sar, 'None'); assert.equal(r.both, 'Stale'); assert.match(r.t, /out of date, not live/); assert.match(r.t, /EGP \(last refreshed 2026-10-10\)/); assert.match(r.t, /No exchange rate:\s*SAR/); assert.doesNotMatch(r.t, /EGP[^\n]*\n?[^\n]*\bLive\b[^\n]*0\.006/);
    const dash = await pg.evaluate(() => { V.nav = 'Dashboard'; render(); return document.querySelector('#v').innerText; }); assert.match(dash, /out of date, not live/); ok();
    const lbl = await pg.evaluate(() => { V.nav = 'Settings'; render(); return [...document.querySelectorAll('#v tr')].filter(r => /^EGP|^USD/.test(r.innerText)).map(r => r.innerText.replace(/\s+/g, ' ')); });
    assert.ok(lbl.find(x => /^EGP/.test(x) && /Stale/.test(x) && !/\bLive\b/.test(x.replace(/not live/g, '')))); assert.ok(lbl.find(x => /^USD/.test(x) && /\bLive\b/.test(x))); ok(); }
  await pg.reload(); await pg.waitForSelector('#nv');

  // ---------- L3: the currency filter has ONE meaning ----------
  { const r = await pg.evaluate(() => { const l = db.l.find(l => l.tc !== l.sc && l.st === 'Completed'); if (!l) return null; const has = F => FL(F).ls.some(x => x.id === l.id), byS = has({ cur: l.sc }), byT_default = has({ cur: l.tc }), byT = has({ cur: l.tc, cr: 't' }), bySt = has({ cur: l.sc, cr: 't' }); return { byS, byT_default, byT, bySt, tc: l.tc, sc: l.sc }; });
    assert.ok(r, 'fixture has a mixed-currency lesson'); assert.equal(r.byS, true); assert.equal(r.byT_default, false, 'a teacher-currency match is not a student-charge match'); assert.equal(r.byT, true); assert.equal(r.bySt, false); ok();
    const ui = await pg.evaluate(() => { V.nav = 'Lessons'; render(); return document.querySelector('#v').innerHTML; }); assert.match(ui, /Currency applies to: student charge/); assert.match(ui, /Teacher cost currency/); ok(); }

  // ---------- L4: undated projects/courses are never dropped silently ----------
  { const r = await pg.evaluate(() => { db.pr.push({ id: db.id++, name: 'UNDATED P3', sub: '', uni: '', t: db.t[0].id, s: db.s[0].id, lv: '', status: 'In Progress', cur: 'KWD', rev: 100000, share: 30, rx: 1, rt: 'Same', bc: 'KWD' }); const none = FL({}).pr.some(p => p.name == 'UNDATED P3'), ranged = FL({ a: '2026-09-01', b: '2026-09-30' }).pr.some(p => p.name == 'UNDATED P3'), inc = FL({ a: '2026-09-01', b: '2026-09-30', ud: '1' }).pr.some(p => p.name == 'UNDATED P3');
      V.nav = 'Dashboard'; V.F = { a: '2026-09-01', b: '2026-09-30' }; render(); const note = document.querySelector('#v').innerText; V.F = { a: '2026-09-01', b: '2026-09-30', ud: '1' }; render(); const note2 = document.querySelector('#v').innerText; V.F = {}; return { none, ranged, inc, note, note2 }; });
    assert.equal(r.none, true); assert.equal(r.ranged, false); assert.equal(r.inc, true); assert.match(r.note, /1 undated record.*not included in this date range/s); assert.match(r.note2, /included.*in these totals/s); ok(); }
  await pg.reload(); await pg.waitForSelector('#nv');

  // ---------- M3 + H5: dated course payments and refunds are in the cash flow; Payments report filters project payments ----------
  { const r = await pg.evaluate(() => { const e = db.re[0], c = db.rc.find(x => x.id == e.rc); db.cp.push({ id: db.id++, re: e.id, date: '2026-10-07', amt: 1000, cur: c.cur, rx: c.cur == B() ? 1 : c.rx, bamt: c.cur == B() ? 1000 : Math.round(1000 * c.rx), bc: B(), fxs: 'stored', meth: 'Cash', notes: '' }); e.paid += 1000; const ok_ = save(); const R = cfRows('2026-10', {}); const row = R.st.find(x => x.svc.startsWith('Course:') && x.amt == 1000);
      const pr = db.pr.find(p => p.s && db.pp.some(q => q.pr == p.id)); const pay = pr ? ds('', '', { s: pr.s }).pay.r.filter(x => x[0] == 'Project payment') : []; const other = pr ? ds('', '', { s: -1 }).pay.r.filter(x => x[0] == 'Project payment').length : 0; return { ok_, hasRow: !!row, cash: R.st.reduce((q, x) => q + x.base, 0), pay: pay.length, projPays: pr ? db.pp.filter(q => q.pr == pr.id).length : 0, other, who: pr && pr.s }; });
    assert.equal(r.ok_, true); assert.equal(r.hasRow, true, 'a dated course payment appears in the monthly cash movement'); ok();
    if (r.who) { assert.ok(r.pay >= r.projPays && r.pay > 0, 'student filter keeps that student\'s project payments'); } ok();
    const cmp = await pg.evaluate(() => { const L = LEDGER.studentRows(db, {}); const m = cfMetrics('2026-10', {}); const dated = db.sp.filter(p => p.date.startsWith('2026-10')).reduce((q, p) => q + p.bamt, 0) + db.cp.filter(p => p.date.startsWith('2026-10')).reduce((q, p) => q + PPB(p), 0) + db.pp.filter(p => (p.date || '').startsWith('2026-10')).reduce((q, p) => q + PPB(p), 0) - db.ad.filter(a => a.kind == 'refund' && a.date.startsWith('2026-10')).reduce((q, a) => q + (a.bamt || 0), 0); return { rec: m.rec, dated }; });
    assert.equal(cmp.rec, cmp.dated, 'monthly cash received = student + project + course payments - refunds (same records the ledger holds)'); ok(); }

  // ---------- M8 + L2: timetable status and the reschedule label ----------
  { const r = await pg.evaluate(() => { const e = db.tt.find(t => t.wt == 'Live' && (t.s || []).length), od = e.sched == 'rec' ? '2026-10-12' : e.date; const dflt = db.l.filter(l => l.tt == e.id && l.od == od); db.l.push({ id: db.id++, date: od, t: e.t, s: e.s[0], sub: (db.sub.find(z => z.name == e.sub) || {}).id, lv: '', d: 1, tr: 1000, sr: 1000, st: 'No Show', tc: 'KWD', sc: 'KWD', trx: 1, srx: 1, bc: 'KWD', bcost: 0, bchg: 0, rt: 'Same', tt: e.id, od });
      const cv = coverage(e, od); const before = S(db.l.filter(l => l.st == 'Completed')).n; doneFlow(e.id, od); const modal = document.querySelector('#m') ? document.querySelector('#m').innerText : ''; return { all: cv.all, modal, completed: before, noshow: db.l.filter(l => l.tt == e.id && l.od == od && l.st == 'No Show').length, nCompleted: S(db.l).n, nAll: db.l.length }; });
    assert.ok(r.noshow >= 1); assert.equal(r.nCompleted, r.completed, 'a No Show lesson is not a completed lesson'); if (r.all) { assert.match(r.modal, /NOT delivered/); assert.match(r.modal, /No Show/); } ok();
    const sub = await pg.evaluate(() => { V.nav = 'Subjects'; render(); return document.querySelector('#v').innerText; }); assert.match(sub, /completed lessons/); ok();
    const dash = await pg.evaluate(() => { V.nav = 'Dashboard'; render(); return document.querySelector('#v').innerHTML; }); assert.match(dash, />RESCHEDULE</); assert.doesNotMatch(dash, /rsOc\([^)]*\)"[^>]*>DELETE</); ok(); }
  await pg.reload(); await pg.waitForSelector('#nv');

  // ---------- M7: timetable subject is a reference ----------
  { const r = await pg.evaluate(() => { const z = db.sub.find(x => (x.type || 'Live') == 'Live'); edTT(); document.querySelector('#f_sched').value = 'one'; document.querySelector('#f_date').value = '2026-11-10'; document.querySelector('#f_st').value = '10:00'; document.querySelector('#f_sub').value = 'Not A Subject'; document.querySelector('#sv').click(); const err = document.querySelector('#er') ? document.querySelector('#er').textContent : ''; const cnt0 = db.tt.length;
      document.querySelector('#f_sub').value = '  ' + z.name.toUpperCase() + ' '; document.querySelector('#sv').click(); const e = db.tt.at(-1); return { err, cnt0, cnt1: db.tt.length, subj: e.subj, sub: e.sub, id: z.id, name: z.name }; });
    assert.match(r.err, /Choose a subject from the list/); assert.equal(r.cnt1, r.cnt0 + 1); assert.equal(r.subj, r.id); assert.equal(r.sub, r.name); ok();
    const sv = await pg.evaluate(() => apiX('GET', '/api/state').state.tt.at(-1)); assert.equal(sv.subj, r.id); assert.equal(sv.sub, r.name); ok(); }

  // ---------- L1: university suggestions ----------
  { const r = await pg.evaluate(() => { edS(); const dl = [...document.querySelectorAll('#unis option')].map(o => o.value), fld = document.querySelector('#f_uni').getAttribute('list'); return { dl, fld }; }); assert.equal(r.fld, 'unis'); assert.ok(r.dl.length >= 1 && new Set(r.dl.map(x => x.toLowerCase())).size === r.dl.length, 'one entry per distinct university'); await pg.evaluate(() => close()); ok(); }

  // ---------- M9 + M11: request id, one retry after a transport failure, failed saves are not successes ----------
  { const bodies = []; let fail = 1; await pg.route('**/api/save', async route => { const b = JSON.parse(route.request().postData()); bodies.push({ reqId: b.reqId, n: b.state.sp.length }); if (fail) { fail = 0; return route.abort(); } return route.continue(); });
    const before = (await (await fetch(s.url + 'api/state')).json()).state.sp.length;
    const r = await pg.evaluate(() => { db.sp.push({ id: db.id++, p: db.s[0].id, date: today(), cur: 'KWD', amt: 4321, rx: 1, rt: 'Same', bamt: 4321, bc: 'KWD', meth: 'Cash', notes: 'p3 retry' }); return save(); });
    assert.equal(r, true); assert.equal(bodies.length, 2); assert.ok(/^[A-Za-z0-9_-]{8,64}$/.test(bodies[0].reqId)); assert.equal(bodies[0].reqId, bodies[1].reqId, 'the retry reuses the request id'); ok();
    const after = (await (await fetch(s.url + 'api/state')).json()).state.sp; assert.equal(after.length, before + 1, 'saved exactly once'); await pg.unroute('**/api/save'); ok();
    // server refuses -> the page says NOT SAVED and the change is undone
    await pg.route('**/api/save', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'disk full (simulated)' }) }));
    const f = await pg.evaluate(() => { const n0 = db.sp.length; db.sp.push({ id: db.id++, p: db.s[0].id, date: today(), cur: 'KWD', amt: 99, rx: 1, rt: 'Same', bamt: 99, bc: 'KWD', meth: 'Cash', notes: 'p3 fail' }); const ret = save(); render(); return { ret, n0, n1: db.sp.length, bad: SAVEBAD, banner: document.body.innerText.includes('NOT SAVED') || document.body.innerText.includes('did not save') }; });
    assert.equal(f.ret, false); assert.equal(f.n1, f.n0, 'the failed change is undone'); assert.match(f.bad, /disk full/); assert.ok(f.banner); await pg.unroute('**/api/save'); ok();
    // a failed form submit leaves nothing behind and says so
    const g = await pg.evaluate(() => { const n0 = db.t.length; edT(); document.querySelector('#f_name').value = 'P3 Teacher'; return n0; }); await pg.route('**/api/save', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'maintenance (simulated)' }) }));
    const g2 = await pg.evaluate(n0 => { document.querySelector('#sv').click(); return { n0, n1: db.t.length, bad: SAVEBAD }; }, g); await pg.unroute('**/api/save'); assert.equal(g2.n1, g2.n0); assert.match(g2.bad, /maintenance/); ok();
    await pg.evaluate(() => { SAVEBAD = ''; }); }

  // ---------- L6: reminders surface once ----------
  { await pg.close(); const p2 = await mkPage('2026-10-29T16:05:00Z'); await p2.waitForTimeout(500);
    const t1 = await p2.evaluate(() => { V.nav = 'Dashboard'; P3poll(); return null; }); await p2.waitForFunction(() => P3.rem.length > 0, null, { timeout: 5000 }); const txt = await p2.evaluate(() => { render(); return document.querySelector('#v').innerText; }); assert.match(txt, /Reminders due/); assert.match(txt, /nothing is delivered while it is closed/); ok();
    const due0 = await p2.evaluate(() => P3.rem.length); await p2.evaluate(() => { P3.rem.slice().forEach(r => P3ack(r.id, r.date)); }); await p2.waitForFunction(() => P3.rem.length === 0, null, { timeout: 5000 });
    await p2.evaluate(() => { P3ack(P3.rem[0] ? P3.rem[0].id : 149, '2026-10-29'); }); // acknowledging again is harmless
    await p2.reload(); await p2.waitForSelector('#nv'); await p2.waitForTimeout(800); const again = await p2.evaluate(() => P3.rem.length); assert.equal(again, 0, 'acknowledged reminders do not come back'); ok();
    const rows = open(dbFile).prepare('SELECT count(*) c FROM reminder_log').get().c; assert.equal(rows, due0, 'one log row per occurrence, no duplicates'); ok();
    assert.deepEqual(p2.errs, [], 'no page errors: ' + p2.errs.join(' | ')); await p2.ctx.close(); }

  await br.close(); await s.close();
  console.log('PHASE 3 BROWSER TEST OK: ' + n + ' check groups (real Chromium: Cairo dates incl. DST + foreign time zones, stale/missing rate labels, currency dimension filter, undated projects, cash flow incl. course payments + refunds, No Show sessions, RESCHEDULE label, subject references, university list, request-id retry, failed saves undone, reminders once).');
})().catch(e => { console.error(e); process.exit(1); });
