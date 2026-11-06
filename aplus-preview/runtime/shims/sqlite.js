'use strict';
// Browser stand-in for Node's built-in `node:sqlite` (DatabaseSync / StatementSync), backed by SQLite compiled to
// WebAssembly (sql.js). Databases are real SQLite files on the in-memory file system, so VACUUM INTO, backups,
// integrity checks and file copies behave like the original. Only the API surface used by the original code is provided.
const SQL = () => {
  if (!globalThis.__APLUS_SQL) throw new Error('SQLite engine not initialised');
  return globalThis.__APLUS_SQL;
};
const registry = typeof FinalizationRegistry === 'function' ? new FinalizationRegistry((st) => { try { st.free(); } catch (_) {} }) : null;

function conv(v) {
  if (v === undefined) throw new TypeError('Provided value cannot be bound to SQLite parameter.');
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'boolean') throw new TypeError('Provided value cannot be bound to SQLite parameter.');
  return v;
}
function bindArgs(args) {
  if (args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0]) && !(args[0] instanceof Uint8Array)) {
    const o = {};
    for (const [k, v] of Object.entries(args[0])) {
      if (/^[:$@]/.test(k)) o[k] = conv(v); else { o[':' + k] = conv(v); o['$' + k] = conv(v); o['@' + k] = conv(v); }
    }
    return o;
  }
  return args.map(conv);
}

// node:sqlite reports engine failures as Error{code:'ERR_SQLITE_ERROR', errcode, errstr} with SQLite's own message
function sq(fn) {
  try { return fn(); } catch (e) {
    if (e && !e.code && !(e instanceof TypeError)) { e.code = 'ERR_SQLITE_ERROR'; if (e.errcode === undefined) e.errcode = 1; if (!e.errstr) e.errstr = 'SQL logic error'; }
    throw e;
  }
}

class StatementSync {
  constructor(owner, sql) {
    this._owner = owner; this.sourceSQL = sql;
    this._st = sq(() => owner._d.prepare(sql));
    if (registry) registry.register(this, this._st, this);
  }
  _bind(args) { const st = this._st; st.reset(); if (args.length) sq(() => st.bind(bindArgs(args))); else st.bind([]); return st; }
  run(...args) {
    const st = this._bind(args);
    try { sq(() => st.step()); } finally { st.reset(); }
    const d = this._owner._d;
    return { changes: d.getRowsModified(), lastInsertRowid: this._owner._lastId() };
  }
  get(...args) {
    const st = this._bind(args);
    try { return sq(() => st.step()) ? st.getAsObject() : undefined; } finally { st.reset(); }
  }
  all(...args) {
    const st = this._bind(args); const out = [];
    try { while (sq(() => st.step())) out.push(st.getAsObject()); } finally { st.reset(); }
    return out;
  }
  *iterate(...args) {
    // a separate statement so nested queries inside the loop cannot disturb the cursor
    const st = sq(() => this._owner._d.prepare(this.sourceSQL));
    try { if (args.length) st.bind(bindArgs(args)); while (sq(() => st.step())) yield st.getAsObject(); } finally { st.free(); }
  }
  setReadBigInts() { return this; }
  setAllowBareNamedParameters() { return this; }
}

class DatabaseSync {
  constructor(file, opts = {}) {
    this._file = file;
    if (opts.open !== false) this.open();
  }
  open() {
    const S = SQL();
    if (this._file === ':memory:' || !this._file) { this._d = new S.Database(); }
    else {
      const p = String(this._file).startsWith('/') ? String(this._file) : '/' + String(this._file);
      const dir = p.slice(0, p.lastIndexOf('/')) || '/';
      try { S.FS.stat(dir); } catch (_) { const e = new Error('unable to open database file'); e.code = 'ERR_SQLITE_ERROR'; throw e; }
      S.__p = p; try { this._d = sq(() => new S.Database()); } finally { S.__p = null; }
    }
    this._lid = null;
  }
  get isOpen() { return !!this._d; }
  _lastId() { if (!this._lid) this._lid = this._d.prepare('SELECT last_insert_rowid() AS id'); this._lid.step(); const id = this._lid.get()[0]; this._lid.reset(); return id; }
  exec(sql) { if (!this._d) throw new Error('database is not open'); sq(() => this._d.exec(sql)); }
  prepare(sql) { if (!this._d) throw new Error('database is not open'); return new StatementSync(this, sql); }
  close() { if (!this._d) throw new Error('database is not open'); this._d.close(); this._d = null; this._lid = null; }
}
module.exports = { DatabaseSync, StatementSync };
