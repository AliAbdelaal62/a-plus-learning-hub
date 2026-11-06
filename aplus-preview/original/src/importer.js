'use strict';
// Legacy (localStorage v5 JSON / v8 backup file) -> SQLite. Never repairs silently: rows that cannot be stored exactly are quarantined with a reason.
const crypto = require('crypto');
const { E, ENUMS, ORDER, NEWKEYS, SETTINGS_KEYS, OPT_FIELDS_NULL_IF_FALSY, structProblem } = require('./mapping');
const { open, migrate, tx } = require('./db');
const { assemble } = require('./state');
const fin = require('./finance');
const store = require('./store');
const { DEFAULT } = require('./defaults');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const isObj = x => x && typeof x === 'object' && !Array.isArray(x);

function unwrap(text) {
  let o; try { o = JSON.parse(text); } catch (e) { throw new Error('not valid JSON: ' + e.message); }
  if (isObj(o) && /hub-backup$/.test(o.format || '') && isObj(o.data)) return { data: o.data, wrapped: o.format };
  return { data: o, wrapped: null };
}

// JSON.parse silently keeps only the LAST of two identical keys in one object. That would lose data without a trace, so it is detected here.
function dupKeys(text) {
  let i = 0; const out = [], ws = () => { while (i < text.length && ' \t\r\n'.includes(text[i])) i++; };
  const str = () => { const s = i; i++; while (text[i] !== '"') { if (text[i] === '\\') i++; i++; } i++; return JSON.parse(text.slice(s, i)); };
  const val = p => { ws(); const c = text[i];
    if (c === '{') { i++; const seen = new Set(); ws(); if (text[i] === '}') { i++; return; } for (;;) { ws(); const k = str(); if (seen.has(k)) out.push(p + '.' + k); seen.add(k); ws(); i++; val(p + '.' + k); ws(); if (text[i] === ',') { i++; continue; } i++; return; } }
    else if (c === '[') { i++; ws(); if (text[i] === ']') { i++; return; } let n = 0; for (;;) { val(p + '[' + (n++) + ']'); ws(); if (text[i] === ',') { i++; continue; } i++; return; } }
    else if (c === '"') str(); else while (i < text.length && !',}] \t\r\n'.includes(text[i])) i++; };
  val('$'); return out;
}
function typeOk(t, v) { return t === 'i' ? Number.isInteger(v) : t === 'r' ? typeof v === 'number' && Number.isFinite(v) : t === 't' ? typeof v === 'string' : t === 'b' ? (v === 1 || v === true) : t === 'j' ? Array.isArray(v) : false; }

// Pure analysis: decides what is imported and what is quarantined. No database involved.
function analyse(data, opts = {}) {
  const rep = { counts: {}, quarantined: [], warnings: [], unknownFields: {}, errors: [] };
  if (!isObj(data)) { rep.errors.push('top level is not an object'); return { rep }; }
  for (const k of NEWKEYS) if (data[k] === undefined) data[k] = []; // lists introduced by migration 003 are optional in older exports
  if (data.v !== 5) rep.errors.push(`data version is ${data.v}; open the data once in the current v8 app so it upgrades to version 5, then export a backup`);
  for (const k of ORDER) if (!Array.isArray(data[k])) rep.errors.push(`"${k}" is missing or not a list`);
  if (!isObj(data.set) || !Array.isArray(data.cur) || !isObj(data.rates)) rep.errors.push('settings, currencies or rates are missing');
  if (isObj(data.set) && Array.isArray(data.cur)) {
    const codes = new Set(data.cur.filter(isObj).map(c => c.c));
    for (const [k, v] of Object.entries(data.set)) {
      if (typeof v !== 'string') { rep.errors.push(`setting "${k}" must be text, found ${typeof v}`); continue; }
      if (!SETTINGS_KEYS.includes(k)) rep.warnings.push(`setting "${k}" is not one this version knows; it is kept unchanged`);
      if ((k === 'tr' || k === 'sr') && v !== '' && !(Number.isFinite(+v) && +v >= 0)) rep.errors.push(`setting "${k}" is not a non-negative number: ${JSON.stringify(v)}`);
      if (k === 'base' && !codes.has(v)) rep.errors.push(`base currency "${v}" is not in the currency list`);
    }
  }
  if (rep.errors.length) return { rep };
  const keep = {}, bad = {}; // keep[k] = Map(id,row); bad[k] = Map(id,reason)
  const seenIds = new Map();
  for (const k of ORDER) { keep[k] = new Map(); bad[k] = new Map(); }
  const quarantine = (k, row, reason) => { const id = Number.isInteger(row && row.id) ? row.id : null; rep.quarantined.push({ entity: k, id, reason, row }); if (id != null) bad[k].set(id, reason); };
  // stage 1: shape, types, duplicate ids
  for (const k of ORDER) {
    const e = E[k]; rep.counts[k] = { read: data[k].length, imported: 0, quarantined: 0 };
    for (const row of data[k]) {
      if (!isObj(row)) { quarantine(k, row, 'record is not an object'); continue; }
      let why = null;
      for (const [c, spec] of Object.entries(e.cols)) {
        const t = spec[0], req = spec.endsWith('!'), v = row[c];
        if (v === undefined || v === null) { if (req) { why = `required field "${c}" is missing`; break; } continue; }
        if (!typeOk(t, v)) { why = `field "${c}" has unexpected type (${typeof v}: ${JSON.stringify(v).slice(0, 40)})`; break; }
      }
      if (!why) for (const [c, list] of Object.entries(ENUMS[k] || {})) if (row[c] != null && !list.includes(row[c])) { why = `field "${c}" has value "${row[c]}" which is not one of: ${list.join(', ')}`; break; }
      if (!why) why = structProblem(k, row);
      if (!why && seenIds.has(row.id)) why = `id ${row.id} is also used by ${seenIds.get(row.id)}`;
      if (!why && !(row.id > 0)) why = 'id must be a positive integer';
      if (why) { quarantine(k, row, why); continue; }
      seenIds.set(row.id, k); keep[k].set(row.id, row);
      const unk = Object.keys(row).filter(c => !store.isKnown(e, c));
      unk.forEach(c => { (rep.unknownFields[k] = rep.unknownFields[k] || {})[c] = (rep.unknownFields[k][c] || 0) + 1; });
    }
  }
  // stage 2: references. Mandatory missing -> quarantine (repeat until stable, so dependants follow their parent). Optional missing -> stored as empty and reported.
  const falsy = v => v === 0 || v === '' || v === null || v === undefined;
  let changed = true;
  while (changed) {
    changed = false;
    for (const k of ORDER) {
      const e = E[k];
      for (const [id, row] of [...keep[k]]) {
        for (const [c, [target, optional]] of Object.entries(e.refs || {})) {
          const v = row[c];
          if (optional && falsy(v)) continue;
          if (!keep[target].has(v)) {
            if (optional) { rep.warnings.push(`${k} ${id}: optional link "${c}" -> ${v} does not exist; stored empty`); row.__nullify = (row.__nullify || []).concat(c); continue; }
            keep[k].delete(id); quarantine(k, row, `required link "${c}" -> ${E[target].table} id ${v} does not exist${bad[target].has(v) ? ' (that record was quarantined: ' + bad[target].get(v) + ')' : ''}`); changed = true; break;
          }
        }
        if (!keep[k].has(id)) continue;
        for (const [lk, L] of Object.entries(e.links || {})) {
          if (row[lk] === undefined) continue;
          if (!Array.isArray(row[lk]) || row[lk].some(x => !Number.isInteger(x))) { keep[k].delete(id); quarantine(k, row, `"${lk}" is not a list of ids`); changed = true; break; }
          const miss = row[lk].filter(x => !keep[L.ref].has(x));
          if (miss.length) { rep.warnings.push(`${k} ${id}: "${lk}" lists ${miss.length} id(s) that do not exist (${miss.join(',')}); those links are not stored`); row.__dropLinks = { ...(row.__dropLinks || {}), [lk]: miss }; }
        }
      }
    }
  }
  // stage 2b (migration 003 bookkeeping): older exports have no payment-level rates. Opening balances are labelled, and project payments are 'identity' (base currency) or 'missing' (never copied from the parent's current rate).
  const k_ = (a, r) => Math.round(a * r);
  if (!opts.save) { // a save is stamped by the save endpoint instead (it must not label new money as an opening balance)
  for (const r of keep.sp.values()) if (r.fxs == null) r.fxs = r.rx > 0 && r.bamt != null && r.bc ? 'stored' : 'missing';
  for (const r of keep.tp.values()) if (r.fxs == null) r.fxs = r.rx > 0 && r.bamt != null && r.bc ? 'stored' : 'missing';
  for (const r of keep.re.values()) if (r.paid_open == null) r.paid_open = r.paid;
  // project payments never had a rate of their own: the parent's CURRENT rate is not copied. Same currency as the base -> identity (rate 1 by definition); otherwise missing (never guessed).
  const baseCur = (data.set && data.set.base) || 'KWD';
  for (const r of keep.pp.values()) if (r.fxs == null) { const p = keep.pr.get(r.pr); r.cur = p.cur; if (p.cur === baseCur) { r.rx = 1; r.bc = baseCur; r.bamt = r.amt; r.fxs = 'identity'; } else { delete r.rx; delete r.bc; delete r.bamt; r.fxs = 'missing'; } }
  }
  // stage 3: currencies, rates, reminder completions
  const codes = new Set(); const cur = [];
  for (const c of data.cur) { if (isObj(c) && typeof c.c === 'string' && /^[A-Za-z]{3}$/.test(c.c) && typeof c.n === 'string' && !/[<>"`]/.test(c.n) && !codes.has(c.c)) { codes.add(c.c); cur.push(c); } else rep.warnings.push('currency entry skipped (invalid or duplicate): ' + JSON.stringify(c)); }
  const rates = {};
  for (const [code, r] of Object.entries(data.rates)) {
    if (isObj(r) && typeof r.r === 'number' && r.r > 0 && codes.has(code)) rates[code] = r;
    else { rep.quarantined.push({ entity: 'rates', id: null, reason: !codes.has(code) ? 'currency code is not in the currency list' : 'rate is not a positive number', row: { code, ...r } }); }
  }
  const rd = [];
  for (const key of Object.keys(isObj(data.rd) ? data.rd : {})) {
    const m = /^(\d+)\|(\d{4}-\d{2}-\d{2})$/.exec(key);
    if (m && keep.rm.has(+m[1])) rd.push([+m[1], m[2]]); else rep.quarantined.push({ entity: 'rd', id: null, reason: m ? `reminder ${m[1]} does not exist (or was quarantined)` : 'malformed completion key', row: { key } });
  }
  for (const k of ORDER) { rep.counts[k].imported = keep[k].size; rep.counts[k].quarantined = rep.counts[k].read - keep[k].size; }
  rep.counts.cur = { read: data.cur.length, imported: cur.length }; rep.counts.rates = { read: Object.keys(data.rates).length, imported: Object.keys(rates).length };
  rep.counts.rd = { read: Object.keys(data.rd || {}).length, imported: rd.length };
  return { rep, keep, cur, rates, rd };
}

const colVal = (t, v) => (v === undefined || v === null ? null : t === 'b' ? 1 : t === 'j' ? JSON.stringify(v) : v);
function writeAll(db, data, A) {
  const { keep, cur, rates, rd } = A; const now = new Date().toISOString();
  const ins = (table, cols) => db.prepare(`INSERT INTO ${table}(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`);
  const reg = db.prepare('INSERT INTO id_registry(id,kind) VALUES(?,?)');
  // register all ids first so ordering between tables never matters
  for (const k of ORDER) for (const id of keep[k].keys()) reg.run(id, E[k].kind);
  const setS = db.prepare('INSERT INTO settings(key,value) VALUES(?,?)');
  for (const [key, v] of Object.entries(data.set)) setS.run(key, JSON.stringify(v));
  const ci = db.prepare('INSERT INTO currencies(code,name,seq) VALUES(?,?,?)'); cur.forEach((c, i) => ci.run(c.c, c.n, i));
  const ri = db.prepare('INSERT INTO exchange_rates_current(code,rate,saved_at,rate_type) VALUES(?,?,?,?)'), hi0 = db.prepare('INSERT INTO exchange_rate_history(code,rate,saved_at,rate_type,recorded_at) SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM exchange_rate_history WHERE code=? AND rate=? AND saved_at IS ? AND rate_type IS ?)'), hi = { run: (c, r, t, y, n) => hi0.run(c, r, t, y, n, c, r, t, y) };
  for (const [code, r] of Object.entries(rates)) { ri.run(code, r.r, r.t ?? null, r.type ?? null); hi.run(code, r.r, r.t ?? null, r.type ?? null, now); }
  for (const k of ORDER) { let seq = 0; for (const row of keep[k].values()) store.insertRow(db, k, row, ++seq); }
  const rdi = db.prepare('INSERT INTO reminder_completions(reminder_id,date) VALUES(?,?)'); rd.forEach(([a, b]) => rdi.run(a, b));
  const ids = [...ORDER.flatMap(k => [...keep[k].keys()]), ...[...(A.quarIds || [])]]; const max = Math.max(0, ...ids, ...A.rep.quarantined.map(q => q.id || 0));
  let next = Number.isInteger(data.id) ? data.id : max + 1;
  if (next <= max) { A.rep.warnings.push(`legacy next-id counter (${data.id}) was not above the highest id (${max}); set to ${max + 1}`); next = max + 1; }
  const had = k => { const r = db.prepare('SELECT value FROM schema_meta WHERE key=?').get(k); return r ? +r.value : null; };
  const prevNext = had('next_id'), prevRev = had('rev'); if (prevNext != null && prevNext > next) next = prevNext;
  const meta = db.prepare('INSERT OR REPLACE INTO schema_meta(key,value) VALUES(?,?)'); meta.run('next_id', String(next)); meta.run('legacy_data_version', '5');
  if (prevRev != null) meta.run('rev', String(prevRev + 1)); // an already-open browser tab must reload before it can save
}

// Reconciliation: finance computed on the (legacy rows that were kept) must equal finance computed on what comes back out of SQLite.
function reconcile(data, A, db) {
  const kept = { ...data, rates: A.rates, cur: A.cur };
  for (const k of ORDER) kept[k] = data[k].filter(r => r && A.keep[k].get(r.id) === r);
  const expected = fin.fin(kept), got = fin.fin(assemble(db)), orig = fin.fin(data);
  const diffs = Object.keys(expected).filter(k => expected[k] !== got[k]);
  return { expected, fromDatabase: got, ofWholeLegacyFile: orig, matches: diffs.length === 0, differingTotals: diffs, effectOfQuarantineOnTotals: Object.fromEntries(Object.keys(orig).map(k => [k, orig[k] - expected[k]]).filter(([, v]) => v !== 0)) };
}

// ---- Target preflight: what may already be in the destination database, and what happens to it ----
// Rules (explicit, tested):
//  1. Any business record (teachers, students, lessons, payments, ...) in the target  -> REFUSED_TARGET_NOT_EMPTY.
//  2. Settings: absent in target -> created; equal to legacy -> unchanged; equal to the factory default (never edited) -> replaced by the legacy value;
//     anything else (edited by the user, and different from legacy) -> REFUSED_TARGET_CONFLICT. Nothing is guessed.
//  3. Currencies: every target currency must be a factory default or also be in the legacy list (same name); a currency the user added that legacy lacks is a conflict.
//  4. Current exchange rates: equal to legacy -> unchanged; auto-fetched ('Live') -> superseded by the legacy rate (the old row stays in exchange_rate_history);
//     any other differing rate (e.g. 'Manual') -> conflict.
//  5. Replaced values are written to audit_log (before_json) in the same transaction. exchange_rate_history is never deleted.
const BUSINESS_TABLES = () => ORDER.map(k => E[k].table);
function planTarget(dst, data, A) {
  const cnt = {}; for (const t of BUSINESS_TABLES()) { const c = dst.prepare(`SELECT count(*) c FROM ${t}`).get().c; if (c) cnt[t] = c; }
  const reg = dst.prepare('SELECT count(*) c FROM id_registry').get().c; if (reg && !Object.keys(cnt).length) cnt.id_registry = reg; // ids that were used once are never reused, so they could collide
  if (Object.keys(cnt).length) return { refuse: 'REFUSED_TARGET_NOT_EMPTY', existingBusinessRows: cnt, conflicts: { settings: [], currencies: [], rates: [] }, hasSeed: true };
  const cur = assemble(dst), fac = DEFAULT(), stable = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(q => [q, x[q]])) : x));
  const conflicts = { settings: [], currencies: [], rates: [] };
  for (const k of Object.keys(cur.set || {})) { const tv = cur.set[k], lv = data.set[k], fv = fac.set[k]; if (tv !== lv && tv !== fv) conflicts.settings.push({ key: k, inTarget: tv, inLegacy: lv === undefined ? null : lv, factoryDefault: fv === undefined ? null : fv }); }
  const lcur = new Map(A.cur.map(c => [c.c, c.n])), fcur = new Map(fac.cur.map(c => [c.c, c.n]));
  for (const c of cur.cur) if (lcur.get(c.c) !== c.n && fcur.get(c.c) !== c.n) conflicts.currencies.push({ code: c.c, nameInTarget: c.n, nameInLegacy: lcur.has(c.c) ? lcur.get(c.c) : null });
  for (const [code, r] of Object.entries(cur.rates || {})) { const l = A.rates[code]; const same = l && l.r === r.r && (l.t ?? null) === (r.t ?? null) && (l.type ?? null) === (r.type ?? null); if (!same && r.type !== 'Live') conflicts.rates.push({ code, inTarget: r, inLegacy: l || null }); }
  const hasSeed = Object.keys(cur.set || {}).length > 0 || cur.cur.length > 0 || Object.keys(cur.rates || {}).length > 0;
  const bad = conflicts.settings.length + conflicts.currencies.length + conflicts.rates.length > 0;
  return { refuse: bad ? 'REFUSED_TARGET_CONFLICT' : null, conflicts, hasSeed, before: { set: cur.set, cur: cur.cur, rates: cur.rates } };
}
function replaceSeed(dst, plan, now) {
  if (!plan.hasSeed) return;
  dst.prepare('INSERT INTO audit_log(at,action,entity,entity_id,before_json,detail) VALUES(?,?,?,?,?,?)').run(now, 'import-replaced-seed', 'config', null, JSON.stringify(plan.before), 'settings, currency list and current rates of an app-seeded, business-empty database were replaced by the legacy values; exchange_rate_history kept');
  dst.exec('DELETE FROM settings'); dst.exec('DELETE FROM exchange_rates_current'); dst.exec('DELETE FROM currencies');
}

// mode 'dry-run' never touches the target file: it imports into memory and reports. mode 'apply' writes one transaction or nothing.
function migrate_(text, opts = {}) {
  const { mode = 'dry-run', target = null } = opts;
  const src = unwrap(text), srcSha = sha(text);
  const A = analyse(src.data); const rep = A.rep; { const dk = dupKeys(text); if (dk.length) A.rep.errors.push(...dk.slice(0, 20).map(p => `key repeated in the file: ${p} (JSON would silently keep only the last value)`)); } rep.mode = mode; rep.sourceSha256 = srcSha; rep.sourceFormat = src.wrapped || 'raw legacy data object';
  if (rep.errors.length) { rep.status = 'REJECTED'; return rep; }
  const quarantinedAny = rep.quarantined.length > 0;
  const mem = open(':memory:'); migrate(mem);
  try { tx(mem, () => writeAll(mem, src.data, { ...A, rep })); } catch (e) { rep.status = 'FAILED'; rep.errors.push('internal write failed: ' + e.message); return rep; }
  rep.reconciliation = reconcile(src.data, A, mem);
  rep.integrity = { integrity_check: mem.prepare('PRAGMA integrity_check').get().integrity_check, foreign_key_violations: mem.prepare('PRAGMA foreign_key_check').all().length };
  // round trip: what comes out equals what went in (for kept rows)
  const out = assemble(mem), diff = roundTripDiff(src.data, out, A);
  rep.roundTrip = { identical: diff.length === 0, differences: diff.slice(0, 50), totalDifferences: diff.length };
  const good = rep.reconciliation.matches && rep.integrity.integrity_check === 'ok' && rep.integrity.foreign_key_violations === 0 && diff.length === 0;
  rep.status = !good ? 'FAILED_VERIFICATION' : quarantinedAny ? 'OK_WITH_QUARANTINE' : 'OK';
  if (mode !== 'apply' || !good) { mem.close(); if (mode === 'apply' && !good) rep.applied = false; return rep; }
  if (!target) throw new Error('target database path required for apply');
  const gd = require('./guard').inspect(target, opts.backupDir); // refuses a damaged, zero-byte or suspiciously missing target: nothing is created or replaced
  const dst = open(target); migrate(dst);
  try {
    if (gd.state === 'ok' && opts.backupDir && require('./db').hasData(dst)) { rep.preImportBackup = require('./backup').create({ db: dst, file: target, backupDir: opts.backupDir }, 'preimport').name; } // high-risk operation: back up first
    const have = dst.prepare("SELECT value FROM schema_meta WHERE key='imported_source_sha256'").get();
    if (have && have.value === srcSha) { rep.status = 'ALREADY_APPLIED'; rep.applied = false; return rep; }
    if (have) { rep.status = 'REFUSED_TARGET_NOT_EMPTY'; rep.applied = false; return rep; }
    const plan = planTarget(dst, src.data, A); rep.targetPreflight = { conflicts: plan.conflicts, existingBusinessRows: plan.existingBusinessRows || {}, willReplaceSeed: plan.hasSeed };
    if (plan.refuse) { rep.status = plan.refuse; rep.applied = false; return rep; }
    try { tx(dst, () => {
      replaceSeed(dst, plan, new Date().toISOString());
      writeAll(dst, src.data, { ...A, rep });
      const q = dst.prepare('INSERT INTO migration_quarantine(run_id,entity,legacy_id,reason,row_json) VALUES(?,?,?,?,?)');
      const run = dst.prepare('INSERT INTO migration_runs(started_at,mode,source_sha256,status,report_json) VALUES(?,?,?,?,?)').run(new Date().toISOString(), 'apply', srcSha, rep.status, JSON.stringify({ ...rep, quarantined: undefined }));
      rep.quarantined.forEach(r => q.run(run.lastInsertRowid, r.entity, r.id, r.reason, JSON.stringify(r.row)));
      dst.prepare("INSERT INTO schema_meta(key,value) VALUES('imported_source_sha256',?)").run(srcSha);
    }); } catch (e) { rep.status = 'FAILED_WRITE_ROLLED_BACK'; rep.applied = false; rep.errors.push(e.message); return rep; }
    rep.applied = true;
    const again = reconcile(src.data, A, dst); if (!again.matches) throw new Error('post-write reconciliation failed');
  } finally { dst.close(); mem.close(); }
  return rep;
}
// Compares kept legacy rows with what the database gives back. Documented, expected normalisations: optional links stored as 0/'' come back absent; empty ex{} is absent; flag value true -> 1.
function roundTripDiff(data, out, A) {
  const diffs = [], canon = (k, r) => { const o = JSON.parse(JSON.stringify(r)); delete o.__nullify; delete o.__dropLinks; for (const f of (OPT_FIELDS_NULL_IF_FALSY[k] || [])) if (o[f] === 0 || o[f] === '') delete o[f]; if (o.ex && !Object.keys(o.ex).length) delete o.ex;
    for (const [f, spec] of Object.entries(E[k].cols)) if (spec[0] === 'b' && o[f] === true) o[f] = 1; for (const f of (r.__nullify || [])) delete o[f]; for (const [lk, ids] of Object.entries(r.__dropLinks || {})) o[lk] = (o[lk] || []).filter(x => !ids.includes(x));
    if (k === 'tt' && o.ex) for (const x of Object.values(o.ex)) if (x && x.moved && typeof x.moved === 'object') { for (const q of Object.keys(x.moved)) if (x.moved[q] == null) delete x.moved[q]; } return o; };
  const stable = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(q => [q, x[q]])) : x));
  for (const k of ORDER) {
    const want = data[k].filter(r => r && A.keep[k].get(r.id) === r).map(r => canon(k, r)), got = out[k];
    if (want.length !== got.length) { diffs.push(`${k}: ${want.length} kept, ${got.length} returned`); continue; }
    want.forEach((w, i) => { if (stable(w) !== stable(got[i])) diffs.push(`${k} ${w.id}: ${stable(w).slice(0, 120)} != ${stable(got[i]).slice(0, 120)}`); });
  }
  const wantRd = Object.keys(data.rd || {}).filter(kk => { const m = /^(\d+)\|/.exec(kk); return m && A.keep.rm.has(+m[1]); }).sort(); if (stable(wantRd) !== stable(Object.keys(out.rd).sort())) diffs.push('rd differs');
  if (stable(data.set) !== stable(out.set)) diffs.push('settings differ'); if (stable(A.cur) !== stable(out.cur)) diffs.push('currencies differ');
  const rr = Object.fromEntries(Object.entries(A.rates).map(([c, r]) => [c, { r: r.r, ...(r.t != null ? { t: r.t } : {}), ...(r.type != null ? { type: r.type } : {}) }])); if (stable(rr) !== stable(out.rates)) diffs.push('rates differ');
  return diffs;
}
module.exports = { migrate: migrate_, analyse, unwrap, sha, roundTripDiff, planTarget, dupKeys };
