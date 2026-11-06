'use strict';
const { dbFile } = require('./_common'); const B = require('../src/backup'); const v = B.validate(dbFile);
console.log(v.ok ? 'DATABASE OK' : 'DATABASE PROBLEMS'); console.log(JSON.stringify({ file: dbFile, schemaVersion: v.schemaVersion, counts: v.counts, totals: v.totals, problems: v.problems }, null, 1)); process.exit(v.ok ? 0 : 1);
