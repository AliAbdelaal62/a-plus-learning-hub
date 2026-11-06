'use strict';
// Parity harness: runs the ORIGINAL test files unchanged, but with node:sqlite, fs, crypto, os, path and http replaced by
// the browser stand-ins, and fetch() to localhost routed into the original handler, exactly as the preview page does.
const initSqlJs = require('sql.js/dist/sql-wasm-debug.js');
const EMBED = require('aplus-embedded');
const { callHandler } = require('./dispatch.js');
const { handlers } = require('./shims/misc.js');
async function boot(dir) {
  const S = await initSqlJs({ locateFile: (f) => dir + f });
  globalThis.__APLUS_SQL = S;
  const FS = S.FS;
  const mk = (d) => { try { FS.stat(d); } catch (_) { FS.mkdirTree(d); } };
  mk('/tmp');
  for (const [p, txt] of Object.entries(EMBED)) { mk(p.slice(0, p.lastIndexOf('/'))); FS.writeFile(p, txt); }
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const u = new URL(typeof input === 'string' ? input : input.url);
    if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname)) return realFetch(input, init);
    const handler = handlers[+u.port];
    if (!handler) throw new TypeError('fetch failed (no preview server on port ' + u.port + ')');
    const hd = { host: u.host };
    const src = init.headers instanceof Headers ? Object.fromEntries(init.headers) : init.headers || {};
    for (const [k, v] of Object.entries(src)) hd[k.toLowerCase()] = v;
    await new Promise((r) => setTimeout(r, 0));
    const r = callHandler(handler, init.method || 'GET', u.pathname + u.search, hd, init.body);
    const headers = new Headers();
    for (const [k, v] of Object.entries(r.headers)) if (k !== 'content-length') headers.append(k, v);
    return new Response([204, 304].includes(r.status) ? null : r.body, { status: r.status, headers });
  };
}
module.exports = { boot };
