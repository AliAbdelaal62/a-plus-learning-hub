'use strict';
const assert = require('node:assert/strict'); const { open, migrate } = require('../src/db'); const { migrate: imp } = require('../src/importer'); const S = require('../src/save'); const { assemble } = require('../src/state'); const fin = require('../src/finance');
const fs = require('fs'), os = require('os'), path = require('path'); const base = require('../fixtures/synthetic-v5.json'); const J = x => JSON.parse(JSON.stringify(x)); let n = 0; const ok = () => n++;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aplus-save-')), f = path.join(dir, 'x.sqlite');
imp(JSON.stringify(base), { mode: 'apply', target: f }); const db = open(f); migrate(db);
let { rev, state, fresh } = S.getState(db); assert.equal(fresh, false); assert.equal(JSON.stringify(fin.fin(state)), JSON.stringify(fin.fin(fin.stampLegacy(base)))); ok();
const save = (st, extra = {}) => { const r = S.applySave(db, { baseRev: rev, state: st, ...extra }); rev = r.rev; return r; };
const fails = (st, code, extra = {}) => { try { S.applySave(db, { baseRev: rev, state: st, ...extra }); } catch (e) { assert.equal(e.code, code, e.message + JSON.stringify(e.detail)); return e; } assert.fail('expected failure ' + code); };
// no-op save changes nothing
const revBefore = rev; assert.deepEqual(save(J(state)).changed, {}); assert.equal(rev, revBefore, 'a save with no changes must not bump the revision'); ok();
// add / edit / delete a lesson (non-protected)
let s2 = J(state); const id = s2.id; s2.id++; s2.l.push({ id, date: '2026-10-01', t: 100, s: 103, sub: 108, lv: '', d: 1.5, tr: 10000, sr: 15000, st: 'No Show', tc: 'KWD', sc: 'KWD', trx: 1, srx: 1, bc: 'KWD', bcost: 15000, bchg: 22500, rt: 'Manual', notes: '' });
let r = save(s2); assert.equal(r.changed.l.added, 1); ok();
assert.equal(assemble(db).l.at(-1).st, 'No Show'); assert.equal(JSON.stringify(fin.C(assemble(db).l.at(-1))), JSON.stringify({ cost: 0, chg: 0, p: 0 })); ok();
s2 = J(assemble(db)); s2.l.at(-1).notes = 'edited'; r = save(s2); assert.equal(r.changed.l.updated, 1); ok();
s2 = J(assemble(db)); s2.l.pop(); r = save(s2); assert.equal(r.changed.l.removed, 1); assert.equal(db.prepare("SELECT count(*) c FROM audit_log WHERE action='delete' AND entity='l'").get().c, 1); ok();
// a recurring-series exception affects only that date
s2 = J(assemble(db)); const tt = s2.tt.find(x => x.sched === 'rec'); const before = Object.keys(tt.ex || {}).length; tt.ex['2026-10-05'] = { moved: { date: '2026-10-06', st: '10:00', en: '11:00' }, done: 1, hist: 'moved' }; /* a Live session can only be marked done once its lessons are recorded (stabilization G) */ for (const sid of tt.s) s2.l.push({ ...J(s2.l[0]), id: s2.id++, date: '2026-10-06', t: tt.t, s: sid, st: 'Completed', tt: tt.id, od: '2026-10-05' }); r = save(s2);
const back = assemble(db).tt.find(x => x.id === tt.id); assert.equal(Object.keys(back.ex).length, before + 1); assert.equal(back.a, tt.a); assert.equal(back.dw, tt.dw); assert.equal(back.ex['2026-10-05'].done, 1); assert.equal(back.ex['2026-10-05'].moved.date, '2026-10-06'); ok();
// protected deletes refused; impact preview explains; explicit confirmation required; archive path works
const im = S.impact(db, 't', 100); assert.ok(im.total > 0 && im.canDelete === false); ok();
s2 = J(assemble(db)); s2.t = s2.t.filter(x => x.id !== 100); s2.l = s2.l.filter(x => x.t !== 100); s2.tp = s2.tp.filter(x => x.p !== 100);
const e = fails(s2, 409); assert.ok(e.detail.some(d => d.entity === 't')); assert.equal(assemble(db).t.length, base.t.length); ok();
s2 = J(assemble(db)); s2.t.find(x => x.id === 100).status = 'Inactive'; save(s2); assert.equal(assemble(db).l.filter(x => x.t === 100).length, base.l.filter(x => x.t === 100).length + tt.s.length /* the lessons recorded above to close the moved session */); ok();
// validation: invalid data refused whole, database unchanged
const snap = JSON.stringify(assemble(db)); s2 = J(assemble(db)); s2.l[0].st = 'Bogus'; fails(s2, 422); s2 = J(assemble(db)); s2.sp[0].p = 424242; fails(s2, 422); assert.equal(JSON.stringify(assemble(db)), snap); ok();
// stale revision refused
{ const stale = rev - 1; try { S.applySave(db, { baseRev: stale, state: assemble(db) }); assert.fail(); } catch (x) { assert.equal(x.code, 409); } ok(); }
// ids never reused: a new record cannot take a used id
s2 = J(assemble(db)); s2.id = 1; s2.s.push({ id: 100, name: 'dup', status: 'Active' }); fails(s2, 422); ok();
// rate change is logged in history; saved lessons keep their own rate
s2 = J(assemble(db)); s2.rates.EGP = { r: 0.0071, t: '2026-10-28T00:00:00.000Z', type: 'Manual' }; save(s2); assert.equal(db.prepare("SELECT count(*) c FROM exchange_rate_history WHERE code='EGP'").get().c, 2);
assert.equal(assemble(db).l.find(l => l.tc === 'EGP' || l.sc === 'EGP').trx, base.l.find(l => l.tc === 'EGP' || l.sc === 'EGP').trx); ok();
// fresh database serves defaults
const m = open(':memory:'); migrate(m); assert.equal(S.getState(m).fresh, true); ok();
assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok'); ok();
db.close(); fs.rmSync(dir, { recursive: true, force: true });
console.log('SAVE TEST OK: ' + n + ' checks (diff apply, No Show, occurrence exceptions isolated, protected delete refused + impact preview + archive, validation atomic, stale revision, id reuse, rate history, fresh DB)');
