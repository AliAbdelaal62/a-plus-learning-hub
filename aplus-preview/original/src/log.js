'use strict';
// M11: one place for diagnostics. Never prints request bodies, tokens or record contents - only a short code, the message and the stack's first lines.
let sink = (...a) => console.error(...a);
const safe = e => { const m = String(e && e.message || e).replace(/[A-Za-z]:\\[^\s'"]*/g, '<path>').replace(/\/[^\s'"]*\.sqlite[^\s'"]*/g, '<path>').slice(0, 300); return m; };
function warn(where, e) { try { sink('[aplus] ' + where + ': ' + safe(e)); } catch (_) { /* logging itself must never throw */ } }
module.exports = { warn, safe, setSink: f => { sink = f; } };
