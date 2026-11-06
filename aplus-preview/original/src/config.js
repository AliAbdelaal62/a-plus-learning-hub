'use strict';
// Small settings file that lives NEXT TO the database (not inside it), so a restore never changes it.
const fs = require('fs'), path = require('path');
const DEFAULTS = { autoBackup: true, backupIntervalHours: 24, keepAutoBackups: 30, secondBackupDir: '', staleRateHours: 24, sessionMinutes: 480 };
const fileFor = dbFile => dbFile + '.config.json';
function load(dbFile) { let o = {}; try { o = JSON.parse(fs.readFileSync(fileFor(dbFile), 'utf8')); } catch (e) { if (e.code !== 'ENOENT') require('./log').warn('settings file unreadable, defaults used', e); } return { ...DEFAULTS, ...o }; }
function validate(c) {
  const e = []; const n = (k, lo, hi) => { if (c[k] !== undefined && !(Number.isFinite(+c[k]) && +c[k] >= lo && +c[k] <= hi)) e.push(`${k} must be a number from ${lo} to ${hi}`); };
  n('backupIntervalHours', 1, 24 * 30); n('keepAutoBackups', 1, 1000); n('staleRateHours', 1, 24 * 365); n('sessionMinutes', 5, 60 * 24 * 30);
  if (c.secondBackupDir !== undefined && (typeof c.secondBackupDir !== 'string' || c.secondBackupDir.length > 500 || /[\0<>|"?*]/.test(c.secondBackupDir.replace(/^[A-Za-z]:/, '')))) e.push('secondBackupDir is not a valid folder path');
  if (c.autoBackup !== undefined && typeof c.autoBackup !== 'boolean') e.push('autoBackup must be true or false');
  return e;
}
function save(dbFile, patch) {
  const cur = load(dbFile), next = { ...cur }; for (const k of Object.keys(DEFAULTS)) if (patch[k] !== undefined) next[k] = typeof DEFAULTS[k] === 'number' ? +patch[k] : patch[k];
  const e = validate(next); if (e.length) { const x = new Error(e.join('; ')); x.problems = e; throw x; }
  fs.mkdirSync(path.dirname(fileFor(dbFile)), { recursive: true }); const tmp = fileFor(dbFile) + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(next, null, 1)); fs.renameSync(tmp, fileFor(dbFile)); return next;
}
module.exports = { load, save, validate, DEFAULTS, fileFor };
