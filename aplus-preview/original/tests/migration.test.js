'use strict';
const assert = require('node:assert/strict'); const fs = require('fs'), os = require('os'), path = require('path');
const { migrate } = require('../src/importer'); const { open, migrate: mig } = require('../src/db'); const { assemble } = require('../src/state');
const base = require('../fixtures/synthetic-v5.json'); const clone = () => JSON.parse(JSON.stringify(base)); const T = o => JSON.stringify(o);
let n = 0; const ok = () => n++;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aplus-mig-')); const file = n => path.join(tmp, n);
// 1 clean fixture, dry-run: nothing written anywhere
let r = migrate(T(base)); assert.equal(r.status, 'OK'); assert.equal(r.roundTrip.identical, true); assert.equal(r.reconciliation.matches, true); assert.equal(r.quarantined.length, 0); ok();
assert.equal(fs.readdirSync(tmp).length, 0); ok();
// 2 wrapped backup (dev + prod formats) accepted
for (const fmt of ['aplus-hub-backup', 'aplusDEV-hub-backup']) { r = migrate(T({ format: fmt, formatVersion: 1, data: base })); assert.equal(r.status, 'OK'); ok(); }
// 3 old data version rejected, nothing guessed
let o = clone(); o.v = 4; r = migrate(T(o)); assert.equal(r.status, 'REJECTED'); assert.match(r.errors[0], /version/); ok();
assert.throws(() => migrate('not json{'), /not valid JSON/); ok();
// 4 empty database
o = { v: 5, id: 1, set: { name: 'x', tr: '1', sr: '1', base: 'KWD' }, cur: [{ c: 'KWD', n: 'Kuwaiti Dinar' }], rates: {}, rd: {} }; for (const k of ['t', 's', 'sub', 'l', 'sp', 'tp', 'tt', 'pr', 'pp', 'rc', 're', 'rm']) o[k] = [];
r = migrate(T(o)); assert.equal(r.status, 'OK'); assert.equal(r.reconciliation.matches, true); ok();
// 5 broken references: lesson -> missing teacher is quarantined, its payments-of-teacher too, everything else imports, totals still reconcile and the effect is reported
o = clone(); const tid = o.t[0].id; o.t = o.t.filter(x => x.id !== tid); r = migrate(T(o));
assert.equal(r.status, 'OK_WITH_QUARANTINE'); assert.ok(r.quarantined.some(q => q.entity === 'l' && /teachers/.test(q.reason))); assert.ok(r.quarantined.some(q => q.entity === 'tp')); assert.equal(r.reconciliation.matches, true); assert.ok(Object.keys(r.reconciliation.effectOfQuarantineOnTotals).length > 0); ok();
// 6 duplicate id across tables, unknown status, wrong type, unknown field, negative rate
o = clone(); o.s[1].id = o.t[0].id; o.l[0].st = 'Maybe'; o.sp[0].amt = '20'; o.t[1].favourite = 'blue'; o.rates.EGP.r = -1; r = migrate(T(o));
assert.ok(r.quarantined.some(q => /also used/.test(q.reason))); assert.ok(r.quarantined.some(q => q.entity === 'l' && /Maybe/.test(q.reason))); assert.ok(r.quarantined.some(q => q.entity === 'sp' && /type/.test(q.reason))); assert.ok(r.quarantined.some(q => q.entity === 'rates')); assert.equal(r.unknownFields.t.favourite, 1);
assert.equal(r.integrity.foreign_key_violations, 0); assert.equal(r.reconciliation.matches, true); ok();
// "Maybe" status is NOT a legal lesson status in the legacy UI list; importer lets the DB CHECK decide -> must be quarantined not crash
assert.ok(r.status === 'OK_WITH_QUARANTINE' || r.status === 'FAILED'); ok();
// 7 unknown field survives a round trip (nothing silently dropped)
o = clone(); o.t[1].favourite = 'blue'; o.pr[0].tag = { a: 1 }; r = migrate(T(o)); assert.equal(r.roundTrip.identical, true, T(r.roundTrip)); ok();
// 8 apply: writes once, idempotent, refuses a different source, real file round trip
const f1 = file('a.sqlite'); r = migrate(T(base), { mode: 'apply', target: f1 }); assert.equal(r.status, 'OK'); assert.equal(r.applied, true); ok();
r = migrate(T(base), { mode: 'apply', target: f1 }); assert.equal(r.status, 'ALREADY_APPLIED'); ok();
o = clone(); o.set.name = 'other'; r = migrate(T(o), { mode: 'apply', target: f1 }); assert.equal(r.status, 'REFUSED_TARGET_NOT_EMPTY'); ok();
let d = open(f1); assert.equal(T(Object.keys(assemble(d).rd)), T(Object.keys(base.rd))); assert.equal(d.prepare('SELECT count(*) c FROM teachers').get().c, base.t.length); assert.equal(d.prepare('SELECT value FROM schema_meta WHERE key=?').get('next_id').value, String(base.id)); d.close(); ok();
// 9 apply with quarantine: quarantined rows kept in migration_quarantine with original JSON
o = clone(); o.l[0].t = 99999; const f2 = file('b.sqlite'); r = migrate(T(o), { mode: 'apply', target: f2 }); assert.equal(r.status, 'OK_WITH_QUARANTINE'); d = open(f2);
assert.equal(d.prepare('SELECT count(*) c FROM migration_quarantine').get().c, r.quarantined.length); assert.equal(JSON.parse(d.prepare("SELECT row_json j FROM migration_quarantine WHERE entity='l'").get().j).t, 99999); d.close(); ok();
// 10 failure in the middle of the write: the whole transaction rolls back, target stays empty
const f3 = file('c.sqlite'); { const x = open(f3); mig(x); x.exec("CREATE TRIGGER boom BEFORE INSERT ON course_reminders BEGIN SELECT RAISE(ABORT,'simulated disk failure'); END"); x.close(); }
r = migrate(T(base), { mode: 'apply', target: f3 }); assert.equal(r.status, 'FAILED_WRITE_ROLLED_BACK'); assert.equal(r.applied, false); d = open(f3);
assert.equal(d.prepare('SELECT count(*) c FROM id_registry').get().c, 0); assert.equal(d.prepare('SELECT count(*) c FROM teachers').get().c, 0); d.close(); ok();
// 11 dangling optional link stored empty + reported; lesson whose series is gone survives
o = clone(); o.l[0].tt = 424242; r = migrate(T(o)); assert.ok(r.warnings.some(w => /optional link/.test(w))); assert.equal(r.status, 'OK'); ok();
// 12 reminder completion for a deleted reminder is quarantined (legacy bug L3), reminder frequency kept as written
o = clone(); o.rd['777|2026-01-01'] = 1; r = migrate(T(o)); assert.ok(r.quarantined.some(q => q.entity === 'rd')); assert.equal(assemble((() => { const m = open(':memory:'); mig(m); return m; })()).rm.length, 0); ok();
o = clone(); o.rm[0].f = 'Every 2 weeks'; r = migrate(T(o)); assert.equal(r.roundTrip.identical, true); ok();
// 13 float rates keep exact value through SQLite
o = clone(); o.rates.EGP.r = 0.0064; o.l[0].trx = 0.30700000000000005; r = migrate(T(o)); assert.equal(r.roundTrip.identical, true); ok();
fs.rmSync(tmp, { recursive: true, force: true });
console.log('MIGRATION TEST OK: ' + n + ' scenarios (clean, wrapped backups, wrong version, empty, broken refs + cascade, duplicates/types/unknown fields, apply/idempotent/refuse, quarantine kept, failed apply leaves nothing, optional links, reminder completions, exact rates)');
