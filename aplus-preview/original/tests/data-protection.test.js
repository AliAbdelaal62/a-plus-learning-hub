'use strict';
// C3 / H4 / H6 / M6 server-side regression tests (synthetic data, temp databases): protected deletion of every kind of record, typed reasons for
// removing financial leaf records, base-currency lock, positive-value validation with auditable free flag, audit coverage and rollback together with the change.
const assert = require('node:assert/strict'); const fs = require('fs'), os = require('os'), path = require('path');
const { open, migrate } = require('../src/db'); const { migrate: imp } = require('../src/importer'); const S = require('../src/save'); const { assemble } = require('../src/state'); const fin = require('../src/finance');
const base = require('../fixtures/synthetic-v5.json'); let n = 0; const ok = () => n++;
const J = x => JSON.parse(JSON.stringify(x));
const mk = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'aplus-dp-')); const file = path.join(d, 'a.sqlite'); imp(JSON.stringify(base), { mode: 'apply', target: file }); const db = open(file); migrate(db); return db; };
const save = (db, st, confirm) => S.applySave(db, { baseRev: S.getRev(db), state: st, confirm });
const fails = (fn, code, rx) => { try { fn(); } catch (e) { assert.ok(e instanceof S.SaveError, 'not a SaveError: ' + e.message); assert.equal(e.code, code, e.message); if (rx) assert.match(JSON.stringify([e.message, e.detail]), rx); return e; } assert.fail('expected failure ' + code); };
const cnt = (db, t) => db.prepare(`SELECT count(*) c FROM ${t}`).get().c;

// ---- C3: absolute protection (parents with history) at the server, for every kind
{ const db = mk(); const st = assemble(db);
  const tWith = st.t.find(t => st.l.some(l => l.t === t.id)); const sWith = st.s.find(s => st.l.some(l => l.s === s.id));
  let s2 = J(st); s2.t = s2.t.filter(t => t.id !== tWith.id); fails(() => save(db, s2), 409, /history/); ok();
  s2 = J(st); s2.s = s2.s.filter(s => s.id !== sWith.id); fails(() => save(db, s2), 409, /history/); ok();
  // cascade attempts (removing the parent AND its children in one request) are refused as well
  s2 = J(st); s2.t = s2.t.filter(t => t.id !== tWith.id); s2.l = s2.l.filter(l => l.t !== tWith.id); s2.tp = s2.tp.filter(p => p.p !== tWith.id); const e = fails(() => save(db, s2), 409); ok();
  if (st.pr.length) { const p = st.pr.find(p => st.pp.some(x => x.pr === p.id)) || st.pr[0]; s2 = J(st); s2.pr = s2.pr.filter(x => x.id !== p.id); s2.pp = s2.pp.filter(x => x.pr !== p.id); fails(() => save(db, s2), 409); ok(); }
  if (st.rc.length) { const c = st.rc.find(c => st.re.some(e => e.rc === c.id)) || st.rc[0]; s2 = J(st); s2.rc = s2.rc.filter(x => x.id !== c.id); s2.re = s2.re.filter(x => x.rc !== c.id); if (st.re.some(e => e.rc === c.id)) { fails(() => save(db, s2), 409); ok(); } }
  // subjects used by lessons
  const sub = st.sub.find(x => st.l.some(l => l.sub === x.id)); s2 = J(st); s2.sub = s2.sub.filter(x => x.id !== sub.id); fails(() => save(db, s2), 409); ok();
  // nothing changed in the database after all those refusals
  assert.equal(cnt(db, 'lessons'), st.l.length); assert.equal(cnt(db, 'teachers'), st.t.length); assert.equal(JSON.stringify(fin.fin(assemble(db))), JSON.stringify(fin.fin(st))); ok();
  // the refusals are visible in the audit log
  assert.ok(db.prepare("SELECT count(*) c FROM audit_log WHERE action='refused'").get().c >= 3); ok();
  // opening-balance protection: an enrolment with money received and a project with an opening paid amount cannot be removed
  const re = st.re.find(e => e.paid > 0); if (re) { s2 = J(st); s2.re = s2.re.filter(e => e.id !== re.id); fails(() => save(db, s2), 409, /money received/); ok(); }
  const withOpening = J(st); const pr0 = withOpening.pr[0]; if (pr0) { pr0.paid0 = 5000; fails(() => save(db, withOpening), 409, /needs a reason/); save(db, withOpening, [{ k: 'pr', id: pr0.id, reason: 'test: opening balance entered' }]); const s3 = J(assemble(db)); s3.pr = s3.pr.filter(x => x.id !== pr0.id); s3.pp = s3.pp.filter(x => x.pr !== pr0.id); fails(() => save(db, s3), 409); ok(); } }

// ---- leaf financial records: removal needs a typed reason, which is audited; without it nothing is removed
{ const db = mk(); const st = assemble(db); const pay = st.sp[0], tpay = st.tp[0]; const before = cnt(db, 'student_payments');
  let s2 = J(st); s2.sp = s2.sp.filter(p => p.id !== pay.id);
  let e = fails(() => save(db, s2), 409, /needs a reason/); assert.ok(e.detail.needsConfirm.some(x => x.k === 'sp' && x.id === pay.id)); assert.equal(cnt(db, 'student_payments'), before); ok();
  fails(() => save(db, s2, [{ k: 'sp', id: pay.id, reason: 'x' }]), 409, /needs a reason/); ok(); // too short
  fails(() => save(db, s2, [{ k: 'sp', id: 999999, reason: 'wrong record' }]), 409, /needs a reason/); ok();
  save(db, s2, [{ k: 'sp', id: pay.id, reason: 'entered twice by mistake' }]); assert.equal(cnt(db, 'student_payments'), before - 1); ok();
  const a = db.prepare("SELECT * FROM audit_log WHERE action='delete' AND entity='sp' AND entity_id=?").get(pay.id); assert.ok(a && /entered twice/.test(a.detail)); assert.equal(JSON.parse(a.before_json).amt, pay.amt); ok();
  s2 = J(assemble(db)); s2.tp = s2.tp.filter(p => p.id !== tpay.id); fails(() => save(db, s2), 409, /needs a reason/); save(db, s2, [{ k: 'tp', id: tpay.id, reason: 'duplicate' }]); ok();
  // a completed lesson with value needs a reason; an unrelated delete in the same request does not hide it
  const cl = st.l.find(l => l.st === 'Completed' && l.bchg > 0); s2 = J(assemble(db)); s2.l = s2.l.filter(l => l.id !== cl.id); fails(() => save(db, s2), 409, /needs a reason/); save(db, s2, [{ k: 'l', id: cl.id, reason: 'logged against the wrong student' }]); ok();
  // reasons are required even when a record is removed together with other changes (no piggy-backing)
  const sp2 = assemble(db).sp[0]; s2 = J(assemble(db)); s2.sp = s2.sp.filter(p => p.id !== sp2.id); s2.set.name = 'Other change'; fails(() => save(db, s2), 409, /needs a reason/); assert.notEqual(assemble(db).set.name, 'Other change'); ok(); }

// ---- H4: base currency lock (server side)
{ const db = mk(); const st = assemble(db); const other = st.cur.find(c => c.c !== st.set.base).c; const s2 = J(st); s2.set.base = other;
  const e = fails(() => save(db, s2), 409, /base currency cannot be changed/); assert.equal(e.detail.code, 'BASE_CURRENCY_LOCKED'); assert.equal(assemble(db).set.base, st.set.base); ok();
  assert.ok(db.prepare("SELECT count(*) c FROM audit_log WHERE action='refused' AND entity='base-currency'").get().c >= 1); ok();
  // an empty database (no financial history) may still choose its base
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'aplus-dp2-')); const e2 = open(path.join(d2, 'e.sqlite')); migrate(e2); const g = S.getState(e2); const x = J(g.state); save(e2, x); const y = J(assemble(e2)); y.set.base = y.cur.find(c => c.c !== y.set.base).c; save(e2, y); assert.equal(assemble(e2).set.base, y.set.base); ok(); }
// aggregation only adds amounts stored in the current base currency
{ const st = J(base); const f0 = fin.fin(st); st.l[0].bc = 'USD'; const f1 = fin.fin(st); assert.ok(f1.baseMismatch && f1.baseMismatch.some(m => m.kind === 'lesson' && m.id === st.l[0].id), 'a record stored in another base currency must be flagged'); assert.notEqual(f1.rev, f0.rev); ok(); }

// ---- M6: positive values; free sessions only with an explicit reason; legacy rows preserved
{ const db = mk(); const st = assemble(db); const zero = st.l.filter(l => l.st === 'Completed' && !(l.bchg > 0)).length;
  let s2 = J(st); const l0 = s2.l.find(l => l.st === 'Completed'); l0.d = 0; fails(() => save(db, s2), 422, /duration/); ok();
  for (const bad of [-1, NaN, 25, 'x', null]) { s2 = J(st); s2.l.find(l => l.id === l0.id).d = bad; fails(() => save(db, s2), 422); } ok();
  s2 = J(st); s2.sp[0].amt = 0; fails(() => save(db, s2), 422, /greater than zero/); s2 = J(st); s2.sp[0].amt = -5; fails(() => save(db, s2), 422); s2 = J(st); s2.sp[0].amt = 1e15; fails(() => save(db, s2), 422); ok();
  s2 = J(st); s2.tp[0].rx = 0; fails(() => save(db, s2), 422, /exchange rate/); s2 = J(st); s2.tp[0].date = '2026-13-45'; fails(() => save(db, s2), 422, /valid date/); s2 = J(st); s2.tp[0].cur = 'ZZZ'; fails(() => save(db, s2), 422); ok();
  // new zero-charge completed lesson: rejected unless flagged free with a reason
  s2 = J(st); const nl = J(l0); nl.d = 1; nl.id = s2.id++; nl.bchg = 0; nl.sr = 0; fails(() => (s2.l.push(nl), save(db, s2)), 422, /free-session flag/); ok();
  s2 = J(st); const fl = J(l0); fl.d = 1; fl.id = s2.id++; fl.bchg = 0; fl.sr = 0; fl.free = 1; fl.freeReason = 'sponsored trial lesson'; s2.l.push(fl); save(db, s2); const sv = assemble(db).l.find(l => l.id === fl.id); assert.equal(sv.free, 1); assert.equal(sv.freeReason, 'sponsored trial lesson'); ok();
  assert.ok(db.prepare("SELECT count(*) c FROM audit_log WHERE action='create' AND entity='l' AND after_json LIKE '%sponsored%'").get().c === 1); ok();
  // existing zero-value lessons stay exactly as they were (not re-judged, not converted)
  assert.equal(assemble(db).l.filter(l => l.st === 'Completed' && !(l.bchg > 0) && !l.free).length, zero); ok();
  // percentages, currency codes, text
  s2 = J(st); s2.pr[0] && (s2.pr[0].share = 120); if (s2.pr[0]) { fails(() => save(db, s2), 422, /profit share/); ok(); }
  s2 = J(st); s2.cur.push({ c: 'abc', n: 'Bad' }); fails(() => save(db, s2), 422, /three capital letters/); s2 = J(st); s2.cur.push({ c: 'XYZ', n: '<img src=x onerror=alert(1)>' }); fails(() => save(db, s2), 422, /plain text|currency entry skipped/); ok();
  s2 = J(st); s2.set.name = '<script>x</script>'; fails(() => save(db, s2), 422, /not allowed/); s2 = J(st); s2.rates.EGP.r = -1; fails(() => save(db, s2), 422); ok(); }

// ---- H6: audit coverage (create / update with before+after / status / rate / settings), no personal data, append-only, atomic with the change
{ const db = mk(); let st = J(assemble(db)); const a0 = cnt(db, 'audit_log');
  const lessonId = st.l[0].id; st.l[0].d = st.l[0].d + 0.5; st.l[0].bchg += 100; st.t[0].phone = '+20 100 555 0000'; st.t[0].name = 'Renamed Teacher'; st.set.name = 'Renamed Academy'; st.rates.EGP = { r: st.rates.EGP.r * 1.1, t: '2026-10-29T10:00:00.000Z', type: 'Manual' };
  const np = { id: st.id++, p: st.s[0].id, date: '2026-10-29', cur: st.set.base, amt: 12000, rx: 1, rt: 'Same', bamt: 12000, bc: st.set.base, meth: 'Cash', notes: 'private note' }; st.sp.push(np); save(db, st);
  const rows = db.prepare('SELECT * FROM audit_log WHERE id>? ORDER BY id').all(a0); const acts = rows.map(r => r.action + ':' + r.entity); for (const want of ['update:l', 'create:sp', 'settings-change:settings', 'rate-change:rate', 'update:t']) assert.ok(acts.includes(want), 'missing audit row ' + want + ' in ' + acts); ok();
  const u = rows.find(r => r.action === 'update' && r.entity === 'l'); assert.ok(u.before_json && u.after_json); assert.ok('d' in JSON.parse(u.before_json) && JSON.parse(u.after_json).d === st.l[0].d && u.entity_id === lessonId); assert.equal(u.actor, 'local'); ok();
  const all = JSON.stringify(rows); assert.ok(!/555 0000|Renamed Teacher|private note/.test(all), 'personal data/notes must not be copied into the audit log'); ok();
  assert.throws(() => db.prepare('UPDATE audit_log SET detail=? WHERE id=?').run('x', rows[0].id), /append-only/); assert.throws(() => db.prepare('DELETE FROM audit_log WHERE id=?').run(rows[0].id), /append-only/); ok();
  // a failed save writes neither the business change nor its audit rows
  const before = cnt(db, 'audit_log'), lessons = JSON.stringify(assemble(db).l); const bad = J(assemble(db)); bad.l[0].d = 5; bad.sp[0].amt = 0; fails(() => save(db, bad), 422); assert.equal(cnt(db, 'audit_log'), before); assert.equal(JSON.stringify(assemble(db).l), lessons); ok();
  // a failure DURING the transaction (after audit rows were written) rolls both back
  db.exec("CREATE TRIGGER boom BEFORE UPDATE ON teachers BEGIN SELECT RAISE(ABORT,'forced failure'); END;"); const b2 = cnt(db, 'audit_log'); const s3 = J(assemble(db)); s3.l[0].notes = 'changed for rollback test'; s3.t[0].status = s3.t[0].status === 'Active' ? 'Inactive' : 'Active'; assert.throws(() => save(db, s3), /forced failure/); assert.equal(cnt(db, 'audit_log'), b2, 'audit rows must roll back with the change'); assert.notEqual(assemble(db).l[0].notes, 'changed for rollback test'); db.exec('DROP TRIGGER boom'); ok(); }
console.log('DATA PROTECTION TEST OK: ' + n + ' checks (protected deletes incl. cascade attempts and opening balances, typed reasons for payments/completed lessons, base-currency lock + base verification, positive-value validation with auditable free flag, legacy zero rows preserved, audit coverage without personal data, append-only, rollback together with the change).');
