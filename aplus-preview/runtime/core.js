'use strict';
// A+ Hub preview runtime core: boots the ORIGINAL server code (aplus-preview/original/src, unchanged apart from the
// build-time adaptations listed in aplus-preview/README.md) against SQLite-in-WebAssembly and an in-memory file system,
// and turns page requests into direct calls of the original request handler.
const initSqlJs = require('sql.js/dist/sql-wasm-debug.js');
const EMBED = require('aplus-embedded');

const DB_FILE = '/app/data/synthetic.sqlite';
const BACKUP_DIR = '/app/backups';
const PERSIST_DIRS = ['/app/data', '/app/backups'];
const PORT = 3001;
const COOKIE = 'aplus_session_' + PORT;
const PREVIEW_PASSWORD = 'DevPreview-2026!';
const PREVIEW_ACCOUNTS = [
  { username: 'dev.admin', display_name: 'DEV Admin (synthetic)', role: 'Admin' },
  { username: 'dev.coordinator', display_name: 'DEV Coordinator (synthetic)', role: 'Coordinator' },
  { username: 'dev.accountant', display_name: 'DEV Accountant (synthetic)', role: 'Accountant' },
  { username: 'dev.teacher', display_name: 'DEV Teacher (synthetic)', role: 'Teacher' },
];

async function createRuntime({ locateFile, snapshot, cookie = '', onCookie = () => {}, log = (...a) => console.info('[A+ Hub preview]', ...a), clock } = {}) {
  const S = await initSqlJs({ locateFile });
  globalThis.__APLUS_SQL = S;
  const FS = S.FS;
  const fs = require('fs');
  const mk = (d) => { if (!fs.existsSync(d)) FS.mkdirTree(d); };
  mk('/tmp');
  for (const [p, txt] of Object.entries(EMBED)) { mk(p.slice(0, p.lastIndexOf('/'))); FS.writeFile(p, txt); }
  for (const d of PERSIST_DIRS) mk(d);
  if (snapshot) for (const [p, bytes] of snapshot) { if (bytes === null) mk(p); else { mk(p.slice(0, p.lastIndexOf('/'))); FS.writeFile(p, bytes); } }

  let created = false;
  if (!fs.existsSync(DB_FILE)) {
    // Same as scripts/init-synthetic-db.js: build the database from the synthetic fixture with the original importer.
    const { migrate } = require('../original/src/importer');
    const r = migrate(fs.readFileSync('/app/fixtures/synthetic-v5.json', 'utf8'), { mode: 'apply', target: DB_FILE });
    log('Synthetic database created: ' + r.status);
    created = true;
  }
  const { start } = require('../original/src/server');
  const opts = { port: PORT, dbFile: DB_FILE, backupDir: BACKUP_DIR, scheduler: true, authRequired: true, log };
  if (clock) opts.clock = clock;
  const server = await start(opts);
  const db = () => server.ctx.db;

  // Synthetic preview accounts, created with the original team module (same validation and scrypt hashing).
  const TEAM = require('../original/src/team');
  if (!db().prepare('SELECT 1 FROM team_users LIMIT 1').get()) {
    const teacher = db().prepare('SELECT id FROM teachers ORDER BY id LIMIT 1').get();
    db().exec('BEGIN');
    try {
      for (const a of PREVIEW_ACCOUNTS) {
        if (a.role === 'Teacher' && !teacher) continue;
        TEAM.createUser(db(), { ...a, password: PREVIEW_PASSWORD, active: 1, teacher_id: a.role === 'Teacher' ? teacher.id : undefined }, 'preview-setup');
      }
      db().exec('COMMIT');
    } catch (e) { db().exec('ROLLBACK'); throw e; }
  }

  let jar = cookie;
  function applySetCookie(v) {
    if (!v) return;
    const first = String(v).split(';')[0]; const eq = first.indexOf('='); const name = first.slice(0, eq), val = first.slice(eq + 1);
    const expired = /max-age=0/i.test(v) || val === '';
    jar = expired ? '' : name + '=' + val;
    onCookie(jar);
  }

  function dispatch(method, url, headers = {}, body) {
    const h = { host: 'localhost:' + PORT, 'sec-fetch-site': 'same-origin' };
    for (const [k, v] of Object.entries(headers || {})) h[k.toLowerCase()] = String(v);
    if (jar) h.cookie = jar;
    const text = body == null ? '' : String(body);
    const req = {
      method: String(method || 'GET').toUpperCase(), url, headers: h,
      __json() {
        if (text.length > 8 * 1024 * 1024) { const e = new Error('request too large'); e.code = 413; throw e; }
        if (!text) return {};
        try { return JSON.parse(text); } catch (_) { const e = new Error('body is not valid JSON'); e.code = 400; throw e; }
      },
    };
    const res = {
      statusCode: 0, _headers: {}, headersSent: false, ended: false, body: null,
      writeHead(code, hd) { this.statusCode = code; this._headers = hd || {}; this.headersSent = true; },
      end(b) { this.body = b; this.ended = true; },
    };
    const handler = globalThis.__APLUS_HANDLER;
    if (!handler) throw new Error('A+ Hub preview server is not running');
    handler(req, res);
    if (!res.ended) throw new Error('A+ Hub preview: request did not complete synchronously: ' + method + ' ' + url);
    const out = {};
    for (const [k, v] of Object.entries(res._headers)) out[k.toLowerCase()] = String(v);
    if (out['set-cookie']) applySetCookie(out['set-cookie']);
    const bytes = res.body == null ? new Uint8Array(0) : typeof res.body === 'string' ? new TextEncoder().encode(res.body) : new Uint8Array(res.body.buffer, res.body.byteOffset, res.body.byteLength);
    return { status: res.statusCode, headers: out, body: bytes, text: () => new TextDecoder().decode(bytes) };
  }

  function snapshotFiles() {
    const out = [];
    const walk = (d) => {
      out.push([d, null]);
      for (const n of fs.readdirSync(d)) { const p = d + '/' + n; const st = fs.statSync(p); if (st.isDirectory()) walk(p); else out.push([p, FS.readFile(p)]); }
    };
    for (const d of PERSIST_DIRS) if (fs.existsSync(d)) walk(d);
    return out;
  }

  return { dispatch, snapshot: snapshotFiles, server, created, cookie: () => jar, accounts: PREVIEW_ACCOUNTS, password: PREVIEW_PASSWORD, stop: () => server.close() };
}
module.exports = { createRuntime, PREVIEW_ACCOUNTS, PREVIEW_PASSWORD, DB_FILE };
