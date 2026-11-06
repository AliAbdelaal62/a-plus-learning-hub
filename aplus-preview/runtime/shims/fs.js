'use strict';
// Browser stand-in for Node's `fs` (synchronous calls only), on top of the in-memory Emscripten file system that the
// SQLite engine also uses. The whole /app/data and /app/backups tree is saved to browser storage by the runtime.
const { Buffer } = require('buffer');
const FS = () => globalThis.__APLUS_SQL.FS;
const CODES = { 44: 'ENOENT', 20: 'EEXIST', 54: 'ENOTDIR', 31: 'EISDIR', 55: 'ENOTEMPTY', 28: 'EINVAL' };
function wrap(fn, op, p) {
  try { return fn(); } catch (e) {
    if (e && e.errno !== undefined && !e.code) {
      const code = CODES[e.errno] || 'EIO'; const x = new Error(`${code}: ${op} '${p}'`); x.code = code; x.errno = e.errno; x.path = p; throw x;
    }
    throw e;
  }
}
const enc = (o) => (typeof o === 'string' ? o : o && o.encoding) || null;
function statObj(s) {
  const mode = s.mode;
  return { size: s.size, mode, mtime: new Date(s.mtime), mtimeMs: +new Date(s.mtime), isFile: () => (mode & 0o170000) === 0o100000, isDirectory: () => (mode & 0o170000) === 0o040000 };
}
const fs = {
  existsSync(p) { try { FS().stat(String(p)); return true; } catch (_) { return false; } },
  statSync(p, o) { try { return statObj(FS().stat(String(p))); } catch (e) { if (o && o.throwIfNoEntry === false) return undefined; return wrap(() => { throw e; }, 'stat', p); } },
  readFileSync(p, o) { const u = wrap(() => FS().readFile(String(p)), 'open', p); const b = Buffer.from(u.buffer, u.byteOffset, u.byteLength); const e = enc(o); return e ? b.toString(e) : b; },
  writeFileSync(p, data, o) {
    const flag = o && typeof o === 'object' ? o.flag : undefined;
    if (flag === 'wx' && fs.existsSync(p)) { const x = new Error(`EEXIST: file already exists, open '${p}'`); x.code = 'EEXIST'; throw x; }
    const bytes = typeof data === 'string' ? Buffer.from(data, enc(o) || 'utf8') : data;
    wrap(() => FS().writeFile(String(p), bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)), 'open', p);
  },
  appendFileSync(p, data) { const old = fs.existsSync(p) ? fs.readFileSync(p) : Buffer.alloc(0); fs.writeFileSync(p, Buffer.concat([old, Buffer.from(data)])); },
  mkdirSync(p, o) { p = String(p); if (o && o.recursive) { if (!fs.existsSync(p)) FS().mkdirTree(p); return; } wrap(() => FS().mkdir(p), 'mkdir', p); },
  mkdtempSync(prefix) { const p = prefix + Math.random().toString(36).slice(2, 8); fs.mkdirSync(p, { recursive: true }); return p; },
  readdirSync(p) { return wrap(() => FS().readdir(String(p)), 'scandir', p).filter((n) => n !== '.' && n !== '..').sort(); },
  renameSync(a, b) { wrap(() => FS().rename(String(a), String(b)), 'rename', a); },
  copyFileSync(a, b, mode) { if (mode && fs.existsSync(b)) { const x = new Error(`EEXIST: file already exists, copyfile '${a}' -> '${b}'`); x.code = 'EEXIST'; throw x; } fs.writeFileSync(b, fs.readFileSync(a)); },
  unlinkSync(p) { wrap(() => FS().unlink(String(p)), 'unlink', p); },
  rmSync(p, o = {}) {
    p = String(p);
    if (!fs.existsSync(p)) { if (o.force) return; return fs.statSync(p); }
    const st = fs.statSync(p);
    if (st.isDirectory()) { if (!o.recursive) { const x = new Error('EISDIR'); x.code = 'ERR_FS_EISDIR'; throw x; } for (const n of fs.readdirSync(p)) fs.rmSync(p + '/' + n, o); FS().rmdir(p); }
    else FS().unlink(p);
  },
  openSync(p, flags = 'r') { return wrap(() => FS().open(String(p), flags), 'open', p); },
  readSync(fd, buf, off = 0, len = buf.length, pos = null) { return FS().read(fd, buf, off, len, pos === null ? undefined : pos); },
  writeSync(fd, buf, off = 0, len = buf.length, pos = null) { return FS().write(fd, buf, off, len, pos === null ? undefined : pos); },
  fsyncSync() {}, closeSync(fd) { FS().close(fd); },
  constants: { COPYFILE_EXCL: 1 },
};
fs.promises = {};
module.exports = fs;
