'use strict';
// `os` and `http` stand-ins. http.createServer only captures the original request handler so the runtime can call it
// directly for each request the page makes; nothing listens on a network port.
const os = { tmpdir: () => '/tmp', EOL: '\n', platform: () => 'browser', hostname: () => 'preview', homedir: () => '/app' };
const http = {
  createServer(handler) {
    const server = {
      _handler: handler, requestTimeout: 0, headersTimeout: 0, maxHeadersCount: 0,
      once() { return server; }, on() { return server; },
      listen(port, host, cb) { server._port = port; globalThis.__APLUS_HANDLER = handler; setTimeout(cb, 0); return server; },
      address() { return { port: server._port, address: '127.0.0.1' }; },
      close(cb) { if (globalThis.__APLUS_HANDLER === handler) globalThis.__APLUS_HANDLER = null; if (cb) setTimeout(cb, 0); },
    };
    return server;
  },
};
module.exports = { os, http };
