'use strict';
// Usage:  node scripts/migrate-legacy.js <backup-or-data.json>
//            -> DRY RUN. Reads the file, verifies an import in memory, and writes ONLY reports\migration-dryrun-*.md/.json. The active database is opened read-only (or not at all).
//         node scripts/migrate-legacy.js <file> --apply --approve=<12 characters>
//            -> REAL IMPORT. Refused unless ALL of these hold:
//               1. a dry-run report for this exact file (same SHA-256) exists in reports\ and says the import verified,
//               2. you typed the approval code (first 12 characters of the SHA-256 in that report) yourself,
//               3. the target database is empty (the importer enforces this and runs everything in one transaction).
//         Nothing in this project ever runs --apply for you, and a successful dry run is not permission to import.
const fs = require('fs'), path = require('path'); const { root, dbFile, backupDir } = require('./_common');
const { migrate, sha } = require('../src/importer'); const dry = require('../src/dryrun');
const args = process.argv.slice(2), file = args.find(a => !a.startsWith('--')); const apply = args.includes('--apply'); const approve = (args.find(a => a.startsWith('--approve=')) || '').slice(10);
if (!file) { console.error('Give the path of a legacy backup / data file (JSON).'); process.exit(2); }
const text = fs.readFileSync(file, 'utf8'); const hash = sha(text); const rdir = process.env.APLUS_REPORT_DIR ? path.resolve(process.env.APLUS_REPORT_DIR) : path.join(root, 'reports');
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
if (!apply) {
  const R = dry.build(text, { sourceName: path.basename(file), activeDb: dbFile }); fs.mkdirSync(rdir, { recursive: true });
  const base = path.join(rdir, `migration-dryrun-${stamp}`); fs.writeFileSync(base + '.json', JSON.stringify(R, null, 1)); const md = dry.markdown(R); fs.writeFileSync(base + '.md', md);
  console.log(md); console.log('\nReport files: ' + base + '.md / .json\nDRY RUN: no database was created, opened for writing, or changed.\nNext step is YOURS: read the report, review it with the assistant, and only then decide whether to approve a real import.');
  process.exit(R.canProceed ? 0 : 1);
}
// ----- real import: gate -----
const reports = fs.existsSync(rdir) ? fs.readdirSync(rdir).filter(n => /^migration-dryrun-.*\.json$/.test(n)) : [];
const prior = reports.map(n => { try { return { n, r: JSON.parse(fs.readFileSync(path.join(rdir, n), 'utf8')) }; } catch (e) { return null; } }).filter(x => x && x.r.sourceSha256 === hash && x.r.canProceed);
if (!prior.length) { console.error('Refusing to write. No successful dry-run report exists for THIS file (SHA-256 ' + hash + ').\nRun the dry run first (migrate-dry-run.cmd), read the report, review it with the assistant, then ask for the import.'); process.exit(3); }
if (approve !== hash.slice(0, 12)) { console.error('Refusing to write. The approval code is missing or wrong. It is the first 12 characters of the source SHA-256 shown in the dry-run report; you must type it yourself, after reviewing the report.'); process.exit(3); }
if (fs.existsSync(dbFile) && fs.statSync(dbFile).size > 0) console.log('Target database already exists: ' + dbFile + ' (the importer refuses unless it is empty or already holds exactly this data).');
const rep = migrate(text, { mode: 'apply', target: dbFile, backupDir }); fs.mkdirSync(rdir, { recursive: true });
const base = path.join(rdir, `migration-apply-${stamp}`); fs.writeFileSync(base + '.json', JSON.stringify({ ...rep, dryRunReportUsed: prior.map(p => p.n) }, null, 1));
const L = ['# Migration APPLY report', '', `Status: **${rep.status}**`, `Source SHA-256: ${rep.sourceSha256}`, `Written: ${rep.applied ? 'yes -> ' + dbFile : 'NO, nothing was written'}`, `Dry-run report(s) that preceded this: ${prior.map(p => p.n).join(', ')}`, ''];
if (rep.errors.length) L.push('## Errors', ...rep.errors.map(e => '- ' + e), '');
if (rep.reconciliation) L.push(`Totals read back from SQLite equal the imported legacy rows: **${rep.reconciliation.matches}**`, '');
if (rep.quarantined.length) L.push('## Quarantined (original JSON kept in migration_quarantine)', ...rep.quarantined.map(q => `- ${q.entity} ${q.id ?? ''}: ${q.reason}`), '');
fs.writeFileSync(base + '.md', L.join('\n')); console.log(L.join('\n')); console.log('\nReport files: ' + base + '.md / .json');
process.exit(['OK', 'OK_WITH_QUARANTINE', 'ALREADY_APPLIED'].includes(rep.status) ? 0 : 1);
