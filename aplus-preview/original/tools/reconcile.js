'use strict';
// Financial reconciliation report (READ-ONLY). usage: node tools/reconcile.js <database-or-backup.sqlite> [reports-dir] [label]
// The source file is opened read-only and never modified. A temporary copy is made with VACUUM INTO (WAL-safe), migrated in memory-of-the-copy, and compared with the source.
// Point it at a verified BACKUP (or a database whose server is stopped); never copy a live WAL database by hand.
const fs = require('fs'), os = require('os'), path = require('path'); const { DatabaseSync } = require('node:sqlite');
const { assemble } = require('../src/state'); const { open, migrate } = require('../src/db'); const R = require('../src/reconcile');
const f3 = v => (v == null ? '—' : (v / 1000).toFixed(3));
function unique(dir, name) { let p = path.join(dir, name), i = 2; while (fs.existsSync(p)) p = path.join(dir, name.replace(/(\.[a-z]+)$/, `-${i++}$1`)); return p; }
function run(src, outDir, label) {
  const ro = new DatabaseSync(src, { readOnly: true }); const oldSt = assemble(ro);
  const before = {}; for (const t of ro.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) before[t.name] = ro.prepare(`SELECT count(*) c FROM ${t.name}`).get().c;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aplus-recon-')), copy = path.join(tmp, 'copy.sqlite'); ro.exec(`VACUUM INTO '${copy.replace(/'/g, "''")}'`); ro.close();
  const db = open(copy); const applied = migrate(db); const newSt = assemble(db); const integrity = db.prepare('PRAGMA integrity_check').get().integrity_check, fk = db.prepare('PRAGMA foreign_key_check').all().length;
  const rec = R.build(oldSt, newSt); db.close(); fs.rmSync(tmp, { recursive: true, force: true });
  return { rec, meta: { source: path.basename(src), appliedToCopyOnly: applied, integrity, foreignKeyProblems: fk, sourceCounts: before, generatedAt: new Date().toISOString(), label: label || '' } };
}
function md({ rec, meta }, day) {
  const o = []; const h = (l, t) => o.push('#'.repeat(l) + ' ' + t, '');
  const tbl = (head, rows) => { o.push('| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|'); rows.forEach(r => o.push('| ' + r.join(' | ') + ' |')); o.push(''); };
  h(1, `Phase 2 — Financial reconciliation (${day})`);
  o.push(`Source: \`${meta.source}\` (opened read-only, never modified). Base currency: **${rec.base}**. All money in thousandths shown with 3 decimals. Migration 003 was applied **to a temporary copy only** (${meta.appliedToCopyOnly.join(', ') || 'already present'}); copy integrity: ${meta.integrity}, foreign-key problems: ${meta.foreignKeyProblems}.`, '');
  o.push('**Nothing in this report changes a stored amount.** Differences are explained and classified: *matches* / *expected* (caused by the documented formula fix) / *unexplained* / *manual-review*. Historical adjustments need your explicit approval and would be recorded as new adjustment rows, never as edits.', '');
  h(2, '1. Summary'); tbl(['Area', 'matches', 'expected', 'unexplained', 'manual-review'], ['teachers', 'students', 'projects', 'courses'].map(k => [k, ...['matches', 'expected', 'unexplained', 'manual-review'].map(c => rec.summary[k][c] || 0)]));
  h(2, '2. Teachers (base currency ' + rec.base + ', each record at its stored base amount)');
  tbl(['Teacher', 'Old: lesson earn', 'Old: recorded', 'Old: project', 'Old: paid', 'Old card balance', 'Old list/details/report balance', 'New earned', 'New paid', 'New outstanding', 'Δ vs list', 'Class'],
    rec.teachers.map(t => [`${t.id} ${t.name}${t.status === 'Inactive' ? ' (archived)' : ''}`, f3(t.old.liveEarned), f3(t.old.recordedEarned), f3(t.old.projectEarned), f3(t.old.paid), f3(t.old.cardBalance), f3(t.old.listBalance), f3(t.new.earned.total), f3(t.new.paid.total), f3(t.new.outstanding), f3(t.diffVsListBalance), t.class]));
  rec.teachers.filter(t => t.class !== 'matches' || t.paidInOtherCurrency || t.overpaid || t.unassignedPayments).forEach(t => {
    o.push(`- **${t.id} ${t.name}** — ${t.class}${t.cause ? ': ' + t.cause : ''}.`);
    o.push(`  - per currency (original, not added together): ${t.new.byCurrency.map(c => `${c.cur} earned ${f3(c.earned)} / paid ${f3(c.paid)} / remaining ${f3(c.remaining)}`).join('; ') || 'none'}`);
    if (t.paidInOtherCurrency) o.push('  - paid in a different currency from the one earned: the per-currency balances look like a debt in one currency and an over-payment in the other; the base figure nets them at the rates stored on each record. Review whether this is intended.');
    if (t.overpaid) o.push('  - negative balance is a real over-payment and is shown as such.'); if (t.unassignedPayments) o.push(`  - ${t.unassignedPayments} payment(s) have no payment source (work type); they reduce only the total.`); });
  o.push('');
  h(2, '3. Students'); tbl(['Student', 'Old charges', 'Old payments', 'Old balance', 'Currency', 'New charged', 'Received', 'Allocated', 'Unallocated', 'Refunds', 'Credits', 'New balance', 'Δ', 'Class'],
    rec.students.flatMap(s => (s.new.length ? s.new : [null]).map((n, i) => [i ? '' : `${s.id} ${s.name}`, i ? '' : f3(s.old.charges), i ? '' : f3(s.old.payments), i ? '' : f3(s.old.balance), n ? n.cur : '—', n ? f3(n.charged.total) : '—', n ? f3(n.receivedTotal) : '—', n ? f3(n.allocatedPayments) : '—', n ? f3(n.unallocatedPayments) : '—', n ? f3(n.refunds) : '—', n ? f3(n.credits) : '—', n ? f3(n.balance) : '—', i ? '' : f3(s.difference), i ? '' : s.class])));
  rec.students.filter(s => s.class !== 'matches').forEach(s => o.push(`- **${s.id} ${s.name}** — ${s.class}: ${s.cause}`)); o.push('');
  const over = rec.students.flatMap(s => s.new.filter(n => n.overpaid).map(n => `${s.id} ${s.name} (${n.cur} ${f3(-n.balance)})`)); o.push(`Over-paid students (credit held for the student): ${over.join('; ') || 'none'}.`, '');
  o.push(`Student payments: ${rec.summary.paymentsByStudent.count}; none has an allocation yet (nothing was assigned automatically) — the full list is the "Unallocated" column above.`, '');
  h(2, '4. Projects'); tbl(['Project', 'Status', 'Cur', 'Agreed', 'Opening', 'Dated payments', 'Received', 'Refunded', 'Credited', 'Retained', 'Unresolved', 'Outstanding', 'Teacher share', 'Academy share', 'Class'],
    rec.projects.map(p => [`${p.id} ${p.name}`, p.status, p.cur, f3(p.agreed), f3(p.opening), f3(p.datedPayments), f3(p.received), f3(p.refunded), f3(p.credited), f3(p.retained), f3(p.unresolved), f3(p.outstanding), f3(p.teacherShare), f3(p.academyShare), p.class]));
  h(2, '5. Recorded courses'); tbl(['Course', 'Cur', 'Price', 'Declared n', 'Enrolments', 'Expected (price×n)', 'Charged to students', 'Collected', 'of which opening (undated)', 'of which dated', 'Instructor share', 'Academy share', 'Class'],
    rec.courses.map(c => [`${c.id} ${c.name}`, c.cur, f3(c.price), c.declaredCount, c.enrolments, f3(c.expected), f3(c.enrolmentCharges), f3(c.collected), f3(c.opening), f3(c.datedPayments), f3(c.instructorShare), f3(c.academyShare), c.class]));
  rec.courses.filter(c => c.cause).forEach(c => o.push(`- **${c.id} ${c.name}** — ${c.cause}`)); o.push('');
  h(2, '6. Exchange-rate reconciliation'); const F = rec.fx;
  tbl(['Status', 'Count', 'Meaning'], [['stored', F.counts.stored, 'payment carries its own rate and base amount'], ['identity', F.counts.identity, 'payment currency = base currency: rate 1 by definition, nothing looked up or copied'], ['derived', F.counts.derived, 'only for payments entered after the update in a foreign currency: parent saved rate at entry, frozen, flagged as an estimate'], ['missing', F.counts.missing, 'no usable rate; never guessed'], ['corrected', F.counts.corrected, 'changed by an audited manual correction'], ['undated opening amounts', F.counts.undatedOpening, 'paid amounts with no payment date (labelled opening balances)']]);
  o.push(`Project payments that converted at the parent project's CURRENT rate before migration 003 (now each carries its own frozen rate or is marked missing): ${F.usedParentRateDynamically.length ? F.usedParentRateDynamically.map(x => `project payment ${x.id} (project ${x.project}, ${f3(x.amt)} ${x.cur} @ ${x.rate})`).join('; ') : 'none'}.`);
  o.push(`Displayed project-paid values that change under the new calculation today: ${F.displayedValueChanges.length ? JSON.stringify(F.displayedValueChanges) : 'none (frozen values equal what was displayed; they would only have diverged if a project rate were edited later)'}.`, '');
  if (F.missing.length) { o.push('Missing historical FX:'); F.missing.forEach(x => o.push(`- ${x.kind} ${x.id} ${x.date || ''} ${f3(x.amt)} ${x.cur || ''}`)); o.push(''); }
  o.push('Undated opening amounts (kept as opening balances, never placed on a date):'); F.undatedOpening.forEach(x => o.push(`- ${x.kind} ${x.id}: ${f3(x.amt)} ${x.cur || ''}${x.student ? ' (student ' + x.student + ', enrolment date ' + (x.enrolmentDate || 'n/a') + ')' : ''}`)); o.push('');
  h(2, '7. Source row counts (unchanged by this run)'); tbl(['Table', 'Rows'], Object.entries(meta.sourceCounts).map(([k, v]) => [k, v]));
  return o.join('\n');
}
module.exports = { run, md };
if (require.main === module) {
  const [src, dir = path.join(__dirname, '..', 'reports'), label] = process.argv.slice(2); if (!src) { console.error('usage: node tools/reconcile.js <database-or-backup.sqlite> [reports-dir] [label]'); process.exit(2); }
  const day = process.env.REPORT_DATE || new Date().toISOString().slice(0, 10), r = run(path.resolve(src), dir, label); fs.mkdirSync(dir, { recursive: true });
  const mdFile = unique(dir, `phase-2-financial-reconciliation-${day}.md`), jsFile = unique(dir, `phase-2-financial-reconciliation-${day}.json`);
  fs.writeFileSync(mdFile, md(r, day)); fs.writeFileSync(jsFile, JSON.stringify(r, null, 1));
  console.log('written', mdFile); console.log('written', jsFile); console.log(JSON.stringify(r.rec.summary));
}
