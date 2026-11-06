'use strict';
// Row-level writes shared by the importer and the save endpoint. All callers run inside a transaction.
const { E, ORDER, OPT_FIELDS_NULL_IF_FALSY } = require('./mapping');
const isObj = x => x && typeof x === 'object' && !Array.isArray(x);
const colVal = (t, v) => (v === undefined || v === null ? null : t === 'b' ? 1 : t === 'j' ? JSON.stringify(v) : v);
const SKIP = new Set(['__nullify', '__dropLinks']);
const isKnown = (e, c) => c in e.cols || (e.links && c in e.links) || (e.special === 'ex' && c === 'ex') || SKIP.has(c);
const cache = new WeakMap();
function stmt(db, sql) { let m = cache.get(db); if (!m) cache.set(db, m = new Map()); let s = m.get(sql); if (!s) m.set(sql, s = db.prepare(sql)); return s; }

function values(k, row) {
  const e = E[k], nul = new Set(row.__nullify || []), nf = OPT_FIELDS_NULL_IF_FALSY[k] || [];
  const vals = Object.keys(e.cols).map(c => (nul.has(c) || (nf.includes(c) && (row[c] === 0 || row[c] === ''))) ? null : colVal(e.cols[c][0], row[c]));
  const extra = {}; Object.keys(row).forEach(c => { if (!isKnown(e, c)) extra[c] = row[c]; });
  return { vals, extra: Object.keys(extra).length ? JSON.stringify(extra) : null };
}
function writeSides(db, k, row) {
  const e = E[k];
  for (const [lk, L] of Object.entries(e.links || {})) {
    stmt(db, `DELETE FROM ${L.table} WHERE ${L.owner}=?`).run(row.id);
    if (!Array.isArray(row[lk])) continue; const drop = new Set((row.__dropLinks || {})[lk] || []); let pos = 0;
    row[lk].filter(x => !drop.has(x)).forEach(x => stmt(db, `INSERT OR IGNORE INTO ${L.table}(${L.owner},${L.other},pos) VALUES(?,?,?)`).run(row.id, x, pos++));
  }
  if (e.special === 'ex') {
    stmt(db, 'DELETE FROM timetable_occurrences WHERE tt=?').run(row.id);
    if (isObj(row.ex)) for (const [od, x] of Object.entries(row.ex)) {
      const o = isObj(x) ? x : {}, ex2 = {}; Object.keys(o).forEach(c => { if (!['done', 'cancelled', 'skipped', 'deleted', 'moved', 'hist'].includes(c)) ex2[c] = o[c]; });
      stmt(db, 'INSERT INTO timetable_occurrences(tt,od,done,cancelled,skipped,deleted,moved_date,moved_st,moved_en,hist,extra_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        .run(row.id, od, o.done ? 1 : null, o.cancelled ? 1 : null, o.skipped ? 1 : null, o.deleted ? 1 : null, o.moved ? o.moved.date ?? null : null, o.moved ? o.moved.st ?? null : null, o.moved ? o.moved.en ?? null : null, o.hist ?? null, Object.keys(ex2).length ? JSON.stringify(ex2) : null);
    }
  }
}
function insertRow(db, k, row, seq) {
  const e = E[k], cols = Object.keys(e.cols), { vals, extra } = values(k, row);
  stmt(db, `INSERT INTO ${e.table}(seq,${cols.join(',')},extra_json) VALUES(${['?', ...cols.map(() => '?'), '?'].join(',')})`).run(seq, ...vals, extra);
  writeSides(db, k, row);
}
function updateRow(db, k, row) {
  const e = E[k], cols = Object.keys(e.cols).filter(c => c !== 'id'), { vals, extra } = values(k, row);
  const all = Object.keys(e.cols), idv = vals[all.indexOf('id')], rest = all.map((c, i) => [c, vals[i]]).filter(([c]) => c !== 'id');
  stmt(db, `UPDATE ${e.table} SET ${cols.map(c => c + '=?').join(',')},extra_json=? WHERE id=?`).run(...rest.map(x => x[1]), extra, idv);
  writeSides(db, k, row);
}
function deleteRow(db, k, id) { const e = E[k]; for (const L of Object.values(e.links || {})) stmt(db, `DELETE FROM ${L.table} WHERE ${L.owner}=?`).run(id); if (e.special === 'ex') stmt(db, 'DELETE FROM timetable_occurrences WHERE tt=?').run(id); stmt(db, `DELETE FROM ${e.table} WHERE id=?`).run(id); }
const nextSeq = (db, k) => stmt(db, `SELECT COALESCE(MAX(seq),0)+1 s FROM ${E[k].table}`).get().s;
module.exports = { insertRow, updateRow, deleteRow, nextSeq, isKnown, stmt };
