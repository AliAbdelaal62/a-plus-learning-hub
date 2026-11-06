'use strict';
// Larger synthetic dataset (about 3,000 lessons): migration round trip, finance equality and save latency.
const assert = require('node:assert/strict'); const { open, migrate } = require('../src/db'); const { migrate: imp } = require('../src/importer'); const S = require('../src/save'); const { assemble } = require('../src/state'); const fin = require('../src/finance');
const base = require('../fixtures/synthetic-v5.json'); const fs = require('fs'), os = require('os'), path = require('path');
let id = 1; const d = JSON.parse(JSON.stringify(base)); const T = [], St = [], Sub = [], L = [], SP = [], TP = [];
for (let i = 0; i < 40; i++) T.push({ ...base.t[i % 3], id: id++, name: 'DEV Teacher ' + i });
for (let i = 0; i < 150; i++) St.push({ ...base.s[i % 5], id: id++, name: 'DEV Student ' + i });
for (let i = 0; i < 60; i++) Sub.push({ id: id++, name: 'DEV Sub ' + i, type: 'Live', uni: '', inst: T[i % 40].id, studs: [St[i].id, St[i + 1].id] });
const cur = ['KWD', 'EGP', 'SAR', 'USD']; const rate = { KWD: 1, EGP: 0.0064, SAR: 0.082, USD: 0.307 };
for (let i = 0; i < 3000; i++) { const c = cur[i % 4], dur = [0.5, 1, 1.5, 2, 0.75][i % 5], tr = 10000 + (i % 7) * 1250, sr = 15000 + (i % 5) * 2000, r = rate[c];
  L.push({ id: id++, date: '2026-0' + (1 + i % 9) + '-' + String(1 + i % 28).padStart(2, '0'), t: T[i % 40].id, s: St[i % 150].id, sub: Sub[i % 60].id, lv: '', d: dur, tr, sr, st: ['Completed', 'Completed', 'Completed', 'Cancelled', 'No Show', 'Rescheduled'][i % 6], tc: c, sc: c, trx: r, srx: r, bc: 'KWD', bcost: Math.round(Math.round(dur * tr) * r), bchg: Math.round(Math.round(dur * sr) * r), rt: 'Manual', notes: '' }); }
for (let i = 0; i < 600; i++) { SP.push({ id: id++, p: St[i % 150].id, date: '2026-05-01', cur: 'KWD', amt: 5000 + i, rx: 1, rt: 'Same', bamt: 5000 + i, bc: 'KWD', meth: 'Cash', notes: '' }); TP.push({ id: id++, p: T[i % 40].id, date: '2026-05-02', cur: 'KWD', amt: 3000 + i, rx: 1, rt: 'Same', bamt: 3000 + i, bc: 'KWD', meth: 'Cash', notes: '', src: 'Live', srcd: '', lk: 0 }); }
Object.assign(d, { t: T, s: St, sub: Sub, l: L, sp: SP, tp: TP, tt: [], pr: [], pp: [], rc: [], re: [], rm: [], rd: {}, id });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aplus-sc-')), f = path.join(dir, 'x.sqlite'); let t0 = Date.now();
const r = imp(JSON.stringify(d), { mode: 'apply', target: f }); assert.equal(r.status, 'OK', JSON.stringify(r.errors)); assert.equal(r.roundTrip.identical, true); assert.equal(r.reconciliation.matches, true); const tMig = Date.now() - t0;
const db = open(f); migrate(db); const st = assemble(db); assert.equal(JSON.stringify(fin.fin(st)), JSON.stringify(fin.fin(d)));
const g = S.getState(db); const s2 = JSON.parse(JSON.stringify(g.state)); s2.l[10].notes = 'x'; t0 = Date.now(); S.applySave(db, { baseRev: g.rev, state: s2 }); const tSave = Date.now() - t0; assert.ok(tSave < 3000, 'save took ' + tSave + ' ms');
db.close(); fs.rmSync(dir, { recursive: true, force: true });
console.log(`SCALE TEST OK: ${L.length} lessons, ${SP.length + TP.length} payments: migrate ${tMig} ms, one-record save ${tSave} ms, round trip identical, totals equal`);
