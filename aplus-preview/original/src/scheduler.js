'use strict';
// Automatic backups (C1): at start-up if the newest automatic backup is older than the interval, then re-checked every 15 minutes.
// A failure is never silent: it is kept in `status`, shown in the backup panel, and logged. A second-location copy is verified by checksum.
const B = require('./backup'); const config = require('./config'); const audit = require('./audit');
function makeScheduler(ctx, log = () => {}) {
  const status = { lastAutoAt: null, lastAutoName: null, lastError: null, lastErrorAt: null, second: { dir: '', lastOkAt: null, lastError: null }, running: false };
  function newestAuto() { return B.list(ctx).find(b => /^aplus-.*-auto\d*\.sqlite$/.test(b.name) || b.kind === 'auto'); }
  function copySecond(name) {
    const c = config.load(ctx.file); status.second.dir = c.secondBackupDir || '';
    if (!c.secondBackupDir) return null;
    try { const p = B.copyTo(ctx, name, c.secondBackupDir); status.second.lastOkAt = new Date().toISOString(); status.second.lastError = null; return p; }
    catch (e) { status.second.lastError = e.message; log('second backup location failed', e.message); try { audit.log(ctx.db, { action: 'backup-copy-failed', entity: 'db', detail: e.message }); } catch (e_) { require('./log').warn('audit entry could not be written (scheduler)', e_); } return null; }
  }
  function runNow(label = 'auto') {
    status.running = true;
    try { const m = B.create(ctx, label); status.lastAutoAt = m.createdAt; status.lastAutoName = m.name; status.lastError = null; copySecond(m.name); const c = config.load(ctx.file); if (label === 'auto') B.prune(ctx.backupDir, c.keepAutoBackups); return m; }
    catch (e) { status.lastError = e.message; status.lastErrorAt = new Date().toISOString(); log('automatic backup failed', e.message); throw e; }
    finally { status.running = false; }
  }
  function due() { const c = config.load(ctx.file); if (!c.autoBackup) return false; const n = newestAuto(); if (!n || !n.createdAt) return true; return Date.now() - Date.parse(n.createdAt) >= c.backupIntervalHours * 3600e3; }
  function tick() { try { if (due()) runNow('auto'); } catch (_) { /* already recorded in status */ } }
  let timer = null;
  return { status, runNow, tick, copySecond, start() { tick(); timer = setInterval(tick, 15 * 60e3); timer.unref(); }, stop() { if (timer) clearInterval(timer); } };
}
module.exports = { makeScheduler };
