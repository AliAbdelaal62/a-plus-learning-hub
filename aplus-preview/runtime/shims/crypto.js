'use strict';
// Browser stand-in for the parts of Node's `crypto` the original uses: sha256, random bytes, scrypt (same Node defaults
// N=16384, r=8, p=1, so password hashes are compatible) and constant-time comparison.
const { Buffer } = require('buffer');
const { sha256 } = require('@noble/hashes/sha256');
const { scrypt } = require('@noble/hashes/scrypt');
const bytes = (x, e) => (typeof x === 'string' ? Buffer.from(x, e || 'utf8') : x);
module.exports = {
  createHash(alg) {
    if (String(alg).toLowerCase() !== 'sha256') throw new Error('Unsupported hash in preview: ' + alg);
    const h = sha256.create();
    const api = { update(x, e) { h.update(bytes(x, e)); return api; }, digest(e) { const d = Buffer.from(h.digest()); return e ? d.toString(e) : d; } };
    return api;
  },
  randomBytes(n) { const u = new Uint8Array(n); globalThis.crypto.getRandomValues(u); return Buffer.from(u); },
  randomUUID() { return globalThis.crypto.randomUUID(); },
  scryptSync(password, salt, keylen, o = {}) {
    return Buffer.from(scrypt(bytes(password), bytes(salt), { N: o.N || o.cost || 16384, r: o.r || o.blockSize || 8, p: o.p || o.parallelization || 1, dkLen: keylen, maxmem: 64 * 1024 * 1024 }));
  },
  timingSafeEqual(a, b) {
    if (a.length !== b.length) throw new RangeError('Input buffers must have the same byte length');
    let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0;
  },
};
