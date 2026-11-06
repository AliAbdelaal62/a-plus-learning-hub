'use strict';
// Migration approval gate + 21-item dry-run report. Synthetic data only; the real database is never referenced.
const assert = require('node:assert/strict'); const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'); const { spawnSync } = require('child_process');
const base = require('../fixtures/synthetic-v5.json'); const J = x => JSON.parse(JSON.stringify(x)); let n = 0; const ok = () => n++;
const root = path.join(__dirname, '..'), cli = path.join(root, 'scripts', 'migrate-legacy.js');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'aplus-gate-')), rdir = path.join(work, 'reports'), dbf = path.join(work, 'data', 'aplus.sqlite');
const run = (file, extra = []) => spawnSync(process.execPath, ['--no-warnings', cli, file, ...extra], { env: { ...process.env, APLUS_DB: dbf, APLUS_REPORT_DIR: rdir }, encoding: 'utf8' });
const wipe = () => { fs.rmSync(path.dirname(dbf), { recursive: true, force: true }); fs.rmSync(path.join(work, 'backups'), { recursive: true, force: true }); }; // simulates a genuinely new install
const put = (name, d) => { const p = path.join(work, name); fs.writeFileSync(p, JSON.stringify(d)); return p; };
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const latest = () => JSON.parse(fs.readFileSync(path.join(rdir, fs.readdirSync(rdir).filter(x => /dryrun.*\.json$/.test(x)).sort().pop()), 'utf8'));
const good = put('good.json', base), code = sha(good).slice(0, 12);
// 1. dry run: exit 0, writes only reports, creates NO database, reports all 21 items
let r = run(good); assert.equal(r.status, 0, r.stderr + r.stdout); assert.ok(!fs.existsSync(path.dirname(dbf)), 'dry run must not even create the data folder'); ok();
let R = latest(); const keys = Object.keys(R.items); assert.equal(keys.length, 21, keys.join()); for (let i = 1; i <= 21; i++) assert.ok(keys.some(k => k.startsWith(i + '_')), 'item ' + i); ok();
assert.equal(R.items['1_source'].file, 'good.json'); assert.equal(R.items['2_legacySchemaVersion'].version, 5); assert.equal(R.items['21_preservesAllSupportedInformationExactly'].answer, 'YES'); ok();
assert.doesNotMatch(r.stdout, new RegExp('--approve=' + code), 'the report must not hand over a ready-made approval command'); ok();
// 2. apply refused without a code / with a wrong code, even though a dry run exists
for (const extra of [['--apply'], ['--apply', '--approve=000000000000'], ['--apply', '--approve=' + code.toUpperCase() + 'x']]) { r = run(good, extra); assert.equal(r.status, 3, extra.join(' ')); assert.ok(!fs.existsSync(dbf)); } ok();
// 3. apply refused when no dry run exists for THAT file (a different file with the right code for itself)
const other = put('other.json', Object.assign(J(base), { set: { ...base.set, name: 'DEV other' } })); r = run(other, ['--apply', '--approve=' + sha(other).slice(0, 12)]); assert.equal(r.status, 3); assert.match(r.stderr, /No successful dry-run report/); assert.ok(!fs.existsSync(dbf)); ok();
// 4. editing the file after the dry run invalidates the approval
fs.writeFileSync(good, JSON.stringify({ ...base, id: base.id + 1 })); r = run(good, ['--apply', '--approve=' + sha(good).slice(0, 12)]); assert.equal(r.status, 3); assert.ok(!fs.existsSync(dbf)); fs.writeFileSync(good, JSON.stringify(base)); ok();
// 5. dry run + typed code -> imports; second run is idempotent; a different file is refused (target not empty)
r = run(good, ['--apply', '--approve=' + code]); assert.equal(r.status, 0, r.stderr + r.stdout); assert.ok(fs.existsSync(dbf)); ok();
r = run(good, ['--apply', '--approve=' + code]); assert.match(r.stdout, /ALREADY_APPLIED/); ok();
// a different file into a database that already holds data: the dry run itself now says it would be refused, so there is no successful report and apply is refused by the gate; the importer's own refusal is covered in migration-target.test.js
const dr2 = run(other); assert.equal(dr2.status, 1); assert.match(dr2.stdout, /REFUSED_TARGET_NOT_EMPTY/); r = run(other, ['--apply', '--approve=' + sha(other).slice(0, 12)]); assert.equal(r.status, 3); assert.match(r.stderr, /No successful dry-run report/); ok();
// 6. a dry run never alters an existing active database (bytes and mtime identical) and shows before/after
const before = sha(dbf), mt = fs.statSync(dbf).mtimeMs, sz = fs.readdirSync(path.dirname(dbf)).sort().join(); r = run(good); assert.equal(sha(dbf), before); assert.equal(fs.statSync(dbf).mtimeMs, mt); assert.equal(fs.readdirSync(path.dirname(dbf)).sort().join(), sz, 'no -wal/-shm left behind'); ok();
R = latest(); assert.equal(R.items['17_entityCountsBeforeAfter'].activeDatabase.l, base.l.length); assert.equal(R.items['17_entityCountsBeforeAfter'].afterImport.l, base.l.length); ok();
// 7. quarantine keeps the original, nothing is invented, discrepancies are surfaced
wipe(); fs.rmSync(rdir, { recursive: true, force: true });
const bad = J(base); bad.sp.push({ id: 9100, p: 424242, date: '2026-09-01', cur: 'KWD', amt: 5000, rx: 1, rt: 'Same', bamt: 5000, bc: 'KWD', meth: 'Cash', notes: '' }); bad.s.push({ id: 9101, name: 'DEV dup', status: 'Active' }); bad.s.push({ id: 9101, name: 'DEV dup2', status: 'Active' }); bad.s.push({ id: 9102, name: 'DEV odd', status: 'Weird' });
const egp = bad.l.find(l => l.tc === 'EGP' || l.sc === 'EGP'); if (egp) { egp.trx = 0; egp.srx = 0; } bad.sp.push({ id: 9103, p: bad.s[0].id, date: '2026-09-02', cur: 'EGP', amt: 1000000, bamt: 0, bc: 'KWD', meth: 'Cash', notes: '' });
const badf = put('bad.json', bad); r = run(badf); R = latest(); const I = R.items;
assert.ok(I['7_quarantined'].records >= 3); assert.ok(I['9_duplicateIds'].some(x => x.id === 9101)); assert.ok(I['10_missingOrInvalidReferences'].quarantinedRequiredLinks.some(x => x.id === 9100)); assert.ok(I['11_unknownStatusValues'].some(x => x.id === 9102)); ok();
assert.ok(I['12_missingHistoricalExchangeRates'].records >= 1); assert.ok(I['13_conversionsThatCannotBeVerified'].records >= 1); assert.equal(I['19_convertedTotals'].withheld, true, 'no converted figure when rates are missing'); ok();
assert.ok(I['20_unresolvedDiscrepancies'].length > 0); assert.equal(I['21_preservesAllSupportedInformationExactly'].answer, 'NO'); assert.equal(R.canProceed, true); ok();
const orig = I['18_totalsByOriginalCurrencyBeforeAfter']; assert.notDeepEqual(orig.wholeSourceFile, orig.afterImport, 'quarantine effect is visible in per-currency totals'); ok();
// apply the dirty file only with the full gate; quarantined rows are kept verbatim and no rate is invented
r = run(badf, ['--apply', '--approve=' + sha(badf).slice(0, 12)]); assert.ok([0].includes(r.status), r.stdout + r.stderr);
const { DatabaseSync } = require('node:sqlite'); const h = new DatabaseSync(dbf, { readOnly: true }); const q = h.prepare('SELECT legacy_id,reason,row_json FROM migration_quarantine WHERE entity=? AND legacy_id=?').get('sp', 9100); assert.ok(q && JSON.parse(q.row_json).p === 424242 && JSON.parse(q.row_json).amt === 5000); ok();
if (egp) { const row = h.prepare('SELECT trx,srx FROM lessons WHERE id=?').get(egp.id); assert.equal(row.trx, 0); assert.equal(row.srx, 0); } assert.equal(h.prepare("SELECT count(*) c FROM student_payments WHERE id=9103").get().c, 1); assert.equal(h.prepare('SELECT bamt FROM student_payments WHERE id=9103').get().bamt, 0, 'unknown value stays as saved, not recomputed'); h.close(); ok();
// 8. a rejected file (old version) cannot proceed and nothing is written
wipe(); const v4 = put('v4.json', { ...J(base), v: 4 }); r = run(v4); assert.equal(r.status, 1); R = latest(); assert.equal(R.canProceed, false); r = run(v4, ['--apply', '--approve=' + sha(v4).slice(0, 12)]); assert.equal(r.status, 3); assert.ok(!fs.existsSync(dbf)); ok();
// 9. Static invariant over ACTIVE code only (separator-independent, archival folders excluded):
//    (a) only the gated CLI can start a real import, (b) no launcher or other script passes --apply,
//    (c) the only other callers of the importer in apply mode are synthetic-only helpers that never reference the real database.
const SKIP_DIRS = new Set(['node_modules', 'data', 'backups', 'backups-synthetic', 'reports', 'production-reference', 'docs', 'tests', 'baselines', 'fixtures', 'spikes', 'dev']);
const skipDir = name => SKIP_DIRS.has(name) || name.startsWith('.') || name.startsWith('_backup') || /^aplus-sqlite/.test(name);
function activeFiles(dir, rel = '') { const out = []; for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) { const r = rel ? rel + '/' + e.name : e.name;
  if (e.isDirectory()) { if (!skipDir(e.name)) out.push(...activeFiles(dir, r)); } else if (/\.(cmd|bat|ps1|js|json)$/i.test(e.name)) out.push(r); } return out; }
// the walker itself: backup folders are skipped, active scripts are NOT, results use '/' on every OS
{ const t = path.join(work, 'tree'); for (const f of ['scripts/migrate-legacy.js', '_backup-before-x/scripts/migrate-legacy.js', 'node_modules/p/i.js', 'tools/a.cmd']) { fs.mkdirSync(path.dirname(path.join(t, f)), { recursive: true }); fs.writeFileSync(path.join(t, f), '--apply'); }
  assert.deepEqual(activeFiles(t).sort(), ['scripts/migrate-legacy.js', 'tools/a.cmd']); ok(); }
const active = activeFiles(root), txt = f => fs.readFileSync(path.join(root, f), 'utf8');
const mentionsApply = active.filter(f => /--apply/.test(txt(f)));
assert.deepEqual(mentionsApply.sort(), ['scripts/migrate-legacy.js', 'src/dryrun.js'], 'only the CLI (the gate) and the report text may mention --apply, found: ' + mentionsApply); ok();
assert.ok(!active.some(f => /\.(cmd|bat|ps1)$/i.test(f) && /--apply|--approve/.test(txt(f))), 'no launcher passes --apply/--approve'); ok();
assert.ok(!/child_process|spawn|exec/.test(txt('src/dryrun.js')), 'the report text cannot execute anything'); ok();
// real-import entry points = files that call the importer with mode apply
const applyCallers = active.filter(f => f.endsWith('.js') && /mode:\s*['"]apply['"]/.test(txt(f)) && f !== 'src/importer.js').sort();
assert.deepEqual(applyCallers, ['scripts/init-synthetic-db.js', 'scripts/migrate-legacy.js', 'scripts/start-operations-demo.js', 'tools/smoke.js'], 'unexpected importer apply-caller: ' + applyCallers); ok();
// The new demo importer has a fixed synthetic filename and accepts no external database path.
assert.match(txt('scripts/start-operations-demo.js'), /management-demo\.sqlite/);
assert.ok(!/APLUS_DB|process\.argv|_common|aplus\.sqlite/.test(txt('scripts/start-operations-demo.js')), 'operations demo must never select a real database or accept a target override'); ok();
assert.ok(!/aplus\.sqlite/.test(txt('scripts/init-synthetic-db.js').replace(/\/\/.*$/gm, '')), 'synthetic initialiser must not name the real database');
assert.ok(!/_common/.test(txt('tools/smoke.js')), 'smoke test does not use the real-path helper'); assert.match(txt('scripts/init-synthetic-db.js'), /synthetic\.sqlite/); ok();
// the CLI gate itself: every apply path is behind the report check AND the typed code (static order check), and --approve without --apply never imports
{ const c = txt('scripts/migrate-legacy.js'); const iApply = c.indexOf("mode: 'apply'"), iReport = c.indexOf('No successful dry-run report'), iCode = c.indexOf('approval code is missing'); assert.ok(iReport > 0 && iCode > 0 && iApply > iReport && iApply > iCode, 'importer apply call must come after both gate checks'); ok(); }
wipe(); r = run(good, ['--approve=' + code]); assert.equal(r.status, 0); assert.ok(!fs.existsSync(dbf), '--approve alone must stay a dry run'); ok();
fs.rmSync(work, { recursive: true, force: true });
console.log('MIGRATION GATE TEST OK: ' + n + ' checks (21-item dry-run report, dry run creates/changes no database, apply refused without a matching prior dry-run report and the typed code, edited file invalidates approval, idempotent re-run, non-empty target refused, quarantine keeps originals, no invented rates, converted totals withheld when rates are missing, old versions rejected, no launcher applies automatically).');
