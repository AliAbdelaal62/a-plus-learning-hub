'use strict';
// Pre-application check for the REAL database. It NEVER modifies, replaces or initialises the live database:
//   1. project files are the expected ones (reference hashes, migrations present)
//   2. the exact database path is printed and must exist
//   3. a WAL-consistent copy is written to the backups folder (VACUUM INTO from a read-only connection)
//   4. the copy's integrity_check, foreign_key_check and sha256 are verified
//   5. migrations 003/004 are validated on an isolated copy OF THAT BACKUP (tools/validate-migration.js)
// Usage: node scripts/preapply-check.js [path-to-aplus.sqlite]     (default: data\aplus.sqlite next to the project)
const fs = require('fs'), path = require('path'), crypto = require('crypto'); const { DatabaseSync } = require('node:sqlite');
const root = path.join(__dirname, '..'), sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const file = path.resolve(process.argv[2] || process.env.APLUS_DB || path.join(root, 'data', 'aplus.sqlite')); const out = { project: root, database: file, steps: [], ok: true };
const step = (name, pass, detail) => { out.steps.push({ name, pass, detail }); if (!pass) out.ok = false; console.log((pass ? 'PASS  ' : 'FAIL  ') + name + (detail ? ' - ' + detail : '')); };
try {
  // 1. files
  const refWant = fs.readFileSync(path.join(root, 'docs', 'prod-reference.sha256'), 'utf8').trim().split(/\s+/)[0], ref = path.join(root, 'production-reference', 'aplus-hub-academy-v8.html');
  step('reference page unchanged', fs.existsSync(ref) && sha(ref) === refWant, fs.existsSync(ref) ? sha(ref) : 'missing');
  const migs = fs.readdirSync(path.join(root, 'db', 'migrations')).filter(f => /^\d+_.*\.sql$/.test(f)).sort(); step('migrations 001-004 present', ['001', '002', '003', '004'].every(v => migs.some(f => f.startsWith(v))), migs.join(', '));
  // 2. path
  step('database file exists', fs.existsSync(file) && fs.statSync(file).size > 0, file + (fs.existsSync(file) ? ' (' + fs.statSync(file).size + ' bytes)' : '')); if (!fs.existsSync(file)) throw new Error('the database file does not exist at that path; nothing was created');
  const before = sha(file);
  // 3. consistent copy (includes anything still in the -wal file)
  const ro = new DatabaseSync(file, { readOnly: true }); const ver = ro.prepare('SELECT MAX(version) v FROM schema_migrations').get().v; step('current schema version read', true, 'version ' + ver);
  const dir = path.join(path.dirname(file), '..', 'backups'); fs.mkdirSync(dir, { recursive: true }); const d = new Date(), p = n => String(n).padStart(2, '0'); const name = `aplus-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-preapply.sqlite`, dest = path.join(dir, name);
  ro.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`); ro.close();
  // 4. verify the copy
  const cp = new DatabaseSync(dest, { readOnly: true }); const ic = cp.prepare('PRAGMA integrity_check').get().integrity_check, fk = cp.prepare('PRAGMA foreign_key_check').all().length; const counts = {}; for (const t of ['teachers', 'students', 'lessons', 'student_payments', 'teacher_payments', 'projects', 'project_payments', 'timetable_entries']) { try { counts[t] = cp.prepare(`SELECT count(*) c FROM ${t}`).get().c; } catch (_) { counts[t] = null; } } cp.close();
  const hash = sha(dest); fs.writeFileSync(dest + '.sha256', hash + '  ' + name + '\n'); step('backup written', true, dest); step('backup integrity_check', ic === 'ok', ic); step('backup foreign_key_check', fk === 0, fk + ' problems'); step('backup sha256', true, hash); out.backup = { file: dest, sha256: hash, counts };
  // 5. migration validation on the backup
  const { validate } = require('../tools/validate-migration'); const v = validate(dest); step('migration validation on the backup copy', v.ok, `applied ${JSON.stringify(v.applied)}; integrity ${v.integrity}; fk ${v.foreignKeyProblems}; idempotent ${v.idempotent}; historical values changed ${Object.values(v.tables).reduce((q, t) => q + (t.historicalValuesChanged || 0), 0)}`);
  step('live database untouched by this check', sha(file) === before, 'sha256 before = after');
} catch (e) { step('check aborted', false, String(e.message).replace(/[A-Za-z]:\\[^\s]*/g, '<path>')); }
console.log(out.ok ? '\nALL PRE-APPLICATION CHECKS PASSED. Nothing has been migrated. The backup above is the rollback point.' : '\nPRE-APPLICATION CHECK FAILED. Do NOT start the new version against this database. Nothing was changed.'); process.exit(out.ok ? 0 : 1);
