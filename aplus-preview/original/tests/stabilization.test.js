'use strict';
// Technical stabilization regression tests (server side). Synthetic data and temporary databases only.
// Every check has an INDEPENDENT expected value (computed here from raw rows, not by calling the code under test).
// Running this file against the Phase 3 baseline (APLUS_REPORT=1) lists which checks fail BEFORE the repair; normal mode asserts that all pass.
const assert = require('node:assert/strict'); const fs = require('fs'), os = require('os'), path = require('path');
const { open, migrate } = require('../src/db'); const { migrate: imp } = require('../src/importer'); const S = require('../src/save'); const { assemble } = require('../src/state');
const { forState } = require('../src/ledger-server'); const B = require('../src/backup'); const rates = require('../src/rates');
const base = require('../fixtures/synthetic-v5.json'); const J = x => JSON.parse(JSON.stringify(x));
const mk = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'aplus-st-')); const file = path.join(d, 'a.sqlite'); imp(JSON.stringify(base), { mode: 'apply', target: file }); const db = open(file); migrate(db); return { db, file, d }; };
const save = (db, st, o = {}) => S.applySave(db, { baseRev: S.getRev(db), state: st, ...o });
const refused = (fn, code, rx) => { try { fn(); } catch (e) { if (!(e instanceof S.SaveError)) throw e; assert.equal(e.code, code, e.message + JSON.stringify(e.detail)); if (rx) assert.match(JSON.stringify([e.message, e.detail]), rx); return e; } assert.fail('expected the save to be refused'); };
const nid = st => st.id++; const results = []; const REPORT = process.env.APLUS_REPORT === '1';
function check(id, title, fn) { try { fn(); results.push({ id, title, result: 'PASS' }); } catch (e) { results.push({ id, title, result: 'FAIL', why: String(e.message).split('\n')[0].slice(0, 220) }); } }
const tpNew = (st, o) => ({ id: nid(st), p: 100, date: '2026-10-01', cur: 'KWD', amt: 1000, rx: 1, rt: 'Same', bamt: 1000, bc: 'KWD', meth: 'Cash', notes: '', src: 'Live', srcd: '', lk: 0, ...o });
const cnt = (db, t) => db.prepare(`SELECT count(*) c FROM ${t}`).get().c;
const lastAudit = (db, action, entity) => db.prepare('SELECT * FROM audit_log WHERE action=? AND entity=? ORDER BY rowid DESC LIMIT 1').get(action, entity);

// ---------- B: backend validation of teacher payments ----------
check('B1', 'teacher payment: unknown source is refused', () => { const { db } = mk(); const st = assemble(db); st.tp.push(tpNew(st, { src: 'Bogus' })); refused(() => save(db, st), 422, /source/); });
check('B2', 'teacher payment: linked lesson of another teacher / another currency is refused', () => { const { db } = mk(); const st = assemble(db); const l = st.l.find(x => x.t === 100 && x.tc === 'KWD');
  const a = J(st); a.tp.push(tpNew(a, { p: 101, cur: 'EGP', rx: 0.0064, amt: 10000, bamt: 64, bc: 'KWD', lk: l.id })); refused(() => save(db, a), 422, /linked lesson/);
  const b = J(st); b.tp.push(tpNew(b, { cur: 'SAR', rx: 0.082, amt: 1000, bamt: 82, lk: l.id })); refused(() => save(db, b), 422, /linked lesson/); });
check('B3', 'teacher payment: amount x rate must equal the base amount; base-currency payments have rate 1', () => { const { db } = mk(); const st = assemble(db);
  const a = J(st); a.tp.push(tpNew(a, { rx: 2, bamt: 2000 })); refused(() => save(db, a), 422, /rate 1/);
  const b = J(st); b.tp.push(tpNew(b, { p: 101, cur: 'EGP', amt: 100000, rx: 0.0064, bamt: 645 })); refused(() => save(db, b), 422, /base amount/);
  const c = J(st); c.tp.push(tpNew(c, { p: 101, cur: 'EGP', amt: 100000, rx: 0.0064, bamt: 640 })); save(db, c, { confirm: [{ k: 'tp', id: c.tp.at(-1).id, reason: 'advance for next month' }] }); });
check('B4', 'legacy teacher payments with an old-style source are preserved by an unrelated save', () => { const { db } = mk(); db.exec("UPDATE teacher_payments SET src='legacy-note' WHERE id=125"); const before = JSON.stringify(db.prepare('SELECT * FROM teacher_payments ORDER BY id').all());
  const st = assemble(db); st.t[0].notes = 'edited'; save(db, st); assert.equal(JSON.stringify(db.prepare('SELECT * FROM teacher_payments ORDER BY id').all()), before); });
check('B7', 'safe editing of a legacy payment: a notes-only edit keeps the stored snapshot; changing the amount re-validates', () => { const { db } = mk(); db.exec("UPDATE teacher_payments SET bamt=bamt+5, src='legacy-note' WHERE id=125"); const was = db.prepare('SELECT * FROM teacher_payments WHERE id=125').get();
  const st = assemble(db); st.tp.find(x => x.id === 125).notes = 'corrected typo in the note'; save(db, J(st)); const now = db.prepare('SELECT * FROM teacher_payments WHERE id=125').get(); assert.equal(now.bamt, was.bamt); assert.equal(now.src, 'legacy-note'); assert.equal(now.notes, 'corrected typo in the note');
  const b = J(st); b.tp.find(x => x.id === 125).amt += 100; b.tp.find(x => x.id === 125).bamt += 100; refused(() => save(db, b), 422, /source|base amount/); });
check('B8', 'payment link follows the source: lesson / course / project must exist, belong to the teacher and share the currency; Other cannot link', () => { const { db } = mk(); const st = assemble(db);
  const okp = J(st); okp.tp.push(tpNew(okp, { p: 102, src: 'Recorded', lk: 140, amt: 1000, bamt: 1000 })); save(db, okp);
  const a = J(st); a.tp.push(tpNew(a, { p: 100, src: 'Recorded', lk: 140 })); refused(() => save(db, a), 422, /different teacher/);
  const b = J(st); b.tp.push(tpNew(b, { p: 101, src: 'Project', lk: 132, cur: 'KWD' })); refused(() => save(db, b), 422, /cross-currency settlement/);
  const c = J(st); c.tp.push(tpNew(c, { p: 100, src: 'Other', srcd: 'bonus', lk: 5 })); refused(() => save(db, c), 422, /cannot be linked/);
  const d = J(st); d.tp.push(tpNew(d, { p: 101, src: 'Project', lk: 99999, cur: 'EGP', rx: 0.0064, amt: 1000, bamt: 6 })); refused(() => save(db, d), 422, /does not exist/); });
check('B5', 'excess payment needs an explicit reason, is saved when confirmed and the reason is audited', () => { const { db } = mk(); const st = assemble(db); const t = st.t.find(x => x.id === 102); const p = tpNew(st, { p: 102, amt: 900000000, bamt: 900000000 }); st.tp.push(p);
  const e = refused(() => save(db, J(st)), 409, /EXCESS/); assert.ok(e.detail.needsConfirm.some(x => x.k === 'tp' && x.id === p.id));
  save(db, J(st), { confirm: [{ k: 'tp', id: p.id, reason: 'advance agreed with the teacher' }] }); assert.equal(cnt(db, 'teacher_payments'), 5); const a = lastAudit(db, 'create', 'tp'); assert.ok(a && /advance agreed/.test(a.reason || a.detail || JSON.stringify(a))); assert.ok(t); });
check('B6', 'replay with the same request id applies once; stale revision refused', () => { const { db } = mk(); const st = assemble(db); const p = tpNew(st, { amt: 10, bamt: 10 }); st.tp.push(p); const rev = S.getRev(db);
  const r1 = S.applySave(db, { baseRev: rev, state: J(st), reqId: 'req-00001' }); const r2 = S.applySave(db, { baseRev: rev, state: J(st), reqId: 'req-00001' }); assert.equal(cnt(db, 'teacher_payments'), 5); assert.equal(JSON.stringify(r1.rev), JSON.stringify(r2.rev));
  const s2 = assemble(db); s2.t[0].notes = 'x'; refused(() => S.applySave(db, { baseRev: rev, state: s2 }), 409); });

// ---------- A / C: teacher balance, cross-currency settlement ----------
function teacherFixture() { const { db } = mk(); const st = assemble(db); const T = nid(st);
  st.t.push({ id: T, name: 'ST Teacher', phone: '0', email: '', spec: 'x', cur: 'KWD', rate: 10000, status: 'Active', notes: '' });
  const C = nid(st), SU = nid(st); st.sub.push({ id: SU, name: 'ST Recorded Subject', type: 'Recorded', uni: '', inst: T });
  st.rc.push({ id: C, name: 'ST Course', sub: '', subj: SU, uni: '', inst: T, lv: '', cur: 'KWD', rx: 1, rt: 'Manual', bc: 'KWD', cost: 0, price: 100000, n: 2, share: 50, date: '2026-09-01', notes: '' });
  const P = tpNew(st, { p: T, cur: 'EGP', amt: 2000000, rx: 0.0064, rt: 'Manual', bamt: 12800, src: 'Recorded' }); st.tp.push(P);
  save(db, J(st), { confirm: [{ k: 'tp', id: P.id, reason: 'advance in EGP' }] }); return { db, T, C, P: P.id }; }
check('A1', 'teacher earned/paid/remaining per currency equals an independent calculation (course share, EGP payment not offset against KWD)', () => { const { db, T } = teacherFixture(); const st = assemble(db); const rows = forState(st).teacherRows(st, { only: T });
  const kwd = rows.find(r => r.cur === 'KWD'), egp = rows.find(r => r.cur === 'EGP'); assert.equal(kwd.earned.Recorded, 100000); assert.equal(kwd.remaining.total, 100000); assert.equal(egp.paid.Recorded, 2000000); assert.equal(egp.remaining.total, -2000000); });
check('C1', 'cross-currency payment without a settlement is listed as unresolved, and counts as recorded', () => { const { db, T, P } = teacherFixture(); const st = assemble(db); const u = forState(st).crossCurrencyUnresolved(st); assert.deepEqual(u.map(x => [x.tp, x.unsettled, x.cur]), [[P, 2000000, 'EGP']]); assert.equal(u[0].teacher, T); });
check('C2', 'recorded settlement: each currency balances on its own with conserved amounts', () => { const { db, T, C, P } = teacherFixture(); const st = assemble(db); st.ts.push({ id: nid(st), tp: P, ok: 'course', oid: C, pcur: 'EGP', pamt: 1000000, scur: 'KWD', samt: 6500, rx: 0.0065, date: '2026-10-02', prov: 'new', reason: '' }); save(db, st);
  const s2 = assemble(db), L = forState(s2), rows = L.teacherRows(s2, { only: T }); const kwd = rows.find(r => r.cur === 'KWD'), egp = rows.find(r => r.cur === 'EGP');
  assert.equal(kwd.remaining.total, 100000 - 6500); assert.equal(egp.remaining.total, -2000000 + 1000000); assert.equal(kwd.remaining.Recorded, 93500); const b = L.teacherBase(s2, T, {}); const bk = b.byCurrency.find(c => c.cur === 'KWD'), be = b.byCurrency.find(c => c.cur === 'EGP');
  assert.equal(bk.paid, 6400); assert.equal(be.paid, 12800 - 6400); assert.deepEqual(L.crossCurrencyUnresolved(s2).map(x => x.unsettled), [1000000]); assert.ok(assemble(db).ts.length === 1); });
check('C3', 'settlement conservation: over-allocation, double settlement, wrong teacher, bad arithmetic are refused', () => { const { db, T, C, P } = teacherFixture(); const mkTs = (st, o) => ({ id: nid(st), tp: P, ok: 'course', oid: C, pcur: 'EGP', pamt: 1000000, scur: 'KWD', samt: 6500, rx: 0.0065, date: '2026-10-02', prov: 'new', reason: '', ...o });
  const a = assemble(db); a.ts.push(mkTs(a, { pamt: 2000001, samt: 13000 })); refused(() => save(db, a), 422, /exceed|violat|payment/);
  const b = assemble(db); b.ts.push(mkTs(b, { samt: 7000 })); refused(() => save(db, b), 422, /does not equal/);
  const c = assemble(db); c.ts.push(mkTs(c, { pamt: 1000000, samt: 90000000, rx: 90 })); refused(() => save(db, c), 422, /exceed what was earned/);
  const d = assemble(db); d.ts.push(mkTs(d, {}), mkTs(d, { pamt: 600000, samt: 3900 })); save(db, d); const e = assemble(db); e.ts.push(mkTs(e, { pamt: 500000, samt: 3250 })); refused(() => save(db, e), 422, /exceed|payment/);
  const f = assemble(db); f.ts.push(mkTs(f, { pamt: 100000, samt: 650, oid: f.rc[0].id })); refused(() => save(db, f), 422, /different teacher|currency/); assert.ok(T); });
check('C4', 'a payment that has settlements cannot be deleted; a settlement delete needs a reason and is audited', () => { const { db, C, P } = teacherFixture(); const st = assemble(db); const t = { id: nid(st), tp: P, ok: 'course', oid: C, pcur: 'EGP', pamt: 1000000, scur: 'KWD', samt: 6500, rx: 0.0065, date: '2026-10-02', prov: 'new', reason: '' }; st.ts.push(t); save(db, st);
  const a = assemble(db); a.tp = a.tp.filter(x => x.id !== P); refused(() => save(db, a), 409, /history|settle/);
  const b = assemble(db); b.ts = []; refused(() => save(db, b), 409, /needsConfirm/); save(db, b, { confirm: [{ k: 'ts', id: t.id, reason: 'entered against the wrong course' }] }); assert.equal(cnt(db, 'teacher_settlements'), 0); assert.ok(lastAudit(db, 'delete', 'ts')); });
check('C5', 'a correction settlement needs a reason; creation is audited with before/after', () => { const { db, C, P } = teacherFixture(); const st = assemble(db); const t = { id: nid(st), tp: P, ok: 'course', oid: C, pcur: 'EGP', pamt: 1000000, scur: 'KWD', samt: 6500, rx: 0.0065, date: '2026-10-02', prov: 'correction', reason: '' }; st.ts.push(t); refused(() => save(db, J(st)), 422, /reason/);
  t.reason = 'owner confirmed the intention for the 2026-09 EGP advance'; save(db, st); const a = lastAudit(db, 'create', 'ts'); assert.ok(a && JSON.parse(a.after_json).samt === 6500); });
check('C6', 'editing the parent course currency or rate never revalues a recorded settlement or payment', () => { const { db, C, P } = teacherFixture(); const st = assemble(db); st.ts.push({ id: nid(st), tp: P, ok: 'course', oid: C, pcur: 'EGP', pamt: 1000000, scur: 'KWD', samt: 6500, rx: 0.0065, date: '2026-10-02', prov: 'new', reason: '' }); save(db, st);
  const before = JSON.stringify([db.prepare('SELECT * FROM teacher_settlements').all(), db.prepare('SELECT * FROM teacher_payments ORDER BY id').all(), db.prepare('SELECT * FROM project_payments ORDER BY id').all(), db.prepare('SELECT * FROM student_payments ORDER BY id').all()]);
  const a = assemble(db); const pr = a.pr.find(x => x.id === 130); pr.rx = 0.5; pr.cur = 'KWD'; a.rates.EGP = { r: 0.9, t: '2026-10-31T00:00:00.000Z', type: 'Manual' }; try { save(db, a, { confirm: [{ k: 'pr', id: 130, reason: 'rate edit test' }] }); } catch (e) { if (!(e instanceof S.SaveError)) throw e; }
  assert.equal(JSON.stringify([db.prepare('SELECT * FROM teacher_settlements').all(), db.prepare('SELECT * FROM teacher_payments ORDER BY id').all(), db.prepare('SELECT * FROM project_payments ORDER BY id').all(), db.prepare('SELECT * FROM student_payments ORDER BY id').all()]), before); });

// ---------- E: recorded-course counts ----------
check('E1', 'a declared count below the number of enrolments needs a reason (and is audited); untouched legacy gaps do not block other saves', () => { const { db } = mk(); const st = assemble(db); const c = st.rc.find(x => x.id === 144); const n = st.re.filter(e => e.rc === 144).length; assert.ok(n >= 1);
  const a = J(st); a.rc.find(x => x.id === 144).n = n - 1; const e = refused(() => save(db, a), 409, /DECLARED COUNT/); assert.ok(e.detail.needsConfirm.some(x => x.k === 'rc' && x.id === 144));
  save(db, a, { confirm: [{ k: 'rc', id: 144, reason: 'count is the number of paying students' }] }); assert.ok(lastAudit(db, 'count-confirmed', 'rc')); assert.ok(c); });
check('E2', 'discounted enrolment prices are preserved (price 12.345 stays on a 100.000 list-price course)', () => { const { db } = mk(); const st = assemble(db); const e = st.re.find(x => x.id === 145); const before = e.price; st.t[0].notes = 'unrelated'; save(db, st); assert.equal(assemble(db).re.find(x => x.id === 145).price, before); });

// ---------- G: timetable ----------
const MON = '2026-08-24';
function lessonFor(st, o) { return { id: nid(st), date: MON, t: 100, s: 103, sub: 108, lv: '', d: 2, tr: 10000, sr: 15000, st: 'Completed', tc: 'KWD', sc: 'KWD', trx: 1, srx: 1, bc: 'KWD', bcost: 20000, bchg: 30000, rt: 'Manual', notes: '', tt: 150, od: MON, ...o }; }
check('G1', 'a Live occurrence cannot be marked done without a recorded lesson for every required student', () => { const { db } = mk(); const st = assemble(db); st.tt.find(e => e.id === 150).ex[MON] = { done: 1 }; refused(() => save(db, J(st)), 422, /marked done/);
  const a = J(st); a.l.push(lessonFor(a, {})); refused(() => save(db, a), 422, /student/); /* student 104 is also required */ });
check('G2', 'Cancelled / No Show lessons close a session but do not count as delivered; moved or reassigned lessons do not qualify', () => { const { db } = mk(); const T = require('../src/timetable'); const st = assemble(db); const e = st.tt.find(x => x.id === 150); e.ex[MON] = { done: 1 };
  st.l.push(lessonFor(st, { s: 103, st: 'No Show', bcost: 0, bchg: 0 }), lessonFor(st, { s: 104, st: 'Cancelled', bcost: 0, bchg: 0, sc: 'SAR', srx: 0.082 })); save(db, st); const s2 = assemble(db); const c = T.coverage(s2, s2.tt.find(x => x.id === 150), MON);
  assert.equal(c.delivered, false); assert.equal(c.closed, true); assert.equal(c.status, 'closed-not-delivered'); assert.equal(T.integrity(s2).doneNotDelivered.filter(x => x.date === MON).length, 1);
  const o = mk(); const x = assemble(o.db); x.tt.find(y => y.id === 150).ex[MON] = { done: 1 }; x.l.push(lessonFor(x, { s: 103, t: 101 }), lessonFor(x, { s: 104, date: '2026-08-25' })); refused(() => save(o.db, x), 422, /marked done/); });
check('G3', 'partial group completion: one student completed, the other not yet - no duplicate lesson, status partial', () => { const { db } = mk(); const T = require('../src/timetable'); const st = assemble(db); st.l.push(lessonFor(st, { s: 103 })); save(db, st); const s2 = assemble(db); const c = T.coverage(s2, s2.tt.find(x => x.id === 150), MON);
  assert.equal(c.status, 'partial'); assert.deepEqual(c.missing, [104]); assert.equal(c.delivered, false); const dup = J(s2); dup.tt.find(x => x.id === 150).ex[MON] = { done: 1 }; refused(() => save(db, dup), 422, /marked done/);
  const ok2 = J(s2); ok2.l.push(lessonFor(ok2, { s: 104, sc: 'SAR', srx: 0.082, bchg: 12300, sr: 41000 })); ok2.tt.find(x => x.id === 150).ex[MON] = { done: 1 }; save(db, ok2); const s3 = assemble(db); assert.equal(T.coverage(s3, s3.tt.find(x => x.id === 150), MON).status, 'delivered'); });
check('G4', 'an unrelated save does not rewrite untouched timetable rows; renaming a subject updates its text', () => { const { db } = mk(); db.exec("UPDATE timetable_entries SET sub='Old text kept', subj=108 WHERE id=150"); const row = () => JSON.stringify(db.prepare('SELECT * FROM timetable_entries ORDER BY id').all());
  const before = row(); const st = assemble(db); st.t[0].notes = 'unrelated'; save(db, st); assert.equal(row(), before); const a = assemble(db); a.sub.find(x => x.id === 108).name = 'DEV Math Renamed'; save(db, a); assert.equal(db.prepare('SELECT sub FROM timetable_entries WHERE id=150').get().sub, 'DEV Math Renamed'); });
check('G5', 'integrity report: done-without-lesson, unlinked lessons (proposal only when unambiguous), inconsistent links, duplicates', () => { const { db } = mk(); const T = require('../src/timetable'); const s0 = assemble(db); const st = J(s0);
  // independent expectation on the untouched fixture: occurrences marked done with no lesson linked at all
  const exp = []; st.tt.filter(e => e.wt === 'Live').forEach(e => { if (e.sched === 'rec') Object.keys(e.ex || {}).forEach(od => { if (e.ex[od].done && !st.l.some(l => l.tt === e.id && l.od === od)) exp.push(e.id + '@' + od); }); else if (e.done && !st.l.some(l => l.tt === e.id)) exp.push(e.id + '@' + e.date); });
  const r = T.integrity(st); assert.deepEqual(r.doneWithoutLesson.map(x => x.tt + '@' + x.od).sort(), exp.sort()); assert.ok(exp.length >= 1);
  // lessons 111 (Mon 2026-08-03, teacher 100, student 103) matches exactly one scheduled occurrence -> proposed, never applied
  const u = r.unlinkedLessons.find(x => x.lesson === 111); assert.ok(u && u.ambiguous === false && r.proposal.some(p => p.lesson === 111 && p.tt === 150 && p.od === '2026-08-03')); assert.ok(J(assemble(db)).l.find(l => l.id === 111).tt == null, 'nothing was linked');
  const bad = J(st); bad.l.find(l => l.id === 111).tt = 150; bad.l.find(l => l.id === 111).od = '2026-08-04'; assert.ok(T.integrity(bad).inconsistentLinks.some(x => x.lesson === 111));
  const dupe = J(st); const e2 = J(dupe.tt.find(e => e.id === 150)); e2.id = 99999; dupe.tt.push(e2); assert.deepEqual(T.integrity(dupe).duplicateLooking.map(x => x.tt), [[150, 99999]]); });

// ---------- H: rate freshness setting, Cairo dates ----------
check('H1', 'rate freshness hours: validated, applied to the displayed status; refresh failure keeps the last usable rate (no rewrite of snapshots)', () => { const { db } = mk(); const st = assemble(db); st.set.rfh = '0'; refused(() => save(db, J(st)), 422, /rfh/);
  const now = Date.parse('2026-11-01T12:00:00Z'), old = new Date(now - 40 * 36e5).toISOString(); const s = { set: { base: 'KWD', rfh: 36 }, cur: [{ c: 'EGP' }], rates: { EGP: { r: 0.0064, t: old, type: 'Live' } } };
  assert.equal(rates.report(s, now).EGP.state, 'stale'); s.set.rfh = 48; assert.equal(rates.report(s, now).EGP.state, 'current');
  const a = assemble(db); a.set.rfh = '48'; save(db, a); assert.equal(assemble(db).set.rfh, '48'); });
check('H2', 'Cairo business date: midnight and daylight-saving boundaries', () => { const cairo = require('../src/cairo'); assert.equal(cairo.today(new Date('2026-07-01T20:59:59Z')), '2026-07-01'); assert.equal(cairo.today(new Date('2026-07-01T21:00:00Z')), '2026-07-02');
  assert.equal(cairo.today(new Date('2026-11-01T21:59:59Z')), '2026-11-01'); assert.equal(cairo.today(new Date('2026-11-01T22:00:00Z')), '2026-11-02'); });
check('H3', 'free / waived lesson: zero charge needs the flag and a reason, with the flag it saves and is audited', () => { const { db } = mk(); const st = assemble(db); const l = lessonFor(st, { tt: undefined, od: undefined, date: '2026-10-05', bchg: 0, sr: 0 }); delete l.tt; delete l.od; const a = J(st); a.l.push(l); refused(() => save(db, a), 422, /free-session flag/);
  const b = J(st); b.l.push({ ...l, free: 1, freeReason: 'trial session offered by the owner' }); save(db, b); assert.equal(assemble(db).l.find(x => x.id === l.id).freeReason, 'trial session offered by the owner'); });

// ---------- I: backup / restore fidelity ----------
check('I1', 'backup and restore carry settlements table-by-table', () => { const { db, file, d, C, P } = Object.assign(teacherFixture(), {}); const f = db.prepare("PRAGMA database_list").all().find(x => x.name === 'main').file; const st = assemble(db); st.ts.push({ id: nid(st), tp: P, ok: 'course', oid: C, pcur: 'EGP', pamt: 1000000, scur: 'KWD', samt: 6500, rx: 0.0065, date: '2026-10-02', prov: 'new', reason: '' }); save(db, st);
  const bdir = path.join(path.dirname(f), 'bk'); const m = B.create({ db, file: f, backupDir: bdir }, 'st'); assert.ok(m.tables.teacher_settlements && m.tables.teacher_settlements.rows === 1);
  const st2 = assemble(db); st2.ts = []; save(db, st2, { confirm: [{ k: 'ts', id: st.ts[0].id, reason: 'restore test' }] }); assert.equal(cnt(db, 'teacher_settlements'), 0); const ctx = { db, file: f, backupDir: bdir }; const r = B.restore(ctx, m.name); assert.ok(r.restored); assert.equal(cnt(ctx.db, 'teacher_settlements'), 1); });

const fails = results.filter(r => r.result === 'FAIL');
if (REPORT) { console.log(JSON.stringify(results, null, 1)); process.exit(0); }
for (const r of results) console.log(r.result + '  ' + r.id + '  ' + r.title + (r.why ? '  -> ' + r.why : ''));
if (fails.length) { console.log('STABILIZATION TEST FAILED: ' + fails.length + ' of ' + results.length); process.exit(1); }
console.log('STABILIZATION TEST OK: ' + results.length + ' checks (teacher payment validation, excess confirmation, replay/stale, per-currency teacher ledger, cross-currency settlement conservation + immutability + audit, course counts, timetable completion/partial/integrity/no-unrelated-rewrite, rate freshness, Cairo boundaries, free/waived lesson, backup/restore of settlements).');
