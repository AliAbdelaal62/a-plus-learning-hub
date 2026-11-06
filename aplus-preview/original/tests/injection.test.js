'use strict';
// L7: markup-like values in EVERY text column must never become live HTML, whichever screen shows them.
// The database is poisoned with raw SQL (bypassing the importer and save validation, which are the first line of defence) so this proves the render layer on its own.
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('INJECTION TEST SKIPPED (Playwright not installed). A skipped test is not a pass.'); process.exit(77); }
const assert = require('node:assert/strict'), fs = require('fs'), os = require('os'), path = require('path'); const { DatabaseSync } = require('node:sqlite');
const { E } = require('../src/mapping'); const JCOL = new Set(); for (const e of Object.values(E)) for (const [f, ty] of Object.entries(e.cols)) if (String(ty).startsWith('j')) JCOL.add(e.table + '.' + f);
const { start } = require('../src/server'), { migrate } = require('../src/importer');
const base = require('../fixtures/synthetic-v5.json');
let seq = 0; const P = tag => `"><img src=x id=INJ_${tag}_${++seq} onerror="window.__pwn=(window.__pwn||0)+1">'+(window.__pwn2=1)+'`;
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aplus-inj-')), dbFile = path.join(dir, 'data', 'a.sqlite');
  const rep = migrate(JSON.stringify(base), { mode: 'apply', target: dbFile, backupDir: path.join(dir, 'backups') }); assert.ok(/applied|ok/i.test(rep.status) || rep.status, 'import');
  const h = new DatabaseSync(dbFile); let poisoned = 0, skipped = 0;
  const tables = h.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('schema_meta','schema_migrations','id_registry','audit_log','migration_runs','migration_quarantine')").all().map(r => r.name);
  h.exec('PRAGMA foreign_keys=OFF;');
  for (const t of tables) for (const c of h.prepare(`PRAGMA table_info(${t})`).all()) {
    if (c.pk || /json/i.test(c.name) || /^(id|.*_id|seq|extra_json|rev|key|value)$/.test(c.name) || !/CHAR|TEXT|^$/i.test(c.type)) continue;
    if (JCOL.has(t + '.' + c.name)) continue; // numeric day list: its shape is enforced by the save validator
    const val = P(t + '_' + c.name);
    try { const r = h.prepare(`UPDATE ${t} SET ${c.name}=? WHERE ${c.name} IS NOT NULL AND ${c.name}<>''`).run(val); if (r.changes) poisoned += r.changes; } catch (e) { skipped++; }
  }
  for (const r of h.prepare('SELECT key,value FROM settings').all()) { let v; try { v = JSON.parse(r.value) } catch (e) { continue } if (typeof v === 'string' && v !== '') { h.prepare('UPDATE settings SET value=? WHERE key=?').run(JSON.stringify(P('set_' + r.key)), r.key); poisoned++; } }
  h.close(); assert.ok(poisoned > 100, 'poison reached many cells: ' + poisoned);
    try { require('../src/state').assemble(new DatabaseSync(dbFile)) } catch (e) { console.log('STATE ERR', e.stack.split('\n').slice(0,3).join(' | ')) }
  const s = await start({authRequired:false, port: 0, dbFile, backupDir: path.join(dir, 'backups') }); const br = await chromium.launch(); const pg = await br.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(String(e))); pg.on('dialog', d => d.dismiss());
  await pg.goto(s.url); await pg.waitForSelector('#nv');
  const leaks = new Set(); let seen = 0;
  const probe = async label => { await pg.waitForTimeout(40); const r = await pg.evaluate(() => ({ ids: [...document.querySelectorAll('[id^=INJ_]')].map(e => e.id.replace(/_\d+$/, '')), pwn: window.__pwn || 0, p2: window.__pwn2 || 0 })); seen++; if (r.ids.length || r.pwn || r.p2) leaks.add(label + ' -> ' + r.ids.slice(0, 4).join(',')); };
  for (const p of ['Dashboard', 'Timetable', 'Teachers', 'Students', 'Subjects', 'Lessons', 'Projects', 'Recorded Courses', 'Payments', 'Reports', 'Cash Flow', 'Settings']) { await pg.evaluate(p => { V.nav = p; render() }, p); await probe('page ' + p); }
  const ids = await pg.evaluate(() => ({ t: db.t.map(x => x.id), s: db.s.map(x => x.id), pr: db.pr.map(x => x.id), rc: db.rc.map(x => x.id) })); assert.ok(ids.t.length && ids.s.length && ids.pr.length && ids.rc.length, 'the poisoned data must load, otherwise this test proves nothing: ' + await pg.evaluate(() => LOCK));
  for (const [key, nav, v] of [['t', 'Teachers', 'tid'], ['s', 'Students', 'sid'], ['pr', 'Projects', 'prid'], ['rc', 'Recorded Courses', 'rcid']]) { for (const id of ids[key]) { await pg.evaluate(([n, v, id]) => { V.nav = n; V[v] = id; render() }, [nav, v, id]); await probe(nav + ' detail ' + id); } await pg.evaluate(v => { V[v] = null }, v); }
  for (const rp of ['daily', 'weekly', 'monthly', 'custom']) { await pg.evaluate(rp => { V.nav = 'Reports'; V.RP.p = rp; render() }, rp); await probe('reports ' + rp); }
  for (const f of ['edT', 'edS', 'edL', 'edPR', 'edRC', 'edTT', 'edSub', 'edPP', 'edRE', 'edRM']) {
    const lst = await pg.evaluate(f => { const m = { edT: db.t, edS: db.s, edL: db.l, edPR: db.pr, edRC: db.rc, edTT: db.tt, edSub: db.sub, edPP: db.pp, edRE: db.re, edRM: db.rm }[f]; return (m || []).map(x => x.id).slice(0, 25) }, f);
    for (const id of lst) { await pg.evaluate(([f, id]) => { try { eval(f)(id) } catch (e) { } }, [f, id]); await probe(f + ' ' + id); await pg.evaluate(() => { try { close() } catch (e) { } }); }
  }
  await br.close(); await s.close(); fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(errs.length, 0, 'page errors: ' + errs.slice(0, 3).join(' | '));
  assert.equal(leaks.size, 0, 'live markup from stored values on: \n' + [...leaks].slice(0, 40).join('\n'));
  console.log(`INJECTION TEST OK: ${poisoned} stored cells poisoned with raw SQL (${skipped} columns refused by DB constraints), ${seen} screens/details/forms rendered, no injected element or script ran`);
})().catch(e => { console.error(e); process.exit(1); });
