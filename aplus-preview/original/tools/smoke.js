'use strict';
// Persistence + isolation smoke test (also run by windows-validate.cmd). Synthetic data in a temp folder; the real database path is only checked, never opened.
const assert = require('node:assert/strict'); const fs = require('fs'), os = require('os'), path = require('path');
const { start } = require('../src/server'); const { migrate } = require('../src/importer'); const base = require('../fixtures/synthetic-v5.json');
const real = path.join(__dirname, '..', 'data', 'aplus.sqlite'); const realBefore = fs.existsSync(real) ? fs.statSync(real).mtimeMs + ':' + fs.statSync(real).size : 'absent';
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aplus-smoke-')), dbFile = path.join(dir, 's.sqlite'); migrate(JSON.stringify(base), { mode: 'apply', target: dbFile });
  const j = async (s, m, u, b) => { const r = await fetch(s.url + u.replace(/^\//, ''), { method: m, headers: { 'content-type': 'application/json', 'x-aplus-token': s.token }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: await r.json() }; };
  let s = await start({authRequired:false, port: 0, dbFile, backupDir: path.join(dir, 'b') }); const h = await j(s, 'GET', '/api/health'); assert.equal(h.status, 200);
  let st = await j(s, 'GET', '/api/state'); const state = st.body.state; state.s.push({ id: state.id, name: 'DEV Smoke Student', status: 'Active' }); state.id++;
  const sv = await j(s, 'POST', '/api/save', { baseRev: st.body.rev, state }); assert.equal(sv.status, 200, JSON.stringify(sv.body)); await s.close();
  s = await start({authRequired:false, port: 0, dbFile, backupDir: path.join(dir, 'b') }); st = await j(s, 'GET', '/api/state'); assert.ok(st.body.state.s.some(x => x.name === 'DEV Smoke Student'), 'record must survive a server restart'); await s.close();
  const after = fs.existsSync(real) ? fs.statSync(real).mtimeMs + ':' + fs.statSync(real).size : 'absent'; assert.equal(after, realBefore, 'the real database path was touched');
  fs.rmSync(dir, { recursive: true, force: true }); console.log('SMOKE OK: save -> stop server -> start server -> record still there (SQLite persistence); real database path untouched (' + realBefore + ').');
})().catch(e => { console.error(e); process.exit(1); });
