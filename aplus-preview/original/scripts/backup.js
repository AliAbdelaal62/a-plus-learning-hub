'use strict';
const { dbFile, backupDir } = require('./_common'); const { openApp } = require('../src/boot'); const { StartupRefused } = require('../src/guard'); const B = require('../src/backup'); const config = require('../src/config'); const path = require('path');
let boot; try { boot = openApp(dbFile, backupDir); } catch (e) { if (e instanceof StartupRefused) { console.error(e.message); process.exit(13); } throw e; }
const m = B.create({ db: boot.db, file: dbFile, backupDir }, process.argv[2] || 'manual'); const c = config.load(dbFile);
console.log('Backup created and verified (table by table): ' + path.join(backupDir, m.name)); console.log('Records: ' + JSON.stringify(m.counts));
if (c.secondBackupDir) { try { console.log('Second copy verified: ' + B.copyTo({ backupDir }, m.name, c.secondBackupDir)); } catch (e) { console.error('SECOND COPY FAILED: ' + e.message); boot.db.close(); process.exit(1); } } else console.log('No second backup location is set. Copy this file to another drive, or set one in the Backups panel.');
boot.db.close();
