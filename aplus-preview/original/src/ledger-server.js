'use strict';
// Server-side binding of the shared ledger (src/ledger.js) to the existing business rules in src/finance.js.
const { makeLedger } = require('./ledger'); const fin = require('./finance');
const forState = st => makeLedger({ O: fin.O, pj: p => fin.pj(st, p), rcc: fin.rcc, k_: fin.k_ });
module.exports = { forState, makeLedger };
