'use strict';
// G: timetable integrity. READ-ONLY analysis over the legacy-shaped state (the same shape the page holds), plus the rule used when an occurrence is marked done.
// Nothing here invents or links a lesson: unambiguous relationships are only PROPOSED (the owner decides), ambiguous ones are listed.
const addD = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const dowN = iso => new Date(iso + 'T00:00:00Z').getUTCDay();
const live = e => (e.wt || 'Live') === 'Live';
const need = e => ((e.s || []).length ? e.s : [0]);
// the date/time an occurrence really takes place (a moved occurrence keeps its original key `od`)
const info = (e, od) => { if (e.sched !== 'rec') return { date: e.date, st: e.st, en: e.en }; const x = (e.ex || {})[od] || {}; return x.moved ? { date: x.moved.date, st: x.moved.st, en: x.moved.en } : { date: od, st: e.st, en: e.en }; };
// a lesson QUALIFIES for (entry, occurrence, student) only if it is linked to exactly that occurrence, is for that student, was taught by the scheduled teacher and took place on the occurrence's date.
// Cancelled / No Show lessons are linked records (they close the session) but never count as delivered; a lesson moved to another date or reassigned to another teacher/student does not qualify.
const linked = (db, e, od, s) => { const i = info(e, od); return (db.l || []).filter(l => l.tt === e.id && l.od === od && (s ? l.s === s : true) && (!e.t || l.t === e.t) && l.date === i.date); };
function coverage(db, e, od) {
  const n = need(e), per = n.map(s => ({ s, lessons: linked(db, e, od, s) })).map(x => ({ ...x, completed: x.lessons.some(l => l.st === 'Completed'), recorded: x.lessons.length > 0 }));
  const noStudent = n[0] === 0; const all = noStudent ? linked(db, e, od, 0) : null;
  if (noStudent) { const c = all.some(l => l.st === 'Completed'); per[0] = { s: 0, lessons: all, completed: c, recorded: all.length > 0 }; }
  const delivered = per.every(x => x.completed), closed = per.every(x => x.recorded), missing = per.filter(x => !x.recorded).map(x => x.s), partial = per.some(x => x.completed) && !delivered;
  return { per, delivered, closed, missing, partial, status: delivered ? 'delivered' : partial ? 'partial' : closed ? 'closed-not-delivered' : 'open' };
}
const doneKeys = e => e.sched === 'rec' ? Object.keys(e.ex || {}).filter(od => (e.ex[od] || {}).done && !(e.ex[od] || {}).deleted) : (e.done ? [e.date] : []);
// occurrences of Live entries that exist on a given date (incl. moved-in ones)
function occurrencesOn(db, date) {
  const out = [];
  (db.tt || []).forEach(e => {
    if (!live(e)) return;
    if (e.sched !== 'rec') { if (e.date === date) out.push({ e, od: e.date }); return; }
    const ex = e.ex || {}, x = ex[date] || {};
    if (e.a && date >= e.a && (!e.b || date <= e.b) && dowN(date) === e.dw && !x.deleted && !x.moved) out.push({ e, od: date });
    Object.keys(ex).forEach(od => { const y = ex[od]; if (y.moved && !y.deleted && y.moved.date === date) out.push({ e, od }); });
  });
  return out;
}
function integrity(db) {
  const r = { doneWithoutLesson: [], doneNotDelivered: [], donePartial: [], unlinkedLessons: [], inconsistentLinks: [], duplicateLooking: [], proposal: [], counts: {} };
  const byId = new Map((db.tt || []).map(e => [e.id, e]));
  (db.tt || []).forEach(e => { if (!live(e)) return; doneKeys(e).forEach(od => { const c = coverage(db, e, od), base = { tt: e.id, od, date: info(e, od).date, teacher: e.t || null, students: need(e).filter(Boolean) };
    if (c.status === 'delivered') return;
    if (!c.per.some(x => x.recorded)) r.doneWithoutLesson.push({ ...base, note: 'marked done but no lesson is linked to this occurrence' });
    else if (c.status === 'partial') r.donePartial.push({ ...base, missingStudents: c.missing, note: 'some required students have a completed lesson, others do not' });
    else r.doneNotDelivered.push({ ...base, note: 'closed as not delivered (Cancelled / No Show) or recorded for a different date/teacher; not counted as a completed session' }); }); });
  (db.l || []).forEach(l => {
    if (l.tt) {
      const e = byId.get(l.tt); if (!e) { r.inconsistentLinks.push({ lesson: l.id, problem: 'linked timetable entry ' + l.tt + ' does not exist' }); return; }
      const p = [];
      if (e.t && l.t !== e.t) p.push('teacher differs from the scheduled teacher');
      if ((e.s || []).length && !(e.s || []).includes(l.s)) p.push('student is not one of the scheduled students');
      if (e.sched === 'rec') { const ok = (e.ex || {})[l.od] ? true : (l.od && dowN(l.od) === e.dw && (!e.a || l.od >= e.a) && (!e.b || l.od <= e.b)); if (!l.od || !ok) p.push('occurrence date ' + (l.od || '(none)') + ' is not an occurrence of this weekly entry'); }
      else if (l.od && l.od !== e.date) p.push('occurrence date differs from the entry date');
      if (e.sched && l.od && info(e, l.od).date !== l.date) p.push('lesson date ' + l.date + ' differs from the occurrence date ' + info(e, l.od).date);
      if (p.length) r.inconsistentLinks.push({ lesson: l.id, tt: l.tt, od: l.od || null, problem: p.join('; ') });
      return;
    }
    // not linked: is there a scheduled Live occurrence for this teacher/student on this date?
    const cand = occurrencesOn(db, l.date).filter(o => o.e.t === l.t && ((o.e.s || []).includes(l.s)));
    let c2 = cand; if (cand.length > 1 && l.ts) c2 = cand.filter(o => info(o.e, o.od).st === l.ts);
    if (cand.length) {
      const alreadyTaken = c2.length === 1 && (db.l || []).some(z => z.id !== l.id && z.tt === c2[0].e.id && z.od === c2[0].od && z.s === l.s);
      r.unlinkedLessons.push({ lesson: l.id, date: l.date, status: l.st, candidates: c2.map(o => ({ tt: o.e.id, od: o.od })), ambiguous: c2.length !== 1 || alreadyTaken });
      if (c2.length === 1 && !alreadyTaken) r.proposal.push({ lesson: l.id, tt: c2[0].e.id, od: c2[0].od, basis: 'same teacher, student and date; exactly one scheduled Live occurrence; no other lesson linked to it for this student' });
    }
  });
  // identical-looking Live entries: same teacher, weekday/date, start and end, subject, overlapping date range and a shared student (listed only; never merged)
  const es = (db.tt || []).filter(live);
  for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) { const a = es[i], b = es[j];
    if (a.t !== b.t || a.sched !== b.sched || (a.st || '') !== (b.st || '') || (a.en || '') !== (b.en || '') || (a.subj || a.sub) !== (b.subj || b.sub)) continue;
    const same = a.sched === 'rec' ? a.dw === b.dw && (a.a || '') <= (b.b || '9999') && (b.a || '') <= (a.b || '9999') : a.date === b.date; if (!same) continue;
    const sa = need(a), sb = need(b); if (!sa.some(x => sb.includes(x))) continue; r.duplicateLooking.push({ tt: [a.id, b.id], note: 'same teacher, time, subject and a shared student' }); }
  r.counts = Object.fromEntries(Object.entries(r).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length]));
  return r;
}
// rule for a save: an occurrence that is NEWLY marked done must be closed by recorded lessons for every required student
function doneProblems(newDb, oldDb) {
  const bad = [], was = new Map((oldDb.tt || []).map(e => [e.id, e]));
  (newDb.tt || []).forEach(e => { if (!live(e)) return; const w = was.get(e.id), before = new Set(w ? doneKeys(w) : []);
    doneKeys(e).forEach(od => { if (before.has(od)) return; const c = coverage(newDb, e, od);
      if (!c.closed) bad.push(`timetable ${e.id} on ${od}: a Live session can only be marked done after a lesson is recorded for ${c.missing.length > 1 || c.missing[0] ? 'student(s) ' + c.missing.filter(Boolean).join(', ') : 'it'} (a Cancelled or No Show lesson also closes it, but is not counted as delivered)`); }); });
  return bad;
}
module.exports = { coverage, integrity, doneProblems, occurrencesOn, info, doneKeys };
