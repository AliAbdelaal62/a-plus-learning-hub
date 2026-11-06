'use strict';
// Read-only financial reconciliation (Phase 2). Compares what the application DISPLAYED before Phase 2 (legacy formulas, taken from the original state) with what the shared
// ledger calculates (src/ledger.js, taken from the same data after migration 003). It never writes anything and never proposes to change a stored amount: every difference is
// explained and classified as  matches | expected | unexplained | manual-review.
const fin = require('./finance'); const { forState } = require('./ledger-server');
const f3 = v => (v / 1000).toFixed(3);
const sumV = a => a.reduce((q, x) => q + x, 0);

function teachers(oldSt, newSt) {
  const L = forState(newSt);
  return newSt.t.map(t => {
    const ts = fin.TS(oldSt, t.id), rcE = oldSt.rc.filter(c => c.inst == t.id).reduce((a, c) => a + fin.rcc(c).bshare, 0), prE = oldSt.pr.filter(p => p.t == t.id && p.status != 'Cancelled').reduce((a, p) => a + fin.pj(oldSt, p).bshare, 0);
    const old = { liveEarned: ts.cost, recordedEarned: rcE, projectEarned: prE, paid: ts.paid, listBalance: ts.rem, cardBalance: ts.cost + rcE + prE - ts.paid };
    const b = L.teacherBalance(newSt, t.id), nb = b.base, rows = b.rows;
    const dList = nb.remaining.total - old.listBalance, dCard = nb.remaining.total - old.cardBalance; let cls, cause;
    if (dList === 0 && dCard === 0) { cls = 'matches'; cause = ''; }
    else if (dCard === 0 && dList === rcE + prE) { cls = 'expected'; cause = `the Payments page / teacher details / reports showed lesson earnings only (${f3(old.liveEarned)}) and left out recorded-course (${f3(rcE)}) and project (${f3(prE)}) earnings; the new figure equals the all-category teacher-card figure`; }
    else { cls = 'unexplained'; cause = 'new balance differs from both legacy formulas by an amount that is not the omitted recorded/project earnings'; }
    const split = rows.length > 1 && rows.some(r => r.remaining.total > 0) && rows.some(r => r.remaining.total < 0);
    return { id: t.id, name: t.name, status: t.status, old, new: { earned: nb.earned, paid: nb.paid, unassigned: nb.unassigned, outstanding: nb.remaining.total, byCurrency: rows.map(r => ({ cur: r.cur, earned: r.earned.total, paid: r.paid.total, remaining: r.remaining.total, byType: r.remaining })) },
      diffVsListBalance: dList, diffVsCardBalance: dCard, class: cls, cause, overpaid: b.overpaid, paidInOtherCurrency: split, unassignedPayments: b.unassignedCount, baseMismatch: nb.mismatch };
  });
}
function students(oldSt, newSt) {
  const L = forState(newSt), base = newSt.set.base, all = L.studentRows(newSt);
  return newSt.s.map(s => {
    const o = fin.SS(oldSt, s.id), rows = all.filter(r => r.s === s.id), single = rows.length === 0 || (rows.length === 1 && rows[0].cur === base);
    const net = rows.length ? rows[0].net : 0, newNet = single ? net : null, diff = single ? net - o.rem : null;
    const cancelled = sumV(rows.map(r => r.cancelledReceived)); let cls, cause = '';
    let convertedCheck = null;
    if (!single) { const cu = [...new Set(rows.map(r => r.cur))], conv = fin.SS(newSt, s.id); convertedCheck = { legacy: o.rem, recomputed: conv.rem, equal: conv.rem === o.rem };
      cls = 'manual-review'; cause = `${cu.length > 1 ? 'charges / payments in more than one currency (' + cu.join(', ') + ')' : 'the only currency is ' + cu[0] + ', not the base ' + base}: the new ledger keeps the balance in ${cu.join(' and ')}, while the legacy figure (${base} ${f3(o.rem)}) was one number converted at the rate saved on each record. Re-converting the same records at those saved rates gives ${base} ${f3(conv.rem)}, ${conv.rem === o.rem ? 'identical to' : 'different from'} the legacy figure. The two are not forced to match; left pending your approval.`; }
    else if (diff === 0) cls = 'matches';
    else if (cancelled > 0 && diff === -cancelled) { cls = 'expected'; cause = 'payments received for a cancelled project were dropped from the legacy balance and are now counted until resolved'; }
    else { cls = 'unexplained'; cause = 'difference is not explained by cancelled-project payments; check currency of charges vs payments'; }
    return { id: s.id, name: s.name, old: { charges: o.tot, payments: o.paid, balance: o.rem }, new: rows.map(r => ({ cur: r.cur, charged: r.charged, receivedTotal: r.received.total, studentPayments: r.received.student, allocatedPayments: r.allocated.total, unallocatedPayments: r.unallocated,
      courseOpening: r.received.courseOpening, projectOpening: r.received.projectOpening, datedCourse: r.received.courseDated, datedProject: r.received.projectDated, refunds: r.refunded, credits: r.credited, creditUsed: r.creditUsed, retained: r.retained, balance: r.net, creditBalance: r.creditBalance, overpaid: r.overpaid, cancelledUnresolved: r.cancelledUnresolved })),
      difference: diff, class: cls, cause, convertedCheck };
  });
}
function projects(newSt) { const L = forState(newSt); return L.projectRows(newSt).map(r => ({ ...r, class: r.status === 'Cancelled' && r.unresolved > 0 ? 'manual-review' : 'matches', cause: r.status === 'Cancelled' && r.unresolved > 0 ? 'money received for a cancelled project has no refund / credit / retained resolution yet' : '' })); }
function courses(newSt) { const L = forState(newSt); return L.courseRows(newSt).map(r => { const miss = r.declaredCount !== r.enrolments; return { ...r, class: miss ? 'manual-review' : 'matches', cause: miss ? `the course says ${r.declaredCount} student(s) but ${r.enrolments} enrolment record(s) exist (audit H2, not changed in Phase 2)` : '' }; }); }
function fx(oldSt, newSt) {
  const L = forState(newSt), rep = L.fxReport(newSt); const changed = [];
  for (const p of newSt.pr) { const oldPaid = fin.k_(fin.pj(oldSt, oldSt.pr.find(x => x.id === p.id)).paid, p.rx), newPaid = fin.k_(p.paid0 || 0, p.rx) + sumV(newSt.pp.filter(x => x.pr === p.id).map(x => x.bamt || 0)); if (oldPaid !== newPaid) changed.push({ kind: 'project', id: p.id, old: oldPaid, new: newPaid }); }
  const dyn = newSt.pp.filter(x => x.fxs === 'identity' || x.fxs === 'derived' || x.fxs === 'missing').map(x => ({ id: x.id, project: x.pr, amt: x.amt, cur: x.cur, rate: x.rx }));
  return { counts: { stored: rep.stored.length, identity: rep.identity.length, derived: rep.derived.length, missing: rep.missing.length, corrected: rep.corrected.length, undatedOpening: rep.undatedOpening.length }, stored: rep.stored, identity: rep.identity, derived: rep.derived, missing: rep.missing, undatedOpening: rep.undatedOpening,
    usedParentRateDynamically: dyn, displayedValueChanges: changed };
}
function build(oldSt, newSt) {
  const T = teachers(oldSt, newSt), S = students(oldSt, newSt), P = projects(newSt), C = courses(newSt), F = fx(oldSt, newSt);
  const tally = a => a.reduce((o, x) => { o[x.class] = (o[x.class] || 0) + 1; return o; }, {});
  return { base: newSt.set.base, teachers: T, students: S, projects: P, courses: C, fx: F, summary: { teachers: tally(T), students: tally(S), projects: tally(P), courses: tally(C), paymentsByStudent: { count: newSt.sp.length, unallocated: newSt.sp.length - new Set(newSt.al.map(a => a.sp)).size } } };
}
module.exports = { build, teachers, students, projects, courses, fx };
