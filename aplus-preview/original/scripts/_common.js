'use strict';
const path = require('path'); const root = path.join(__dirname, '..');
const dbFile = process.env.APLUS_DB ? path.resolve(process.env.APLUS_DB) : path.join(root, 'data', 'aplus.sqlite');
const backupDir = process.env.APLUS_BACKUP_DIR ? path.resolve(process.env.APLUS_BACKUP_DIR) : process.env.APLUS_DB ? path.join(path.dirname(dbFile), '..', 'backups') : path.join(root, 'backups'); // a custom database never writes into the project's own backups folder
const [maj, min] = process.versions.node.split('.').map(Number);
if (maj < 22 || (maj === 22 && min < 5)) { console.error('Node.js 22.5 or newer is required (this is ' + process.version + '). Install the current LTS from nodejs.org.'); process.exit(2); }
module.exports = { root, dbFile, backupDir };
