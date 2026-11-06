'use strict';
const assert = require('node:assert/strict');
const f = require('../src/finance'); const d = require('../fixtures/synthetic-v5.json'); const b = require('../baselines/baseline-v8.json').snapshot;
const J = JSON.stringify; let n = 0; const eq = (a, e, m) => { assert.equal(J(a), J(e), m); n++; };
eq(f.fin(d), b.fin, 'fin totals'); eq(f.TOT(d, f.all(d)), b.total, 'TOT');
eq(Object.fromEntries(d.s.map(z => [z.name, f.SS(d, z.id)])), b.studentBalances, 'student balances');
eq(Object.fromEntries(d.t.map(z => [z.name, f.TS(d, z.id)])), b.teacherBalances, 'teacher balances');
eq(d.pr.map(p => [p.name, f.pj(d, p)]), b.projects, 'projects'); eq(d.rc.map(c => [c.name, f.rcc(c)]), b.courses, 'courses');
eq(d.l.map(l => [l.id, l.st, f.C(l)]), b.lessonAmounts, 'lesson amounts (No Show / Cancelled count as zero)');
// explicit business rules on hand-computed numbers
const p = f.pj({ pp: [{ pr: 1, amt: 5000 }] }, { id: 1, rev: 100000, share: 35, rx: 1, paid0: 1000 });
assert.deepEqual([p.share, p.prof, p.paid, p.out], [35000, 65000, 6000, 94000]); n++;
const c = f.rcc({ price: 12345, n: 3, share: 30, cost: 1000, rx: 1 }); assert.deepEqual([c.rev, c.share, c.prof], [37035, 11111, 37035 - 11111 - 1000]); n++; // 11110.5 rounds half up
const c2 = f.rcc({ price: 100000, n: 2, share: 10, cost: 5000, rx: 0.0064 }); assert.equal(c2.brev, Math.round(200000 * 0.0064)); n++;
// original-currency mode never uses a rate; converted mode reports records lacking a saved rate instead of guessing
const oc = f.byOriginalCurrency(d); assert.ok(oc.KWD && oc.SAR && oc.USD); const tot = Object.values(oc).reduce((s, r) => s + r.studentPayments, 0); assert.equal(tot, d.sp.reduce((s, x) => s + x.amt, 0)); n++;
const bad = JSON.parse(J(d)); bad.pr[0].rx = 0; assert.ok(f.convertedSaved(bad).recordsWithoutSavedRate.some(x => x.kind === 'project' && x.id === bad.pr[0].id)); n++;
// Mutation guard: floor instead of round must change something in this fixture
assert.notEqual(Math.floor(12480 * 0.0064), f.k_(12480, 0.0064)); n++; // a floor mutation would be visible
console.log('FINANCE TEST OK: ' + n + ' checks (equals baseline-v8 on 7 sections, business rules, original-currency mode, missing-rate reporting)');
