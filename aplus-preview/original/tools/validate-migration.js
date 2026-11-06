'use strict';
// READ-ONLY validation of migration 003 on an isolated copy of a database/backup: node tools/validate-migration.js <source.sqlite>
// The source is never modified (opened read-only; sha256 compared before/after). Exit code 0 only if every check passes.
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'); const { DatabaseSync } = require('node:sqlite'); const { open, migrate } = require('../src/db');
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function validate(src) {
  src = path.resolve(src); const h0 = sha(src); const ro = new DatabaseSync(src, { readOnly: true }); const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aplus-mv-')), copy = path.join(tmp, 'copy.sqlite'); ro.exec(`VACUUM INTO '${copy.replace(/'/g, "''")}'`);
  const tables = ro.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name); const cols = {}, rows = {};
  for (const t of tables) { cols[t] = ro.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name); rows[t] = ro.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all(); } ro.close();
  const db = open(copy); const applied = migrate(db); const out = { source: path.basename(src), sourceSha256: h0, applied, tables: {}, problems: [] };
  out.integrity = db.prepare('PRAGMA integrity_check').get().integrity_check; out.foreignKeyProblems = db.prepare('PRAGMA foreign_key_check').all().length;
  const num = v => typeof v === 'number';
  for (const t of tables) { const after = db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all(); const oldCols = cols[t]; let changed = 0; const idsBefore = rows[t].map(r => r.id ?? r.key ?? r.code ?? r.version).join(','), idsAfter = after.slice(0, rows[t].length).map(r => r.id ?? r.key ?? r.code ?? r.version).join(',');
    const sumB = {}, sumA = {}; for (const c of oldCols) if (rows[t].some(r => num(r[c]))) { sumB[c] = rows[t].reduce((q, r) => q + (num(r[c]) ? r[c] : 0), 0); sumA[c] = after.reduce((q, r) => q + (num(r[c]) ? r[c] : 0), 0); }
    rows[t].forEach((r, i) => { const a = after[i]; if (!a) return; for (const c of oldCols) if (r[c] !== a[c]) { changed++; if (out.problems.length < 20) out.problems.push(`${t} row ${i} column ${c}: ${r[c]} -> ${a[c]}`); } });
    const expectedAfter = rows[t].length + (t === 'schema_migrations' ? applied.length : 0); const newCols = db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name).filter(c => !oldCols.includes(c));
    const sumsEqual = t === 'schema_migrations' || Object.keys(sumB).every(c => sumB[c] === sumA[c]);
    out.tables[t] = { before: rows[t].length, after: after.length, countsEqual: after.length === expectedAfter, idsEqual: idsBefore === idsAfter, historicalValuesChanged: changed, columnSumsEqual: sumsEqual, columnSums: sumB, addedColumns: newCols };
    if (changed || after.length !== expectedAfter || idsBefore !== idsAfter || !sumsEqual) out.problems.push(`${t}: changed=${changed} countsEqual=${after.length === expectedAfter} idsEqual=${idsBefore === idsAfter} sumsEqual=${sumsEqual}`); }
  const all = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name); out.newTables = all.filter(t => !tables.includes(t)).map(t => ({ table: t, rows: db.prepare(`SELECT count(*) c FROM ${t}`).get().c }));
  const one = sql => db.prepare(sql).get().c;
  out.orphans = { allocationsWithoutPayment: one('SELECT count(*) c FROM payment_allocations a LEFT JOIN student_payments p ON p.id=a.sp WHERE p.id IS NULL'), coursePaymentsWithoutEnrolment: one('SELECT count(*) c FROM course_payments c LEFT JOIN course_enrollments e ON e.id=c.re WHERE e.id IS NULL'), adjustmentsWithoutStudent: one('SELECT count(*) c FROM student_adjustments a LEFT JOIN students s ON s.id=a.s WHERE s.id IS NULL'), projectPaymentsWithoutProject: one('SELECT count(*) c FROM project_payments x LEFT JOIN projects p ON p.id=x.pr WHERE p.id IS NULL') };
  out.duplicates = { duplicateIds: all.reduce((q, t) => { try { return q + one(`SELECT count(*) c FROM (SELECT id FROM ${t} GROUP BY id HAVING count(*)>1)`); } catch (e) { return q; } }, 0), duplicateAllocations: one('SELECT count(*) c FROM (SELECT 1 FROM payment_allocations GROUP BY sp, wt, ifnull(tk,\'\'), ifnull(tid,0), amt, date HAVING count(*)>1)'),
    migrationCreatedPayments: { student_payments: db.prepare('SELECT count(*) c FROM student_payments').get().c - rows.student_payments.length, teacher_payments: db.prepare('SELECT count(*) c FROM teacher_payments').get().c - rows.teacher_payments.length, project_payments: db.prepare('SELECT count(*) c FROM project_payments').get().c - rows.project_payments.length },
    // identical-looking entries ALREADY in the source (not created by the migration): same student, date, amount, method
    identicalLookingStudentPayments: db.prepare("SELECT p, date, amt, meth, group_concat(id) ids, count(*) n FROM student_payments GROUP BY p, date, amt, meth HAVING n>1").all().map(r => ({ student: r.p, date: r.date, amount: r.amt, method: r.meth, ids: r.ids })),
    identicalLookingTeacherPayments: db.prepare("SELECT p, date, amt, meth, group_concat(id) ids, count(*) n FROM teacher_payments GROUP BY p, date, amt, meth HAVING n>1").all().map(r => ({ teacher: r.p, date: r.date, amount: r.amt, method: r.meth, ids: r.ids })) };
  // FX: stored rates of student / teacher payments are untouched; project payments are identity or missing (never copied from the parent)
  out.fx = { studentPaymentsRateOrBaseChanged: out.tables.student_payments.historicalValuesChanged, teacherPaymentsRateOrBaseChanged: out.tables.teacher_payments.historicalValuesChanged, projectPayments: db.prepare('SELECT id, pr, date, amt, cur, rx, bamt, bc, fxs FROM project_payments ORDER BY id').all(), statusCounts: {} };
  for (const t of ['student_payments', 'teacher_payments', 'project_payments']) out.fx.statusCounts[t] = Object.fromEntries(db.prepare(`SELECT ifnull(fxs,'(none)') s, count(*) c FROM ${t} GROUP BY fxs`).all().map(r => [r.s, r.c]));
  out.fx.parentRateCopied = db.prepare("SELECT count(*) c FROM project_payments x JOIN projects p ON p.id=x.pr WHERE x.fxs NOT IN ('identity','missing','corrected','derived') OR (x.fxs='derived')").get().c;
  // idempotent: a second run applies nothing and changes nothing
  const snap = JSON.stringify(all.map(t => db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all())); const again = migrate(db); out.idempotent = again.length === 0 && JSON.stringify(all.map(t => db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all())) === snap;
  out.version = db.prepare('SELECT max(version) v FROM schema_migrations').get().v; db.close(); fs.rmSync(tmp, { recursive: true, force: true });
  out.sourceUnchanged = sha(src) === h0; out.problems.push(...Object.entries(out.orphans).filter(([, v]) => v).map(([k, v]) => 'orphans ' + k + ': ' + v)); if (out.duplicates.duplicateIds) out.problems.push('duplicate ids'); if (out.duplicates.duplicateAllocations) out.problems.push('duplicate allocations');
  if (Object.values(out.duplicates.migrationCreatedPayments).some(v => v)) out.problems.push('the migration created payment rows'); if (!out.idempotent) out.problems.push('second run changed something'); if (out.fx.parentRateCopied) out.problems.push('a project payment still carries a copied parent rate');
  out.ok = !out.problems.length && out.integrity === 'ok' && out.foreignKeyProblems === 0 && out.sourceUnchanged; return out;
}
module.exports = { validate };
if (require.main === module) { const src = process.argv[2]; if (!src || !fs.existsSync(src)) { console.error('usage: node tools/validate-migration.js <source.sqlite>'); process.exit(2); } const out = validate(src); console.log(JSON.stringify(out, null, 1)); process.exit(out.ok ? 0 : 1); }
