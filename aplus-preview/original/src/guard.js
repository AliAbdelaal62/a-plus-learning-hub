'use strict';
// Startup guard (C2). A database file is only ever CREATED when this really is a new installation.
// A zero-byte, truncated, malformed or otherwise unreadable file is never opened for writing, never replaced and never re-initialised:
// the program stops with a message that lists the backups it can see. The damaged file is only ever moved aside by an explicit restore.
const fs = require('fs'), path = require('path');
const { DatabaseSync } = require('node:sqlite');
const NAME = /^aplus-\d{8}-\d{6}(-[a-z0-9_]{1,30})?\.sqlite$/;
class StartupRefused extends Error { constructor(code, message, info = {}) { super(message); this.code = code; this.info = info; } }
const exists = f => { try { return fs.statSync(f); } catch (_) { return null; } };
const WAL_MAGIC = [0x377f0682, 0x377f0683];

function backupsIn(dir) {
  const out = []; try { for (const f of fs.readdirSync(dir)) if (NAME.test(f)) { let m = {}; try { m = JSON.parse(fs.readFileSync(path.join(dir, f + '.json'), 'utf8')); } catch (e) { require('./log').warn('backup manifest unreadable: ' + f, e); } out.push({ name: f, createdAt: m.createdAt || null, verified: m.verified === true, rev: m.rev ?? null }); } } catch (_) {}
  return out.sort((a, b) => b.name.localeCompare(a.name));
}
function recovery(file, backupDir, list) {
  const lines = ['', 'Nothing was changed, deleted or replaced. Your data has NOT been reset.'];
  if (list.length) { lines.push('Backups available in ' + backupDir + ':'); list.slice(0, 5).forEach(b => lines.push('  ' + b.name + (b.createdAt ? '   (' + b.createdAt + ')' : '') + (b.verified ? '   verified' : ''))); lines.push('To recover: stop the server, then run restore-backup.cmd <backup name>. The damaged file is moved aside (never deleted).'); }
  else lines.push('No backups were found in ' + backupDir + '. Do not delete anything. Copy the data folder somewhere safe first. Only if you are certain nothing was ever stored (a brand-new installation), move the damaged file out of the data folder yourself and start again.');
  return lines.join('\n');
}
// Read-only look at the files. Returns { state: 'new' | 'ok' } or throws StartupRefused.
function inspect(file, backupDir) {
  const list = backupsIn(backupDir || path.join(path.dirname(file), '..', 'backups'));
  const refuse = (code, msg, extra) => { throw new StartupRefused(code, msg + recovery(file, backupDir, list), { backups: list, file, ...extra }); };
  const st = exists(file), wal = exists(file + '-wal'), marker = exists(file + '.installed');
  if (!st) {
    if (wal && wal.size > 0) refuse('WAL_WITHOUT_DATABASE', 'The database file is missing but a write-ahead log (' + path.basename(file) + '-wal) is still there, so recent data may only exist in that log.');
    if (marker) refuse('DATABASE_MISSING', 'The database file ' + file + ' is missing, but this installation has been used before.');
    if (list.length) refuse('DATABASE_MISSING_WITH_BACKUPS', 'The database file ' + file + ' is missing, but backups exist, so this is not a new installation.');
    return { state: 'new' };
  }
  if (!st.isFile()) refuse('NOT_A_FILE', file + ' is not a file.');
  if (st.size === 0) refuse('ZERO_BYTE', 'The database file ' + file + ' is empty (0 bytes). It was probably damaged; it is NOT treated as a new database.');
  const fd = fs.openSync(file, 'r'); const head = Buffer.alloc(100); const n = fs.readSync(fd, head, 0, 100, 0); fs.closeSync(fd);
  if (n < 100 || head.subarray(0, 16).toString('latin1') !== 'SQLite format 3\0') refuse('NOT_SQLITE', 'The file ' + file + ' is not a readable SQLite database.');
  let ps = head.readUInt16BE(16); if (ps === 1) ps = 65536; const pages = head.readUInt32BE(28), chg = head.readUInt32BE(24), valid = head.readUInt32BE(92);
  if (pages > 0 && chg === valid && st.size < pages * ps) refuse('TRUNCATED', 'The database file is shorter than its own header says (' + st.size + ' bytes, expected at least ' + pages * ps + '). It looks truncated.');
  if (st.size % ps !== 0 && !wal) refuse('TRUNCATED', 'The database file size is not a whole number of pages. It looks truncated or damaged.');
  if (wal && wal.size > 0) {
    if (wal.size < 32) refuse('WAL_UNREADABLE', 'The write-ahead log (' + path.basename(file) + '-wal) is too short to be valid; SQLite would silently ignore it and recent changes could be lost.');
    const w = fs.openSync(file + '-wal', 'r'); const hb = Buffer.alloc(4); fs.readSync(w, hb, 0, 4, 0); fs.closeSync(w);
    if (!WAL_MAGIC.includes(hb.readUInt32BE(0))) refuse('WAL_UNREADABLE', 'The write-ahead log (' + path.basename(file) + '-wal) is unreadable; SQLite would silently ignore it and recent changes could be lost.');
  }
  let d; try { d = new DatabaseSync(file); } catch (e) { refuse('CANNOT_OPEN', 'The database cannot be opened: ' + e.message); }
  try {
    let ic; try { ic = d.prepare('PRAGMA integrity_check').all().map(r => r.integrity_check); } catch (e) { refuse('INTEGRITY', 'The database failed its integrity check: ' + e.message); }
    if (ic.join() !== 'ok') refuse('INTEGRITY', 'The database failed its integrity check: ' + ic.slice(0, 3).join('; '));
    let fk = []; try { fk = d.prepare('PRAGMA foreign_key_check').all(); } catch (e) { refuse('INTEGRITY', 'The foreign-key check could not run: ' + e.message); }
    if (fk.length) refuse('FOREIGN_KEYS', 'The database has ' + fk.length + ' broken link(s) between records (foreign_key_check).');
    let hasMig = true; try { d.prepare('SELECT count(*) c FROM schema_migrations').get(); } catch (_) { hasMig = false; }
    if (!hasMig) refuse('NOT_APLUS', 'The file is a valid SQLite database but not an A+ Hub database (no schema_migrations table).');
  } finally { try { d.close(); } catch (_) {} }
  return { state: 'ok' };
}
const markInstalled = file => { try { fs.writeFileSync(file + '.installed', JSON.stringify({ firstSeen: new Date().toISOString() }), { flag: 'wx' }); } catch (e) { if (e.code !== 'EEXIST') require('./log').warn('could not write the .installed marker', e); } };
module.exports = { inspect, markInstalled, StartupRefused, backupsIn, NAME };
