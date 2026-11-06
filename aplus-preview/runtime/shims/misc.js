'use strict';
// `os` and `http` stand-ins. http.createServer only captures the original request handler (by port) so the runtime can
// call it directly for each request the page makes; nothing listens on a network port.
const os = { tmpdir: () => '/tmp', EOL: '\n', platform: () => 'browser', hostname: () => 'preview', homedir: () => '/app', cpus: () => [{}] };
let nextPort = 41000;
const handlers = (globalThis.__APLUS_HANDLERS = globalThis.__APLUS_HANDLERS || {});
const http = {
  createServer(handler) {
    const server = {
      _handler: handler, requestTimeout: 0, headersTimeout: 0, maxHeadersCount: 0, listening: false,
      once() { return server; }, on() { return server; }, off() { return server; },
      listen(port, host, cb) {
        if (typeof host === 'function') cb = host;
        server._port = port || nextPort++;
        if (handlers[server._port]) { const e = new Error('listen EADDRINUSE'); e.code = 'EADDRINUSE'; throw e; }
        handlers[server._port] = handler; server.listening = true;
        if (cb) setTimeout(cb, 0); return server;
      },
      address() { return { port: server._port, address: '127.0.0.1' }; },
      close(cb) { if (handlers[server._port] === handler) delete handlers[server._port]; server.listening = false; if (cb) setTimeout(cb, 0); return server; },
      closeAllConnections() {},
    };
    return server;
  },
};
// Minimal in-process client (http.request / http.get) used only by the original HTTP-level tests.
function emitter() {
  const ls = {};
  return { on(n, f) { (ls[n] = ls[n] || []).push(f); return this; }, once(n, f) { return this.on(n, f); }, emit(n, ...a) { (ls[n] || []).forEach((f) => f(...a)); }, setEncoding() {} };
}
http.request = function request(opts, cb) {
  if (typeof opts === 'string') opts = new URL(opts);
  const chunks = []; const rq = emitter();
  rq.write = (c) => { chunks.push(typeof c === 'string' ? c : new TextDecoder().decode(c)); return true; };
  rq.setTimeout = () => rq; rq.destroy = () => {};
  rq.end = (c) => {
    if (c) rq.write(c);
    setTimeout(() => {
      const handler = handlers[+opts.port];
      if (!handler) return rq.emit('error', Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }));
      try {
        const { callHandler } = require('../dispatch.js');
        const r = callHandler(handler, opts.method || 'GET', opts.path || '/', opts.headers || {}, chunks.join(''));
        const rs = emitter(); rs.statusCode = r.status; rs.headers = r.headers;
        if (cb) cb(rs);
        setTimeout(() => { if (r.body.length) rs.emit('data', require('buffer').Buffer.from(r.body)); rs.emit('end'); }, 0);
      } catch (e) { rq.emit('error', e); }
    }, 0);
    return rq;
  };
  return rq;
};
http.get = function get(opts, cb) { const r = http.request(opts, cb); r.end(); return r; };
module.exports = { os, http, handlers };
