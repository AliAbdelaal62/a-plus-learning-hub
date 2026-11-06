'use strict';
// Creates data/synthetic.sqlite from the synthetic fixture (names start with "DEV "). Safe to try the screens with. Never touches data/aplus.sqlite.
const fs = require('fs'), path = require('path'); const { root } = require('./_common'); const { migrate } = require('../src/importer');
const target = path.join(root, 'data', 'synthetic.sqlite'); fs.mkdirSync(path.dirname(target), { recursive: true });
if (!fs.existsSync(target)) { const r = migrate(fs.readFileSync(path.join(root, 'fixtures', 'synthetic-v5.json'), 'utf8'), { mode: 'apply', target }); console.log('Synthetic database created: ' + r.status); }
process.env.APLUS_DB = target;
