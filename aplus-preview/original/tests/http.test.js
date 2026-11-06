'use strict';
const assert = require('node:assert/strict'); const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { start } = require('../src/server'); const { migrate } = require('../src/importer'); const base = require('../fixtures/synthetic-v5.json'); let n = 0; const ok = () => n++;
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aplus-http-')), dbFile = path.join(dir, 'data', 'a.sqlite'), backupDir = path.join(dir, 'backups'); fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  migrate(JSON.stringify(base), { mode: 'apply', target: dbFile });
  const s = await start({authRequired:false, port: 0, dbFile, backupDir }); const P = s.port; assert.equal(s.server.address().address, '127.0.0.1'); ok();
  const raw = (p, o = {}) => new Promise((res, rej) => { const rq = http.request({ host: '127.0.0.1', port: P, path: p, method: o.method || 'GET', headers: { Host: 'localhost:' + P, ...(o.headers || {}) } }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: b })); }); rq.on('error', rej); if (o.body !== undefined) rq.write(o.body); rq.end(); });
  const J = async (p, method = 'GET', body, extra = {}) => { const r = await raw(p, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'Content-Type': 'application/json', ...(method === 'GET' ? {} : { 'X-APlus-Token': s.token }), ...extra } }); let j = {}; try { j = JSON.parse(r.body); } catch (_) {} return { status: r.status, j, r }; };
  // static: index served with token and CSP; nothing sensitive reachable
  let r = await raw('/'); assert.equal(r.status, 200); assert.match(r.body, /name="aplus-token" content="[0-9a-f]{48}"/); assert.match(r.headers['content-security-policy'], /default-src 'self'/); ok();
  for (const p of ['/data/a.sqlite', '/../package.json', '/%2e%2e/src/server.js', '/.env', '/.git/config', '/vendor/..%2f..%2fsrc/db.js', '/backups/', '/src/db.js', '/public/index.html', '/index.html%00.png', '/vendor/', '/vendor/xlsx.LICENSE']) { r = await raw(p); assert.ok(r.status === 404 || r.status === 400, p + ' -> ' + r.status); }
  ok();
  r = await raw('/vendor/chart.umd.min.js'); assert.equal(r.status, 200); ok();
  // host header / DNS rebinding
  r = await raw('/api/health', { headers: { Host: 'evil.example.com' } }); assert.equal(r.status, 421); r = await raw('/api/health', { headers: { Host: 'localhost:1' } }); assert.equal(r.status, 421); ok();
  // read endpoints
  let g = await J('/api/health'); assert.equal(g.j.ok, true); g = await J('/api/state'); assert.equal(g.status, 200); assert.equal(g.j.state.l.length, base.l.length); const rev0 = g.j.rev; ok();
  // writes need the token, JSON content type, same origin
  r = await raw('/api/save', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } }); assert.equal(r.status, 403);
  r = await raw('/api/save', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json', 'X-APlus-Token': 'wrong' } }); assert.equal(r.status, 403);
  r = await raw('/api/save', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json', 'X-APlus-Token': s.token, Origin: 'http://evil.example.com' } }); assert.equal(r.status, 403);
  r = await raw('/api/save', { method: 'POST', body: '{}', headers: { 'Content-Type': 'text/plain', 'X-APlus-Token': s.token } }); assert.equal(r.status, 415); ok();
  // size limit and malformed bodies
  r = await raw('/api/save', { method: 'POST', body: 'x'.repeat(9 * 1024 * 1024), headers: { 'Content-Type': 'application/json', 'X-APlus-Token': s.token } }).catch(e => ({ status: 413 })); assert.equal(r.status, 413);
  r = await raw('/api/save', { method: 'POST', body: '{not json', headers: { 'Content-Type': 'application/json', 'X-APlus-Token': s.token } }); assert.equal(r.status, 400); ok();
  // save round trip over HTTP + validation + stale revision
  const st = JSON.parse(JSON.stringify(g.j.state)); st.l[0].notes = 'via http'; let sv = await J('/api/save', 'POST', { baseRev: rev0, state: st }); assert.equal(sv.status, 200); assert.equal(sv.j.rev, rev0 + 1); ok();
  sv = await J('/api/save', 'POST', { baseRev: rev0, state: st }); assert.equal(sv.status, 409); ok();
  const bad = JSON.parse(JSON.stringify(st)); bad.l[0].st = 'Nope'; sv = await J('/api/save', 'POST', { baseRev: rev0 + 1, state: bad }); assert.equal(sv.status, 422); assert.ok(sv.j.detail.length); ok();
  g = await J('/api/state'); assert.equal(g.j.state.l[0].notes, 'via http'); ok();
  // SQL-looking input is just data
  const inj = JSON.parse(JSON.stringify(g.j.state)); inj.t[0].name = "Robert'); DROP TABLE lessons;--"; sv = await J('/api/save', 'POST', { baseRev: g.j.rev, state: inj }); assert.equal(sv.status, 200); g = await J('/api/state'); assert.equal(g.j.state.t[0].name, "Robert'); DROP TABLE lessons;--"); assert.equal(g.j.state.l.length, base.l.length); ok();
  // impact + protected delete
  let im = await J('/api/impact?e=t&id=100'); assert.equal(im.j.canDelete, false); assert.ok(im.j.dependants.lessons); r = await J('/api/impact?e=zz&id=1'); assert.equal(r.status, 400); ok();
  const del = JSON.parse(JSON.stringify(g.j.state)); del.t = del.t.filter(x => x.id !== 100); sv = await J('/api/save', 'POST', { baseRev: g.j.rev, state: del }); assert.equal(sv.status, 409); ok();
  // reports: both modes
  r = await J('/api/reports/original-currency'); assert.equal(r.j.mode, 'original-currency'); assert.ok(r.j.byCurrency.KWD); r = await J('/api/reports/converted'); assert.equal(r.j.mode, 'converted-saved-rates'); ok();
  // backup / restore over HTTP
  const b = await J('/api/backups', 'POST', { label: 'http' }); assert.equal(b.j.backup.verified, true); const lst = await J('/api/backups'); assert.equal(lst.j.backups.length, 1); ok();
  const mod = JSON.parse(JSON.stringify(g.j.state)); mod.l[0].notes = 'after backup'; g = await J('/api/state'); sv = await J('/api/save', 'POST', { baseRev: g.j.rev, state: mod }); assert.equal(sv.status, 200);
  r = await J('/api/restore', 'POST', { name: b.j.backup.name }); assert.equal(r.status, 400); r = await J('/api/restore', 'POST', { name: '../x', confirm: true }); assert.ok(r.status >= 400); ok();
  r = await J('/api/restore', 'POST', { name: b.j.backup.name, confirm: true }); assert.equal(r.status, 200); g = await J('/api/state'); assert.equal(g.j.state.l[0].notes, 'via http'); ok();
  r = await J('/api/export'); assert.equal(r.j.format, 'aplus-localhost-export'); ok();
  r = await J('/api/nope'); assert.equal(r.status, 404); ok();
  await s.close(); fs.rmSync(dir, { recursive: true, force: true });
  console.log('HTTP TEST OK: ' + n + ' checks (loopback bind, Host/Origin/token/content-type, 8 MB limit, static whitelist + traversal attempts, save/validation/stale/injection, impact + protected delete, report modes, backup/restore, export)');
})().catch(e => { console.error(e); process.exit(1); });
