'use strict';
// The ONE way the app (server and scripts) opens the real database: guard -> open -> (backup if an upgrade is pending) -> migrate.
const fs = require('fs'), path = require('path');
const guard = require('./guard'); const { open, migrate, pending, hasData } = require('./db'); const B = require('./backup'); const audit = require('./audit');
function openApp(file, backupDir, { log = () => {} } = {}) {
  const g = guard.inspect(file, backupDir); // throws StartupRefused for anything damaged or suspicious
  const db = open(file); const ctx = { db, file, backupDir }; let premigrate = null;
  try {
    const todo = pending(db);
    if (g.state === 'ok' && todo.length && hasData(db)) { premigrate = B.create(ctx, 'premigrate', { noAudit: true }); log('backup before upgrade: ' + premigrate.name); }
    const applied = migrate(db);
    if (applied.length && premigrate) { try { audit.log(db, { action: 'schema-upgrade', entity: 'db', detail: applied.join(', '), after: { backup: premigrate.name } }); } catch (e_) { require('./log').warn('audit entry could not be written (boot)', e_); } }
    guard.markInstalled(file);
    return { db, state: g.state, premigrate, applied };
  } catch (e) { try { db.close(); } catch (_) {} throw e; }
}
module.exports = { openApp };
