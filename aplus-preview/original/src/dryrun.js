'use strict';
// The 21-item dry-run report required before ANY real import. Pure reading: it never writes to the active database.
const fs = require('fs'), os = require('os'), path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { analyse, unwrap, sha, migrate, planTarget } = require('./importer');
const { ORDER } = require('./mapping');
const { open, migrate: mig } = require('./db');
const { assemble } = require('./state');
const f = require('./finance');
const { makeOrig } = require('./orig');

const bump = (o, c, k, v) => { const r = o[c || '—'] || (o[c || '—'] = {}); r[k] = (r[k] || 0) + v; };
function totalsOf(d) {
  const o = makeOrig({ O: f.O, pj: p => f.pj(d, p), rcc: f.rcc }), W = o.work(f.all(d)).byCurrency, T = JSON.parse(JSON.stringify(W));
  const pr = new Map((d.pr || []).map(p => [p.id, p])), rc = new Map((d.rc || []).map(c => [c.id, c]));
  (d.sp || []).forEach(p => bump(T, p.cur, 'studentPaymentsReceived', p.amt));
  (d.tp || []).forEach(p => bump(T, p.cur, 'teacherPaymentsMade', p.amt));
  (d.pp || []).forEach(p => { const q = pr.get(p.pr); if (q) bump(T, q.cur, 'projectPaymentsReceived', p.amt); });
  (d.pr || []).forEach(p => { if (p.paid0) bump(T, p.cur, 'projectOpeningPaid_undated', p.paid0); });
  (d.re || []).forEach(e => { const c = rc.get(e.rc); if (c && e.paid) bump(T, c.cur, 'courseEnrolmentPaid_undated', e.paid); });
  return T;
}
function counts(d) { return Object.fromEntries(ORDER.map(k => [k, (d[k] || []).length])); }
function readActive(dbFile, planFn) {
  if (!dbFile || !fs.existsSync(dbFile) || fs.statSync(dbFile).size === 0) return { exists: false, counts: Object.fromEntries(ORDER.map(k => [k, 0])), totals: {} };
  // Work on a throw-away COPY (database + any -wal), so the active files are only read, never opened by SQLite: no -shm/-wal side files, no mtime change.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aplus-dry-')); let h;
  try { const cp = path.join(tmp, 'copy.sqlite'); fs.copyFileSync(dbFile, cp); if (fs.existsSync(dbFile + '-wal')) fs.copyFileSync(dbFile + '-wal', cp + '-wal');
    h = new DatabaseSync(cp); const st = assemble(h); const r = { exists: true, counts: counts(st), totals: totalsOf(st), plan: planFn ? planFn(h) : null }; h.close(); return r; }
  catch (e) { try { h && h.close(); } catch (_) {} return { exists: true, unreadable: String(e.message), counts: null, totals: null }; }
  finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

function build(text, { sourceName = '(unnamed)', activeDb = null } = {}) {
  const { data } = unwrap(text), srcSha = sha(text);
  const rep = migrate(text, { mode: 'dry-run' });               // verified in-memory import; touches no file
  const R = { items: {}, sourceSha256: srcSha, approvalCode: srcSha.slice(0, 12), importerStatus: rep.status };
  const A = analyse(JSON.parse(JSON.stringify(unwrap(text).data)));
  const base = (data.set && data.set.base) || '';
  const I = R.items;
  I['1_source'] = { file: sourceName, sha256: srcSha, validationStatus: rep.status, format: rep.sourceFormat, errors: rep.errors };
  I['2_legacySchemaVersion'] = { version: data.v, supported: data.v === 5 };
  if (rep.status === 'REJECTED' || !A.keep) { I['8_rejected'] = { fileRejected: true, reasons: rep.errors }; R.canProceed = false; R.verdict = 'The file was REJECTED; nothing can be imported from it.'; return R; }
  I['3_totalsByEntity'] = Object.fromEntries(ORDER.map(k => [k, rep.counts[k].read]));
  // classify every kept row: exact / transformed / has-extra-fields
  let exact = 0, transformed = [], extra = 0;
  for (const k of ORDER) for (const row of A.keep[k].values()) {
    const t = []; if (row.__nullify) t.push(`optional link(s) ${row.__nullify.join(',')} stored empty`); if (row.__dropLinks) t.push(`list link(s) ${Object.keys(row.__dropLinks).join(',')} lost missing ids`);
    if (t.length) transformed.push({ entity: k, id: row.id, changes: t }); else exact++;
  }
  Object.values(rep.unknownFields).forEach(m => Object.values(m).forEach(n => { extra += n; }));
  I['4_eligibleForExactImport'] = { records: exact };
  I['5_optionalFieldsPreservedSafely'] = { recordsWithUnknownFields: extra, where: 'extra_json (kept verbatim)', fields: rep.unknownFields };
  I['6_requiringTransformation'] = { records: transformed.length, list: transformed.slice(0, 200) };
  const q = rep.quarantined;
  I['7_quarantined'] = { records: q.length, list: q.map(x => ({ entity: x.entity, id: x.id, reason: x.reason })) };
  I['8_rejected'] = { fileRejected: false, rows: 0, note: 'Nothing is silently dropped: a row that cannot be stored exactly is quarantined (item 7) with its original JSON kept and the precise reason.' };
  I['9_duplicateIds'] = q.filter(x => /is also used by/.test(x.reason)).map(x => ({ entity: x.entity, id: x.id, reason: x.reason }));
  I['10_missingOrInvalidReferences'] = { quarantinedRequiredLinks: q.filter(x => /link/.test(x.reason)).map(x => ({ entity: x.entity, id: x.id, reason: x.reason })), optionalLinksStoredEmpty: rep.warnings.filter(w => /does not exist/.test(w)) };
  I['11_unknownStatusValues'] = q.filter(x => /not one of/.test(x.reason)).map(x => ({ entity: x.entity, id: x.id, reason: x.reason }));
  // rates
  const miss = [], unver = [], keepAll = k => [...A.keep[k].values()];
  const rateOk = (cur, rx) => cur === base || (typeof rx === 'number' && rx > 0);
  const chk = (entity, r, cur, rx, amt, bamt) => { if (cur === base) return; if (!rateOk(cur, rx)) { miss.push({ entity, id: r.id, currency: cur, reason: 'no saved rate on this record' }); unver.push({ entity, id: r.id, currency: cur, reason: 'no rate, so the base-currency value cannot be verified' }); }
    else if (bamt != null && f.k_(amt, rx) !== bamt) unver.push({ entity, id: r.id, currency: cur, reason: `stored base amount ${bamt} != amount ${amt} x saved rate ${rx} = ${f.k_(amt, rx)}` }); };
  keepAll('sp').forEach(r => chk('sp', r, r.cur, r.rx, r.amt, r.bamt)); keepAll('tp').forEach(r => chk('tp', r, r.cur, r.rx, r.amt, r.bamt));
  keepAll('pr').forEach(r => { if (r.cur !== base && !rateOk(r.cur, r.rx)) { miss.push({ entity: 'pr', id: r.id, currency: r.cur, reason: 'no saved rate' }); unver.push({ entity: 'pr', id: r.id, currency: r.cur, reason: 'project revenue cannot be valued' }); } });
  keepAll('rc').forEach(r => { if (r.cur !== base && !rateOk(r.cur, r.rx)) { miss.push({ entity: 'rc', id: r.id, currency: r.cur, reason: 'no saved rate' }); unver.push({ entity: 'rc', id: r.id, currency: r.cur, reason: 'course revenue cannot be valued' }); } });
  keepAll('l').forEach(l => { const o = f.O(l); if (l.st !== 'Completed') return; chk('l.cost', l, l.tc, l.trx, o.cost, l.bcost); chk('l.charge', l, l.sc, l.srx, o.chg, l.bchg); });
  I['12_missingHistoricalExchangeRates'] = { records: miss.length, list: miss.slice(0, 200), note: 'These are never filled in with today\'s rate or any invented value; they are listed so you can decide.' };
  I['13_conversionsThatCannotBeVerified'] = { records: unver.length, list: unver.slice(0, 200) };
  I['14_openingBalancesWithoutDates'] = { projects: keepAll('pr').filter(p => p.paid0 > 0).map(p => ({ id: p.id, currency: p.cur, amount: p.paid0 })), note: 'Reported separately, never shown as a dated receipt.' };
  const reAll = keepAll('re'); I['15_courseEnrolmentsWithoutPaymentHistory'] = { enrolments: reAll.length, withAmountPaidButNoHistory: reAll.filter(e => e.paid > 0).length, note: 'The legacy data stores one "paid so far" number per enrolment, with no dated payments. They are imported as an undated opening amount.' };
  I['16_projectPaymentsValuedFromParentRate'] = { payments: keepAll('pp').length, note: 'Project payments carry no rate of their own; they are valued with the project\'s saved rate.' };
  // before / after
  const act = readActive(activeDb, h => planTarget(h, data, A)); const kept = { ...data, rates: A.rates || data.rates, cur: A.cur || data.cur }; for (const k of ORDER) kept[k] = [...A.keep[k].values()].map(r => { const o = { ...r }; delete o.__nullify; delete o.__dropLinks; return o; });
  const pre = act.plan ? { wouldBeRefused: act.plan.refuse || null, existingBusinessRows: act.plan.existingBusinessRows || {}, conflicts: act.plan.conflicts, appSeededConfigThatWillBeReplaced: !!act.plan.hasSeed, previousConfigKeptIn: act.plan.hasSeed ? 'audit_log (before_json); exchange_rate_history is never deleted' : null, rules: 'see CUTOVER_PROCEDURE.md' } : { note: 'no active database yet (or it could not be read): nothing to conflict with' };
  I['17_entityCountsBeforeAfter'] = { targetPreflight: pre, activeDatabase: act.exists ? (act.unreadable ? 'could not be read read-only: ' + act.unreadable : act.counts) : 'no active database yet (empty)', afterImport: counts(kept), note: 'Import is refused unless the target is empty, so "after" = the imported rows.' };
  I['18_totalsByOriginalCurrencyBeforeAfter'] = { activeDatabase: act.exists ? act.totals : {}, wholeSourceFile: totalsOf(data), afterImport: totalsOf(kept), note: 'Amounts are integer thousandths of each currency; currencies are never added together.' };
  const defensible = miss.length === 0 && unver.length === 0;
  I['19_convertedTotals'] = defensible ? { basis: 'each record\'s own saved rate (never today\'s rate)', baseCurrency: base, totals: rep.reconciliation && rep.reconciliation.expected } : { withheld: true, reason: `${miss.length} record(s) have no saved rate and ${unver.length} conversion(s) cannot be verified, so no single converted figure is shown.` };
  const disc = []; if (rep.reconciliation && !rep.reconciliation.matches) disc.push('financial totals from SQLite differ from legacy rows: ' + rep.reconciliation.differingTotals.join(', '));
  if (rep.roundTrip && !rep.roundTrip.identical) disc.push(`round trip differs in ${rep.roundTrip.totalDifferences} place(s): ` + rep.roundTrip.differences.slice(0, 5).join(' ; '));
  if (rep.integrity && (rep.integrity.integrity_check !== 'ok' || rep.integrity.foreign_key_violations)) disc.push('database integrity/foreign-key check failed');
  if (q.length) disc.push(`${q.length} record(s) are quarantined; totals of the imported data are lower than the whole source by: ` + JSON.stringify(rep.reconciliation && rep.reconciliation.effectOfQuarantineOnTotals));
  if (unver.length) disc.push(`${unver.length} conversion(s) cannot be verified`); if (miss.length) disc.push(`${miss.length} record(s) lack a saved exchange rate`);
  I['20_unresolvedDiscrepancies'] = disc;
  const exactAll = rep.status === 'OK' && !transformed.length && rep.roundTrip && rep.roundTrip.identical && !q.length;
  I['21_preservesAllSupportedInformationExactly'] = { answer: exactAll ? 'YES' : 'NO', why: exactAll ? 'Every record imported unchanged and read back identical.' : [q.length && `${q.length} quarantined`, transformed.length && `${transformed.length} transformed`, rep.status !== 'OK' && 'status ' + rep.status].filter(Boolean).join('; ') };
  R.canProceed = ['OK', 'OK_WITH_QUARANTINE'].includes(rep.status) && !(act.plan && act.plan.refuse);
  if (act.plan && act.plan.refuse) disc.push('the existing target database would be refused: ' + act.plan.refuse);
  R.verdict = R.canProceed ? 'Dry run finished. NOTHING has been imported. A real import needs your separate explicit approval after you and the assistant have read this report.' : 'The dry run did not verify; do not import.';
  return R;
}

function markdown(R) {
  const I = R.items, L = [`# Migration dry-run report (21 items)`, '', `**${R.verdict}**`, '', `Importer status: \`${R.importerStatus}\` · Source SHA-256: \`${R.sourceSha256}\``, ''];
  const j = x => '```json\n' + JSON.stringify(x, null, 1) + '\n```';
  for (const [k, v] of Object.entries(I)) L.push(`## ${k.replace('_', '. ').replace(/([a-z])([A-Z])/g, '$1 $2')}`, '', j(v), '');
  L.push('---', 'This report is not permission to import. A real import requires: (1) your explicit written approval after reviewing this report, then (2) `--apply --approve=<first 12 characters of the source SHA-256 above>` run by you.', '');
  return L.join('\n');
}
module.exports = { build, markdown, totalsOf, readActive };
