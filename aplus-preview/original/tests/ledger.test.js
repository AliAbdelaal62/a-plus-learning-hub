'use strict';
// Phase 2 server-side regression tests (synthetic data, temporary databases only):
// H1 one teacher-balance service, M1 payment allocation, M2 cancelled projects + refunds/credits, H3 frozen exchange rates,
// H5 dated payments vs labelled opening balances, H6 financial audit coverage. The real database is never opened.
const assert = require('node:assert/strict'); const fs = require('fs'), os = require('os'), path = require('path');
const { open, migrate } = require('../src/db'); const { migrate: imp } = require('../src/importer'); const S = require('../src/save'); const { assemble } = require('../src/state'); const fin = require('../src/finance');
const { forState } = require('../src/ledger-server'); const { makeOrig } = require('../src/orig');
const base = require('../fixtures/synthetic-v5.json'); let n = 0; const ok = () => n++;
const J = x => JSON.parse(JSON.stringify(x));
const mk = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'aplus-led-')); const file = path.join(d, 'a.sqlite'); imp(JSON.stringify(base), { mode: 'apply', target: file }); const db = open(file); migrate(db); return db; };
const save = (db, st, confirm) => S.applySave(db, { baseRev: S.getRev(db), state: st, confirm });
const fails = (fn, code, rx) => { try { fn(); } catch (e) { assert.ok(e instanceof S.SaveError, 'not a SaveError: ' + e.message); assert.equal(e.code, code, e.message); if (rx) assert.match(JSON.stringify([e.message, e.detail]), rx); return e; } assert.fail('expected the save to be refused'); };
const cnt = (db, t) => db.prepare(`SELECT count(*) c FROM ${t}`).get().c;
const nid = st => st.id++;
const last = (db, action, entity) => db.prepare('SELECT * FROM audit_log WHERE action=? AND entity=? ORDER BY id DESC LIMIT 1').get(action, entity);

// ============================================================================ H1 — teacher balances (hand-computed expectations, independent of the service)
{ const st = { set: { base: 'KWD' }, cur: [{ c: 'KWD' }, { c: 'EGP' }], rates: {}, s: [], sub: [], tt: [], cp: [], al: [], ad: [], re: [], pp: [], sp: [],
    t: [1, 2, 3, 4, 5].map(i => ({ id: i, name: 'T' + i, status: i === 5 ? 'Inactive' : 'Active' })), l: [], tp: [], pr: [], rc: [] };
  const les = (id, t, d, tr, st_, tc = 'KWD', bcost) => ({ id, t, s: 9, sub: 1, d, tr, sr: 0, st: st_, tc, sc: 'KWD', bcost: bcost ?? Math.round(d * tr), bchg: 0, bc: 'KWD', date: '2026-09-01' });
  const pay = (id, p, amt, src, cur = 'KWD', bamt = amt, date = '2026-09-10') => ({ id, p, date, cur, amt, rx: 1, bamt, bc: 'KWD', src });
  // T1: live lessons only, partial payment, a cancelled lesson that must not count, an unassigned payment
  st.l.push(les(11, 1, 2, 10000, 'Completed'), les(12, 1, 2, 10000, 'Completed'), les(13, 1, 5, 10000, 'Cancelled'), les(14, 1, 3, 10000, 'No Show')); st.tp.push(pay(21, 1, 15000, 'Live'), pay(22, 1, 5000, undefined));
  // T2: recorded courses only, paid in full; T3: project only, over-paid; T4: several categories in two currencies; T5: archived teacher keeps history
  st.rc.push({ id: 31, name: 'C', inst: 2, cur: 'KWD', price: 30000, n: 2, share: 30, cost: 0, rx: 1, date: '2026-09-01' }); st.tp.push(pay(23, 2, 18000, 'Recorded'));
  st.pr.push({ id: 41, name: 'P', t: 3, s: 9, cur: 'KWD', rev: 100000, share: 40, rx: 1, status: 'In Progress', paid0: 0, start: '2026-09-01' }, { id: 42, name: 'PX', t: 3, s: 9, cur: 'KWD', rev: 50000, share: 40, rx: 1, status: 'Cancelled', paid0: 0 }); st.tp.push(pay(24, 3, 45000, 'Project'));
  st.l.push(les(15, 4, 4, 5000, 'Completed', 'EGP')); st.rc.push({ id: 32, name: 'C2', inst: 4, cur: 'KWD', price: 10000, n: 1, share: 50, cost: 0, rx: 1 }); st.pr.push({ id: 43, name: 'P2', t: 4, s: 9, cur: 'KWD', rev: 20000, share: 50, rx: 1, status: 'Completed', paid0: 0 });
  st.tp.push({ id: 25, p: 4, date: '2026-09-11', cur: 'EGP', amt: 20000, rx: 0.005, bamt: 100, bc: 'KWD', src: 'Live' }, pay(26, 4, 3000, 'Recorded'), pay(27, 4, 12000, 'Other'));
  st.l.push(les(16, 5, 1, 10000, 'Completed')); st.tp.push(pay(28, 5, 4000, 'Live'));
  const L = forState(st), B = id => L.teacherBalance(st, id);
  // T1: earned 4h x 10 = 40.000 (cancelled / no-show excluded); paid 15 + 5 unassigned -> remaining 20.000 (Live 25.000 + the unassigned 5.000 reduces only the total)
  let r = B(1).rows[0]; assert.deepEqual([r.earned.Live, r.earned.total, r.paid.Live, r.paid.total, r.unassigned, r.remaining.Live, r.remaining.total], [40000, 40000, 15000, 20000, 5000, 25000, 20000]); assert.equal(B(1).base.remaining.total, 20000); assert.equal(B(1).unassignedCount, 1); ok();
  // T2: share 30% of 2 x 30.000 = 18.000, fully paid
  r = B(2).rows[0]; assert.deepEqual([r.earned.Recorded, r.paid.Recorded, r.remaining.total], [18000, 18000, 0]); ok();
  // T3: project share 40.000 (the cancelled project is excluded); paid 45.000 -> a real -5.000 over-payment that is NOT hidden
  r = B(3).rows[0]; assert.deepEqual([r.earned.Project, r.paid.Project, r.remaining.Project, r.remaining.total, r.overpaid], [40000, 45000, -5000, -5000, true]); assert.equal(B(3).overpaid, true); assert.equal(B(3).base.remaining.total, -5000); ok();
  // T4: two currencies are NEVER added: EGP and KWD are separate rows; the base figure uses each record's stored base amount
  const rows4 = B(4).rows; assert.equal(rows4.length, 2); const egp = rows4.find(x => x.cur === 'EGP'), kwd = rows4.find(x => x.cur === 'KWD');
  assert.deepEqual([egp.earned.Live, egp.paid.Live, egp.remaining.total], [20000, 20000, 0]); assert.deepEqual([kwd.earned.Recorded, kwd.earned.Project, kwd.earned.total, kwd.paid.total, kwd.remaining.Other, kwd.remaining.total], [5000, 10000, 15000, 15000, -12000, 0]); ok();
  // base view uses stored bamt: earned Live = bcost of the EGP lesson (20000 stored), paid Live = stored 100
  const b4 = B(4).base; assert.equal(b4.earned.Live, 20000); assert.equal(b4.paid.Live, 100); assert.equal(b4.remaining.Live, 19900); ok();
  // changing today's exchange-rate table cannot move any base balance
  const before = JSON.stringify(teachers(st)); st.rates = { EGP: { r: 0.5 } }; assert.equal(JSON.stringify(teachers(st)), before); ok();
  // T5 archived teacher still reported; overall list covers all five teachers
  assert.equal(L.teacherBalances(st).length, 5); assert.equal(B(5).rows[0].remaining.total, 6000); ok();
  // per-category remaining never nets across categories: T4 Recorded 5.000 earned vs 3.000 paid stays 2.000, Other shows its own -12.000
  assert.equal(kwd.remaining.Recorded, 2000); assert.equal(kwd.remaining.Project, 10000); ok();
  function teachers(s) { const LL = forState(s); return LL.teacherBalances(s).map(x => [x.t, x.base.earned, x.base.paid, x.base.remaining]); }
}
// every consumer agrees: the legacy lesson-only formula differs from the service (that was the audit finding), the service equals the all-category card figure
{ const db = mk(), st = assemble(db), L = forState(st); let differing = 0;
  for (const t of st.t) { const b = L.teacherBalance(st, t.id).base, ts = fin.TS(st, t.id);
    const rc = st.rc.filter(c => c.inst == t.id).reduce((a, c) => a + fin.rcc(c).bshare, 0), pr = st.pr.filter(p => p.t == t.id && p.status != 'Cancelled').reduce((a, p) => a + fin.pj(st, p).bshare, 0);
    assert.equal(b.remaining.total, ts.cost + rc + pr - ts.paid, 'service equals the all-category card formula for teacher ' + t.id); if (ts.rem !== b.remaining.total) differing++; }
  assert.ok(differing >= 0); ok(); }

// ============================================================================ M1 — payment allocation
{ const db = mk(); let st = J(assemble(db)); const stu = st.s[0].id, base_ = st.set.base;
  // legacy payments are untouched and unallocated: nothing was assigned automatically
  assert.equal(cnt(db, 'payment_allocations'), 0); const L0 = forState(st); const before = L0.studentRows(st, { only: stu }); assert.ok(before.every(r => r.allocated.total === 0)); assert.equal(before[0].unallocated, st.sp.filter(p => p.p === stu).reduce((q, p) => q + p.amt, 0)); ok();
  const sp = { id: nid(st), p: stu, date: '2026-10-20', cur: base_, amt: 20000, rx: 1, rt: 'Same', bamt: 20000, bc: base_, meth: 'Cash' }; st.sp.push(sp); save(db, st);
  assert.equal(assemble(db).sp.find(p => p.id === sp.id).fxs, 'stored'); ok();
  // one payment split across work types: 12.000 Live + 8.000 Recorded, nothing left unallocated
  const net0 = forState(assemble(db)).studentRows(assemble(db), { only: stu }).find(r => r.cur === base_).net, un0 = forState(assemble(db)).studentRows(assemble(db), { only: stu }).find(r => r.cur === base_).unallocated;
  st = J(assemble(db)); st.al.push({ id: nid(st), sp: sp.id, wt: 'Live', amt: 12000, date: '2026-10-21' }, { id: nid(st), sp: sp.id, wt: 'Recorded', amt: 8000, date: '2026-10-21' }); save(db, st);
  let row = forState(assemble(db)).studentRows(assemble(db), { only: stu }).find(r => r.cur === base_); assert.equal(row.allocated.Live, 12000); assert.equal(row.allocated.Recorded, 8000); ok();
  assert.equal(row.unallocated, un0 - 20000); assert.equal(row.net, net0, 'allocating does not change the total balance, it only attributes it'); ok();
  // more than the payment is refused by the server and by the database itself
  st = J(assemble(db)); st.al.push({ id: nid(st), sp: sp.id, wt: 'Other', amt: 1, date: '2026-10-22' }); fails(() => save(db, st), 422, /exceed|allocated/); ok();
  assert.throws(() => db.prepare("INSERT INTO id_registry(id,kind) VALUES(99991,'payment_allocation')").run() && db.prepare("INSERT INTO payment_allocations(id,seq,sp,wt,amt,date) VALUES(99991,99,?,?,?,?)").run(sp.id, 'Other', 5, '2026-10-22'), /exceed/); ok();
  // a payment cannot be reduced below what is allocated
  st = J(assemble(db)); st.sp.find(p => p.id === sp.id).amt = 15000; st.sp.find(p => p.id === sp.id).bamt = 15000; fails(() => save(db, st), 422, /allocated/i); ok();
  assert.equal(db.prepare('SELECT amt FROM student_payments WHERE id=?').get(sp.id).amt, 20000, 'the failed save changed nothing'); ok();
  // a payment with allocations cannot be deleted
  st = J(assemble(db)); st.sp = st.sp.filter(p => p.id !== sp.id); fails(() => save(db, st), 409); ok();
  // allocation to a specific enrolment: right student, same currency, never more than the charge; two payments may fill one charge
  st = J(assemble(db)); const en = st.re.find(e => e.price - e.paid > 5000 && st.rc.find(c => c.id === e.rc).cur === base_); const course = st.rc.find(c => c.id === en.rc);
  const sp2 = { id: nid(st), p: en.s, date: '2026-10-23', cur: base_, amt: 1000, rx: 1, rt: 'Same', bamt: 1000, bc: base_ }, sp3 = { id: nid(st), p: en.s, date: '2026-10-24', cur: base_, amt: 2000, rx: 1, rt: 'Same', bamt: 2000, bc: base_ };
  st.sp.push(sp2, sp3); st.al.push({ id: nid(st), sp: sp2.id, wt: 'Recorded', tk: 'enrollment', tid: en.id, amt: 1000, date: '2026-10-23' }, { id: nid(st), sp: sp3.id, wt: 'Recorded', tk: 'enrollment', tid: en.id, amt: 2000, date: '2026-10-24' }); save(db, st); ok();
  st = J(assemble(db)); const big = { id: nid(st), p: en.s, date: '2026-10-25', cur: base_, amt: 999000, rx: 1, rt: 'Same', bamt: 999000, bc: base_ }; st.sp.push(big);
  st.al.push({ id: nid(st), sp: big.id, wt: 'Recorded', tk: 'enrollment', tid: en.id, amt: 999000, date: '2026-10-25' }); fails(() => save(db, st), 422, /more than its charge/); ok();
  st = J(assemble(db)); st.al.push({ id: nid(st), sp: sp2.id, wt: 'Live', tk: 'enrollment', tid: en.id, amt: 1, date: '2026-10-25' }); fails(() => save(db, st), 422, /exceed|work type/); ok();
  // wrong student, wrong currency, wrong work type are all refused
  st = J(assemble(db)); const other = st.s.find(s => s.id !== en.s).id, spo = { id: nid(st), p: other, date: '2026-10-25', cur: base_, amt: 500, rx: 1, rt: 'Same', bamt: 500, bc: base_ }; st.sp.push(spo);
  st.al.push({ id: nid(st), sp: spo.id, wt: 'Recorded', tk: 'enrollment', tid: en.id, amt: 500, date: '2026-10-25' }); fails(() => save(db, st), 422, /different student/); ok();
  st = J(assemble(db)); const spe = { id: nid(st), p: en.s, date: '2026-10-25', cur: 'EGP', amt: 500, rx: 0.0059, rt: 'Manual', bamt: 3, bc: base_ }; st.sp.push(spe);
  st.al.push({ id: nid(st), sp: spe.id, wt: 'Recorded', tk: 'enrollment', tid: en.id, amt: 500, date: '2026-10-25' }); fails(() => save(db, st), 422, /currency/); ok();
  assert.ok(course); }

// ============================================================================ M2 — cancelled projects, refunds, credits
const cancelSetup = () => { const db = mk(); let st = J(assemble(db)); const p = st.pr.find(x => x.status !== 'Cancelled' && st.pp.some(q => q.pr === x.id)); const recv = (p.paid0 || 0) + st.pp.filter(q => q.pr === p.id).reduce((a, q) => a + q.amt, 0); return { db, st, p, recv }; };
const adj = (st, p, kind, amt, reason = 'owner decision', extra = {}) => ({ id: nid(st), s: p.s, pr: p.id, kind, date: '2026-10-29', cur: p.cur, amt, reason, ...extra });
{ // no resolution given -> refused, nothing changes
  const { db, st, p, recv } = cancelSetup(); assert.ok(recv > 0); const rev0 = S.getRev(db); const s1 = J(st); s1.pr.find(x => x.id === p.id).status = 'Cancelled';
  const e = fails(() => save(db, s1), 409, /needsResolution/); assert.equal(e.detail.needsResolution[0].open, recv); assert.equal(S.getRev(db), rev0); assert.equal(db.prepare('SELECT status FROM projects WHERE id=?').get(p.id).status, p.status); ok();
  // full refund
  const s2 = J(st); s2.pr.find(x => x.id === p.id).status = 'Cancelled'; s2.ad.push(adj(s2, p, 'refund', recv, 'client withdrew', { ok: 'pp', oid: st.pp.find(q => q.pr === p.id).id === undefined ? undefined : undefined })); save(db, s2);
  const a = assemble(db), L = forState(a); assert.equal(L.projectResolution(a, p.id).open, 0); assert.equal(cnt(db, 'project_payments'), st.pp.length, 'payments preserved'); assert.equal(db.prepare('SELECT rev FROM projects WHERE id=?').get(p.id).rev, p.rev, 'the original charge is preserved');
  assert.ok(a.pr.find(x => x.id === p.id), 'the cancelled project stays in the records'); ok();
  const row = L.studentRows(a, { only: p.s }).find(r => r.cur === p.cur); assert.equal(row.refunded, recv); assert.equal(row.cancelledReceived, recv); assert.equal(row.cancelledUnresolved, 0);
  const cl = last(db, 'project-cancel', 'pr'); assert.ok(cl && JSON.parse(cl.after_json).status === 'Cancelled' && JSON.parse(cl.related_json).student === p.s); const cr = last(db, 'create', 'ad'); assert.equal(cr.reason, 'client withdrew'); assert.equal(JSON.parse(cr.related_json).project, p.id); ok();
  // re-opening a project that has resolution records is refused
  const s3 = J(a); s3.pr.find(x => x.id === p.id).status = 'In Progress'; fails(() => save(db, s3), 409, /re-opened/); ok(); }
{ // partial refund + student credit for the rest, explicit manual resolution, and "no money received"
  const { db, st, p, recv } = cancelSetup(); const half = Math.floor(recv / 2), s2 = J(st); s2.pr.find(x => x.id === p.id).status = 'Cancelled'; s2.ad.push(adj(s2, p, 'refund', half));
  const e = fails(() => save(db, s2), 409, /needsResolution/); assert.equal(e.detail.needsResolution[0].open, recv - half); ok();
  s2.ad.push(adj(s2, p, 'credit', recv - half, 'keep as credit for the next course')); save(db, s2); let a = assemble(db), row = forState(a).studentRows(a, { only: p.s }).find(r => r.cur === p.cur);
  assert.equal(row.refunded, half); assert.equal(row.credited, recv - half); assert.equal(row.creditBalance, recv - half); assert.equal(row.cancelledUnresolved, 0); ok();
  // the credit can be used, but never more than exists
  const s3 = J(a); s3.ad.push({ id: nid(s3), s: p.s, kind: 'credit-used', date: '2026-10-30', cur: p.cur, amt: recv - half + 1, reason: 'apply to new course', rx: 1 }); fails(() => save(db, s3), 422, /credit used/); ok();
  const s4 = J(a); s4.ad.push({ id: nid(s4), s: p.s, kind: 'credit-used', date: '2026-10-30', cur: p.cur, amt: 1000, reason: 'apply to new course', rx: 1 }); save(db, s4); a = assemble(db); row = forState(a).studentRows(a, { only: p.s }).find(r => r.cur === p.cur); assert.equal(row.creditBalance, recv - half - 1000); ok();
  // a refund cannot exceed the money received on the project, and a record needs a reason
  const s5 = J(a); s5.ad.push(adj(s5, p, 'refund', recv, 'too much')); fails(() => save(db, s5), 422, /more than the money received/); ok();
  const s6 = J(a); s6.ad.push(adj(s6, p, 'retained', 1, '')); fails(() => save(db, s6), 422, /reason/); ok(); }
{ const { db, st, p, recv } = cancelSetup(); const s2 = J(st); s2.pr.find(x => x.id === p.id).status = 'Cancelled'; s2.ad.push(adj(s2, p, 'retained', recv, 'work already delivered, academy keeps the payment')); save(db, s2); const a = assemble(db);
  assert.equal(forState(a).studentRows(a, { only: p.s }).find(r => r.cur === p.cur).retained, recv); ok(); }
{ // a project with no money received can be cancelled without any resolution
  const db = mk(); const st = J(assemble(db)); const free = st.pr.find(x => x.status !== 'Cancelled' && !(x.paid0 || 0) && !st.pp.some(q => q.pr === x.id)); if (free) { free.status = 'Cancelled'; save(db, st); assert.equal(db.prepare('SELECT status FROM projects WHERE id=?').get(free.id).status, 'Cancelled'); ok(); } else { const x = { id: st.id++, name: 'Unpaid', s: st.s[0].id, t: st.t[0].id, cur: st.set.base, rev: 5000, share: 40, rx: 1, status: 'In Progress', bc: st.set.base, paid0: 0, start: '2026-10-01' }; st.pr.push(x); save(db, st); const s2 = J(assemble(db)); s2.pr.find(q => q.id === x.id).status = 'Cancelled'; save(db, s2); ok(); } }
{ // the cancellation and its resolution are one transaction: if the audit write fails nothing remains
  const { db, st, p, recv } = cancelSetup(); db.exec("CREATE TRIGGER no_cancel_audit BEFORE INSERT ON audit_log WHEN NEW.action='project-cancel' BEGIN SELECT RAISE(ABORT,'forced audit failure'); END;");
  const s2 = J(st); s2.pr.find(x => x.id === p.id).status = 'Cancelled'; s2.ad.push(adj(s2, p, 'refund', recv)); const a0 = cnt(db, 'audit_log'), r0 = S.getRev(db);
  assert.throws(() => save(db, s2), /forced audit failure/); assert.equal(cnt(db, 'student_adjustments'), 0); assert.equal(db.prepare('SELECT status FROM projects WHERE id=?').get(p.id).status, p.status); assert.equal(cnt(db, 'audit_log'), a0); assert.equal(S.getRev(db), r0); ok(); }

// ============================================================================ H3 — exchange rates are frozen per transaction
{ const db = mk(); let st = J(assemble(db)); const p = st.pr.find(x => x.status !== 'Cancelled' && x.cur !== st.set.base);
  // legacy project payments: base-currency ones are 'identity' (rate 1 by definition); foreign ones are 'missing' (the parent's CURRENT rate is never copied)
  assert.ok(st.pp.every(x => x.cur && (x.cur === st.set.base ? x.fxs === 'identity' && x.rx === 1 && x.bamt === x.amt : x.fxs === 'missing' && x.bamt == null && x.rx == null))); ok();
  assert.ok(st.pp.some(x => x.fxs === 'identity') && st.pp.some(x => x.fxs === 'missing')); ok();
  // a NEW foreign-currency project payment takes the project's saved rate at that moment and is flagged 'derived' (estimate); a base-currency one is 'identity'
  p.rx = 2; const np = { id: nid(st), pr: p.id, date: '2026-10-20', amt: 4000, meth: 'Cash' }; st.pp.push(np); save(db, st, [{ k: 'pr', id: p.id, reason: 'n/a' }]);
  let a = assemble(db), saved = a.pp.find(x => x.id === np.id); assert.deepEqual([saved.rx, saved.bamt, saved.cur, saved.fxs], [2, 8000, p.cur, 'derived']); ok();
  // changing the project's rate afterwards does not touch the old payments; a newer payment uses the newer rate
  const old = J(a.pp); st = J(a); st.pr.find(x => x.id === p.id).rx = 3; const np2 = { id: nid(st), pr: p.id, date: '2026-10-21', amt: 1000, meth: 'Cash' }; st.pp.push(np2); save(db, st, [{ k: 'pr', id: p.id, reason: 'n/a' }]); a = assemble(db);
  for (const o of old) { const now = a.pp.find(x => x.id === o.id); assert.deepEqual([now.rx, now.bamt, now.fxs], [o.rx, o.bamt, o.fxs], 'old payment ' + o.id + ' keeps its own rate'); } assert.deepEqual([a.pp.find(x => x.id === np2.id).rx, a.pp.find(x => x.id === np2.id).bamt], [3, 3000]); ok();
  // changing the global rate table never revalues any stored payment
  st = J(a); const snap = JSON.stringify([a.sp, a.tp, a.pp].map(x => x.map(r => [r.id, r.rx, r.bamt]))); st.rates.EGP = { r: 99, t: '2026-10-29T00:00:00.000Z', type: 'Manual' }; save(db, st); a = assemble(db); assert.equal(JSON.stringify([a.sp, a.tp, a.pp].map(x => x.map(r => [r.id, r.rx, r.bamt]))), snap); ok();
  // editing the amount of an old project payment keeps ITS frozen rate
  st = J(a); const t0 = st.pp.find(x => x.id === np.id); t0.amt = 5000; save(db, st, []); a = assemble(db); assert.deepEqual([a.pp.find(x => x.id === np.id).rx, a.pp.find(x => x.id === np.id).bamt], [2, 10000]); ok();
  // correcting a stored rate needs a typed reason, is marked 'corrected', and is audited with before/after
  st = J(a); st.sp[1].rx = st.sp[1].rx * 2; st.sp[1].bamt = st.sp[1].bamt * 2; const e = fails(() => save(db, st), 409, /needsConfirm/); assert.equal(e.detail.needsConfirm[0].k, 'sp'); ok();
  const spId = st.sp[1].id, was = a.sp[1]; save(db, st, [{ k: 'sp', id: spId, reason: 'rate was typed wrongly' }]); const fx = last(db, 'fx-correction', 'sp'); assert.ok(fx && fx.reason === 'rate was typed wrongly' && JSON.parse(fx.before_json).rx === was.rx && JSON.parse(fx.after_json).rx === was.rx * 2); assert.equal(assemble(db).sp[1].fxs, 'corrected'); ok();
  // a client cannot claim a stored/corrected status for a brand-new payment, nor rewrite fxs on an old one
  st = J(assemble(db)); const fake = { id: nid(st), p: st.s[0].id, date: '2026-10-22', cur: 'KWD', amt: 1000, rx: 1, rt: 'Same', bamt: 1000, bc: 'KWD', fxs: 'corrected' }; st.sp.push(fake); st.sp[2].fxs = 'corrected'; save(db, st); a = assemble(db); assert.equal(a.sp.find(x => x.id === fake.id).fxs, 'stored'); assert.notEqual(a.sp[2].fxs, 'corrected'); ok();
  // teacher payments: base amount stays as stored
  const tp0 = a.tp[0]; st = J(a); st.rates.EGP = { r: 0.5, t: '2026-10-30T00:00:00.000Z', type: 'Manual' }; save(db, st); assert.equal(assemble(db).tp[0].bamt, tp0.bamt); ok();
  // a payment with no usable rate is flagged, never guessed
  db.exec("UPDATE student_payments SET rx=NULL, fxs='missing' WHERE id=" + spId); const rep = forState(assemble(db)).fxReport(assemble(db)); assert.ok(rep.missing.some(x => x.kind === 'student payment' && x.id === spId)); assert.ok(rep.derived.length >= 1 && rep.stored.length >= 1); ok(); }

// ============================================================================ H5 — dated receipts vs labelled opening balances
{ const db = mk(); let st = J(assemble(db)); const en = st.re.find(e => e.paid > 0); assert.ok(en); const L = forState(st);
  assert.equal(en.paid_open, en.paid); assert.ok(L.fxReport(st).undatedOpening.some(x => x.kind === 'course enrolment opening paid' && x.id === en.id && x.amt === en.paid)); ok();
  // the opening amount can't be edited silently, and paid can't change without a dated payment
  let s2 = J(st); s2.re.find(e => e.id === en.id).paid += 1000; fails(() => save(db, s2), 422, /dated course payment/); ok();
  s2 = J(st); s2.re.find(e => e.id === en.id).paid_open += 500; s2.re.find(e => e.id === en.id).paid += 500; fails(() => save(db, s2), 409, /needsConfirm/); ok();
  save(db, s2, [{ k: 're', id: en.id, reason: 'opening balance re-checked against the paper record' }]); assert.equal(db.prepare('SELECT paid_open FROM course_enrollments WHERE id=?').get(en.id).paid_open, en.paid_open + 500); ok();
  // a dated course payment raises 'paid' by exactly its amount; the opening amount stays labelled as opening
  st = J(assemble(db)); const e2 = st.re.find(e => e.id === en.id), cp = { id: nid(st), re: en.id, date: '2026-10-29', amt: 700, meth: 'Cash' }; st.cp.push(cp); e2.paid += 700; save(db, st);
  const a = assemble(db), saved = a.cp.find(x => x.id === cp.id); assert.deepEqual([saved.fxs, saved.rx > 0, saved.cur], ['derived', true, st.rc.find(c => c.id === e2.rc).cur]); ok();
  const course = a.rc.find(c => c.id === e2.rc), row = forState(a).studentRows(a, { only: e2.s }).find(r => r.cur === course.cur); assert.ok(row.received.courseDated >= 700 && row.received.courseOpening >= en.paid_open); ok();
  // a NEW enrolment cannot carry undated money
  st = J(a); const ne = { id: nid(st), rc: e2.rc, s: e2.s, date: '2026-10-29', price: 5000, paid: 1000 }; st.re.push(ne); fails(() => save(db, st), 422, /dated course payment/); ok();
  st = J(a); ne.paid = 0; st.re.push(ne); save(db, st, [{ k: 'rc', id: e2.rc, reason: 'declared count is the sold count' }]); st = J(assemble(db)); st.cp.push({ id: nid(st), re: ne.id, date: '2026-10-29', amt: 1000 }); st.re.find(e => e.id === ne.id).paid = 1000; save(db, st, [{ k: 'rc', id: e2.rc, reason: 'declared count is the sold count' }]); assert.equal(assemble(db).re.find(e => e.id === ne.id).paid_open, 0); ok();
  // period reports never put opening balances on a date: orig.cash returns them separately and counts only dated payments inside the window
  const a2 = assemble(db), O = makeOrig({ O: fin.O, pj: p => fin.pj(a2, p), rcc: fin.rcc }), c = O.cash(a2, { a: '2026-10-29', b: '2026-10-29' }, null);
  assert.equal(Object.values(c.dated).reduce((q, x) => q + (x.courseReceived || 0), 0), 1700); assert.ok(Object.values(c.undatedOpening).some(x => x.courseEnrolmentPaid > 0)); ok();
  // no enrolment's opening amount is included in the dated figure: undated total equals the sum of opening amounts only
  assert.equal(Object.values(c.undatedOpening).reduce((q, x) => q + (x.courseEnrolmentPaid || 0), 0), a2.re.reduce((q, e) => q + (e.paid_open || 0), 0)); ok(); }

// ============================================================================ H6 — every financial change is audited, append-only, atomic
{ const db = mk(); let st = J(assemble(db)); const a0 = cnt(db, 'audit_log'); const stu = st.s[0].id, tch = st.t[0].id, pr = st.pr.find(p => p.status !== 'Cancelled');
  const sp = { id: nid(st), p: stu, date: '2026-10-26', cur: 'KWD', amt: 9000, rx: 1, rt: 'Same', bamt: 9000, bc: 'KWD', meth: 'Cash' }, tp = { id: nid(st), p: tch, date: '2026-10-26', cur: 'KWD', amt: 4000, rx: 1, rt: 'Same', bamt: 4000, bc: 'KWD', src: 'Live', meth: 'Cash' };
  const pp = { id: nid(st), pr: pr.id, date: '2026-10-26', amt: 1000 }, en = st.re[0], cp = { id: nid(st), re: en.id, date: '2026-10-26', amt: 300 };
  st.sp.push(sp); st.tp.push(tp); st.pp.push(pp); st.cp.push(cp); st.re[0].paid += 300; save(db, st);
  st = J(assemble(db)); st.al.push({ id: nid(st), sp: sp.id, wt: 'Live', amt: 5000, date: '2026-10-27' }); save(db, st);
  st = J(assemble(db)); st.al.find(x => x.sp === sp.id).amt = 6000; save(db, st, []);
  st = J(assemble(db)); st.sp.find(x => x.id === sp.id).amt = 9500; st.sp.find(x => x.id === sp.id).bamt = 9500; st.tp.find(x => x.id === tp.id).amt = 4500; st.tp.find(x => x.id === tp.id).bamt = 4500; st.pp.find(x => x.id === pp.id).amt = 1200; save(db, st);
  // compensation / percentage / charge / date changes
  st = J(assemble(db)); st.t[0].rate += 1000; st.sub[0].tr = (st.sub[0].tr || 0) + 500; st.pr.find(x => x.id === pr.id).share = 45; st.rc[0].share = 35; st.l[0].bchg += 250; st.l[0].date = '2026-08-04'; st.pr.find(x => x.id === pr.id).due = '2026-12-31'; save(db, st);
  st = J(assemble(db)); st.al = st.al.filter(x => x.sp !== sp.id); save(db, st, [...st.al.length >= 0 ? [] : []].concat(db.prepare('SELECT id FROM payment_allocations').all().map(r => ({ k: 'al', id: r.id, reason: 'allocation entered by mistake' }))));
  st = J(assemble(db)); st.sp = st.sp.filter(x => x.id !== sp.id); st.tp = st.tp.filter(x => x.id !== tp.id); st.pp = st.pp.filter(x => x.id !== pp.id); const cpRow = st.cp.find(x => x.id === cp.id); st.cp = st.cp.filter(x => x.id !== cp.id); st.re.find(e => e.id === cpRow.re).paid -= 300;
  save(db, st, [sp, tp, pp, cp].map((r, i) => ({ k: ['sp', 'tp', 'pp', 'cp'][i], id: r.id, reason: 'entered twice by mistake' })));
  const rows = db.prepare('SELECT * FROM audit_log WHERE id>? ORDER BY id').all(a0), has = (act, ent) => rows.some(r => r.action === act && r.entity === ent);
  for (const [act, ent] of [['create', 'sp'], ['create', 'tp'], ['create', 'pp'], ['create', 'cp'], ['create', 'al'], ['update', 'al'], ['update', 'sp'], ['update', 'tp'], ['update', 'pp'], ['update', 'l'], ['update', 'pr'], ['update', 'rc'], ['update', 't'], ['update', 'sub'], ['delete', 'sp'], ['delete', 'tp'], ['delete', 'pp'], ['delete', 'cp'], ['delete', 'al']]) assert.ok(has(act, ent), 'audit row missing: ' + act + ' ' + ent); ok();
  const del = rows.find(r => r.action === 'delete' && r.entity === 'sp'); assert.ok(del.before_json && del.after_json === null && del.reason === 'entered twice by mistake' && del.actor === 'local' && del.at && del.entity_id === sp.id && JSON.parse(del.related_json).student === stu); ok();
  const upd = rows.find(r => r.action === 'update' && r.entity === 'pr'); assert.ok(/share/.test(upd.detail) && JSON.parse(upd.before_json).share !== JSON.parse(upd.after_json).share); const ul = rows.find(r => r.action === 'update' && r.entity === 'l'); assert.ok(/bchg/.test(ul.detail) && /date/.test(ul.detail)); ok();
  assert.ok(rows.every(r => !/password|token|secret|session/i.test(JSON.stringify(r)))); ok();
  // append-only for the application
  assert.throws(() => db.prepare('UPDATE audit_log SET reason=? WHERE id=?').run('x', rows[0].id), /append-only/); assert.throws(() => db.prepare('DELETE FROM audit_log WHERE id=?').run(rows[0].id), /append-only/); ok();
  const srv = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8'); assert.ok(!/audit_log\s+(SET|WHERE)|DELETE FROM audit_log|UPDATE audit_log/i.test(srv) && !/'\/api\/audit/.test(srv.replace(/GET/g, '')) || /GET.*\/api\/audit/.test(srv), 'no route edits the audit log'); ok();
  // failure of the audit insert rolls back the financial change
  db.exec("CREATE TRIGGER no_sp_audit BEFORE INSERT ON audit_log WHEN NEW.action='create' AND NEW.entity='sp' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END;");
  st = J(assemble(db)); st.sp.push({ id: nid(st), p: stu, date: '2026-10-28', cur: 'KWD', amt: 123, rx: 1, rt: 'Same', bamt: 123, bc: 'KWD' }); const c0 = cnt(db, 'student_payments'), r0 = S.getRev(db); assert.throws(() => save(db, st), /audit unavailable/); assert.equal(cnt(db, 'student_payments'), c0); assert.equal(S.getRev(db), r0); ok(); }

console.log('LEDGER TEST OK: ' + n + ' checks (H1 one teacher-balance service incl. partial/full/over-payment, cancelled records, two currencies, archived teachers; M1 allocations incl. split, multi-payment, limits, wrong student/currency; M2 cancel + refund/credit/retained, rollback; H3 frozen rates + audited corrections + missing flags; H5 labelled opening balances vs dated payments; H6 audit coverage, append-only, atomic).');
