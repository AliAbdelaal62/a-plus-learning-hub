'use strict';
const log = require('./log');
// SQLite backups (VACUUM INTO = a consistent single-file copy even while the server runs) and verified restore.
// Every backup carries a per-table fingerprint of the WHOLE database (settings, currencies, rates, rate history, audit log, every business table);
// validation and restore compare it table by table, so "complete" is proven rather than assumed.
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const { open, migrate, pending, SCHEMA_VERSION } = require('./db'); const { assemble } = require('./state'); const fin = require('./finance'); const audit = require('./audit');
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const stamp = d => d.toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
const NAME = /^aplus-\d{8}-\d{6}(-[a-z0-9_]{1,30})?\.sqlite$/;
const getRev = db => { const r = db.prepare("SELECT value FROM schema_meta WHERE key='rev'").get(); return r ? +r.value : 0; };
const BUSINESS = ['teachers', 'students', 'subjects', 'lessons', 'student_payments', 'teacher_payments', 'timetable_entries', 'projects', 'project_payments', 'recorded_courses', 'course_enrollments', 'course_reminders'];
const counts = db => Object.fromEntries(BUSINESS.map(t => [t, db.prepare(`SELECT count(*) c FROM ${t}`).get().c]));

// table-by-table fingerprint of every user table (rows sorted by all columns so VACUUM's rowid renumbering cannot matter)
function fingerprint(db) {
  const out = {}; const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name").all().map(r => r.name);
  for (const t of names) {
    const n = db.prepare(`SELECT count(*) c FROM pragma_table_info('${t}')`).get().c, order = Array.from({ length: n }, (_, i) => i + 1).join(',');
    const h = crypto.createHash('sha256'); let rows = 0;
    for (const r of db.prepare(`SELECT * FROM ${t} ORDER BY ${order}`).iterate()) { h.update(JSON.stringify(r) + '\n'); rows++; }
    out[t] = { rows, sha: h.digest('hex').slice(0, 24) };
  }
  return out;
}
const diffFp = (a, b) => { const d = []; for (const t of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) { const x = a && a[t], y = b && b[t]; if (!x || !y) d.push(t + ': table ' + (x ? 'missing in the copy' : 'not in the original')); else if (x.rows !== y.rows || x.sha !== y.sha) d.push(`${t}: ${x.rows} rows vs ${y.rows} rows, contents differ`); } return d; };

// Opens a file the way a restore would, without trusting it. Never modifies the file (works on a temp copy, including its -wal).
function validate(file, opt = {}) {
  const problems = []; let counts_ = null, totals = null, ver = null, tables = null, needsMigration = false;
  if (!fs.existsSync(file)) return { ok: false, problems: ['file does not exist'] };
  const head = fs.readFileSync(file).subarray(0, 16).toString('latin1'); if (!head.startsWith('SQLite format 3')) return { ok: false, problems: ['not an SQLite database file'] };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aplus-val-')), cp = path.join(tmp, 'check.sqlite');
  try {
    fs.copyFileSync(file, cp); if (fs.existsSync(file + '-wal')) fs.copyFileSync(file + '-wal', cp + '-wal');
    const { DatabaseSync } = require('node:sqlite'); const d = new DatabaseSync(cp); d.exec('PRAGMA foreign_keys=ON');
    try {
      const ic = d.prepare('PRAGMA integrity_check').all().map(r => r.integrity_check); if (ic.join() !== 'ok') problems.push('integrity_check: ' + ic.slice(0, 3).join('; '));
      const fk = d.prepare('PRAGMA foreign_key_check').all(); if (fk.length) problems.push(`foreign_key_check: ${fk.length} violation(s)`);
      let ok = true; try { ver = d.prepare('SELECT MAX(version) v FROM schema_migrations').get().v; } catch (e) { ok = false; problems.push('schema_migrations table missing'); }
      if (ok && ver > SCHEMA_VERSION) problems.push(`database schema version ${ver} is newer than this program supports (${SCHEMA_VERSION})`);
      if (ok && !problems.length) {
        tables = fingerprint(d); // fingerprint BEFORE any upgrade: this is what the backup really holds
        if (opt.expectTables) { const df = diffFp(opt.expectTables, tables); if (df.length) problems.push('table-by-table comparison failed: ' + df.slice(0, 5).join('; ')); }
        if (ver < SCHEMA_VERSION) { needsMigration = true; try { migrate(d); } catch (e) { problems.push('upgrade check failed: ' + e.message); } } // on the temp copy only
      }
      if (!problems.length) { counts_ = counts(d); const st = assemble(d); totals = fin.fin(st); if (!Number.isInteger(st.id)) problems.push('next id counter missing'); }
    } finally { d.close(); }
  } catch (e) { problems.push('cannot be opened: ' + e.message); } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  return { ok: problems.length === 0, problems, schemaVersion: ver, needsMigration, counts: counts_, totals, tables };
}
function uniqueName(dir, label) {
  const lab = (label ? label.replace(/[^a-z0-9_]/gi, '').toLowerCase().slice(0, 26) : '') || 'b', base = 'aplus-' + stamp(new Date()); let name = base + (label ? '-' + lab : '') + '.sqlite', i = 1;
  while (fs.existsSync(path.join(dir, name))) name = base + '-' + lab + (++i) + '.sqlite'; // keeps the label (e.g. auto2) so retention still recognises it
  return name;
}
function create(ctx, label = '', opt = {}) {
  fs.mkdirSync(ctx.backupDir, { recursive: true });
  const name = uniqueName(ctx.backupDir, label), out = path.join(ctx.backupDir, name);
  ctx.db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); const fpSrc = fingerprint(ctx.db); const rev = getRev(ctx.db);
  ctx.db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
  const v = validate(out, { expectTables: fpSrc }); const manifest = { name, kind: label || 'manual', createdAt: new Date().toISOString(), rev, sha256: sha(out), bytes: fs.statSync(out).size, schemaVersion: v.schemaVersion, counts: v.counts, totals: v.totals, tables: fpSrc, verified: v.ok, problems: v.problems };
  fs.writeFileSync(out + '.json', JSON.stringify(manifest, null, 1));
  if (!v.ok) throw new Error('backup was written but failed verification: ' + v.problems.join('; '));
  if (!opt.noAudit) { try { audit.log(ctx.db, { action: 'backup', entity: 'db', detail: name + (label ? ' (' + label + ')' : ''), after: { rev, bytes: manifest.bytes } }); } catch (e_) { require('./log').warn('audit entry could not be written (backup)', e_); } }
  return manifest;
}
function list(ctx) {
  if (!fs.existsSync(ctx.backupDir)) return [];
  return fs.readdirSync(ctx.backupDir).filter(f => NAME.test(f)).sort().reverse().map(f => { let m = {}; try { m = JSON.parse(fs.readFileSync(path.join(ctx.backupDir, f + '.json'), 'utf8')); } catch (e) { log.warn('backup manifest unreadable: ' + f, e); } return { name: f, bytes: fs.statSync(path.join(ctx.backupDir, f)).size, createdAt: m.createdAt, kind: m.kind, counts: m.counts, verified: m.verified }; });
}
// copy a finished backup (and its manifest) to a second location and prove the copy is identical
function copyTo(ctx, name, dir) {
  fs.mkdirSync(dir, { recursive: true }); const a = path.join(ctx.backupDir, name), b = path.join(dir, name);
  fs.copyFileSync(a, b); fs.copyFileSync(a + '.json', b + '.json');
  if (sha(a) !== sha(b)) { fs.rmSync(b, { force: true }); fs.rmSync(b + '.json', { force: true }); throw new Error('the copy in ' + dir + ' does not match the original (removed)'); }
  return b;
}
// keep every manual / pre-restore / pre-import / pre-migration backup; thin out only the automatic ones
function prune(dir, keepAuto) {
  if (!fs.existsSync(dir)) return [];
  const when = f => { try { return Date.parse(JSON.parse(fs.readFileSync(path.join(dir, f + '.json'), 'utf8')).createdAt) || 0; } catch (_) { return fs.statSync(path.join(dir, f)).mtimeMs; } };
  const autos = fs.readdirSync(dir).filter(f => NAME.test(f) && /-auto\d*\.sqlite$/.test(f)).map(f => [f, when(f)]).sort((x, y) => y[1] - x[1] || y[0].localeCompare(x[0])), gone = [];
  autos.slice(Math.max(1, keepAuto | 0)).forEach(([f]) => { for (const x of ['', '.json']) fs.rmSync(path.join(dir, f + x), { force: true }); gone.push(f); });
  return gone;
}
// restore: validate -> safety backup of the current data -> swap -> compare table by table -> upgrade -> verify -> (rollback on any failure). ctx.db is replaced on success.
function restore(ctx, name) {
  if (!NAME.test(name)) throw new Error('invalid backup name'); const src = path.join(ctx.backupDir, name);
  const m = fs.existsSync(src + '.json') ? JSON.parse(fs.readFileSync(src + '.json', 'utf8')) : null;
  const v = validate(src, { expectTables: m && m.tables }); if (!v.ok) { const e = new Error('the backup failed validation; nothing was changed: ' + v.problems.join('; ')); e.problems = v.problems; throw e; }
  if (m && m.sha256 !== sha(src)) throw new Error('the backup file does not match its recorded checksum; nothing was changed');
  const safety = create(ctx, 'prerestore'); // safety copy of what is live right now
  const live = ctx.file, hold = live + '.replaced-' + Date.now(); ctx.db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); ctx.db.close();
  const swap = () => { fs.renameSync(live, hold); for (const x of ['-wal', '-shm']) if (fs.existsSync(live + x)) fs.renameSync(live + x, hold + x); fs.copyFileSync(src, live); };
  const undo = () => { try { ctx.db && ctx.db.close(); } catch (_) {} for (const x of ['', '-wal', '-shm']) { try { fs.rmSync(live + x, { force: true }); } catch (_) {} } for (const x of ['', '-wal', '-shm']) if (fs.existsSync(hold + x)) fs.renameSync(hold + x, live + x); ctx.db = open(live); };
  try {
    swap(); ctx.db = open(live);
    if (m && m.tables) { const df = diffFp(m.tables, fingerprint(ctx.db)); if (df.length) throw new Error('restored data differs from the backup: ' + df.slice(0, 5).join('; ')); }
    migrate(ctx.db); const chk = validate(live); if (!chk.ok) throw new Error('restored database failed verification: ' + chk.problems.join('; '));
  } catch (e) { undo(); const err = new Error('restore failed and was rolled back; the previous data is unchanged: ' + e.message); err.rolledBack = true; throw err; }
  for (const x of ['', '-wal', '-shm']) fs.rmSync(hold + x, { force: true });
  try { audit.log(ctx.db, { action: 'restore', entity: 'db', detail: name, after: { safetyBackup: safety.name } }); } catch (e_) { require('./log').warn('audit entry could not be written (backup)', e_); }
  return { restored: name, counts: v.counts, safetyBackup: safety.name };
}
// OFFLINE restore for a live file that cannot be opened (zero-byte, truncated, malformed, bad WAL). The damaged files are MOVED ASIDE, never deleted.
function restoreOffline({ file, backupDir, name }) {
  if (!NAME.test(name)) throw new Error('invalid backup name'); const src = path.join(backupDir, name);
  const m = fs.existsSync(src + '.json') ? JSON.parse(fs.readFileSync(src + '.json', 'utf8')) : null;
  const v = validate(src, { expectTables: m && m.tables }); if (!v.ok) throw new Error('the backup failed validation; nothing was changed: ' + v.problems.join('; '));
  if (m && m.sha256 !== sha(src)) throw new Error('the backup file does not match its recorded checksum; nothing was changed');
  const aside = file + '.damaged-' + stamp(new Date()), moved = [];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (const x of ['', '-wal', '-shm']) if (fs.existsSync(file + x)) { fs.renameSync(file + x, aside + x); moved.push(aside + x); }
  try {
    fs.copyFileSync(src, file); const db = open(file);
    try { if (m && m.tables) { const df = diffFp(m.tables, fingerprint(db)); if (df.length) throw new Error('restored data differs from the backup: ' + df.slice(0, 5).join('; ')); } migrate(db); audit.log(db, { action: 'restore', entity: 'db', detail: name + ' (offline recovery)', after: { damagedFilesKeptAs: path.basename(aside) } }); } finally { db.close(); }
    const chk = validate(file); if (!chk.ok) throw new Error('restored database failed verification: ' + chk.problems.join('; '));
  } catch (e) { for (const x of ['', '-wal', '-shm']) fs.rmSync(file + x, { force: true }); for (const x of ['', '-wal', '-shm']) if (fs.existsSync(aside + x)) fs.renameSync(aside + x, file + x); throw new Error('recovery failed; the original files were put back: ' + e.message); }
  return { restored: name, damagedFilesKeptAs: moved };
}
module.exports = { create, list, restore, restoreOffline, validate, fingerprint, diffFp, copyTo, prune, counts, NAME, getRev };
