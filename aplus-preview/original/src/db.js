'use strict';
// Database layer: opens SQLite with safe pragmas and applies forward-only migrations in order.
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs'), path = require('path');
const MIG_DIR = path.join(__dirname, '..', 'db', 'migrations');
const migFiles = () => fs.readdirSync(MIG_DIR).filter(f => /^\d+_.*\.sql$/.test(f)).sort();
const SCHEMA_VERSION = Math.max(...migFiles().map(f => parseInt(f, 10))); // highest migration file number shipped

function open(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;');
  return db;
}
// migrations that have not been applied to this database yet (does not change anything)
function pending(db) {
  let done = new Set(); try { done = new Set(db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version)); } catch (_) {}
  return migFiles().filter(f => !done.has(parseInt(f, 10)));
}
const hasData = db => { try { return db.prepare("SELECT count(*) c FROM settings").get().c > 0; } catch (_) { return false; } };
function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)');
  const done = new Set(db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version));
  const files = migFiles();
  const applied = [];
  for (const f of files) {
    const v = parseInt(f, 10); if (done.has(v)) continue;
    const sql = fs.readFileSync(path.join(MIG_DIR, f), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations(version,name,applied_at) VALUES(?,?,?)').run(v, f, new Date().toISOString());
      db.exec('COMMIT'); applied.push(f);
    } catch (e) { db.exec('ROLLBACK'); throw new Error('migration ' + f + ' failed and was rolled back: ' + e.message); }
  }
  return applied;
}
const tx = (db, fn) => { db.exec('BEGIN IMMEDIATE'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; } };
module.exports = { open, migrate, pending, hasData, tx, SCHEMA_VERSION, MIG_DIR };
