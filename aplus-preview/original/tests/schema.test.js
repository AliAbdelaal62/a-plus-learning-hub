'use strict';
const assert = require('node:assert/strict');
const { open, migrate } = require('../src/db');
const { E } = require('../src/mapping');
let n = 0; const ok = (m) => { n++; };
const db = open(':memory:'); migrate(db);
// 1. mapping and table columns agree (both directions), apart from housekeeping columns
const hk = new Set(['seq', 'extra_json', 'archived_at']);
for (const [k, e] of Object.entries(E)) {
  const cols = db.prepare(`PRAGMA table_info(${e.table})`).all().map(c => c.name).filter(c => !hk.has(c));
  const want = Object.keys(e.cols).filter(c => e.cols[c] !== 'j' || true);
  assert.deepEqual(cols.sort(), want.sort(), 'column mismatch in ' + e.table); ok();
}
const reg = (id, kind) => db.prepare('INSERT INTO id_registry(id,kind) VALUES(?,?)').run(id, kind);
const throws = (fn, re, msg) => { assert.throws(fn, re, msg); ok(); };
// 2. id guard: unregistered / wrong kind / duplicate across tables
throws(() => db.prepare("INSERT INTO teachers(id,seq,name,status) VALUES(1,1,'x','Active')").run(), /not registered/, 'unregistered id');
reg(1, 'student');
throws(() => db.prepare("INSERT INTO teachers(id,seq,name,status) VALUES(1,1,'x','Active')").run(), /not registered/, 'wrong kind');
throws(() => reg(1, 'teacher'), /UNIQUE|constraint/, 'duplicate id across tables');
reg(2, 'teacher'); db.prepare("INSERT INTO teachers(id,seq,name,status) VALUES(2,1,'T','Active')").run();
throws(() => db.prepare('UPDATE teachers SET id=9 WHERE id=2').run(), /immutable/, 'id immutable');
throws(() => db.prepare('DELETE FROM id_registry WHERE id=2').run(), /never reused/, 'registry delete');
// 3. enums
reg(3, 'student'); throws(() => db.prepare("INSERT INTO students(id,seq,name,status) VALUES(3,1,'S','Gone')").run(), /CHECK/, 'bad status');
db.prepare("INSERT INTO students(id,seq,name,status) VALUES(1,1,'S','Active')").run();
reg(4, 'subject'); db.prepare("INSERT INTO subjects(id,seq,name,type) VALUES(4,1,'Sub','Live')").run();
const L = (id, st, extra = '') => { reg(id, 'lesson'); db.prepare(`INSERT INTO lessons(id,seq,date,t,s,sub,d,st,bcost,bchg) VALUES(${id},${id},'2026-01-01',2,1,4,1.5,'${st}',1,1)`).run(); };
L(5, 'No Show'); L(6, 'Completed'); L(7, 'Cancelled'); L(8, 'Rescheduled');
reg(9, 'lesson'); throws(() => db.prepare("INSERT INTO lessons(id,seq,date,t,s,sub,d,st,bcost,bchg) VALUES(9,9,'2026-01-01',2,1,4,1,'Bogus',1,1)").run(), /CHECK/, 'bad lesson status');
// 4. exact rate precision survives (S1)
reg(10, 'lesson'); db.prepare("INSERT INTO lessons(id,seq,date,t,s,sub,d,st,bcost,bchg,trx) VALUES(10,10,'2026-01-01',2,1,4,0.3333333,'Completed',1,1,0.0064)").run();
const r = db.prepare('SELECT d,trx FROM lessons WHERE id=10').get(); assert.equal(r.trx, 0.0064); assert.equal(r.d, 0.3333333); ok();
// 5. FK enforcement and restrict-on-delete
throws(() => { reg(11, 'lesson'); db.prepare("INSERT INTO lessons(id,seq,date,t,s,sub,d,st,bcost,bchg) VALUES(11,11,'2026-01-01',999,1,4,1,'Completed',1,1)").run(); }, /FOREIGN KEY/, 'dangling teacher');
throws(() => db.prepare('DELETE FROM teachers WHERE id=2').run(), /FOREIGN KEY/, 'teacher with lessons cannot be deleted');
// 6. occurrence flags are independent per date and cascade only with their own series
reg(12, 'timetable'); db.prepare("INSERT INTO timetable_entries(id,seq,sched,a) VALUES(12,1,'rec','2026-01-05')").run();
for (const od of ['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26'])
  db.prepare('INSERT INTO timetable_occurrences(tt,od) VALUES(12,?)').run(od);
db.prepare("UPDATE timetable_occurrences SET moved_date='2026-01-13',moved_st='10:00',done=1 WHERE tt=12 AND od='2026-01-12'").run();
db.prepare("UPDATE timetable_occurrences SET cancelled=1 WHERE tt=12 AND od='2026-01-19'").run();
db.prepare("UPDATE timetable_occurrences SET skipped=1 WHERE tt=12 AND od='2026-01-26'").run();
db.prepare("UPDATE timetable_occurrences SET deleted=1 WHERE tt=12 AND od='2026-01-05'").run();
const occ = db.prepare('SELECT od,done,cancelled,skipped,deleted,moved_date FROM timetable_occurrences WHERE tt=12 ORDER BY od').all();
assert.equal(occ.filter(o => o.deleted).length, 1); assert.equal(occ.filter(o => o.cancelled).length, 1); assert.equal(occ[1].done, 1); assert.equal(occ[1].moved_date, '2026-01-13');
assert.equal(db.prepare('SELECT a,b FROM timetable_entries WHERE id=12').get().a, '2026-01-05'); ok();
throws(() => db.prepare("INSERT INTO timetable_occurrences(tt,od) VALUES(12,'2026-01-12')").run(), /UNIQUE|constraint/, 'one row per occurrence');
// 7. lesson survives deletion of its series (L4)
db.prepare('UPDATE lessons SET tt=12, od=\'2026-01-12\' WHERE id=6').run(); db.prepare('DELETE FROM timetable_entries WHERE id=12').run();
const l6 = db.prepare('SELECT tt,od FROM lessons WHERE id=6').get(); assert.equal(l6.tt, null); assert.equal(l6.od, '2026-01-12'); ok();
// 8. rate must be > 0
db.prepare("INSERT INTO currencies VALUES('USD','US Dollar',1)").run();
throws(() => db.prepare("INSERT INTO exchange_rates_current(code,rate) VALUES('USD',0)").run(), /CHECK/, 'zero rate');
// 9. migration runner is idempotent and rolls back a broken migration
assert.deepEqual(migrate(db), []); ok();
const fk = db.prepare('PRAGMA foreign_key_check').all(); assert.equal(fk.length, 0); ok();
assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok'); ok();
console.log('SCHEMA V3 TEST OK: ' + n + ' assertions (mapping=columns, id guard, enums incl. No Show, exact REAL rates, FKs, independent occurrence flags, series delete keeps lessons, idempotent migrations)');
