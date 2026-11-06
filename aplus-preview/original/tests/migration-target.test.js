'use strict';
// Import into a target database that already holds app-seeded settings / currencies / rates (the real-world failure:
// "UNIQUE constraint failed: settings.key"). Synthetic data and temporary databases only; no real database is referenced.
const assert = require('node:assert/strict'); const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const { open, migrate } = require('../src/db'); const { migrate: imp, dupKeys, analyse } = require('../src/importer'); const S = require('../src/save'); const { assemble } = require('../src/state');
const f = require('../src/finance'); const { makeOrig } = require('../src/orig'); const backup = require('../src/backup'); const dry = require('../src/dryrun');
const base = require('../fixtures/synthetic-v5.json'); const J = x => JSON.parse(JSON.stringify(x)); let n = 0; const ok = () => n++;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aplus-tgt-')); let seq = 0; const newFile = () => path.join(tmp, 'db' + (++seq) + '.sqlite');
const TABLES = ['settings', 'currencies', 'exchange_rates_current', 'exchange_rate_history', 'schema_meta', 'id_registry', 'audit_log', 'migration_runs', 'migration_quarantine', 'teachers', 'students', 'subjects', 'lessons', 'student_payments', 'teacher_payments', 'projects', 'project_payments', 'recorded_courses', 'course_enrollments', 'course_reminders', 'timetable_entries'];
const dump = file => { const d = open(file); const o = {}; for (const t of TABLES) o[t] = d.prepare(`SELECT * FROM ${t} ORDER BY 1,2`).all(); d.close(); return JSON.stringify(o); };
const LIVE = { EGP: 0.005519250965231445, USD: 0.31064882424079754, SAR: 0.08284054255916305, QAR: 0.08534396605358406 };
// Exactly how the app seeds a new database: first page load writes the defaults, then the page fetches live rates and saves again.
function seededTarget(file = newFile()) { const d = open(file); migrate(d); let st = S.getState(d).state; S.applySave(d, { baseRev: S.getRev(d), state: st });
  st = assemble(d); st.rates = Object.fromEntries(Object.entries(LIVE).map(([c, r]) => [c, { r, t: '2026-10-28T21:04:22.185Z', type: 'Live' }])); S.applySave(d, { baseRev: S.getRev(d), state: st, now: '2026-10-28T21:05:00.000Z' }); /* saved at the moment the rates were fetched (Phase 3 refuses a 'Live' label on an old timestamp) */ d.close(); return file; }
const run = (file, data, mode = 'apply') => imp(JSON.stringify(data), { mode, target: file });
const counts = file => { const d = open(file); const r = Object.fromEntries(['teachers', 'students', 'lessons', 'student_payments', 'teacher_payments', 'id_registry'].map(t => [t, d.prepare(`SELECT count(*) c FROM ${t}`).get().c])); d.close(); return r; };

// ---------- A. settings / currency / rate conflicts ----------
{ // A1. the real failure: seeded target (defaults + live rates), legacy differs -> imports, legacy wins, nothing lost
  const file = seededTarget(); const d0 = open(file); const before = { set: assemble(d0).set, cur: assemble(d0).cur, rates: assemble(d0).rates, rev: S.getRev(d0), hist: d0.prepare('SELECT count(*) c FROM exchange_rate_history').get().c }; d0.close();
  assert.deepEqual(before.set, { name: 'A+ Hub Academy', tr: '0', sr: '0', base: 'KWD' }); assert.ok(before.hist >= 4);
  const r = run(file, base); assert.equal(r.status, 'OK', JSON.stringify(r.errors) + r.status); assert.equal(r.applied, true); ok();
  const d = open(file); const st = assemble(d);
  assert.deepEqual(st.set, base.set, 'legacy settings are the source of truth over untouched defaults'); assert.deepEqual(st.cur, base.cur); assert.deepEqual(st.rates, base.rates); ok();
  assert.equal(d.prepare("SELECT count(*) c FROM exchange_rate_history WHERE rate_type='Live' AND saved_at='2026-10-28T21:04:22.185Z'").get().c, Object.keys(LIVE).length, 'the superseded live rates are still in the history'); ok();
  const au = d.prepare("SELECT * FROM audit_log WHERE action='import-replaced-seed'").all(); assert.equal(au.length, 1); const b = JSON.parse(au[0].before_json); assert.deepEqual(b.set, before.set); assert.equal(Object.keys(b.rates).length, Object.keys(LIVE).length); ok();
  assert.equal(S.getRev(d), before.rev + 1, 'revision bumped so an open browser tab must reload'); assert.equal(d.prepare('PRAGMA integrity_check').get().integrity_check, 'ok'); assert.equal(d.prepare('PRAGMA foreign_key_check').all().length, 0); ok();
  assert.equal(JSON.stringify(f.fin(st)), JSON.stringify(f.fin(f.stampLegacy(base)))); d.close(); }
{ // A2. legacy settings identical to the target's -> fine, unchanged
  const file = seededTarget(); const legacy = J(base); legacy.set = { name: 'A+ Hub Academy', tr: '0', sr: '0', base: 'KWD' }; const r = run(file, legacy); assert.equal(r.status, 'OK'); const d = open(file); assert.deepEqual(assemble(d).set, legacy.set); d.close(); ok(); }
{ // A3. target setting was edited by the user and differs from legacy -> REFUSED, nothing written (byte-for-byte same rows)
  const file = seededTarget(); let d = open(file); const st = assemble(d); st.set.name = 'My Own Academy Name'; S.applySave(d, { baseRev: S.getRev(d), state: st }); d.close(); const before = dump(file);
  const r = run(file, base); assert.equal(r.status, 'REFUSED_TARGET_CONFLICT'); assert.equal(r.applied, false); assert.deepEqual(r.targetPreflight.conflicts.settings.map(c => c.key), ['name']); assert.equal(r.targetPreflight.conflicts.settings[0].inTarget, 'My Own Academy Name'); ok();
  assert.equal(dump(file), before, 'a refused import changes nothing'); ok();
  // ... and the same edit is harmless when legacy carries the same value
  const same = J(base); same.set.name = 'My Own Academy Name'; assert.equal(run(file, same).status, 'OK'); ok(); }
{ // A4. a missing setting is created from legacy
  const file = seededTarget(); let d = open(file); d.prepare("DELETE FROM settings WHERE key='sr'").run(); d.close(); const r = run(file, base); assert.equal(r.status, 'OK'); d = open(file); assert.equal(assemble(d).set.sr, base.set.sr); d.close(); ok(); }
{ // A5. a manually entered target rate that differs from legacy is user data -> refused; auto 'Live' rates are superseded (A1)
  const file = seededTarget(); let d = open(file); const st = assemble(d); st.rates.EGP = { r: 0.0061, t: '2026-10-28T22:00:00.000Z', type: 'Manual' }; S.applySave(d, { baseRev: S.getRev(d), state: st }); d.close(); const before = dump(file);
  const r = run(file, base); assert.equal(r.status, 'REFUSED_TARGET_CONFLICT'); assert.deepEqual(r.targetPreflight.conflicts.rates.map(c => c.code), ['EGP']); assert.equal(dump(file), before); ok(); }
{ // A6. a currency the user added to the target that legacy does not know -> refused
  const file = seededTarget(); let d = open(file); const st = assemble(d); st.cur.push({ c: 'JPY', n: 'Yen' }); S.applySave(d, { baseRev: S.getRev(d), state: st }); d.close(); const r = run(file, base); assert.equal(r.status, 'REFUSED_TARGET_CONFLICT'); assert.deepEqual(r.targetPreflight.conflicts.currencies.map(c => c.code), ['JPY']); ok(); }
{ // A7. duplicate keys inside the legacy file (JSON.parse would silently drop one) -> REJECTED in dry run and apply, target untouched
  const txt = JSON.stringify(base).replace('"set":{', '"set":{"name":"first",'); assert.ok(dupKeys(txt).some(p => /set\.name/.test(p))); const file = seededTarget(), before = dump(file);
  for (const mode of ['dry-run', 'apply']) { const r = imp(txt, { mode, target: file }); assert.equal(r.status, 'REJECTED'); assert.ok(r.errors.some(e => /repeated/.test(e))); } assert.equal(dump(file), before); ok(); }
{ // A8. invalid / unsupported setting values -> REJECTED with a reason; unknown key is kept and warned
  for (const [mut, re] of [[s => { s.tr = 'abc'; }, /"tr" is not a non-negative number/], [s => { s.sr = '-5'; }, /"sr"/], [s => { s.base = 'XXX'; }, /base currency "XXX"/], [s => { s.name = 5; }, /must be text/]]) {
    const l = J(base); mut(l.set); const r = run(seededTarget(), l, 'dry-run'); assert.equal(r.status, 'REJECTED'); assert.ok(r.errors.some(e => re.test(e)), r.errors.join()); }
  const l = J(base); l.set.theme = 'dark'; const file = seededTarget(); const r = run(file, l); assert.equal(r.status, 'OK'); assert.ok(r.warnings.some(w => /"theme"/.test(w))); const d = open(file); assert.equal(assemble(d).set.theme, 'dark'); d.close(); ok(); }

// ---------- B. transaction safety ----------
{ // B1. forced failure in the middle (after settings/currencies/rates/teachers are already written) rolls EVERYTHING back, including the seed replacement
  const file = seededTarget(); let d = open(file); d.exec("CREATE TRIGGER boom BEFORE INSERT ON lessons BEGIN SELECT RAISE(ABORT,'forced failure'); END;"); d.close(); const before = dump(file);
  const r = run(file, base); assert.equal(r.status, 'FAILED_WRITE_ROLLED_BACK'); assert.equal(r.applied, false); assert.match(r.errors.join(), /forced failure/); assert.equal(dump(file), before, 'every write rolled back'); assert.equal(counts(file).teachers, 0); ok();
  d = open(file); d.exec('DROP TRIGGER boom'); d.close(); const r2 = run(file, base); assert.equal(r2.status, 'OK', 'the same target imports once the fault is gone'); ok(); }
{ // B2. repeated import cannot duplicate; a different file is refused
  const file = seededTarget(); assert.equal(run(file, base).status, 'OK'); const c1 = counts(file), snap = dump(file); assert.equal(run(file, base).status, 'ALREADY_APPLIED'); assert.deepEqual(counts(file), c1); assert.equal(dump(file), snap);
  const other = J(base); other.set.name = 'Other'; assert.equal(run(file, other).status, 'REFUSED_TARGET_NOT_EMPTY'); assert.equal(dump(file), snap); ok(); }
{ // B3. conflicting business records already in the target -> refused (policy), nothing changes
  const file = seededTarget(); let d = open(file); const st = assemble(d); st.s.push({ id: st.id, name: 'Existing Student', status: 'Active' }); st.id++; S.applySave(d, { baseRev: S.getRev(d), state: st }); d.close(); const before = dump(file);
  const r = run(file, base); assert.equal(r.status, 'REFUSED_TARGET_NOT_EMPTY'); assert.ok(r.targetPreflight.existingBusinessRows.students >= 1); assert.equal(dump(file), before); ok(); }
{ // B4. the dry run never changes the target, even a seeded one, and previews the same decision
  const file = seededTarget(), before = dump(file), bytes = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); const R = dry.build(JSON.stringify(base), { sourceName: 'x.json', activeDb: file });
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), bytes); assert.equal(dump(file), before); const pre = R.items['17_entityCountsBeforeAfter'].targetPreflight; assert.equal(pre.wouldBeRefused, null); assert.equal(pre.appSeededConfigThatWillBeReplaced, true); assert.equal(R.canProceed, true); ok();
  let d = open(file); const st = assemble(d); st.set.sr = '99'; S.applySave(d, { baseRev: S.getRev(d), state: st }); d.close(); const R2 = dry.build(JSON.stringify(base), { sourceName: 'x.json', activeDb: file }); assert.equal(R2.items['17_entityCountsBeforeAfter'].targetPreflight.wouldBeRefused, 'REFUSED_TARGET_CONFLICT'); assert.equal(R2.canProceed, false); ok(); }

// ---------- C/D/E. integrity, optional link (lesson 139 case), reconciliation, round trip ----------
{ const legacy = J(base); const l0 = legacy.l.find(l => l.st === 'Completed'); l0.tt = 999999; l0.od = '2026-10-23'; l0.ts = '16:00'; l0.te = '17:30'; // optional link to a timetable entry that does not exist
  const file = seededTarget(); const r = run(file, legacy); assert.equal(r.status, 'OK'); assert.ok(r.warnings.some(w => new RegExp('l ' + l0.id + ': optional link "tt" -> 999999 does not exist; stored empty').test(w)), 'clear warning recorded'); ok();
  const d = open(file); const st = assemble(d); const got = st.l.find(l => l.id === l0.id); assert.equal(got.tt, undefined); for (const k of Object.keys(l0)) if (k !== 'tt') assert.deepEqual(got[k], l0[k], 'lesson field ' + k + ' preserved'); ok();
  assert.ok(JSON.parse(d.prepare('SELECT report_json FROM migration_runs').get().report_json).warnings.some(w => /999999/.test(w)), 'warning stored with the run'); assert.equal(d.prepare('PRAGMA integrity_check').get().integrity_check, 'ok'); assert.equal(d.prepare('PRAGMA foreign_key_check').all().length, 0);
  // E. every difference between legacy and what the database returns is the one documented change
  const diffs = []; for (const k of ['t', 's', 'sub', 'tt', 'l', 'sp', 'tp', 'pr', 'pp', 'rc', 're', 'rm']) legacy[k].forEach((row, i) => { const stab = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(q => [q, x[q]])) : x)); const BOOK = { sp: ['fxs'], tp: ['fxs'], pp: ['cur', 'rx', 'bamt', 'bc', 'fxs'], re: ['paid_open'] }; /* bookkeeping columns added by migration 003 (documented, derived from the record itself or its parent; no original value changes) */ const norm = (r, kk) => stab(Object.fromEntries(Object.entries(r).filter(([q, v]) => !(q === 'ex' && v && !Object.keys(v).length) && !(BOOK[kk] || []).includes(q)))); /* documented normalisation: an empty ex{} is not stored */ const a = norm(row, k), b = norm(st[k][i], k); if (a !== b) diffs.push(k + ' ' + row.id); });
  assert.deepEqual(diffs, ['l ' + l0.id], 'only the lesson whose dangling link was cleared differs'); assert.deepEqual(st.set, legacy.set); assert.deepEqual(st.cur, legacy.cur); assert.deepEqual(st.rates, legacy.rates); assert.deepEqual(st.rd, legacy.rd); ok();
  // D. financial reconciliation computed from the legacy file (not hard-coded): totals, per-original-currency totals, converted totals
  const exp = f.fin(f.stampLegacy(legacy)), act = f.fin(st); assert.deepEqual(act, exp); const o = d => makeOrig({ O: f.O, pj: p => f.pj(d, p), rcc: f.rcc }); assert.equal(JSON.stringify(o(st).work(f.all(st)).byCurrency), JSON.stringify(o(legacy).work(f.all(legacy)).byCurrency));
  assert.equal(JSON.stringify(o(st).cash(st, {}, null)), JSON.stringify(o(legacy).cash(legacy, {}, null))); assert.equal(JSON.stringify(dry.totalsOf(st)), JSON.stringify(dry.totalsOf(legacy))); assert.deepEqual(r.reconciliation.expected, r.reconciliation.fromDatabase); ok();
  for (const [c, v] of Object.entries(legacy.rates)) assert.equal(d.prepare('SELECT rate FROM exchange_rates_current WHERE code=?').get(c).rate, v.r, 'rate precision ' + c); d.close();
  // E. round trip through the existing backup mechanism: back up the imported database, open the backup, compare with the live state
  const bdir = path.join(tmp, 'bk' + seq), live = open(file); migrate(live); const b = backup.create({ db: live, dbFile: file, backupDir: bdir }, 'rt'); assert.ok(b.verified); live.close(); const bf = path.join(bdir, b.name);
  const bd = open(bf); assert.equal(JSON.stringify(assemble(bd)), JSON.stringify(st)); bd.close(); ok(); }
fs.rmSync(tmp, { recursive: true, force: true });
console.log('MIGRATION TARGET TEST OK: ' + n + ' checks (seeded-target import, settings/currency/rate precedence + refusals, duplicate/invalid legacy settings, forced-failure rollback of every write, idempotence, business-row refusal, dry run changes nothing and previews the decision, FK/integrity, dangling optional link, legacy-computed reconciliation, backup round trip).');
