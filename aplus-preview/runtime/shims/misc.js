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
module.exports = { os, http, handlers };
