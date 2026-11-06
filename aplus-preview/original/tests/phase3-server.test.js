'use strict';
// Phase 3 server-side regression tests (synthetic data, temporary databases only; the real database is never opened).
// M9 idempotency + concurrency + duplicate payments, L5 overpayment/credit, M5 rate status, M7 subject references, M8 lesson status, M10 recognition,
// L1 universities, M4 Cairo dates, L6 reminders, H7 request boundaries, M11 failed saves, migration 004.
const assert = require('node:assert/strict'); const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { open, migrate, pending, MIG_DIR } = require('../src/db'); const { migrate: imp } = require('../src/importer'); const S = require('../src/save'); const { assemble } = require('../src/state'); const fin = require('../src/finance');
const { forState } = require('../src/ledger-server'); const cairo = require('../src/cairo'); const rates = require('../src/rates'); const REM = require('../src/reminders'); const { start } = require('../src/server');
const base = require('../fixtures/synthetic-v5.json'); let n = 0; const ok = () => n++;
const J = x => JSON.parse(JSON.stringify(x));
const mk = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'aplus-p3-')); const file = path.join(d, 'a.sqlite'); imp(JSON.stringify(base), { mode: 'apply', target: file }); const db = open(file); migrate(db); return { db, file, d }; };
const save = (db, st, o = {}) => S.applySave(db, { baseRev: S.getRev(db), state: st, ...o });
const fails = (fn, code, rx) => { try { fn(); } catch (e) { assert.ok(e instanceof S.SaveError, 'not a SaveError: ' + e.message); assert.equal(e.code, code, e.message); if (rx) assert.match(JSON.stringify([e.message, e.detail]), rx); return e; } assert.fail('expected the save to be refused'); };
const cnt = (db, t) => db.prepare(`SELECT count(*) c FROM ${t}`).get().c;
const nid = st => st.id++;

// ===== migration 004: forward-only, additive, idempotent =====
{ const { db, file } = mk(); assert.equal(pending(db).length, 0); const before = {}; for (const t of ['teachers', 'students', 'lessons', 'student_payments', 'teacher_payments', 'projects', 'project_payments', 'timetable_entries', 'subjects']) before[t] = JSON.stringify(db.prepare(`SELECT * FROM ${t} ORDER BY id`).all());
  const m = migrate(db); assert.deepEqual(m, [], 'running migrate again applies nothing'); ok();
  // every existing row still has exactly the same value in every pre-existing column (the new `subj` column is the only addition)
  const tt = db.prepare('SELECT * FROM timetable_entries ORDER BY id').all(); assert.ok(tt.length > 0); assert.ok(tt.every(r => r.subj === null || db.prepare('SELECT 1 x FROM subjects WHERE id=?').get(r.subj))); ok();
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name IN ('save_requests','reminder_log')").all().length === 2); ok();
  // upgrade of a database that stopped at migration 003: the data is untouched and only subj is back-filled, only where the name is unique
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'aplus-p3m-')), f2 = path.join(d2, 'a.sqlite'); imp(JSON.stringify(base), { mode: 'apply', target: f2 }); const o = open(f2);
  o.exec('DROP TABLE save_requests; DROP TABLE reminder_log; ALTER TABLE timetable_entries DROP COLUMN subj; DELETE FROM schema_migrations WHERE version=4;');
  const snap = t => JSON.stringify(o.prepare(`SELECT * FROM ${t} ORDER BY id`).all()); const was = Object.fromEntries(Object.keys(before).filter(t => t !== 'timetable_entries').map(t => [t, snap(t)])); const wasTT = o.prepare('SELECT id,sub,date,st,en,t FROM timetable_entries ORDER BY id').all();
  assert.deepEqual(pending(o).map(f => f.slice(0, 3)), ['004']); assert.deepEqual(migrate(o), ['004_stabilization.sql']); assert.deepEqual(migrate(o), []);
  for (const t of Object.keys(was)) assert.equal(snap(t), was[t], t + ' unchanged by migration 004');
  assert.deepEqual(o.prepare('SELECT id,sub,date,st,en,t FROM timetable_entries ORDER BY id').all(), wasTT, 'timetable text/date/time unchanged');
  assert.ok(o.prepare('SELECT count(*) c FROM timetable_entries WHERE subj IS NOT NULL').get().c > 0, 'unique names are back-filled by the migration'); assert.ok(o.prepare('SELECT count(*) c FROM timetable_entries t WHERE subj IS NOT NULL AND (SELECT lower(trim(name)) FROM subjects WHERE id=t.subj) IS NOT lower(trim(t.sub))').get().c === 0);
  assert.equal(o.prepare('PRAGMA integrity_check').get().integrity_check, 'ok'); assert.deepEqual(o.prepare('PRAGMA foreign_key_check').all(), []); ok();
  // ambiguous / unknown subject text is left NULL, never guessed
  const o2 = open(f2); o2.exec('DROP TABLE save_requests; DROP TABLE reminder_log; ALTER TABLE timetable_entries DROP COLUMN subj; DELETE FROM schema_migrations WHERE version=4;');
  o2.exec("UPDATE timetable_entries SET sub='no such subject' WHERE id=(SELECT MIN(id) FROM timetable_entries)"); migrate(o2);
  assert.equal(o2.prepare('SELECT subj FROM timetable_entries WHERE sub=?').get('no such subject').subj, null); ok(); o2.close(); o.close(); db.close(); }

// ===== M9: idempotent saves, retries and concurrent requests =====
{ const { db } = mk(); const st = assemble(db), sid = st.s[0].id; st.sp.push({ id: nid(st), p: sid, date: '2026-10-01', cur: 'KWD', amt: 5000, rx: 1, bamt: 5000, bc: 'KWD', meth: 'Cash' });
  const before = cnt(db, 'student_payments'), rev = S.getRev(db);
  const r1 = save(db, st, { reqId: 'req-aaaaaaaa-1' }); assert.equal(r1.rev, rev + 1); assert.equal(cnt(db, 'student_payments'), before + 1); ok();
  // the page times out and sends the very same request again (same id, same base revision): answered with the first result, applied once
  const r2 = S.applySave(db, { baseRev: rev, state: st, reqId: 'req-aaaaaaaa-1' }); assert.equal(r2.replayed, true); assert.equal(r2.rev, r1.rev); assert.equal(cnt(db, 'student_payments'), before + 1); assert.equal(S.getRev(db), rev + 1); ok();
  // the same content with a NEW request id and a stale revision is a conflict, never a second payment
  fails(() => S.applySave(db, { baseRev: rev, state: st, reqId: 'req-bbbbbbbb-2' }), 409, /changed since/); assert.equal(cnt(db, 'student_payments'), before + 1); ok();
  fails(() => save(db, st, { reqId: 'bad id!' }), 400); ok();
  // two browser tabs hold the same revision and both add a payment: exactly one wins
  const a = assemble(db), b = J(a), rv = S.getRev(db); a.sp.push({ id: nid(a), p: sid, date: '2026-10-02', cur: 'KWD', amt: 1000, rx: 1, bamt: 1000, bc: 'KWD' }); b.sp.push({ id: nid(b), p: sid, date: '2026-10-03', cur: 'KWD', amt: 2000, rx: 1, bamt: 2000, bc: 'KWD' });
  const c0 = cnt(db, 'student_payments'); S.applySave(db, { baseRev: rv, state: a, reqId: 'tab-a-0000001' }); fails(() => S.applySave(db, { baseRev: rv, state: b, reqId: 'tab-b-0000001' }), 409, /changed since/); assert.equal(cnt(db, 'student_payments'), c0 + 1); ok();
  // a double submit with a different request id but the same payment (user clicked twice after a reload) needs a typed reason
  const c = assemble(db), dup = c.sp.find(p => p.id === a.sp[a.sp.length - 1].id); c.sp.push({ ...J(dup), id: nid(c) });
  const e = fails(() => save(db, c), 409, /DUPLICATE/); assert.ok(e.detail.needsConfirm.length === 1);
  save(db, c, { confirm: [{ k: 'sp', id: e.detail.needsConfirm[0].id, reason: 'two real payments of the same amount on the same day' }] });
  assert.match(db.prepare("SELECT reason FROM audit_log WHERE action='create' AND entity='sp' ORDER BY id DESC LIMIT 1").get().reason, /two real payments/); ok();
  // same-save duplicate is caught too
  const d = assemble(db), x = { p: sid, date: '2026-11-01', cur: 'KWD', amt: 777, rx: 1, bamt: 777, bc: 'KWD' }; d.sp.push({ ...x, id: nid(d) }, { ...x, id: nid(d) }); fails(() => save(db, d), 409, /DUPLICATE/); ok();
  // the replay table is bounded and purged
  assert.ok(cnt(db, 'save_requests') >= 2); ok(); db.close(); }

// ===== L5: overpayment and student credit are traceable, never lost or counted twice =====
{ const { db } = mk(); const st = assemble(db), sid = st.s[0].id; const L0 = forState(st).studentRows(st, { only: sid }); const cur = (L0[0] || { cur: 'KWD' }).cur;
  const ch = L0.reduce((q, r) => q + r.charged.total, 0), rc0 = L0.reduce((q, r) => q + r.received.total, 0);
  const extra = ch - rc0 + 25000; st.sp.push({ id: nid(st), p: sid, date: '2026-10-05', cur, amt: extra, rx: cur === 'KWD' ? 1 : 0.3, bamt: cur === 'KWD' ? extra : Math.round(extra * 0.3), bc: 'KWD', meth: 'Cash' }); save(db, st);
  const a = assemble(db), rows = forState(a).studentRows(a, { only: sid }), tot = rows.filter(r => r.cur === cur)[0];
  assert.equal(tot.received.total, rc0 + extra, 'the payment is counted once'); assert.ok(tot.net < 0 && tot.overpaid, 'shown as a credit position, not hidden'); assert.equal(tot.unallocated, tot.received.student - tot.allocated.total); ok();
  // allocate part of it: allocation moves money between buckets but never changes the cash received
  const l = a.l.find(x => x.s === sid && x.st === 'Completed'); const sp = a.sp[a.sp.length - 1];
  a.al.push({ id: nid(a), sp: sp.id, wt: 'Live', tk: 'lesson', tid: l.id, amt: 1000, date: '2026-10-06', reason: 'test' }); save(db, a);
  const b = assemble(db), t2 = forState(b).studentRows(b, { only: sid }).filter(r => r.cur === cur)[0]; assert.equal(t2.received.total, tot.received.total); assert.equal(t2.unallocated, tot.unallocated - 1000); assert.equal(t2.net, tot.net); ok();
  // credit recorded and used: balance = credited - used, never negative, never double counted in net
  assert.equal(forState(b).studentRows(b).reduce((q, r) => q + r.creditBalance, 0) >= 0, true); ok();
  // the cash-flow overview must not subtract one student's credit from another's debt: sum of positives only
  const pos = forState(b).studentRows(b).filter(r => r.net > 0).reduce((q, r) => q + r.net, 0); assert.ok(pos >= 0); db.close(); }

// ===== M5: rate freshness =====
{ const now = Date.parse('2026-11-01T12:00:00Z'), H = 36e5;
  assert.equal(rates.status({ r: 1, t: new Date(now - 2 * H).toISOString(), type: 'Live' }, 'KWD', 'EGP', now).state, 'current');
  assert.equal(rates.status({ r: 1, t: new Date(now - 40 * H).toISOString(), type: 'Live' }, 'KWD', 'EGP', now).state, 'stale');
  assert.equal(rates.status({ r: 1, type: 'Live' }, 'KWD', 'EGP', now).state, 'stale', 'no timestamp is never Live');
  assert.equal(rates.status(undefined, 'KWD', 'EGP', now).state, 'missing'); assert.equal(rates.status({ r: 0, t: 'x', type: 'Live' }, 'KWD', 'EGP', now).state, 'missing');
  assert.equal(rates.status({ r: 1, t: '2026-01-01T00:00:00Z', type: 'Manual' }, 'KWD', 'EGP', now).state, 'manual'); assert.equal(rates.status(null, 'KWD', 'KWD', now).state, 'base');
  assert.notEqual(rates.status({ r: 1, t: new Date(now - 40 * H).toISOString(), type: 'Live' }, 'KWD', 'EGP', now).label, 'Live'); ok();
  const { db } = mk(); const st = assemble(db); const stamp = '2026-10-20T10:00:00.000Z'; st.rates.USD = { r: 0.31, t: stamp, type: 'Live' };
  fails(() => save(db, st, { now: '2026-11-01T10:00:00.000Z' }), 422, /labelled Live but not refreshed recently/); // an old timestamp cannot be saved as Live
  save(db, st, { now: '2026-10-20T10:05:00.000Z' }); // saved when it was refreshed: fine
  const again = assemble(db); again.set = { ...again.set, name: 'renamed' }; save(db, again, { now: '2026-11-01T10:00:00.000Z' }); // an unchanged old Live label is left alone (history is never rewritten)
  assert.equal(assemble(db).rates.USD.type, 'Live'); ok();
  // historical records keep the rate they were saved with when the current rate changes
  const h = assemble(db), lesson = h.l[0], was = { trx: lesson.trx, srx: lesson.srx, rt: lesson.rt }; h.rates.EGP = { r: 0.5, t: '2026-11-01T09:00:00.000Z', type: 'Manual' }; save(db, h);
  const after = assemble(db).l[0]; assert.deepEqual({ trx: after.trx, srx: after.srx, rt: after.rt }, was); ok(); db.close(); }

// ===== M7 / M8: timetable subject references and lesson status =====
{ const { db } = mk(); const st = assemble(db), e0 = st.tt[0], z = st.sub.find(x => x.name === e0.sub);
  assert.equal(db.prepare('SELECT subj FROM timetable_entries WHERE id=?').get(e0.id).subj, null, 'rows imported as-is keep no reference until they are edited (never guessed)'); ok();
  // new entry typed with different case/spacing resolves to the real subject; unknown text is refused
  const a = J(st); a.tt.push({ id: nid(a), sched: 'one', wt: 'Live', date: '2026-11-03', day: 'Tuesday', st: '10:00', en: '11:00', t: e0.t, s: [e0.s[0]], sub: '  dev   MATH ' }); save(db, a);
  const added = assemble(db).tt.at(-1); assert.equal(added.sub, z.name); assert.equal(added.subj, z.id); ok();
  const b = assemble(db); b.tt.push({ id: nid(b), sched: 'one', wt: 'Live', date: '2026-11-04', day: 'Wednesday', st: '10:00', en: '11:00', t: e0.t, s: [], sub: 'Quantum Basket Weaving' }); fails(() => save(db, b), 422, /not in the subject list/); ok();
  // renaming the subject renames the text on every entry that references it (no drift)
  const c = assemble(db); c.sub.find(x => x.id === z.id).name = 'DEV Mathematics'; c.tt.forEach(t => { if (t.subj === z.id) t.sub = 'stale text'; }); save(db, c);
  assert.ok(assemble(db).tt.filter(t => t.subj === z.id).every(t => t.sub === 'DEV Mathematics')); ok();
  // a lesson recorded from the timetable cannot silently change student / date / subject
  const d = assemble(db), li = d.l.find(l => l.tt); if (li) { const w = J(d); w.l.find(l => l.id === li.id).date = '2026-01-01'; const er = fails(() => save(db, w), 409, /lesson recorded from the timetable/); assert.ok(er.detail.needsConfirm); save(db, w, { confirm: [{ k: 'l', id: li.id, reason: 'recorded on the wrong day' }] }); } else {
    const w = J(d), ev = w.tt.find(t => t.sched === 'one'); w.l.push({ id: nid(w), date: ev.date, t: ev.t, s: ev.s[0], sub: z.id, d: 1, tr: 1000, sr: 1000, st: 'Completed', tc: 'KWD', sc: 'KWD', bc: 'KWD', bcost: 1000, bchg: 1000, tt: ev.id, od: ev.date }); save(db, w);
    const w2 = assemble(db), l2 = w2.l.at(-1); l2.date = '2026-01-02'; const er = fails(() => save(db, w2), 409, /lesson recorded from the timetable/); save(db, w2, { confirm: [{ k: 'l', id: l2.id, reason: 'recorded on the wrong day' }] }); } ok();
  // M8: cancelled / no-show / rescheduled lessons add nothing to completed counts, charges or earnings (even if amounts were typed)
  const e = assemble(db), ok0 = fin.S(e.l), cntC = e.l.filter(l => l.st === 'Completed').length;
  for (const status of ['Cancelled', 'No Show', 'Rescheduled']) { const w = J(e); w.l.push({ id: nid(w), date: '2026-10-09', t: e.t[0].id, s: e.s[0].id, sub: z.id, d: 2, tr: 5000, sr: 7000, st: status, tc: 'KWD', sc: 'KWD', bc: 'KWD', bcost: 10000, bchg: 14000 }); const x = fin.S(w.l); assert.equal(x.n, ok0.n); assert.equal(x.rev, ok0.rev); assert.equal(x.cost, ok0.cost); assert.equal(x.h, ok0.h); }
  assert.equal(cntC, e.l.filter(l => l.st === 'Completed').length); ok(); db.close(); }

// ===== M10: recognition timing is configurable, default unchanged =====
{ const { db } = mk(); const st = assemble(db); assert.equal(st.set.recog, undefined); const dflt = fin.fin(st); const none = J(st); none.pr.forEach((p, i) => { p.status = i % 2 ? 'In Progress' : 'Completed'; });
  const booking = fin.fin(none); const dl = J(none); dl.set.recog = 'delivered'; const delivered = fin.fin(dl);
  assert.equal(JSON.stringify(fin.fin(st)), JSON.stringify(dflt)); const undelivered = none.pr.filter(p => p.status === 'In Progress' && p.status !== 'Cancelled'); assert.ok(undelivered.length > 0);
  assert.ok(delivered.rev < booking.rev, 'undelivered projects are not recognised when the setting is delivered'); assert.equal(fin.all(dl).pr.every(p => p.status === 'Completed'), true); ok();
  save(db, dl); assert.equal(assemble(db).set.recog, 'delivered'); const bad = J(dl); bad.set.recog = 'whenever'; fails(() => save(db, bad), 422, /recog/); ok(); db.close(); }

// ===== L1: universities =====
{ const { db } = mk(); const st = assemble(db); const exist = st.s[0].uni; st.s.push({ id: nid(st), name: 'Uni Test', uni: exist.toLowerCase() + ' .', lv: '', cur: 'KWD', status: 'Active' }); st.s.push({ id: nid(st), name: 'Uni Test 2', uni: 'Brand New University', cur: 'KWD', status: 'Active' }); const before = JSON.stringify(st.s.slice(0, 5).map(s => s.uni)); save(db, st);
  const a = assemble(db); assert.equal(a.s.find(s => s.name === 'Uni Test').uni, exist, 'near-identical spelling maps to the spelling already in use'); assert.equal(a.s.find(s => s.name === 'Uni Test 2').uni, 'Brand New University'); assert.equal(JSON.stringify(a.s.slice(0, 5).map(s => s.uni)), before, 'existing students are never rewritten'); ok(); db.close(); }

// ===== M4: Africa/Cairo business dates =====
{ const T = (iso, want) => assert.equal(cairo.today(new Date(iso)), want, iso);
  T('2026-12-31T21:59:59Z', '2026-12-31'); T('2026-12-31T22:00:00Z', '2027-01-01'); // winter UTC+2: midnight Cairo = 22:00 UTC
  T('2026-06-30T20:59:59Z', '2026-06-30'); T('2026-06-30T21:00:00Z', '2026-07-01'); // summer UTC+3: midnight Cairo = 21:00 UTC
  T('2026-10-28T21:30:00Z', '2026-10-29'); // 00:30 Cairo while the UTC date is still the 28th
  T('2026-10-29T20:59:59Z', '2026-10-29'); T('2026-10-29T21:00:00Z', '2026-10-29'); T('2026-10-29T21:59:59Z', '2026-10-29'); T('2026-10-29T22:00:00Z', '2026-10-30'); // DST ends 24:00 on 29 Oct 2026: the clock repeats 23:00-24:00
  T('2026-04-23T21:59:59Z', '2026-04-23'); T('2026-04-23T22:00:00Z', '2026-04-24'); T('2026-04-24T22:00:00Z', '2026-04-25'); // DST starts Fri 24 Apr 2026 (00:00 -> 01:00)
  assert.equal(cairo.nowTime(new Date('2026-06-30T21:05:00Z')), '00:05'); assert.equal(cairo.addDays('2026-10-31', 1), '2026-11-01'); assert.equal(cairo.addDays('2026-03-01', -1), '2026-02-28'); ok(); }

// ===== L6: reminders =====
{ const { db } = mk(); const st = assemble(db), r = st.rm[0]; assert.ok(r);
  // r: weekdays [1,4] (Mon, Thu) from 2026-08-20, 18:00. Thursday 2026-10-29 17:59 Cairo: not due yet; 19:05: due
  const early = new Date('2026-10-29T14:59:00Z'), late = new Date('2026-10-29T16:05:00Z'); // 17:59 and 19:05 Cairo (UTC+3: DST is still active on 29 Oct until 24:00)
  const d0 = REM.due(db, st, early).filter(o => o.date === '2026-10-29' && o.id === r.id), d1 = REM.due(db, st, late).filter(o => o.date === '2026-10-29' && o.id === r.id);
  assert.equal(d0.length, 0, 'not due before its time (Cairo)'); assert.equal(d1.length, 1, 'due once its Cairo time has passed'); ok();
  assert.equal(REM.ack(db, r.id, '2026-10-29', late).first, true); assert.equal(REM.ack(db, r.id, '2026-10-29', late).first, false, 'acknowledging twice is harmless');
  assert.equal(REM.due(db, st, late).filter(o => o.date === '2026-10-29' && o.id === r.id).length, 0, 'never surfaced twice'); assert.equal(cnt(db, 'reminder_log'), 1); ok();
  // marked Done by the user: never due
  const dn = J(st); dn.rd[r.id + '|2026-10-26'] = 1; assert.equal(REM.due(db, dn, late).filter(o => o.date === '2026-10-26').length, 0); ok();
  // the user-selected dates are respected (nothing before the start date, nothing after the end date)
  const lim = J(st); lim.rm[0].b = '2026-10-01'; assert.ok(REM.due(db, lim, late).every(o => o.date <= '2026-10-01')); assert.ok(REM.occurrences(st, '2026-08-01', '2026-08-19').every(o => o.id !== r.id)); ok();
  // failure behaviour: bad references are refused with a clear error and write nothing
  for (const [id, date, code] of [[999999, '2026-10-29', 404], ['x', '2026-10-29', 400], [r.id, 'tomorrow', 400]]) { try { REM.ack(db, id, date); assert.fail('should refuse'); } catch (e) { assert.equal(e.code, code); } } assert.equal(cnt(db, 'reminder_log'), 1); ok();
  // calendar export: stable UIDs, Cairo zone, no duplicates when imported twice
  const ics = REM.ics(st, st.rc, new Date('2026-10-29T10:00:00Z')); const uids = ics.match(/UID:[^\r]+/g); assert.ok(uids.length > 0); assert.equal(new Set(uids).size, uids.length); assert.match(ics, /TZID=Africa\/Cairo/); assert.equal(REM.ics(st, st.rc, new Date('2026-10-29T10:00:00Z')).match(/UID:[^\r]+/g).join(), uids.join()); ok(); db.close(); }

// ===== H7 + M11 over real HTTP =====
(async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'aplus-p3h-')), file = path.join(d, 'a.sqlite'); imp(JSON.stringify(base), { mode: 'apply', target: file });
  const logs = []; const s = await start({authRequired:false, port: 0, dbFile: file, backupDir: path.join(d, 'b'), log: (...a) => logs.push(a.join(' ')) });
  const get = (p, h = {}) => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: s.port, path: p, headers: { Host: 'localhost:' + s.port, ...h } }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => res({ status: r.statusCode, body: b, headers: r.headers })); }).on('error', rej));
  const post = (p, body, h = {}) => new Promise((res, rej) => { const data = JSON.stringify(body); const q = http.request({ host: '127.0.0.1', port: s.port, path: p, method: 'POST', headers: { Host: 'localhost:' + s.port, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'X-APlus-Token': s.token, ...h } }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => res({ status: r.statusCode, body: b })); }); q.on('error', rej); q.end(data); });
  assert.equal(s.server.address().address, '127.0.0.1'); ok();
  assert.equal((await get('/api/state')).status, 200); assert.equal((await get('/api/state', { Origin: 'https://evil.example' })).status, 403); assert.equal((await get('/api/state', { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await get('/api/state', { 'Sec-Fetch-Site': 'same-origin' })).status, 200); assert.equal((await get('/api/export', { Origin: 'http://attacker.test' })).status, 403); ok();
  for (const p of ['/data/aplus.sqlite', '/aplus.sqlite', '/a.sqlite', '/api/db', '/api/sql', '/api/admin', '/../package.json', '/%2e%2e/package.json', '/.env', '/src/server.js', '/db/migrations/001_init.sql']) assert.equal((await get(p)).status === 200 && !/<html/i.test((await get(p)).body) ? 'leak ' + p : 'ok', 'ok', p);
  assert.equal((await get('/api/state', { Host: 'evil.example:' + s.port })).status, 421); ok();
  // concurrent payment requests over HTTP: both carry the same base revision, exactly one is applied
  const st = JSON.parse((await get('/api/state')).body), rev = st.rev, sid = st.state.s[0].id; const mkS = (id, amt) => { const x = J(st.state); x.sp.push({ id, p: sid, date: '2026-10-10', cur: 'KWD', amt, rx: 1, bamt: amt, bc: 'KWD', meth: 'Cash' }); return x; };
  const before = (JSON.parse((await get('/api/state')).body).state.sp).length; const [r1, r2] = await Promise.all([post('/api/save', { baseRev: rev, state: mkS(st.state.id, 1111), reqId: 'http-req-000001' }), post('/api/save', { baseRev: rev, state: mkS(st.state.id + 1, 2222), reqId: 'http-req-000002' })]);
  assert.deepEqual([r1.status, r2.status].sort(), [200, 409]); assert.equal(JSON.parse((await get('/api/state')).body).state.sp.length, before + 1); ok();
  // the same request id sent twice at once: one result, one payment
  const st2 = JSON.parse((await get('/api/state')).body), body = { baseRev: st2.rev, state: (() => { const x = J(st2.state); x.sp.push({ id: x.id, p: sid, date: '2026-10-11', cur: 'KWD', amt: 3333, rx: 1, bamt: 3333, bc: 'KWD' }); return x; })(), reqId: 'http-req-000003' };
  const [q1, q2] = await Promise.all([post('/api/save', body), post('/api/save', body)]); assert.deepEqual([q1.status, q2.status], [200, 200]); assert.equal(JSON.parse(q1.body).rev, JSON.parse(q2.body).rev); assert.equal(JSON.parse((await get('/api/state')).body).state.sp.length, st2.state.sp.length + 1); ok();
  // failed saves look failed: validation errors come back as non-2xx with a message and change nothing
  const bad = JSON.parse((await get('/api/state')).body), revB = bad.rev; bad.state.sp.push({ id: bad.state.id, p: sid, date: 'not-a-date', cur: 'KWD', amt: -5, rx: 1, bamt: -5, bc: 'KWD' });
  const fb = await post('/api/save', { baseRev: revB, state: bad.state }); assert.equal(fb.status, 422); assert.equal(JSON.parse(fb.body).ok, false); assert.ok(JSON.parse(fb.body).error); assert.equal(JSON.parse((await get('/api/health')).body).rev, revB); ok();
  assert.equal((await post('/api/save', { baseRev: 'x', state: {} })).status, 400); assert.equal((await post('/api/save', { baseRev: 1, state: {} }, { 'X-APlus-Token': 'wrong' })).status, 403); assert.equal((await post('/api/save', { baseRev: 1, state: {} }, { Origin: 'https://evil.example' })).status, 403); ok();
  // client log: bounded, no token or record content echoed, never an error to the page
  const lg = await post('/api/client-log', { where: 'test <script>', message: 'boom ' + 'x'.repeat(2000) }); assert.equal(lg.status, 200); const line = logs.find(l => /page: test script/.test(l)); assert.ok(line, 'the page error reached the server log'); assert.ok(line.length < 400 && !line.includes(s.token) && !/<script/.test(line), 'bounded, sanitised, no token'); ok();
  // rate status + reminders endpoints
  const rs = JSON.parse((await get('/api/rates/status')).body); assert.ok(rs.rates.EGP && ['stale', 'current', 'manual', 'missing'].includes(rs.rates.EGP.state)); assert.notEqual(rs.rates.EGP.label, 'Live'.repeat(0) + 'Live'); ok();
  const rm = JSON.parse((await get('/api/reminders')).body); assert.equal(rm.timezone, 'Africa/Cairo'); assert.match(rm.note, /closed/); const ic = await get('/api/reminders.ics'); assert.equal(ic.status, 200); assert.match(ic.headers['content-type'], /calendar/); ok();
  assert.equal((await post('/api/reminders/ack', { id: 424242, date: '2026-10-29' })).status, 404); ok();
  await s.close(); console.log('PHASE 3 SERVER TEST OK: ' + n + ' check groups (migration 004 integrity + idempotency, idempotent/concurrent/duplicate payments, overpayment + credit, rate status, subject references, lesson status, recognition setting, universities, Cairo dates incl. DST, reminders incl. failure paths, loopback/Origin/Host boundaries, failed saves).');
})().catch(e => { console.error(e); process.exit(1); });
