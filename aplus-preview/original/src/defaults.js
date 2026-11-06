'use strict';
// Factory state of a brand-new database. Used by the server (fresh DB) and by the importer (to recognise an untouched, app-seeded target).
const DEFAULT = () => ({ cp: [], al: [], ad: [], ts: [], v: 5, id: 1, set: { name: 'A+ Hub Academy', tr: '0', sr: '0', base: 'KWD' }, cur: [{ c: 'KWD', n: 'Kuwaiti Dinar' }, { c: 'EGP', n: 'Egyptian Pound' }, { c: 'USD', n: 'US Dollar' }, { c: 'SAR', n: 'Saudi Riyal' }, { c: 'QAR', n: 'Qatari Riyal' }, { c: 'AED', n: 'UAE Dirham' }, { c: 'BHD', n: 'Bahraini Dinar' }, { c: 'OMR', n: 'Omani Rial' }], rates: {}, t: [], s: [], sub: [], l: [], sp: [], tp: [], tt: [], pr: [], pp: [], rc: [], re: [], rm: [], rd: {} });
module.exports = { DEFAULT };
