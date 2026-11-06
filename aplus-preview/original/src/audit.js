'use strict';
// One way to write audit rows. Append-only (triggers in migration 002 forbid UPDATE/DELETE). Never put secrets or whole personal records in `before`/`after`:
// callers pass only the fields that matter; `scrub` removes anything that looks like a credential.
const SECRET = /pass(word)?|token|secret|hash|salt|cookie|session/i;
function scrub(v) { if (v == null) return v; if (Array.isArray(v)) return v.map(scrub); if (typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) if (!SECRET.test(k)) o[k] = scrub(x); return o; } return v; }
const js = v => (v === undefined || v === null ? null : JSON.stringify(scrub(v)));
function log(db, { at = new Date().toISOString(), action, entity = null, id = null, before, after, detail = '', actor = 'local', reason = null, related }) {
  db.prepare('INSERT INTO audit_log(at,action,entity,entity_id,before_json,after_json,detail,actor,reason,related_json) VALUES(?,?,?,?,?,?,?,?,?,?)').run(at, action, entity, id, js(before), js(after), String(detail).slice(0, 500), actor, reason == null ? null : String(reason).slice(0, 300), js(related));
}
module.exports = { log, scrub };
