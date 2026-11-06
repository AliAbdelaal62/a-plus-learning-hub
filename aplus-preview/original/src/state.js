'use strict';
// Builds the legacy-shaped state object ({v,id,set,cur,rates,t,s,sub,l,...,rd}) from the relational tables so the existing UI logic keeps working unchanged.
const { E, ORDER, STRUCT, NEWKEYS } = require('./mapping');
// L7 (read side): structured fields (codes, dates, times, enumerations) are interpolated into the page as-is by the legacy code, because valid values can never contain markup.
// If a stored value does not have the expected shape (damaged file, hand-edited database, old import), the page receives a harmless version of it. The database row is not touched.
const SAFE = v => String(v).replace(/[^A-Za-z0-9 _.:\/+\-]/g, '').slice(0, 40);
const CODE_RX = /^[A-Z]{3}$/;
function neutralize(st) {
  for (const [k, spec] of Object.entries(STRUCT)) for (const row of st[k] || []) for (const [f, rx] of Object.entries(spec)) { const v = row[f]; if (typeof v === 'string' && v !== '' && !rx.test(v)) row[f] = SAFE(v); }
  if (st.set && typeof st.set.base === 'string' && !CODE_RX.test(st.set.base)) st.set.base = SAFE(st.set.base);
  for (const c of st.cur || []) { if (typeof c.c === 'string' && !CODE_RX.test(c.c)) c.c = SAFE(c.c); }
  for (const r of Object.values(st.rates || {})) if (r && typeof r.type === 'string' && !/^[A-Za-z-]{1,20}$/.test(r.type)) r.type = SAFE(r.type);
  for (const code of Object.keys(st.rates || {})) if (!CODE_RX.test(code)) { st.rates[SAFE(code)] = st.rates[code]; delete st.rates[code]; }
  return st;
}
const parseCol = (t, v) => (t === 'j' ? JSON.parse(v) : v);
function assemble(db) {
  const st = {};
  const meta = Object.fromEntries(db.prepare('SELECT key,value FROM schema_meta').all().map(r => [r.key, r.value]));
  st.v = meta.legacy_data_version ? +meta.legacy_data_version : 5; st.id = meta.next_id ? +meta.next_id : 1;
  st.set = {}; db.prepare('SELECT key,value FROM settings').all().forEach(r => { st.set[r.key] = JSON.parse(r.value); });
  st.cur = db.prepare('SELECT code c,name n FROM currencies ORDER BY seq').all().map(r => ({ c: r.c, n: r.n }));
  st.rates = {}; db.prepare('SELECT code,rate,saved_at,rate_type FROM exchange_rates_current').all().forEach(r => { const o = { r: r.rate }; if (r.saved_at != null) o.t = r.saved_at; if (r.rate_type != null) o.type = r.rate_type; st.rates[r.code] = o; });
  for (const k of ORDER) {
    const e = E[k]; let rows; try { rows = db.prepare(`SELECT * FROM ${e.table} ORDER BY seq`).all(); } catch (err) { if (NEWKEYS.includes(k) && /no such table/.test(err.message)) { st[k] = []; continue; } throw err; } // a database from before migration 003 simply has none of the newer record types
    st[k] = rows.map(row => {
      const o = {};
      for (const [c, spec] of Object.entries(e.cols)) { const v = row[c]; if (v === null || v === undefined) continue; o[c] = parseCol(spec[0], v); }
      if (row.extra_json) Object.assign(o, JSON.parse(row.extra_json));
      if (row.archived_at && e.cols.status) { /* archived rows are reported through their status field */ }
      for (const [lk, L] of Object.entries(e.links || {})) {
        const arr = db.prepare(`SELECT ${L.other} v FROM ${L.table} WHERE ${L.owner}=? ORDER BY pos`).all(row.id).map(r => r.v);
        if (lk === 's' || e.table === 'subjects' && row.type === 'Live' || arr.length) o[lk] = arr;
      }
      return o;
    });
  }
  for (const e of st.tt) {
    if (e.sched !== 'rec') continue;
    const occ = db.prepare('SELECT * FROM timetable_occurrences WHERE tt=? ORDER BY od').all(e.id); if (!occ.length) continue;
    e.ex = {};
    for (const r of occ) {
      const x = r.extra_json ? JSON.parse(r.extra_json) : {};
      for (const f of ['done', 'cancelled', 'skipped', 'deleted']) if (r[f]) x[f] = 1;
      if (r.moved_date != null) { x.moved = { date: r.moved_date }; if (r.moved_st != null) x.moved.st = r.moved_st; if (r.moved_en != null) x.moved.en = r.moved_en; }
      if (r.hist != null) x.hist = r.hist; e.ex[r.od] = x;
    }
  }
  st.rd = {}; db.prepare('SELECT reminder_id,date FROM reminder_completions').all().forEach(r => { st.rd[r.reminder_id + '|' + r.date] = 1; });
  return st;
}
module.exports = { assemble, neutralize };
