'use strict';
const assert = require('node:assert/strict'); const fs = require('fs'), os = require('os'), path = require('path');
const { open, migrate } = require('../src/db'); const { migrate: imp } = require('../src/importer'); const B = require('../src/backup'); const S = require('../src/save'); const { assemble } = require('../src/state'); const fin = require('../src/finance');
const base = require('../fixtures/synthetic-v5.json'); const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aplus-bk-')); const file = path.join(dir, 'live.sqlite'); const bdir = path.join(dir, 'backups'); let n = 0; const ok = () => n++;
imp(JSON.stringify(base), { mode: 'apply', target: file }); const ctx = { db: open(file), file, backupDir: bdir }; migrate(ctx.db);
const m1 = B.create(ctx, 'first'); assert.ok(m1.verified && m1.counts.lessons === base.l.length); assert.ok(/^aplus-\d{8}-\d{6}-first\.sqlite$/.test(m1.name)); ok();
assert.equal(B.list(ctx).length, 1); ok();
// change live data, then restore the earlier backup
let st = assemble(ctx.db), rev = S.getRev(ctx.db); st = JSON.parse(JSON.stringify(st)); st.l[0].notes = 'CHANGED AFTER BACKUP'; S.applySave(ctx.db, { baseRev: rev, state: st });
assert.equal(assemble(ctx.db).l[0].notes, 'CHANGED AFTER BACKUP'); ok();
const r = B.restore(ctx, m1.name); assert.equal(assemble(ctx.db).l[0].notes, base.l[0].notes); assert.ok(r.safetyBackup); assert.equal(JSON.stringify(fin.fin(assemble(ctx.db))), JSON.stringify(fin.fin(fin.stampLegacy(base)))); ok();
// the safety backup holds the pre-restore change (nothing lost)
const safe = open(path.join(bdir, r.safetyBackup)); assert.equal(assemble(safe).l[0].notes, 'CHANGED AFTER BACKUP'); safe.close(); ok();
// corrupt / wrong files are refused and live data is untouched
const bad1 = path.join(bdir, 'aplus-20260101-000000-bad.sqlite'); fs.writeFileSync(bad1, 'this is not a database at all'); const before = JSON.stringify(assemble(ctx.db));
assert.throws(() => B.restore(ctx, 'aplus-20260101-000000-bad.sqlite'), /not an SQLite|validation/); assert.equal(JSON.stringify(assemble(ctx.db)), before); ok();
const bytes = fs.readFileSync(path.join(bdir, m1.name)); const bad2 = path.join(bdir, 'aplus-20260101-000001-trunc.sqlite'); fs.writeFileSync(bad2, bytes.subarray(0, Math.floor(bytes.length / 2)));
assert.throws(() => B.restore(ctx, 'aplus-20260101-000001-trunc.sqlite'), /validation|cannot be opened/); assert.equal(JSON.stringify(assemble(ctx.db)), before); ok();
// Phase 3: the byte to damage is chosen from the file itself (the first one whose damage the integrity check detects). A fixed offset depended on the schema's page layout, which migration 004 changed.
let tampered = null; for (let off = 4096 + 37; off < bytes.length && !tampered; off += 211) { const t = Buffer.from(bytes); for (let q = 0; q < 8 && off + q < t.length; q++) t[off + q] ^= 0xff; const f = path.join(bdir, 'aplus-20260101-000009-probe.sqlite'); fs.writeFileSync(f, t); if (!B.validate(f).ok) tampered = t; fs.rmSync(f, { force: true }); }
assert.ok(tampered, 'a damaging offset exists'); fs.writeFileSync(path.join(bdir, 'aplus-20260101-000002-tamp.sqlite'), tampered);
assert.throws(() => B.restore(ctx, 'aplus-20260101-000002-tamp.sqlite')); assert.equal(JSON.stringify(assemble(ctx.db)), before); ok();
// a valid backup whose checksum file disagrees is refused
const m2 = B.create(ctx, 'second'); const mf = JSON.parse(fs.readFileSync(path.join(bdir, m2.name + '.json'))); mf.sha256 = '0'.repeat(64); fs.writeFileSync(path.join(bdir, m2.name + '.json'), JSON.stringify(mf)); assert.throws(() => B.restore(ctx, m2.name), /checksum/); ok();
// path traversal in a restore name
assert.throws(() => B.restore(ctx, '../live.sqlite'), /invalid backup name/); ok();
// failure during swap rolls back to the previous data
const m3 = B.create(ctx, 'third'); const origCopy = fs.copyFileSync; fs.copyFileSync = (a, b, ...x) => { if (b === file) throw new Error('simulated disk full'); return origCopy(a, b, ...x); };
try { assert.throws(() => B.restore(ctx, m3.name), /rolled back/); } finally { fs.copyFileSync = origCopy; }
assert.equal(JSON.stringify(assemble(ctx.db)), before); assert.equal(ctx.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok'); ok();
// live database still fully usable after all of that
S.applySave(ctx.db, { baseRev: S.getRev(ctx.db), state: assemble(ctx.db) }); ok();
ctx.db.close(); fs.rmSync(dir, { recursive: true, force: true });
console.log('BACKUP TEST OK: ' + n + ' checks (VACUUM INTO backup + verification, restore, safety backup, corrupt/truncated/tampered/bad-checksum/traversal refused, swap failure rolled back)');
