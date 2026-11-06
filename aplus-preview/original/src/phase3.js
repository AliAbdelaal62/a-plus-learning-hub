'use strict';
// Phase 3 server rules used by applySave: subject references (M7), university spelling (L1), duplicate payments (M9), linked-lesson protection (B), rate labels (M5).
const rates = require('./rates');
const norm = s => String(s || '').toLowerCase().replace(/[.,'’"()\-_/]+/g, ' ').replace(/\s+/g, ' ').trim();

// M7: timetable entries carry a real subject reference; the text column is always the subject's current name. Only new / changed rows are touched.
function normaliseTimetable(A, old) {
  const problems = [], was = new Map((old.tt || []).map(r => [r.id, r]));
  const subs = [...A.keep.sub.values()], byName = new Map();
  subs.forEach(z => { const k = norm(z.name); byName.set(k, (byName.get(k) || []).concat(z)); });
  for (const [id, row] of A.keep.tt) {
    const w = was.get(id);
    // the text follows the referenced subject ONLY when that subject was renamed in this save, or the row itself is new / changed. An untouched row is never rewritten (AUD2-011).
    if (row.subj && A.keep.sub.get(row.subj) && row.sub !== A.keep.sub.get(row.subj).name) {
      const oldSub = (old.sub || []).find(z => z.id === row.subj), renamed = oldSub && oldSub.name !== A.keep.sub.get(row.subj).name, touched = !w || (w.sub ?? '') !== (row.sub ?? '') || (w.subj ?? 0) !== (row.subj ?? 0);
      if (renamed || touched) { row.sub = A.keep.sub.get(row.subj).name; continue; }
      continue;
    }
    if (w && (w.sub ?? '') === (row.sub ?? '') && (w.subj ?? 0) === (row.subj ?? 0)) continue; // untouched legacy rows are preserved exactly
    if (row.subj) { const z = A.keep.sub.get(row.subj); if (!z) { problems.push(`timetable ${id}: subject reference ${row.subj} does not exist`); continue; } row.sub = z.name; continue; }
    if (!row.sub) continue;
    const m = byName.get(norm(row.sub)) || [];
    if (m.length === 1) { row.subj = m[0].id; row.sub = m[0].name; }
    else problems.push(`timetable ${id}: subject "${String(row.sub).slice(0, 60)}" is ${m.length ? 'ambiguous' : 'not in the subject list'}; choose a subject from the list`);
  }
  return problems;
}

// L1: a new or edited record whose university differs from an existing one only by case / spacing / punctuation gets the existing spelling. Existing records are never rewritten.
function normaliseUniversities(A, old) {
  const count = new Map(); // normalised -> Map(spelling -> n)
  const add = v => { if (!v) return; const k = norm(v); if (!k) return; const m = count.get(k) || new Map(); m.set(v, (m.get(v) || 0) + 1); count.set(k, m); };
  for (const k of ['s', 'sub', 'pr', 'rc']) (old[k] || []).forEach(r => add(r.uni));
  const best = k => { const m = count.get(k); if (!m) return null; return [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0]; };
  const changed = [];
  for (const k of ['s', 'sub', 'pr', 'rc']) { const was = new Map((old[k] || []).map(r => [r.id, r]));
    for (const [id, row] of A.keep[k]) { if (!row.uni) continue; const w = was.get(id); if (w && w.uni === row.uni) continue; const canon = best(norm(row.uni)); if (canon && canon !== row.uni) { changed.push({ k, id, from: row.uni, to: canon }); row.uni = canon; } } }
  return changed;
}

// M9: the same payment (owner, date, amount, currency) entered twice needs a typed reason. Same-save duplicates count too.
function duplicatePayments(A, old) {
  const need = [], key = {
    sp: r => ['sp', r.p, r.date, r.amt, r.cur], tp: r => ['tp', r.p, r.date, r.amt, r.cur], pp: r => ['pp', r.pr, r.date || '', r.amt], cp: r => ['cp', r.re, r.date, r.amt] };
  for (const k of Object.keys(key)) {
    const seen = new Map(); (old[k] || []).forEach(r => seen.set(JSON.stringify(key[k](r)), r.id));
    const was = new Set((old[k] || []).map(r => r.id));
    for (const [id, row] of A.keep[k]) { if (was.has(id)) continue; const kk = JSON.stringify(key[k](row)); if (seen.has(kk)) need.push({ k, id, label: 'possible DUPLICATE payment - an identical one (same person, date and amount) already exists (#' + seen.get(kk) + ')' }); else seen.set(kk, id); }
  }
  return need;
}

// B: changing who / when / what a linked lesson is changes attendance and money history; it needs a reason. Same for removing a student or changing the subject of a timetable session that already has lessons.
function linkedEdits(A, old, upd) {
  const need = [], wasL = new Map((old.l || []).map(r => [r.id, r]));
  for (const id of upd.l || []) { const w = wasL.get(id), n = A.keep.l.get(id); if (!w || !w.tt) continue; if (['s', 'date', 'sub', 't', 'od', 'tt'].some(f => (w[f] ?? null) !== (n[f] ?? null))) need.push({ k: 'l', id, label: 'change of student / date / subject of a lesson recorded from the timetable' }); }
  const wasT = new Map((old.tt || []).map(r => [r.id, r]));
  for (const id of upd.tt || []) { const w = wasT.get(id), n = A.keep.tt.get(id); const linked = (old.l || []).filter(l => l.tt === id); if (!linked.length) continue;
    const dropped = (w.s || []).filter(s => !(n.s || []).includes(s) && linked.some(l => l.s === s));
    if (dropped.length || (w.subj ?? null) !== (n.subj ?? null) || (!w.subj && !n.subj && (w.sub ?? '') !== (n.sub ?? ''))) need.push({ k: 'tt', id, label: 'change of subject / students of a timetable session that already has recorded lessons' }); }
  return need;
}

// B: an excess payment is legitimate (advance / credit) but must be confirmed explicitly with a typed reason. Only NEW or CHANGED teacher payments that make a currency balance MORE negative are listed.
function overpayments(A, old, ins, upd, state, forState) {
  const need = [], ids = [...(ins.tp || []), ...(upd.tp || [])]; if (!ids.length) return need;
  const Ln = forState(state), Lo = forState(old), key = (r) => r.t + '|' + r.cur, bal = (L, st) => { const m = {}; L.teacherRows(st).forEach(r => { m[key(r)] = r.remaining.total; }); return m; };
  const after = bal(Ln, state), before = bal(Lo, old), seen = new Set();
  for (const id of ids) { const p = A.keep.tp.get(id); if (!p) continue; const k = p.p + '|' + (p.cur || '—'), a = after[k] ?? 0, b = before[k] ?? 0;
    if (a < 0 && a < Math.min(0, b) && !seen.has(k)) { seen.add(k); need.push({ k: 'tp', id, label: `EXCESS payment - after this payment the teacher would be over-paid by ${(-a / 1000).toFixed(3)} ${p.cur || ''} (advance / credit). Confirm with a reason if this is an advance.` }); } }
  return need;
}
// M5: a rate may be labelled 'Live' only if it carries a recent timestamp.
function rateLabelProblems(newRates, oldRates, now, hours) {
  const p = [];
  for (const [code, r] of Object.entries(newRates || {})) { const was = (oldRates || {})[code]; if (r.type !== 'Live') continue; if (was && was.r === r.r && was.t === r.t && was.type === r.type) continue; // unchanged legacy label is left alone
    const t = r.t ? Date.parse(r.t) : NaN; if (!Number.isFinite(t) || Math.abs(Date.parse(now) - t) > 36e5 * (hours || rates.STALE_HOURS)) p.push(`rate ${String(code).slice(0, 5)}: labelled Live but not refreshed recently - save it as Manual or refresh it first`); }
  return p;
}
module.exports = { overpayments, normaliseTimetable, normaliseUniversities, duplicatePayments, linkedEdits, rateLabelProblems, norm };
