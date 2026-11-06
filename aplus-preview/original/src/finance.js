'use strict';
// Server-side port of the legacy financial rules (dev/index.html lines "core calculations"). Pure functions over a legacy-shaped state.
// Money = integer thousandths. Rounding = Math.round (half up on doubles), applied at exactly the same points as the legacy app.
const k_ = (a, r) => Math.round(a * r);
const sum = a => a.reduce((x, p) => x + p.bamt, 0), sumO = a => a.reduce((x, p) => x + p.amt, 0);
const O = l => ({ cost: l.oc != null ? l.oc : Math.round(l.d * l.tr), chg: l.og != null ? l.og : Math.round(l.d * l.sr) });
const C = l => { const ok = l.st === 'Completed'; const cost = ok ? l.bcost : 0, chg = ok ? l.bchg : 0; return { cost, chg, p: chg - cost }; };
const S = ls => { const r = { n: 0, h: 0, rev: 0, cost: 0 }; ls.forEach(l => { if (l.st !== 'Completed') return; const c = C(l); r.n++; r.h += l.d; r.rev += c.chg; r.cost += c.cost; }); r.p = r.rev - r.cost; return r; };
const g = (a, id) => a.find(x => x.id == id);
function pj(db, p) {
 const fee=p.teacherFee, fixed=fee&&fee.teacherId===p.t, percentShare=Math.round(p.rev*p.share/100);
 const bshare=fixed?fee.baseAmount:k_(percentShare,p.rx),share=fixed?Math.round(bshare/p.rx):percentShare,paid=(p.paid0||0)+sumO(db.pp.filter(x=>x.pr==p.id));
 return Object.defineProperties({share,prof:p.rev-share,paid,out:p.rev-paid,brev:k_(p.rev,p.rx),bshare,bprof:k_(p.rev,p.rx)-bshare},{teacherCurrency:{value:fixed?'EGP':p.cur},teacherShare:{value:fixed?fee.amount:percentShare},fixedTeacherFee:{value:!!fixed}});
}
function rcc(c) {
 const rev=Math.round(c.price*c.n),fee=c.teacherFee,fixed=fee&&fee.teacherId===c.inst,percentShare=Math.round(rev*c.share/100);
 const bshare=fixed?fee.baseAmount:k_(percentShare,c.rx),share=fixed?Math.round(bshare/c.rx):percentShare,prof=rev-share-c.cost;
 return Object.defineProperties({rev,share,prof,brev:k_(rev,c.rx),bshare,bcost:k_(c.cost,c.rx),bprof:k_(rev,c.rx)-bshare-k_(c.cost,c.rx)},{teacherCurrency:{value:fixed?'EGP':c.cur},teacherShare:{value:fixed?fee.amount:percentShare},fixedTeacherFee:{value:!!fixed}});
}

const TS = (db, id) => { const s = S(db.l.filter(l => l.t == id)), paid = sum(db.tp.filter(p => p.p == id)); return { ...s, paid, rem: s.cost - paid }; };
const SS = require('./student-account').studentAccount;

function TOT(db, x) {
  const s = S(x.ls), L = { rev: s.rev, cost: s.cost, p: s.p }, P = { rev: 0, cost: 0, p: 0 }, R = { rev: 0, cost: 0, p: 0 };
  x.pr.forEach(p => { const j = pj(db, p); P.rev += j.brev; P.cost += j.bshare; P.p += j.bprof; });
  x.rc.forEach(c => { const j = rcc(c); R.rev += j.brev; R.cost += j.bshare + j.bcost; R.p += j.bprof; });
  return { s, L, P, R, rev: L.rev + P.rev + R.rev, cost: L.cost + P.cost + R.cost, p: L.p + P.p + R.p };
}
// M10: 'booking' (default, the original rule) counts a non-cancelled project from the moment it is booked; 'delivered' counts it only once it is Completed
const all = db => ({ ls: db.l, pr: db.pr.filter(p => p.status != 'Cancelled' && (!(db.set && db.set.recog === 'delivered') || p.status === 'Completed')), rc: db.rc });
// H4: only amounts stored in the CURRENT base currency are added together. A record whose stored base currency differs is left out of the base totals and listed.
function scopeBase(db) {
  const base = db.set && db.set.base, mismatch = [], keep = (kind, a) => a.filter(r => { if (r.bc && base && r.bc !== base) { mismatch.push({ kind, id: r.id, storedBase: r.bc }); return false; } return true; });
  const d = { ...db, l: keep('lesson', db.l), sp: keep('student payment', db.sp), tp: keep('teacher payment', db.tp), pr: keep('project', db.pr), rc: keep('course', db.rc) };
  d.pp = db.pp.filter(p => d.pr.some(x => x.id == p.pr)); d.re = db.re.filter(e => d.rc.some(x => x.id == e.rc)); return { d, mismatch };
}
// What migration 003 does to legacy project payments (they never had a rate of their own): base-currency payments get rate 1 ('identity'); payments in any other currency get NO
// base value ('missing') - the parent project's current rate is never copied. Used by tests to express the one documented, intended effect of the migration on base-currency totals.
function stampLegacy(db0) { const d = JSON.parse(JSON.stringify(db0)), base = d.set && d.set.base; d.pp = d.pp.map(x => { const pr = d.pr.find(p => p.id == x.pr) || {}; return pr.cur === base ? { ...x, cur: pr.cur, rx: 1, bc: base, bamt: x.amt, fxs: 'identity' } : { ...x, cur: pr.cur, fxs: 'missing' }; }); return d; }
// same shape as the legacy fin_()
function fin(db0) {
  const { d: db, mismatch } = scopeBase(db0);
  const Z = TOT(db, all(db));
  const out = { rev: Z.rev, cost: Z.cost, profit: Z.p, charged: db.s.reduce((q, x) => q + SS(db, x.id).tot, 0), studentPaid: db.s.reduce((q, x) => q + SS(db, x.id).paid, 0),
    studentRem: db.s.reduce((q, x) => q + SS(db, x.id).rem, 0), teacherCost: db.t.reduce((q, x) => q + TS(db, x.id).cost, 0), teacherPaid: db.t.reduce((q, x) => q + TS(db, x.id).paid, 0),
    studentPayments: sum(db.sp), teacherPayments: sum(db.tp), projectPayments: db.pp.reduce((q, p) => q + p.amt, 0) };
  return Object.defineProperty(out, 'baseMismatch', { value: mismatch, enumerable: false }); // listed, but kept out of the legacy-shaped totals
}
// ---- report modes -------------------------------------------------------------------------------
// ORIGINAL-CURRENCY mode: every amount stays in the currency it was recorded in; no conversion, no rates used.
function byOriginalCurrency(db) {
  const o = {}; const row = c => (o[c || '—'] = o[c || '—'] || { lessonRevenue: 0, lessonCost: 0, projectRevenue: 0, projectShare: 0, courseRevenue: 0, courseShare: 0, courseCost: 0, studentPayments: 0, teacherPayments: 0, projectPayments: 0 });
  db.l.forEach(l => { if (l.st !== 'Completed') return; const a = O(l); row(l.sc).lessonRevenue += a.chg; row(l.tc).lessonCost += a.cost; });
  db.pr.filter(p => p.status != 'Cancelled').forEach(p => { const r = row(p.cur), j = pj(db, p); r.projectRevenue += p.rev; r.projectShare += j.share; });
  db.rc.forEach(c => { const r = row(c.cur), j = rcc(c); r.courseRevenue += j.rev; r.courseShare += j.share; r.courseCost += c.cost; });
  db.sp.forEach(p => { row(p.cur).studentPayments += p.amt; }); db.tp.forEach(p => { row(p.cur).teacherPayments += p.amt; });
  db.pp.forEach(p => { const pr = g(db.pr, p.pr); if (pr) row(pr.cur).projectPayments += p.amt; });
  return o;
}
// CONVERTED mode: base-currency amounts converted with the rate SAVED on each record (never today's rate). Records with no usable saved rate are listed, not guessed.
function convertedSaved(db) {
  const missing = [];
  const chk = (kind, r, ok) => { if (!ok) missing.push({ kind, id: r.id }); };
  db.l.forEach(l => chk('lesson', l, l.trx > 0 && l.srx > 0 || l.bc == l.tc)); db.pr.forEach(p => chk('project', p, p.rx > 0)); db.rc.forEach(c => chk('course', c, c.rx > 0));
  return { basis: 'saved rates per record', base: db.set.base, totals: fin(db), recordsWithoutSavedRate: missing };
}
module.exports = { scopeBase, k_, O, C, S, pj, rcc, TS, SS, TOT, fin, stampLegacy, all, byOriginalCurrency, convertedSaved };
