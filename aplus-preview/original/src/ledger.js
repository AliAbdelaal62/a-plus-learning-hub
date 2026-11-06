'use strict';
// THE financial calculation service (Phase 2: H1, M1, M2, H3, H5).
// Pure functions over the legacy-shaped state. The SAME source text runs on the server (API, reports, tests) and inside the page (injected by tools/make-public.js),
// so a teacher or student balance is computed in exactly one place and every screen shows the same figure.
// deps: { O(l) -> {cost,chg} original amounts of a lesson, pj(p) -> {share,prof,...}, rcc(c) -> {rev,share,prof,bshare,...}, k_(amount, rate) -> rounded base amount }
// Rules: amounts are only ever added to amounts of the SAME currency. A "base" figure uses the base amount STORED on each record (never today's exchange rate).
// A negative balance is a real credit / over-payment and is never hidden or rounded to zero.
function makeLedger(deps) {
  const { O, pj, rcc, k_ } = deps;
  const CATS = ['Live', 'Recorded', 'Project'];
  const g = (a, id) => (a || []).find(x => x.id == id);
  const cc = c => c || '—';
  const z3 = () => ({ Live: 0, Recorded: 0, Project: 0, Other: 0, total: 0 });
  const add = (o, k, v) => { o[k] = (o[k] || 0) + v; o.total = (o.total || 0) + v; };
  const fxs = r => r.fxs === 'identity' ? (r.cur && r.cur === r.bc && r.rx === 1 && r.bamt === r.amt ? 'identity' : 'missing') : (r.fxs || (r.rx > 0 && r.bamt != null && r.bc ? 'stored' : 'missing'));
  const arr = (db, k) => db[k] || [];

  // ------------------------------------------------------------------ H1: teachers
  // Earnings are recognised exactly as before (completed lessons; every non-cancelled project share; every course share). Payments are never netted across work types:
  // each work type has its own earned / paid / remaining, and a payment with no work type is shown as "unassigned" (it only reduces the grand total).
  function teacherRows(db, opt) {
    const E = (opt && opt.upTo) || '', only = opt && opt.only, o = {};
    const row = (tid, c) => { const k = tid + '|' + cc(c); return o[k] || (o[k] = { t: tid, cur: cc(c), earned: z3(), paid: z3(), unassigned: 0, remaining: z3(), settledOut: 0, settledIn: 0, settledOutBy: z3(), settledInBy: z3() }); };
    arr(db, 'l').forEach(l => { if (l.st === 'Completed' && (!E || l.date <= E) && (!only || l.t == only)) add(row(l.t, l.tc).earned, 'Live', O(l).cost); });
    arr(db, 'rc').forEach(c => { if (c.inst && (!E || !c.date || c.date <= E) && (!only || c.inst == only)) add(row(c.inst, rcc(c).teacherCurrency||c.cur).earned, 'Recorded', rcc(c).teacherShare??rcc(c).share); });
    arr(db, 'pr').forEach(p => { if (p.t && p.status !== 'Cancelled' && (!E || !p.start || p.start <= E) && (!only || p.t == only)) add(row(p.t, pj(p).teacherCurrency||p.cur).earned, 'Project', pj(p).teacherShare??pj(p).share); });
    arr(db, 'tp').forEach(p => {
      if ((E && p.date > E) || (only && p.p != only)) return; const r = row(p.p, p.cur);
      if (['Live', 'Recorded', 'Project', 'Other'].includes(p.src)) add(r.paid, p.src, p.amt); else { r.unassigned += p.amt; r.paid.total += p.amt; }
    });
    // Cross-currency settlements (migration 005): a payment made in one currency that explicitly settles an obligation in another. The paid amount leaves the
    // payment currency's balance and the settled amount is credited to the obligation's currency - each currency still balances on its own; nothing is netted silently.
    const tpById = new Map(arr(db, 'tp').map(p => [p.id, p])), CAT = { lesson: 'Live', course: 'Recorded', project: 'Project' };
    arr(db, 'ts').forEach(t => {
      const p = tpById.get(t.tp); if (!p || (E && t.date > E) || (only && p.p != only)) return;
      const out = row(p.p, t.pcur), inn = row(p.p, t.scur); out.settledOut += t.pamt; inn.settledIn += t.samt;
      const oc = ['Live', 'Recorded', 'Project', 'Other'].includes(p.src) ? p.src : null; if (oc) out.settledOutBy[oc] += t.pamt; inn.settledInBy[CAT[t.ok]] += t.samt;
    });
    return Object.values(o).filter(r => r.earned.total || r.paid.total || r.settledIn || r.settledOut).map(r => {
      for (const k of ['Live', 'Recorded', 'Project', 'Other']) r.remaining[k] = r.earned[k] - r.paid[k] + r.settledOutBy[k] - r.settledInBy[k];
      r.remaining.total = r.earned.total - r.paid.total + r.settledOut - r.settledIn; r.overpaid = r.remaining.total < 0; return r;
    });
  }
  // the same teacher in the academy base currency, using the base amount stored on every record (lessons: bcost, payments: bamt, courses / projects: their own saved rate)
  function teacherBase(db, tid, opt) {
    const E = (opt && opt.upTo) || '', base = db.set && db.set.base, mismatch = [];
    const ok = (kind, r) => { if (r.bc && base && r.bc !== base) { mismatch.push({ kind, id: r.id, storedBase: r.bc }); return false; } return true; };
    const earned = z3(), paid = z3(); let unassigned = 0; const cm = {}, cmr = c => cm[cc(c)] || (cm[cc(c)] = { cur: cc(c), earned: 0, paid: 0, rates: new Set() });
    arr(db, 'l').forEach(l => { if (l.t == tid && l.st === 'Completed' && (!E || l.date <= E) && ok('lesson', l)) { add(earned, 'Live', l.bcost); const r = cmr(l.tc); r.earned += l.bcost; if (l.trx > 0) r.rates.add(l.trx); } });
    arr(db, 'rc').forEach(c => { if (c.inst == tid && (!E || !c.date || c.date <= E) && ok('course', c)) { const v = rcc(c).bshare; add(earned, 'Recorded', v); const r = cmr(rcc(c).teacherCurrency||c.cur); r.earned += v; if ((c.teacherFee?.rate||c.rx)>0) r.rates.add(c.teacherFee?.rate||c.rx); } });
    arr(db, 'pr').forEach(p => { if (p.t == tid && p.status !== 'Cancelled' && (!E || !p.start || p.start <= E) && ok('project', p)) { const v = pj(p).bshare; add(earned, 'Project', v); const r = cmr(pj(p).teacherCurrency||p.cur); r.earned += v; if ((p.teacherFee?.rate||p.rx)>0) r.rates.add(p.teacherFee?.rate||p.rx); } });
    arr(db, 'tp').forEach(p => {
      if (p.p != tid || (E && p.date > E) || !ok('teacher payment', p)) return;
      if (['Live', 'Recorded', 'Project', 'Other'].includes(p.src)) add(paid, p.src, p.bamt); else { unassigned += p.bamt; paid.total += p.bamt; }
      const r = cmr(p.cur); r.paid += p.bamt; if (p.rx > 0) r.rates.add(p.rx);
    });
    // cross-currency settlements move the payer's own base value from the payment currency to the settled currency (no new rate is invented)
    const tpB = new Map(arr(db, 'tp').map(p => [p.id, p]));
    arr(db, 'ts').forEach(t => { const p = tpB.get(t.tp); if (!p || p.p != tid || (E && t.date > E) || !p.amt) return; const v = Math.round(p.bamt * t.pamt / p.amt); cmr(t.pcur).paid -= v; cmr(t.scur).paid += v; });
    // base value of each ORIGINAL currency's balance (each at the rates saved on its own records). Positive = owed, negative = over-paid. They are reported separately so that a netted total is never mistaken for one currency's debt.
    const byCurrency = Object.values(cm).filter(r => r.earned || r.paid).map(r => ({ cur: r.cur, earned: r.earned, paid: r.paid, remaining: r.earned - r.paid, rates: [...r.rates].sort((a, b) => a - b) }));
    const owed = byCurrency.reduce((q, r) => q + Math.max(0, r.remaining), 0), credit = byCurrency.reduce((q, r) => q + Math.min(0, r.remaining), 0);
    const remaining = z3(); for (const k of ['Live', 'Recorded', 'Project', 'Other']) remaining[k] = earned[k] - paid[k]; remaining.total = earned.total - paid.total;
    return { t: tid, base: base || '', earned, paid, unassigned, remaining, overpaid: remaining.total < 0, mismatch, byCurrency, owed, credit, netted: owed > 0 && credit < 0 };
  }
  function teacherBalance(db, tid, opt) {
    const rows = teacherRows(db, { ...(opt || {}), only: tid }), b = teacherBase(db, tid, opt);
    return { t: tid, base: b, rows, unassignedCount: arr(db, 'tp').filter(p => p.p == tid && !['Live', 'Recorded', 'Project', 'Other'].includes(p.src)).length, overpaid: rows.some(r => r.overpaid) || b.overpaid };
  }
  const teacherBalances = (db, opt) => arr(db, 't').map(t => teacherBalance(db, t.id, opt)); // archived (Inactive) teachers are included: their history stays visible

  // ------------------------------------------------------------------ M1 / M2 / H5: students
  // Per student and currency. charged = what the student owes for completed lessons, course enrolments and non-cancelled projects.
  // received = student payments + course payments + project payments + opening amounts. Allocations only ATTRIBUTE a student payment to a work type / charge; they never add money.
  // A cancelled project keeps its payments in the ledger until a refund, credit or explicit "retained" resolution has been recorded for it.
  function studentRows(db, opt) {
    const E = (opt && opt.upTo) || '', only = opt && opt.only, o = {};
    const row = (sid, c) => { const k = sid + '|' + cc(c); return o[k] || (o[k] = { s: sid, cur: cc(c), charged: z3(), paidByType: z3(), received: { student: 0, courseOpening: 0, courseDated: 0, projectOpening: 0, projectDated: 0, total: 0 },
      allocated: z3(), unallocated: 0, refunded: 0, credited: 0, creditUsed: 0, retained: 0, cancelledReceived: 0, cancelledUnresolved: 0 }); };
    const inE = d => !E || !d || d <= E;
    arr(db, 'l').forEach(l => { if (l.st === 'Completed' && (!E || l.date <= E) && (!only || l.s == only)) add(row(l.s, l.sc).charged, 'Live', O(l).chg); });
    const alBySp = {}; arr(db, 'al').forEach(a => { (alBySp[a.sp] = alBySp[a.sp] || []).push(a); });
    arr(db, 'sp').forEach(p => {
      if ((E && p.date > E) || (only && p.p != only)) return; const r = row(p.p, p.cur); r.received.student += p.amt; r.received.total += p.amt;
      let used = 0; (alBySp[p.id] || []).forEach(a => { if (E && a.date > E) return; add(r.allocated, a.wt, a.amt); add(r.paidByType, a.wt, a.amt); used += a.amt; });
      r.unallocated += p.amt - used;
    });
    const cpBy = {}; arr(db, 'cp').forEach(c => { (cpBy[c.re] = cpBy[c.re] || []).push(c); });
    arr(db, 're').forEach(e => {
      const c = g(db.rc, e.rc); if (!c || !inE(e.date || c.date) || (only && e.s != only)) return; const r = row(e.s, c.cur);
      add(r.charged, 'Recorded', e.price);
      const dated = (cpBy[e.id] || []).filter(x => !E || x.date <= E).reduce((q, x) => q + x.amt, 0), opening = (e.paid || 0) - (cpBy[e.id] || []).reduce((q, x) => q + x.amt, 0);
      r.received.courseOpening += opening; r.received.courseDated += dated; r.received.total += opening + dated; add(r.paidByType, 'Recorded', opening + dated);
    });
    arr(db, 'pr').forEach(p => {
      if (!p.s || (only && p.s != only)) return; const cancelled = p.status === 'Cancelled';
      if (!cancelled && E && p.start && p.start > E) return; const r = row(p.s, p.cur);
      if (!cancelled) add(r.charged, 'Project', p.rev);
      const dated = arr(db, 'pp').filter(x => x.pr == p.id && (!E || x.date <= E)).reduce((q, x) => q + x.amt, 0), opening = p.paid0 || 0;
      r.received.projectOpening += opening; r.received.projectDated += dated; r.received.total += opening + dated; add(r.paidByType, 'Project', opening + dated);
      if (cancelled) r.cancelledReceived += opening + dated;
    });
    arr(db, 'ad').forEach(a => {
      if ((E && a.date > E) || (only && a.s != only)) return; const r = row(a.s, a.cur);
      if (a.kind === 'refund') r.refunded += a.amt; else if (a.kind === 'credit') r.credited += a.amt; else if (a.kind === 'credit-used') r.creditUsed += a.amt; else if (a.kind === 'retained') r.retained += a.amt;
    });
    arr(db, 'pr').forEach(p => { if (p.status === 'Cancelled' && p.s && (!only || p.s == only)) { const u = projectResolution(db, p.id); row(p.s, p.cur).cancelledUnresolved += u.open; } });
    return Object.values(o).filter(r => r.charged.total || r.received.total || r.refunded || r.credited || r.retained || r.creditUsed).map(r => {
      r.paidByType.total = r.paidByType.Live + r.paidByType.Recorded + r.paidByType.Project + r.paidByType.Other;
      r.remainingByType = { Live: r.charged.Live - r.paidByType.Live, Recorded: r.charged.Recorded - r.paidByType.Recorded, Project: r.charged.Project - r.paidByType.Project, Other: -r.paidByType.Other };
      // net > 0: the student owes this much; net < 0: the academy holds this much for the student (over-payment / credit) in THIS currency
      r.net = r.charged.total - r.received.total - r.creditUsed + r.refunded + r.retained;
      r.creditBalance = r.credited - r.creditUsed; r.overpaid = r.net < 0; return r;
    });
  }
  // money held for one project and how much of it has been resolved (M2). Amounts are in the project's currency.
  function projectResolution(db, prid) {
    const p = g(db.pr, prid); if (!p) return { received: 0, refunded: 0, credited: 0, retained: 0, resolved: 0, open: 0 };
    const received = (p.paid0 || 0) + arr(db, 'pp').filter(x => x.pr == prid).reduce((q, x) => q + x.amt, 0) + arr(db, 'al').filter(a => a.tk === 'project' && a.tid == prid).reduce((q, a) => q + a.amt, 0);
    const mine = arr(db, 'ad').filter(a => a.pr == prid), by = k => mine.filter(a => a.kind === k).reduce((q, a) => q + a.amt, 0);
    const refunded = by('refund'), credited = by('credit'), retained = by('retained'), resolved = refunded + credited + retained;
    return { received, refunded, credited, retained, resolved, open: p.status === 'Cancelled' ? received - resolved : 0, cur: p.cur };
  }
  // ------------------------------------------------------------------ allocation rules (M1)
  // returns a list of problems; empty = every allocation is valid. Used by the save endpoint and by reconciliation.
  function allocationProblems(db) {
    const bad = [], sps = {}; arr(db, 'sp').forEach(p => { sps[p.id] = p; });
    const used = {}, tgt = {};
    arr(db, 'al').forEach(a => {
      const p = sps[a.sp]; if (!p) { bad.push(`allocation ${a.id}: payment ${a.sp} does not exist`); return; }
      used[a.sp] = (used[a.sp] || 0) + a.amt;
      if (!(a.amt > 0)) bad.push(`allocation ${a.id}: amount must be greater than zero`);
      if (a.tk) {
        const key = a.tk + ':' + a.tid; tgt[key] = (tgt[key] || 0) + a.amt;
        let owner, cur, limit, already = 0, wt;
        if (a.tk === 'lesson') { const l = g(db.l, a.tid); if (l) { owner = l.s; cur = l.sc; limit = O(l).chg; wt = 'Live'; } }
        else if (a.tk === 'enrollment') { const e = g(db.re, a.tid), c = e && g(db.rc, e.rc); if (e && c) { owner = e.s; cur = c.cur; limit = e.price; already = e.paid || 0; wt = 'Recorded'; } }
        else if (a.tk === 'project') { const pr = g(db.pr, a.tid); if (pr) { owner = pr.s; cur = pr.cur; limit = pr.rev; already = (pr.paid0 || 0) + arr(db, 'pp').filter(x => x.pr == pr.id).reduce((q, x) => q + x.amt, 0); wt = 'Project'; } }
        if (owner === undefined) { bad.push(`allocation ${a.id}: the ${a.tk} it points to (${a.tid}) does not exist`); return; }
        if (owner != p.p) bad.push(`allocation ${a.id}: the ${a.tk} belongs to a different student than payment ${p.id}`);
        if ((cur || '') !== (p.cur || '')) bad.push(`allocation ${a.id}: payment currency ${p.cur} differs from the charge currency ${cur}; no conversion is invented, record the payment in the charge currency`);
        if (a.wt !== wt) bad.push(`allocation ${a.id}: work type ${a.wt} does not match the ${a.tk} it points to (${wt})`);
        if (already + tgt[key] > limit) bad.push(`allocation ${a.id}: would pay this ${a.tk} more than its charge (${(already + tgt[key]) / 1000} of ${limit / 1000}); keep the rest unallocated as student credit`);
      }
    });
    for (const [id, u] of Object.entries(used)) if (u > sps[id].amt) bad.push(`payment ${id}: allocated ${u / 1000} but the payment is only ${sps[id].amt / 1000}`);
    return bad;
  }
  // ------------------------------------------------------------------ H3 / H5: exchange-rate status and undated money (read-only lists)
  function fxReport(db) {
    const out = { stored: [], identity: [], derived: [], missing: [], corrected: [], undatedOpening: [] };
    const put = (kind, r, extra) => { const s = fxs(r); (out[s] || out.missing).push({ kind, id: r.id, ...extra }); };
    arr(db, 'sp').forEach(r => put('student payment', r, { date: r.date, amt: r.amt, cur: r.cur }));
    arr(db, 'tp').forEach(r => put('teacher payment', r, { date: r.date, amt: r.amt, cur: r.cur }));
    arr(db, 'pp').forEach(r => put('project payment', r, { date: r.date, amt: r.amt, cur: r.cur }));
    arr(db, 'cp').forEach(r => put('course payment', r, { date: r.date, amt: r.amt, cur: r.cur }));
    arr(db, 'ad').forEach(r => put('student ' + r.kind, r, { date: r.date, amt: r.amt, cur: r.cur }));
    arr(db, 'pr').forEach(p => { if (p.paid0) out.undatedOpening.push({ kind: 'project opening paid', id: p.id, amt: p.paid0, cur: p.cur }); });
    arr(db, 're').forEach(e => { const c = g(db.rc, e.rc), opening = (e.paid || 0) - arr(db, 'cp').filter(x => x.re == e.id).reduce((q, x) => q + x.amt, 0); if (opening > 0) out.undatedOpening.push({ kind: 'course enrolment opening paid', id: e.id, amt: opening, cur: c && c.cur, student: e.s, enrolmentDate: e.date || '' }); });
    return out;
  }
  // ------------------------------------------------------------------ reconciliation rows for projects and courses
  function projectRows(db) {
    return arr(db, 'pr').map(p => {
      const j = pj(p), res = projectResolution(db, p.id), dated = arr(db, 'pp').filter(x => x.pr == p.id).reduce((q, x) => q + x.amt, 0), alloc = arr(db, 'al').filter(a => a.tk === 'project' && a.tid == p.id).reduce((q, a) => q + a.amt, 0);
      return { id: p.id, name: p.name, status: p.status, cur: p.cur, student: p.s, teacher: p.t, agreed: p.rev, opening: p.paid0 || 0, datedPayments: dated, allocatedFromStudentPayments: alloc, received: res.received,
        refunded: res.refunded, credited: res.credited, retained: res.retained, unresolved: res.open, outstanding: p.status === 'Cancelled' ? 0 : p.rev - res.received, teacherShare: j.share, academyShare: p.rev - j.share };
    });
  }
  function courseRows(db) {
    return arr(db, 'rc').map(c => {
      const j = rcc(c), en = arr(db, 're').filter(e => e.rc == c.id), cps = arr(db, 'cp').filter(x => en.some(e => e.id == x.re)).reduce((q, x) => q + x.amt, 0), paid = en.reduce((q, e) => q + (e.paid || 0), 0);
      return { id: c.id, name: c.name, cur: c.cur, price: c.price, declaredCount: c.n, declaredCountNote: 'manual count - drives list revenue (price x count)', enrolments: en.length, countGap: (c.n || 0) - en.length, expected: j.rev, enrolmentCharges: en.reduce((q, e) => q + e.price, 0), collected: paid, opening: paid - cps, datedPayments: cps,
        instructor: c.inst, instructorShare: j.share, academyShare: j.rev - j.share - (c.cost || 0), cost: c.cost || 0 };
    });
  }

  // ------------------------------------------------------------------ C: cross-currency settlement (migration 005)
  // A settlement says: "this part of teacher payment <tp> (paid in pcur) settles this part of obligation <ok,oid> (owed in scur) at rate rx (scur per 1 pcur)".
  // Limits: the settled parts of one payment never exceed the payment; the settled parts of one obligation never exceed what the teacher earned from it; the teacher must own both.
  const obligation = (db, ok, oid) => {
    if (ok === 'lesson') { const l = g(db.l, oid); return l ? { t: l.t, cur: l.tc, total: l.st === 'Completed' ? O(l).cost : 0, label: 'lesson ' + oid } : null; }
    if (ok === 'course') { const c = g(db.rc, oid); return c ? { t: c.inst, cur: rcc(c).teacherCurrency||c.cur, total: rcc(c).teacherShare??rcc(c).share, label: 'course ' + oid } : null; }
    if (ok === 'project') { const p = g(db.pr, oid); return p ? { t: p.t, cur: pj(p).teacherCurrency||p.cur, total: p.status === 'Cancelled' ? 0 : (pj(p).teacherShare??pj(p).share), label: 'project ' + oid } : null; }
    return null;
  };
  function settlementProblems(db) {
    const bad = [], byTp = {}, byOb = {};
    arr(db, 'ts').forEach(t => {
      const p = g(db.tp, t.tp), ob = obligation(db, t.ok, t.oid);
      if (!p) { bad.push(`settlement ${t.id}: teacher payment ${t.tp} does not exist`); return; }
      if (!ob) { bad.push(`settlement ${t.id}: ${t.ok} ${t.oid} does not exist`); return; }
      if (ob.t != p.p) bad.push(`settlement ${t.id}: ${ob.label} belongs to a different teacher than payment ${t.tp}`);
      if ((p.cur || '') !== t.pcur) bad.push(`settlement ${t.id}: paid currency ${t.pcur} differs from payment ${t.tp} currency ${p.cur}`);
      if ((ob.cur || '') !== t.scur) bad.push(`settlement ${t.id}: settled currency ${t.scur} differs from ${ob.label} currency ${ob.cur}`);
      if (t.pcur === t.scur) bad.push(`settlement ${t.id}: same currency - a same-currency payment needs no settlement`);
      if (!(t.pamt > 0) || !(t.samt > 0) || !(t.rx > 0)) bad.push(`settlement ${t.id}: paid amount, settled amount and rate must be positive`);
      else if (Math.abs(Math.round(t.pamt * t.rx) - t.samt) > 1) bad.push(`settlement ${t.id}: settled ${t.samt / 1000} does not equal paid ${t.pamt / 1000} x rate ${t.rx} (rounded to 0.001)`);
      byTp[t.tp] = (byTp[t.tp] || 0) + t.pamt; byOb[t.ok + ':' + t.oid] = (byOb[t.ok + ':' + t.oid] || 0) + t.samt;
      if (byTp[t.tp] > p.amt) bad.push(`settlement ${t.id}: settlements of payment ${t.tp} (${byTp[t.tp] / 1000}) exceed the payment (${p.amt / 1000})`);
      if (byOb[t.ok + ':' + t.oid] > ob.total) bad.push(`settlement ${t.id}: settlements of ${ob.label} (${byOb[t.ok + ':' + t.oid] / 1000}) exceed what was earned from it (${ob.total / 1000})`);
    });
    return bad;
  }
  // HISTORICAL cross-currency payments are NOT guessed. A payment is listed here when its category (Live / Recorded / Project) has earnings for that teacher only in OTHER currencies
  // and the payment has no settlement. The payment stays visible and counts exactly as recorded (in its own currency); the owner may settle it later with an audited record.
  function crossCurrencyUnresolved(db) {
    const out = [], rows = teacherRows(db), settled = {}; arr(db, 'ts').forEach(t => { settled[t.tp] = (settled[t.tp] || 0) + t.pamt; });
    arr(db, 'tp').forEach(p => {
      if (!['Live', 'Recorded', 'Project'].includes(p.src)) return; const mine = rows.filter(r => r.t == p.p && r.earned[p.src] > 0);
      if (!mine.length || mine.some(r => r.cur === cc(p.cur))) return;
      const open = p.amt - (settled[p.id] || 0); if (open > 0) out.push({ tp: p.id, teacher: p.p, date: p.date, src: p.src, cur: cc(p.cur), amt: p.amt, unsettled: open, earnedIn: mine.map(r => r.cur) });
    });
    return out;
  }
  // E: recorded courses - the declared student count drives list revenue (price x count); enrolments carry the real (possibly discounted) prices. The declared count may not be smaller than the enrolments.
  function courseCountProblems(db) {
    const bad = [], n = {}; arr(db, 're').forEach(e => { n[e.rc] = (n[e.rc] || 0) + 1; });
    arr(db, 'rc').forEach(c => { if ((n[c.id] || 0) > (c.n || 0)) bad.push(`course ${c.id}: ${n[c.id]} enrolments are recorded but the declared student count is ${c.n || 0}; raise the declared count (it drives the course revenue) or remove the extra enrolment`); });
    return bad;
  }
  // ------------------------------------------------------------------ M2 / H5 rules shared by the save endpoint and reconciliation
  function adjustmentProblems(db) {
    const bad = [], byOrig = {}, creditIn = {}, creditOut = {};
    arr(db, 'ad').forEach(a => {
      const s = g(db.s, a.s); if (!s) { bad.push(`adjustment ${a.id}: student ${a.s} does not exist`); return; }
      if (a.pr) {
        const p = g(db.pr, a.pr); if (!p) { bad.push(`adjustment ${a.id}: project ${a.pr} does not exist`); return; }
        if (p.s != a.s) bad.push(`adjustment ${a.id}: project ${a.pr} belongs to a different student`);
        if ((p.cur || '') !== (a.cur || '')) bad.push(`adjustment ${a.id}: currency ${a.cur} differs from the project currency ${p.cur}`);
      } else if (!(a.ok && a.oid) && a.kind !== 'credit-used') bad.push(`adjustment ${a.id}: a ${a.kind} needs either a project or the original payment it refers to`);
      if (a.ok && a.oid) {
        const src = a.ok === 'sp' ? g(db.sp, a.oid) : a.ok === 'pp' ? g(db.pp, a.oid) : a.ok === 'cp' ? g(db.cp, a.oid) : null;
        if (!src) bad.push(`adjustment ${a.id}: original ${a.ok} payment ${a.oid} does not exist`);
        else { const k = a.ok + ':' + a.oid; byOrig[k] = (byOrig[k] || 0) + (a.kind === 'credit-used' ? 0 : a.amt); if (byOrig[k] > src.amt) bad.push(`adjustment ${a.id}: refunds / credits against payment ${a.ok} ${a.oid} (${byOrig[k] / 1000}) exceed the payment (${src.amt / 1000})`); }
      }
      const key = a.s + '|' + a.cur; if (a.kind === 'credit') creditIn[key] = (creditIn[key] || 0) + a.amt; if (a.kind === 'credit-used') creditOut[key] = (creditOut[key] || 0) + a.amt;
    });
    for (const [k, u] of Object.entries(creditOut)) if (u > (creditIn[k] || 0)) bad.push(`student credit used (${u / 1000}) is more than the credit recorded (${(creditIn[k] || 0) / 1000}) for student|currency ${k}`);
    arr(db, 'pr').forEach(p => { const r = projectResolution(db, p.id); if (r.resolved > r.received) bad.push(`project ${p.id}: resolutions (${r.resolved / 1000}) are more than the money received (${r.received / 1000})`); });
    return bad;
  }
  // a course enrolment's paid figure = its undated opening amount + its dated course payments, so no money exists without a date unless it is labelled as opening
  function coursePayProblems(db) {
    const bad = [];
    arr(db, 'cp').forEach(c => { if (!g(db.re, c.re)) bad.push(`course payment ${c.id}: enrolment ${c.re} does not exist`); });
    arr(db, 're').forEach(e => { const dated = arr(db, 'cp').filter(x => x.re == e.id).reduce((q, x) => q + x.amt, 0), open = e.paid_open || 0;
      if ((e.paid || 0) !== open + dated) bad.push(`enrolment ${e.id}: paid ${(e.paid || 0) / 1000} must equal the opening amount ${open / 1000} plus its dated payments ${dated / 1000}; record money received as a dated course payment`); });
    return bad;
  }
  return { teacherRows, teacherBase, teacherBalance, teacherBalances, studentRows, projectResolution, allocationProblems, adjustmentProblems, coursePayProblems, settlementProblems, crossCurrencyUnresolved, courseCountProblems, obligation, fxReport, projectRows, courseRows, fxs };
}
module.exports = { makeLedger };
