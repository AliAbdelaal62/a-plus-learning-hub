'use strict';
// Starts the server on port 3001 with the SYNTHETIC database only (data/synthetic.sqlite).
const path = require('path'); const { root } = require('./_common'); require('./init-synthetic-db.js');
const { start } = require('../src/server');
start({authRequired:false, port: +(process.env.APLUS_PORT || 3001), dbFile: path.join(root, 'data', 'synthetic.sqlite'), backupDir: path.join(root, 'backups-synthetic') })
  .then(s => { console.log('SYNTHETIC test data at ' + s.url + ' (fake "DEV" records; press Ctrl+C to stop)'); }).catch(e => { console.error(e.message); process.exit(1); });
