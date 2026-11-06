'use strict';
// ORIGINAL-CURRENCY reporting (Decision A). Pure functions; the SAME source text runs on the server (tests, /api) and inside the page (injected by tools/make-public.js).
// Rule: amounts are only ever added to amounts of the SAME currency. Nothing here uses an exchange rate.
// deps: { O(l) -> {cost,chg} original amounts of a lesson, pj(p) -> {share,prof}, rcc(c) -> {rev,share,prof} } supplied by the caller from the existing business rules.
const { makeLedger } = require('./ledger'); // in the page makeLedger is injected as a global before makeOrig
function makeOrig(deps) {
  const { O, pj, rcc } = deps;
  const g = (a, id) => a.find(x => x.id == id);
  const cc = c => c || '—';
  const add = (o, c, k, v) => { const r = o[cc(c)] || (o[cc(c)] = {}); r[k] = (r[k] || 0) + v; };
  const inW = (w, d) => (!w.a || (d || '') >= w.a) && (!w.b || (d || '') <= w.b);

  // Work performed (revenue / cost / profit) for an already-filtered selection x = {ls, pr, rc}
  function work(x) {
    const o = {}, mixed = [];
    x.ls.forEach(l => {
      if (l.st !== 'Completed') return; const a = O(l);
      add(o, l.sc, 'liveRevenue', a.chg); add(o, l.tc, 'liveCost', a.cost);
      if (l.sc === l.tc) add(o, l.sc, 'liveProfit', a.chg - a.cost); else { mixed.push(l.id); add(o, l.sc, 'mixedRevenue', a.chg); add(o, l.tc, 'mixedCost', a.cost); } // revenue and cost of mixed-currency lessons are kept so each currency still foots
    });
    x.pr.forEach(p => { const j = pj(p); add(o, p.cur, 'projectRevenue', p.rev); add(o, j.teacherCurrency||p.cur, 'projectShare', j.teacherShare??j.share); if((j.teacherCurrency||p.cur)===p.cur)add(o,p.cur,'projectProfit',p.rev-(j.teacherShare??j.share));else{mixed.push('project:'+p.id);add(o,p.cur,'mixedRevenue',p.rev);add(o,j.teacherCurrency,'mixedCost',j.teacherShare);} });
    x.rc.forEach(c => { const j = rcc(c); add(o, c.cur, 'courseRevenue', j.rev); add(o,j.teacherCurrency||c.cur,'courseShare',j.teacherShare??j.share); add(o,c.cur,'courseCost',c.cost||0); if((j.teacherCurrency||c.cur)===c.cur)add(o,c.cur,'courseProfit',j.rev-(j.teacherShare??j.share)-(c.cost||0));else{mixed.push('course:'+c.id);add(o,c.cur,'mixedRevenue',j.rev-(c.cost||0));add(o,j.teacherCurrency,'mixedCost',j.teacherShare);} });
    return { byCurrency: o, mixedCurrencyLessons: mixed };
  }
  // Dated cash inside a window w={a,b} with optional filters {cur,s,t,meth}. Undated opening balances are returned separately and are NEVER counted as dated receipts.
  function cash(db, w, x) {
    // filters: cur, s (student), t (teacher), meth (payment method), wt (work type). A receipt with no allocation has no work type, and a teacher payment with no source has none either:
    // when a work-type filter is set they are NOT counted (never given an invented category); the report says so.
    const o = {}, mOk = p => !w.meth || p.meth === w.meth, alBy = {}; (db.al || []).forEach(a => { (alBy[a.sp] = alBy[a.sp] || []).push(a); });
    db.sp.forEach(p => { if (!(inW(w, p.date) && (!w.cur || p.cur == w.cur) && (!w.s || p.p == w.s) && mOk(p))) return; let v = p.amt;
      if (w.wt) v = (alBy[p.id] || []).filter(a => a.wt === w.wt && inW(w, a.date || p.date)).reduce((q, a) => q + a.amt, 0); if (v) add(o, p.cur, 'studentReceived', v); });
    db.pp.forEach(p => { const pr = g(db.pr, p.pr); if (!pr || !inW(w, p.date) || (w.cur && pr.cur != w.cur) || (w.s && pr.s != w.s) || (w.t && pr.t != w.t) || !mOk(p) || (w.wt && w.wt !== 'Project')) return; add(o, pr.cur, 'projectReceived', p.amt); });
    db.tp.forEach(p => { if (inW(w, p.date) && (!w.cur || p.cur == w.cur) && (!w.t || p.p == w.t) && mOk(p) && (!w.wt || p.src === w.wt)) add(o, p.cur, 'teacherPaid', p.amt); });
    (db.cp || []).forEach(p => { const e = g(db.re, p.re), c = e && g(db.rc, e.rc); if (!c || !inW(w, p.date) || (w.cur && c.cur != w.cur) || (w.s && e.s != w.s) || (w.t && c.inst != w.t) || !mOk(p) || (w.wt && w.wt !== 'Recorded')) return; add(o, c.cur, 'courseReceived', p.amt); });
    (db.ad || []).forEach(r => { if (r.kind === 'refund' && inW(w, r.date) && (!w.cur || r.cur == w.cur) && (!w.s || r.s == w.s) && !w.meth && !w.wt) add(o, r.cur, 'refundsPaid', r.amt); }); // refunds carry no method / work type: they are left out whenever either filter is set
    const open = {};
    (x ? x.pr : db.pr).forEach(p => { if (p.paid0 && (!w.cur || p.cur == w.cur)) add(open, p.cur, 'projectOpeningPaid', p.paid0); });
    (x ? x.rc : db.rc).forEach(c => { if (w.cur && c.cur != w.cur) return; db.re.filter(e => e.rc == c.id && (!w.s || e.s == w.s)).forEach(e => { const op = (e.paid || 0) - (db.cp || []).filter(x => x.re == e.id).reduce((q, x) => q + x.amt, 0); if (op) add(open, c.cur, 'courseEnrolmentPaid', op); }); });
    return { dated: o, undatedOpening: open };
  }
  // Student ledger per currency up to date E (E='' = all time). charged/paid in the SAME currency; no netting across currencies.
  function studentLedger(db, E, only) {
    const o = {}, z = (sid, c) => { const k = sid + '|' + cc(c); return o[k] || (o[k] = { s: sid, cur: cc(c), charged: 0, paid: 0, openingPaid: 0 }); }, ok = d => !E || !d || d <= E;
    db.l.forEach(l => { if (l.st === 'Completed' && (!E || l.date <= E) && (!only || l.s == only)) z(l.s, l.sc).charged += O(l).chg; });
    db.sp.forEach(p => { if ((!E || p.date <= E) && (!only || p.p == only)) z(p.p, p.cur).paid += p.amt; });
    db.re.forEach(e => { const c = g(db.rc, e.rc); if (!c || !ok(e.date || c.date) || (only && e.s != only)) return; const r = z(e.s, c.cur); const dated = (db.cp || []).filter(x => x.re == e.id).reduce((q, x) => q + x.amt, 0); r.charged += e.price; r.paid += e.paid; r.openingPaid += e.paid - dated; });
    db.pr.forEach(p => { if (p.status == 'Cancelled' || !p.s || (E && p.start && p.start > E) || (only && p.s != only)) return; const r = z(p.s, p.cur); r.charged += p.rev; const pd = (p.paid0 || 0) + db.pp.filter(x => x.pr == p.id && (!E || x.date <= E)).reduce((q, x) => q + x.amt, 0); r.paid += pd; r.openingPaid += p.paid0 || 0; });
    return Object.values(o).filter(r => r.charged || r.paid).map(r => ({ ...r, net: r.charged - r.paid }));
  }
  // teacher earned / paid / remaining per currency: ONE implementation, shared with every other screen (src/ledger.js)
  function teacherLedger(db, E, only) {
    const L = makeLedger({ O, pj, rcc, k_: (a, r) => Math.round(a * r) });
    return L.teacherRows(db, { upTo: E, only }).map(r => ({ t: r.t, cur: r.cur, earned: r.earned.total, paid: r.paid.total, unassignedPaid: r.unassigned, remaining: r.remaining.total, byType: r }));
  }
  // students whose payments are in a different currency from their charges: per-currency balances then look like a debt in one currency and a credit in another
  function crossCurrency(rows) {
    const by = {}; rows.forEach(r => { (by[r.s] = by[r.s] || []).push(r); });
    return Object.entries(by).filter(([, a]) => a.length > 1 && a.some(r => r.net > 0) && a.some(r => r.net < 0)).map(([s]) => +s);
  }
  return { work, cash, studentLedger, teacherLedger, crossCurrency };
}
module.exports = { makeOrig };
