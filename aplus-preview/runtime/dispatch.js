'use strict';
// Calls the original Node request handler directly with in-memory request/response objects.
function callHandler(handler, method, url, headers, body) {
  const h = {};
  for (const [k, v] of Object.entries(headers || {})) h[k.toLowerCase()] = String(v);
  const text = body == null ? '' : typeof body === 'string' ? body : new TextDecoder().decode(body);
  const req = {
    method: String(method || 'GET').toUpperCase(), url, headers: h,
    __json() {
      if (text.length > 8 * 1024 * 1024) { const e = new Error('request too large'); e.code = 413; throw e; }
      if (!text) return {};
      try { return JSON.parse(text); } catch (_) { const e = new Error('body is not valid JSON'); e.code = 400; throw e; }
    },
  };
  const res = {
    statusCode: 0, _headers: {}, headersSent: false, ended: false, body: null,
    writeHead(code, hd) { this.statusCode = code; this._headers = hd || {}; this.headersSent = true; },
    end(b) { this.body = b; this.ended = true; },
  };
  handler(req, res);
  if (!res.ended) throw new Error('A+ Hub preview: request did not complete synchronously: ' + method + ' ' + url);
  const out = {};
  for (const [k, v] of Object.entries(res._headers)) out[k.toLowerCase()] = String(v);
  const b = res.body;
  const bytes = b == null ? new Uint8Array(0) : typeof b === 'string' ? new TextEncoder().encode(b) : new Uint8Array(b.buffer, b.byteOffset, b.byteLength).slice();
  return { status: res.statusCode, headers: out, body: bytes, text: () => new TextDecoder().decode(bytes) };
}
module.exports = { callHandler };
