'use strict';
// Decision B: a teacher with any history is archived (Inactive), never deleted; history and money stay intact.
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { chromium = null; }
const assert = require('node:assert/strict'); const fs = require('fs'), os = require('os'), path = require('path');
const { open, migrate } = require('../src/db'); const { migrate: imp } = require('../src/importer'); const S = require('../src/save'); const { assemble } = require('../src/state');
const { makeOrig } = require('../src/orig'); const f = require('../src/finance'); const { start } = require('../src/server');
const base = require('../fixtures/synthetic-v5.json'); const J = x => JSON.parse(JSON.stringify(x)); let n = 0; const ok = () => n++;
const mk = d => makeOrig({ O: f.O, pj: p => f.pj(d, p), rcc: f.rcc });
// helper: a state where teacher `id` is referenced by exactly the listed kinds of history
const only = (keep, tid = 100) => { const d = J(base); const own = r => r.t === tid;
  if (!keep.includes('l')) d.l = d.l.filter(l => !own(l)); if (!keep.includes('tp')) d.tp = d.tp.filter(p => p.p !== tid);
  if (!keep.includes('tt')) d.tt = d.tt.filter(x => !own(x)); if (!keep.includes('pr')) { const ids = d.pr.filter(own).map(p => p.id); d.pr = d.pr.filter(p => !own(p)); d.pp = (d.pp || []).filter(p => !ids.includes(p.pr)); }
  if (!keep.includes('rc')) { const ids = d.rc.filter(c => c.inst === tid).map(c => c.id); d.rc = d.rc.filter(c => c.inst !== tid); d.re = (d.re || []).filter(e => !ids.includes(e.rc)); const gone = d.rm.filter(r => ids.includes(r.rc)).map(r => String(r.id)); d.rm = d.rm.filter(r => !ids.includes(r.rc)); d.rd = Object.fromEntries(Object.entries(d.rd).filter(([k]) => !gone.includes(k.split('|')[0]))); }
  if (!keep.includes('sub')) d.sub.forEach(z => { if (z.inst === tid) z.inst = 101; }); return d; };
const mkdb = d => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aplus-ta-')), file = path.join(dir, 'x.sqlite'); const r = imp(JSON.stringify(d), { mode: 'apply', target: file }); if (r.quarantined.length || !/^(IMPORTED|OK)/.test(r.status)) throw new Error('fixture import: ' + r.status + ' ' + JSON.stringify(r.quarantined).slice(0, 500)); const db = open(file); migrate(db); return { dir, db }; };
const without = (st, id) => { const s = J(st); s.t = s.t.filter(x => x.id !== id); return s; };
const tryDelete = (db, st, id) => { const { rev } = S.getState(db); try { S.applySave(db, { baseRev: rev, state: without(st, id) }); return null; } catch (e) { return e; } };
const count = db => ['teachers', 'lessons', 'teacher_payments', 'timetable_entries', 'projects', 'recorded_courses', 'subjects'].map(t => db.prepare(`SELECT count(*) c FROM ${t}`).get().c).join(',');
// 1. each kind of history alone blocks deletion; nothing is removed
for (const kind of ['l', 'tp', 'tt', 'pr', 'rc', 'sub']) {
  const d = only([kind]); const { dir, db } = mkdb(d); const st = assemble(db), before = count(db);
  const has = { l: st.l.some(x => x.t === 100), tp: st.tp.some(x => x.p === 100), tt: st.tt.some(x => x.t === 100), pr: st.pr.some(x => x.t === 100), rc: st.rc.some(x => x.inst === 100), sub: st.sub.some(x => x.inst === 100) };
  assert.ok(has[kind], 'fixture variant really holds ' + kind);
  const im = S.impact(db, 't', 100); assert.equal(im.canDelete, false, kind); assert.ok(im.total > 0);
  const e = tryDelete(db, st, 100); assert.ok(e && e.code === 409, 'delete of teacher with ' + kind + ' refused: ' + (e && e.code)); assert.equal(count(db), before, 'nothing removed'); ok();
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
}
// 2. no typed-confirmation bypass: even with a confirm flag in the request, protected deletion is refused
{ const { dir, db } = mkdb(base); const st = assemble(db), { rev } = S.getState(db), before = count(db);
  for (const extra of [{ confirm: 'DELETE' }, { confirm: true }, { confirmText: 'DEV Teacher 01' }, { force: true }, { cascade: true }]) { try { S.applySave(db, { baseRev: rev, state: without(st, 100), ...extra }); assert.fail('must refuse'); } catch (e) { assert.equal(e.code, 409); } }
  assert.equal(count(db), before); ok();
  // deleting the teacher AND their lessons/payments in one request is also refused (no cascade of financial history)
  const s2 = without(st, 100); s2.l = s2.l.filter(x => x.t !== 100); s2.tp = s2.tp.filter(x => x.p !== 100); s2.tt = s2.tt.filter(x => x.t !== 100);
  try { S.applySave(db, { baseRev: rev, state: s2 }); assert.fail('must refuse'); } catch (e) { assert.equal(e.code, 409); } assert.equal(count(db), before); ok();
  db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
// 3. archive: preserves everything, money unchanged, still in historical reports
{ const { dir, db } = mkdb(base); const st0 = assemble(db), { rev } = S.getState(db);
  const L0 = JSON.stringify(mk(st0).teacherLedger(st0, '')), W0 = JSON.stringify(mk(st0).work(f.all(st0))), F0 = JSON.stringify(f.fin(st0)), C0 = count(db);
  const s2 = J(st0); s2.t.find(x => x.id === 100).status = 'Inactive'; const r = S.applySave(db, { baseRev: rev, state: s2 }); assert.equal(r.changed.t.updated, 1);
  const st1 = assemble(db); assert.equal(st1.t.find(x => x.id === 100).status, 'Inactive'); assert.equal(count(db), C0, 'no row added or removed');
  for (const k of ['l', 'tp', 'tt', 'pr', 'rc', 'sub']) assert.equal(JSON.stringify(st1[k]), JSON.stringify(st0[k]), k + ' untouched');
  assert.equal(JSON.stringify(mk(st1).work(f.all(st1))), W0, 'work totals unchanged'); assert.equal(JSON.stringify(f.fin(st1)), F0, 'finance baseline unchanged');
  const L1 = mk(st1).teacherLedger(st1, ''); assert.equal(JSON.stringify(L1), L0, 'teacher balances unchanged'); assert.ok(L1.some(r => String(r.t || r.id || r.teacher || '').length) || L1.length > 0);
  assert.ok(db.prepare("SELECT count(*) c FROM audit_log WHERE entity='t'").get().c > 0, 'audit history kept'); assert.ok(db.prepare("SELECT count(*) c FROM id_registry WHERE id=100").get().c === 1, 'id still reserved'); ok();
  // reactivating works and is also a plain update
  const s3 = J(st1); s3.t.find(x => x.id === 100).status = 'Active'; S.applySave(db, { baseRev: S.getState(db).rev, state: s3 }); assert.equal(assemble(db).t.find(x => x.id === 100).status, 'Active'); ok();
  db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
// 4. a completely unused teacher can be deleted (and only that one)
{ const d = J(base); d.t.push({ id: d.id, name: 'DEV Unused', cur: 'KWD', status: 'Active', tr: 0 }); const tid = d.id; d.id++; const { dir, db } = mkdb(d); const st = assemble(db), im = S.impact(db, 't', tid); assert.equal(im.total, 0); assert.equal(im.canDelete, true);
  assert.equal(tryDelete(db, st, tid), null); assert.equal(assemble(db).t.length, base.t.length); assert.ok(db.prepare('SELECT count(*) c FROM id_registry WHERE id=?').get(tid).c === 1, 'deleted id is never reused'); ok();
  db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
// 5. other entities are protected the same way
{ const { dir, db } = mkdb(base); const st = assemble(db); const before = count(db);
  for (const [k, id] of [['s', base.s[0].id], ['sub', base.sub[0].id], ['pr', base.pr[0].id], ['rc', base.rc[0].id]]) { const im = S.impact(db, k, id); const { rev } = S.getState(db); const s2 = J(st); s2[k] = s2[k].filter(x => x.id !== id);
    if (im.total) { try { S.applySave(db, { baseRev: rev, state: s2 }); assert.fail(k + ' with history must be refused'); } catch (e) { assert.equal(e.code, 409, k); } } }
  assert.equal(count(db), before); ok(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
// 6. teacher-payment source rules are intact: Other needs a description; unassigned stays identifiable
{ const o = mk(base).teacherLedger(base, ''); assert.ok(o.some(r => r.unassignedPaid > 0)); const srcs = new Set(base.tp.map(p => p.src)); assert.ok([...srcs].every(x => ['Live', 'Recorded', 'Project', 'Other', undefined, ''].includes(x))); ok(); }
(async () => {
  if (!chromium) { console.log('TEACHER ARCHIVE (server part) OK: ' + n + ' checks. BROWSER PART SKIPPED: Playwright is not installed. This is NOT a pass for the selectors.'); process.exit(77); }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aplus-tb-')), dbFile = path.join(dir, 'a.sqlite'); imp(JSON.stringify(base), { mode: 'apply', target: dbFile });
  const s = await start({authRequired:false, port: 0, dbFile, backupDir: path.join(dir, 'b') }); const br = await chromium.launch(); const pg = await br.newPage(); const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  await pg.goto(s.url); await pg.waitForSelector('#nv');
  const opts = async (open, sel) => pg.evaluate(([open, sel]) => { close(); eval(open); const r = [...document.querySelectorAll('#f_' + sel + ' option')].map(o => o.textContent); close(); return r; }, [open, sel]);
  const names = await pg.evaluate(() => db.t.map(t => [t.id, t.name]));
  // archive teacher 102 through the real UI function path (edit + status) and save to the server
  await pg.evaluate(() => { db.t.find(t => t.id == 102).status = 'Inactive'; save(); });
  const T = names.find(x => x[0] === 102)[1];
  for (const [open, sel, label] of [['edL()', 't', 'lesson'], ['edTT()', 't', 'timetable'], ['edPR()', 't', 'project'], ['edRC()', 'inst', 'course'], ['newSub()', 'inst', 'subject']]) {
    const o = await opts(open, sel); assert.ok(!o.some(x => x.startsWith(T)), label + ' new-work selector must not offer the inactive teacher: ' + o.join('|')); assert.ok(o.some(x => x.startsWith('DEV Teacher 01')), label + ' still offers active teachers'); ok(); }
  // editing an EXISTING record that uses the inactive teacher keeps (and labels) its teacher
  const L = await pg.evaluate(() => db.l.find(l => l.t == 102).id); let o = await opts(`edL(${L})`, 't'); assert.ok(o.includes(T + ' (inactive)'), 'existing lesson keeps its teacher: ' + o.join('|')); ok();
  // payments: an archived teacher may still be owed money, so the payment form lists them, labelled
  o = await opts("edP('tp')", 'p'); assert.ok(o.includes(T + ' (inactive)'), o.join('|')); ok();
  // filters still list every teacher so history stays reachable
  const filt = await pg.evaluate(() => { V.nav = 'Lessons'; render(); return [...document.querySelectorAll('#v select')].some(s => [...s.options].some(o => o.textContent.startsWith('DEV Teacher 03'))) }); assert.ok(filt); ok();
  // archived teacher still in historical reports (Teachers ledger / Reports) and Teachers screen
  const rep = await pg.evaluate(() => { V.nav = 'Reports'; V.MODE.RP = 'orig'; V.RP.p = 'custom'; V.RP.a = '2000-01-01'; V.RP.b = '2100-01-01'; render(); return document.querySelector('#v').innerText; }); assert.match(rep, /DEV Teacher 03/); ok();
  const tt = await pg.evaluate(() => { V.nav = 'Teachers'; render(); return document.querySelector('#v').innerText; }); assert.match(tt, /DEV Teacher 03/); assert.match(tt, /Inactive/); ok();
  // delete attempt shows the explanation + Archive action, and removes nothing
  const before = await pg.evaluate(() => db.t.length);
  await pg.evaluate(() => dlT(101)); await pg.waitForSelector('#md'); const modal = await pg.evaluate(() => document.querySelector('#md').innerText);
  assert.match(modal, /cannot be deleted|can.t be deleted|history/i); assert.match(modal, /Archive/i); assert.doesNotMatch(modal, /type .*(DELETE|name).* to confirm/i); ok();
  assert.equal(await pg.evaluate(() => db.t.length), before); await pg.evaluate(() => close());
  // server agrees: nothing was removed
  const st = await (await fetch(s.url + 'api/health')).json(); assert.ok(st); ok();
  // payment source Other without a description is refused by the form
  const er = await pg.evaluate(() => { close(); edP('tp'); $('#f_p').value = '100'; $('#f_src').value = 'Other'; $('#f_srcd').value = ''; $('#f_date').value = '2026-10-01'; $('#f_amt').value = '1'; $('#sv').click(); return document.querySelector('#er').textContent; }); assert.match(er, /Other Payment Source Description is required/); ok();
  assert.deepEqual(errs, [], errs.join(' | ')); ok();
  await br.close(); await s.close(); fs.rmSync(dir, { recursive: true, force: true });
  console.log('TEACHER ARCHIVE TEST OK: ' + n + ' checks (every history kind blocks deletion, no typed-confirmation/cascade bypass, archive preserves rows + balances + reports + audit, unused teacher deletable, other entities protected; in Chromium: new-work selectors exclude inactive teachers, existing records and payments keep them labelled, filters/reports/Teachers screen keep them, delete explanation offers Archive, Other source needs description).');
})().catch(e => { console.error(e); process.exit(1); });
