'use strict';
// POST /api/save: the client sends its whole new state; the server validates it, diffs it against the database and applies the difference in ONE transaction.
const { E, ORDER } = require('./mapping');
const { tx } = require('./db');
const { assemble: assembleRaw, neutralize } = require('./state'); const assemble = db => neutralize(assembleRaw(db)); // the page only ever sees (and sends back) the neutralised view; damaged rows are left untouched unless edited
const { analyse, roundTripDiff } = require('./importer');
const store = require('./store');
const audit = require('./audit');
const rules = require('./rules');
const P3 = require('./phase3');
const log = require('./log');
const { forState } = require('./ledger-server');
const stable = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(q => [q, x[q]])) : x));
class SaveError extends Error { constructor(code, msg, detail) { super(msg); this.code = code; this.detail = detail; } }
const getRev = db => { const r = db.prepare("SELECT value FROM schema_meta WHERE key='rev'").get(); return r ? +r.value : 0; };
const isFresh = db => db.prepare("SELECT count(*) c FROM settings").get().c === 0;
const { DEFAULT } = require('./defaults');
function getState(db) { return { rev: getRev(db), fresh: isFresh(db), state: isFresh(db) ? DEFAULT() : assemble(db) }; }

// records whose removal would destroy financial or scheduling history
const PROTECT = {
  t: ['SELECT count(*) c FROM lessons WHERE t=?', 'SELECT count(*) c FROM teacher_payments WHERE p=?', 'SELECT count(*) c FROM timetable_entries WHERE t=?', 'SELECT count(*) c FROM projects WHERE t=?', 'SELECT count(*) c FROM recorded_courses WHERE inst=?', 'SELECT count(*) c FROM subjects WHERE inst=?'],
  s: ['SELECT count(*) c FROM lessons WHERE s=?', 'SELECT count(*) c FROM student_payments WHERE p=?', 'SELECT count(*) c FROM course_enrollments WHERE s=?', 'SELECT count(*) c FROM projects WHERE s=?', 'SELECT count(*) c FROM timetable_students WHERE student_id=?', 'SELECT count(*) c FROM subject_students WHERE student_id=?', 'SELECT count(*) c FROM student_adjustments WHERE s=?'],
  pr: ['SELECT count(*) c FROM project_payments WHERE pr=?', 'SELECT count(*) c FROM projects WHERE id=? AND paid0>0', 'SELECT count(*) c FROM student_adjustments WHERE pr=?', 'SELECT count(*) c FROM payment_allocations WHERE tk=\'project\' AND tid=?', "SELECT count(*) c FROM teacher_settlements WHERE ok='project' AND oid=?"], rc: ['SELECT count(*) c FROM course_enrollments WHERE rc=?', "SELECT count(*) c FROM teacher_settlements WHERE ok='course' AND oid=?"], re: ['SELECT count(*) c FROM course_enrollments WHERE id=? AND paid>0', 'SELECT count(*) c FROM course_payments WHERE re=?', 'SELECT count(*) c FROM payment_allocations WHERE tk=\'enrollment\' AND tid=?'], tp: ['SELECT count(*) c FROM teacher_settlements WHERE tp=?'], l: ["SELECT count(*) c FROM teacher_settlements WHERE ok='lesson' AND oid=?"],
  sp: ['SELECT count(*) c FROM payment_allocations WHERE sp=?', 'SELECT count(*) c FROM student_adjustments WHERE ok=\'sp\' AND oid=?'], sub: ['SELECT count(*) c FROM lessons WHERE sub=?', 'SELECT count(*) c FROM projects WHERE subj=?', 'SELECT count(*) c FROM recorded_courses WHERE subj=?'],
};
for(const key of ['pp','cp','ad'])if(!PROTECT[key])PROTECT[key]=[];
function impact(db, k, id) {
  const q = PROTECT[k]; if (!q) return { entity: k, id, dependants: {}, total: 0 };
  const names = { t: ['lessons', 'teacher payments', 'timetable entries', 'projects', 'recorded courses', 'subjects'], s: ['lessons', 'student payments', 'course enrolments', 'projects', 'timetable entries', 'subjects', 'refund / credit records'], pr: ['project payments', 'opening paid amount', 'refund / credit records', 'student payments allocated to it', 'cross-currency settlements'], rc: ['enrolments', 'cross-currency settlements'], re: ['money received on this enrolment (an opening balance)', 'dated course payments', 'student payments allocated to it'], tp: ['settlements of this payment'], l: ['cross-currency settlements of this lesson'], sp: ['allocations of this payment', 'refunds referring to this payment'], sub: ['lessons', 'projects', 'recorded courses'] }[k];
  const dependants = {}; let total = 0; q.forEach((sql, i) => { const c = db.prepare(sql).get(id).c; if (c) { dependants[names[i]] = c; total += c; } });
  const operationsRefs={t:[['service registrations','service_registrations','teacher_id'],['follow-up tasks','followup_tasks','teacher_id']],s:[['service registrations','service_registrations','student_id'],['follow-up tasks','followup_tasks','student_id']],sub:[['service registrations','service_registrations','subject_id']],l:[['attendance records','lesson_attendance','lesson_id'],['lesson summaries','lesson_journals','lesson_id']]};
  const extraRefs={t:[['team accounts','team_users','teacher_id'],['availability','teacher_availability','teacher_id'],['managed bookings','managed_sessions','teacher_id']],s:[['managed bookings','managed_sessions','student_id'],['waiting-list requests','lesson_waitlist','student_id']],sub:[['managed bookings','managed_sessions','subject_id'],['waiting-list requests','lesson_waitlist','subject_id']],l:[['package usage','package_usage','lesson_id'],['managed bookings','managed_sessions','lesson_id']],pr:[['project delivery stages','project_stages','project_id']],re:[['course delivery records','course_deliveries','enrollment_id']]};
  for(const [name,table,column] of extraRefs[k]||[]){const c=db.prepare('SELECT count(*) c FROM '+table+' WHERE '+column+'=?').get(id).c;if(c){dependants[name]=c;total+=c;}}
  if(k==='pr'||k==='re'){const c=db.prepare('SELECT count(*) c FROM billing_contracts WHERE source_kind=? AND target_id=?').get(k==='pr'?'Project':'Recorded',id).c;if(c){dependants['collection agreements']=c;total+=c;}}
  if(['sp','pp','cp','ad'].includes(k)){const c=db.prepare('SELECT count(*) c FROM billing_receipts WHERE payment_kind=? AND payment_id=?').get(k,id).c;if(c){dependants['issued agreement receipts']=c;total+=c;}}
  for(const [name,table,column] of operationsRefs[k]||[]){const c=db.prepare(`SELECT count(*) c FROM ${table} WHERE ${column}=?`).get(id).c;if(c){dependants[name]=c;total+=c;}}
  return { entity: k, id, dependants, total, canDelete: total === 0, advice: total ? (k === 't' || k === 's' ? 'Archive instead: set the status to Inactive. History and balances are kept.' : 'Has history; cannot be removed without destroying records. Keep it (mark Cancelled / Inactive where available).') : 'Nothing depends on it.' };
}

const PII = new Set(['name', 'phone', 'email', 'notes', 'major', 'country', 'uni']);
const hasHistory = db => ['lessons', 'student_payments', 'teacher_payments', 'projects', 'recorded_courses', 'course_enrollments'].some(t => db.prepare(`SELECT 1 x FROM ${t} LIMIT 1`).get());
// destructive removal of these needs a typed reason (kept in the audit log); parents with history and money already received are blocked outright (see PROTECT)
const needsReason = (k, row) => k === 'sp' || k === 'tp' || k === 'pp' || k === 'cp' || k === 'al' || k === 'ad' || k === 'ts' || (k === 'l' && row.st === 'Completed' && (row.bchg > 0 || row.bcost > 0));
const label = (k, r) => ({ sp: 'student payment', tp: 'teacher payment', pp: 'project payment', cp: 'course payment', al: 'payment allocation', ad: 'refund / credit record', ts: 'cross-currency settlement', l: 'completed lesson' }[k] || k) + (r.date ? ' dated ' + r.date : '') + (r.amt != null ? ', ' + (r.amt / 1000).toFixed(3) + ' ' + (r.cur || '') : r.bchg != null ? ', charge ' + (r.bchg / 1000).toFixed(3) : '');
const shown = (k, o) => { if (!o) return o; const x = {}; for (const [f, v] of Object.entries(o)) { if (f.startsWith('__') || f === 'ex') continue; if ((k === 't' || k === 's') && PII.has(f)) continue; if (f === 'notes') { x.notes = '(text)'; continue; } x[f] = v; } return x; };
function changed(was, now_) { const a = {}, b = {}; for (const f of new Set([...Object.keys(was || {}), ...Object.keys(now_ || {})])) { if (f.startsWith('__') || f === 'id') continue; if (stable(was && was[f]) !== stable(now_ && now_[f])) { a[f] = was ? was[f] : undefined; b[f] = now_ ? now_[f] : undefined; } } return { a, b }; }
// ---- Phase 2: frozen conversion, labelled opening balances, reasons for corrections -------------------------------------------------------------------
const k_ = (a, r) => Math.round(a * r);
const fxOf = r => (r.rx > 0 && r.bamt != null && r.bc ? 'stored' : 'missing');
// Mutates the incoming rows (which are also what the client sent, so the round-trip proof still holds) and returns the changes that need a typed reason.
function stampLedger(A, old, base) {
  const need = [], by = k => new Map((old[k] || []).map(r => [r.id, r]));
  const parent = { pp: row => A.keep.pr.get(row.pr), cp: row => { const e = A.keep.re.get(row.re); return e && A.keep.rc.get(e.rc); } };
  for (const k of ['sp', 'tp', 'pp', 'cp', 'ad']) {
    const o = by(k);
    for (const [id, row] of A.keep[k]) {
      const was = o.get(id);
      if (!was) { // a NEW transaction: its conversion is frozen now, taken from its own record or from its parent's saved rate at this moment
        if (k === 'pp' || k === 'cp') { const p = parent[k](row); row.cur = p.cur; row.rx = p.rx; row.bc = p.bc || base; if (row.cur === row.bc) { row.rx = 1; row.bamt = row.amt; row.fxs = 'identity'; } else if (p.rx > 0) { row.bamt = k_(row.amt, p.rx); row.fxs = 'derived'; } else { delete row.bamt; row.fxs = 'missing'; } }
        else if (k === 'ad') { const p = row.pr ? A.keep.pr.get(row.pr) : null; if (p) { row.rx = p.rx; row.bc = p.bc || base; } else if (row.cur === base) { row.rx = 1; row.bc = base; } if (row.rx > 0) { row.bamt = k_(row.amt, row.rx); row.bc = row.bc || base; row.fxs = 'stored'; } else { delete row.bamt; row.fxs = 'missing'; } }
        else row.fxs = fxOf(row);
        continue;
      }
      if (k === 'ad') { const cn = JSON.stringify(Object.fromEntries(Object.entries(row).sort())) !== JSON.stringify(Object.fromEntries(Object.entries(was).sort())); if (cn) need.push({ k, id, label: 'edit of a refund / credit record' }); continue; }
      const core = ['cur', 'rx', 'bc'].some(f => (row[f] ?? null) !== (was[f] ?? null)), onlyBase = row.amt === was.amt && (row.bamt ?? null) !== (was.bamt ?? null);
      if (core || onlyBase) { need.push({ k, id, label: 'exchange rate / base amount change on a recorded payment' }); row.fxs = 'corrected'; }
      else { if (was.fxs != null) row.fxs = was.fxs; else delete row.fxs; if ((k === 'pp' || k === 'cp') && row.amt !== was.amt && row.rx > 0) row.bamt = k_(row.amt, row.rx); }
    }
  }
  const oldRe = by('re'), oldPr = by('pr');
  for (const [id, row] of A.keep.re) { const was = oldRe.get(id); if (!was) row.paid_open = 0; else if ((row.paid_open ?? null) !== (was.paid_open ?? null)) need.push({ k: 're', id, label: 'change of an opening paid amount' }); }
  for (const [id, row] of A.keep.pr) { const was = oldPr.get(id); if (was && (row.paid0 || 0) !== (was.paid0 || 0)) need.push({ k: 'pr', id, label: 'change of an opening paid amount' }); }
  return need;
}
// related ids stored with each audit row (H6)
const related = (k, r, st) => { const x = {}; const put = (n, v) => { if (v) x[n] = v; };
  if (k === 'sp') put('student', r.p); else if (k === 'tp') put('teacher', r.p);
  else if (k === 'pp') { const p = (st.pr || []).find(q => q.id == r.pr); put('project', r.pr); put('student', p && p.s); put('teacher', p && p.t); }
  else if (k === 'cp') { const e = (st.re || []).find(q => q.id == r.re), c = e && (st.rc || []).find(q => q.id == e.rc); put('enrolment', r.re); put('student', e && e.s); put('course', e && e.rc); put('teacher', c && c.inst); }
  else if (k === 'al') { const p = (st.sp || []).find(q => q.id == r.sp); put('payment', r.sp); put('student', p && p.p); }
  else if (k === 'ad') { put('student', r.s); put('project', r.pr); }
  else if (k === 'l') { put('teacher', r.t); put('student', r.s); put('subject', r.sub); }
  else if (k === 'pr') { put('student', r.s); put('teacher', r.t); } else if (k === 're') { put('student', r.s); put('course', r.rc); } else if (k === 'rc') put('teacher', r.inst);
  return Object.keys(x).length ? x : undefined; };
const REQ = /^[A-Za-z0-9_-]{8,64}$/;
function applySave(db, opts) {
  for(const a of opts.state?.al||[]){const receipt=db.prepare("SELECT contract_id FROM billing_receipts WHERE payment_kind='sp' AND payment_id=?").get(a.sp);if(receipt&&(a.wt!=='Live'||(a.tk&&(a.tk!=='lesson'||!db.prepare('SELECT lesson_id FROM package_usage WHERE contract_id=? AND lesson_id=?').get(receipt.contract_id,a.tid)))))throw new SaveError(422,'A package receipt can only be attributed to its own Live package lessons.');}

  const rid = opts && opts.reqId;
  if (rid != null && !REQ.test(String(rid))) throw new SaveError(400, 'reqId is not valid');
  if (rid) { const hit = db.prepare('SELECT result_json,rev_before FROM save_requests WHERE req_id=?').get(rid); if (hit) return { ...JSON.parse(hit.result_json), replayed: true }; } // M9: a retried / double-submitted save is answered with its first result and applied once
  try { const r = applySave_(db, opts); if (rid) { try { db.prepare('INSERT OR IGNORE INTO save_requests(req_id,rev_before,rev_after,result_json,created_at) VALUES(?,?,?,?,?)').run(rid, opts.baseRev, r.rev, JSON.stringify(r), opts.now || new Date().toISOString()); db.prepare("DELETE FROM save_requests WHERE created_at < ?").run(new Date(Date.now() - 7 * 864e5).toISOString()); } catch (e) { log.warn('save_requests', e); } } return r; }
  catch (e) { // refusals are recorded too (outside the rolled-back transaction) so attempts are visible
    if (e instanceof SaveError && e.code === 409 && e.detail && (e.detail.refusal || Array.isArray(e.detail))) { try { audit.log(db, { action: 'refused', entity: e.detail.refusal || 'delete', detail: e.message.slice(0, 200), after: Array.isArray(e.detail) ? e.detail.slice(0, 5).map(x => ({ entity: x.entity, id: x.id })) : e.detail.info }); } catch (x) { log.warn('audit of refused save', x); } }
    throw e; }
}
function applySave_(db, { baseRev, state, confirm = [], now = new Date().toISOString(), actor = 'local' }) {
  const A = analyse(state, { save: true }), rep = A.rep;
  const problems = [...rep.errors, ...rep.quarantined.map(q => `${q.entity} ${q.id ?? ''}: ${q.reason}`), ...rep.warnings];
  if (problems.length && !rep.errors.length) { // a delete that leaves dangling links: explain the history first
    const prot = []; try { for (const k of Object.keys(PROTECT)) { const keepIds = new Set((state[k] || []).map(r => r && r.id)); db.prepare(`SELECT id FROM ${E[k].table}`).all().forEach(r => { if (!keepIds.has(r.id)) { const im = impact(db, k, r.id); if (im.total) prot.push(im); } }); } } catch (_) {}
    if (prot.length) throw new SaveError(409, 'This change would delete records that have history. Nothing was deleted.', prot);
  }
  if (problems.length) throw new SaveError(422, 'The data was not saved because it failed validation.', problems.slice(0, 30));
  return tx(db, () => {
    const cur = getRev(db); if (baseRev !== cur) throw new SaveError(409, 'The data changed since this page loaded (another tab or a restore). Reload before saving again.', { serverRev: cur, yourRev: baseRev });
    const old = isFresh(db) ? { ...DEFAULT(), set: null } : assemble(db);
    // Linked cash and paid-hour documents retain the original snapshot even through the legacy save API.
    const hasTable=name=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name),treasury=hasTable('treasury_entries'),batches=hasTable('teacher_payment_batches');
    const moneyFields={sp:['p','date','cur','amt','rx','bamt','bc'],tp:['p','date','cur','amt','rx','bamt','bc','src','lk'],pp:['pr','date','cur','amt','rx','bamt','bc'],cp:['re','date','cur','amt','rx','bamt','bc'],ad:['s','pr','kind','date','cur','amt','rx','bamt','bc','ok','oid']};
    for(const [key,fields]of Object.entries(moneyFields))for(const was of old[key]||[]){const protectedCash=treasury&&db.prepare('SELECT 1 FROM treasury_entries WHERE native_kind=? AND native_id=?').get(key,was.id),protectedBatch=key==='tp'&&batches&&(db.prepare('SELECT 1 FROM teacher_payment_batches WHERE payment_id=?').get(was.id)||(was.src==='Live'&&was.lk&&db.prepare('SELECT 1 FROM teacher_hour_allocations WHERE lesson_id=?').get(was.lk)));if(protectedCash||protectedBatch){const next=(state[key]||[]).find(x=>x.id===was.id);if(!next||fields.some(f=>(next[f]??null)!==(was[f]??null)))throw new SaveError(422,'This treasury-linked or batched financial snapshot is immutable. Use a recorded correction.');}}
    if(batches)for(const was of old.l||[])if(db.prepare('SELECT 1 FROM teacher_hour_allocations WHERE lesson_id=?').get(was.id)){const next=(state.l||[]).find(x=>x.id===was.id);if(!next||['t','s','sub','st','date','d','tr','tc','oc','bcost','trx','bc'].some(f=>(next[f]??null)!==(was[f]??null)))throw new SaveError(422,'A paid lesson must retain its recorded hours, ownership and cost.');}
    // H4: the base currency is part of every stored base amount. It cannot change once financial history exists.
    for(const key of ['pr','rc'])for(const previous of old[key]||[]){const next=(state[key]||[]).find(r=>r.id===previous.id);if(previous.teacherFee&&!next)throw new SaveError(422,'A service with an agreed teacher fee must be retained for its financial history.');if(JSON.stringify(previous.teacherFee??null)!==JSON.stringify(next?.teacherFee??null))throw new SaveError(422,'Use the agreed EGP teacher-fee form to change this amount.');if(previous.teacherFee&&next&&(key==='pr'?next.t:next.inst)!==previous.teacherFee.teacherId)throw new SaveError(422,'A service with an agreed teacher fee cannot be reassigned to another teacher.');}
    for(const key of ['pr','rc'])for(const row of state[key]||[])if(row.teacherFee&&!(old[key]||[]).some(r=>r.id===row.id))throw new SaveError(422,'Create the service first, then use the agreed EGP teacher-fee form.');
    if (old.set && state.set && old.set.base !== state.set.base && hasHistory(db)) throw new SaveError(409, `The base currency cannot be changed from ${old.set.base} to ${state.set.base}: this database already holds financial records whose base amounts are stored in ${old.set.base}. Nothing was changed.`, { refusal: 'base-currency', code: 'BASE_CURRENCY_LOCKED', info: { from: old.set.base, to: state.set.base } });
    const fxNeed = stampLedger(A, old, (state.set || {}).base);
    { const pb = P3.normaliseTimetable(A, old); if (pb.length) throw new SaveError(422, 'The data was not saved because it failed validation.', pb);
      P3.normaliseUniversities(A, old);
      const rp = P3.rateLabelProblems(A.rates, old.rates, now, require('./rates').hoursOf({ set: state.set })); if (rp.length) throw new SaveError(422, 'The data was not saved because it failed validation.', rp); }
    const del = {}, ins = {}, upd = {}; let removedProtected = [];
    for (const k of ORDER) {
      const o = new Map((old[k] || []).map(r => [r.id, r])), n = A.keep[k];
      del[k] = [...o.keys()].filter(id => !n.has(id)); ins[k] = [...n.keys()].filter(id => !o.has(id));
      upd[k] = [...n.keys()].filter(id => o.has(id) && stable(canon(k, n.get(id))) !== stable(o.get(id)));
      if (PROTECT[k]) del[k].forEach(id => { const im = impact(db, k, id); if (im.total) removedProtected.push(im); });
    }
    fxNeed.push(...P3.duplicatePayments(A, old), ...P3.linkedEdits(A, old, upd), ...P3.overpayments(A, old, ins, upd, state, forState));
    if (removedProtected.length) throw new SaveError(409, 'This change would delete records that have history. Nothing was deleted.', removedProtected);
    // M6: validate only rows that are new or changed (legacy rows are preserved exactly until reviewed)
    { const ctx = { codes: new Set((A.cur || []).map(c => c.c)), base: (state.set || {}).base, keep: A.keep }, bad = [];
      const se = rules.checkSettings({ ...state, cur: A.cur, rates: A.rates }); if (old.set === null || stable(old.set) !== stable(state.set) || stable(old.cur) !== stable(A.cur)) bad.push(...se.map(m => 'settings: ' + m));
      else if (se.length && ORDER.some(k => ins[k].length || upd[k].length)) { /* pre-existing legacy settings problem: not re-judged */ }
      for (const k of ORDER) { const wasRow = new Map((old[k] || []).map(r => [r.id, r])); for (const id of [...ins[k], ...upd[k]]) for (const m of rules.checkRow(k, canon(k, A.keep[k].get(id)), { ...ctx, was: wasRow.get(id) })) bad.push(`${k} ${id}: ${m}`); }
      if (bad.length) throw new SaveError(422, 'The data was not saved because it failed validation.', bad.slice(0, 30)); }
    const cntNeed = [];
    // M1 / M2 / H5: allocation limits, refunds and credits, dated course payments, and the cancelled-project resolution gate
    { const L = forState(state), touchedRc = new Set([...ins.rc, ...upd.rc, ...[...ins.re, ...upd.re, ...del.re].map(id => ((A.keep.re.get(id) || (old.re || []).find(r => r.id === id)) || {}).rc)].filter(Boolean)),
        cnt = L.courseCountProblems(state).filter(m => { const mm = /^course (\d+):/.exec(m); return mm && touchedRc.has(+mm[1]); }),
        lp = [...L.allocationProblems(state), ...L.adjustmentProblems(state), ...L.coursePayProblems(state), ...L.settlementProblems(state)];
      cnt.forEach(m => { const id = +/^course (\d+):/.exec(m)[1]; cntNeed.push({ k: 'rc', id, label: 'DECLARED COUNT DIFFERS FROM ENROLMENTS - ' + m }); }); fxNeed.push(...cntNeed);
      const dp = require('./timetable').doneProblems(state, old); lp.push(...dp);
      if (lp.length) throw new SaveError(422, 'The data was not saved because the payment ledger rules were broken.', lp.slice(0, 30));
      const oldPr = new Map((old.pr || []).map(r => [r.id, r])), open = [], reopen = [];
      for (const [id, row] of A.keep.pr) { const was = oldPr.get(id), res = L.projectResolution(state, id);
        if (row.status === 'Cancelled' && (!was || was.status !== 'Cancelled') && res.received > 0 && res.open !== 0) open.push({ id, name: row.name, cur: row.cur, student: row.s, received: res.received, resolved: res.resolved, open: res.open });
        if (was && was.status === 'Cancelled' && row.status !== 'Cancelled' && res.resolved > 0) reopen.push({ id, name: row.name }); }
      if (reopen.length) throw new SaveError(409, 'A cancelled project that has a recorded refund / credit / resolution cannot be re-opened: those records belong to the cancellation. Nothing was changed.', { refusal: 'reopen-cancelled-project', projects: reopen });
      if (open.length) throw new SaveError(409, 'Cancelling a project that has received money needs an explicit financial resolution (refund, student credit, or a reasoned manual resolution) for the full amount. Nothing was changed.', { needsResolution: open }); }
    // destructive removals that are allowed but need a typed reason
    { const have = new Map((Array.isArray(confirm) ? confirm : []).filter(c => c && typeof c.reason === 'string' && c.reason.trim().length >= 3).map(c => [c.k + ':' + c.id, c.reason.trim().slice(0, 300)])), need = [];
      for (const k of ORDER) for (const id of del[k]) { const row = old[k].find(r => r.id === id); if (needsReason(k, row) && !have.has(k + ':' + id)) need.push({ k, id, label: label(k, row) }); }
      for (const x of fxNeed) if (!have.has(x.k + ':' + x.id)) need.push(x);
      if (need.length) throw new SaveError(409, 'Deleting these records, or changing these recorded amounts, needs a reason. Nothing was changed.', { needsConfirm: need });
      var reasons = have; }
    let dirty = ORDER.some(k => del[k].length || ins[k].length || upd[k].length) || old.set === null;
    const AL = (action, entity, id, before, after, detail = '', extra = {}) => audit.log(db, { at: now, action, entity, id, before, after, detail, actor, ...extra });
    for (const x of cntNeed) AL('count-confirmed', 'rc', x.id, null, { declared: (A.keep.rc.get(x.id) || {}).n, enrolments: [...A.keep.re.values()].filter(e => e.rc === x.id).length }, reasons.get('rc:' + x.id) || '', { reason: reasons.get('rc:' + x.id) || null });
    for (const k of [...ORDER].reverse()) for (const id of del[k]) {
      const was = old[k].find(r => r.id === id);
      AL('delete', k, id, shown(k, was), null, reasons.get(k + ':' + id) || '', { reason: reasons.get(k + ':' + id) || null, related: related(k, was, old) });
      store.deleteRow(db, k, id);
    }
    for (const k of ORDER) {
      for (const id of ins[k]) { const row = A.keep[k].get(id); db.prepare('INSERT INTO id_registry(id,kind) VALUES(?,?)').run(id, E[k].kind); store.insertRow(db, k, row, store.nextSeq(db, k)); AL('create', k, id, null, shown(k, canon(k, row)), '', { reason: k === 'ad' ? row.reason : (reasons.get(k + ':' + id) || null), related: related(k, row, state) }); }
      for (const id of upd[k]) {
        const was = old[k].find(r => r.id === id), now_ = A.keep[k].get(id), cn = canon(k, now_);
        const ch = changed(was, cn);
        if (['t', 's', 'pr'].includes(k) && (was.status || '') !== (now_.status || '')) AL(k === 'pr' && now_.status === 'Cancelled' ? 'project-cancel' : 'status-change', k, id, { status: was.status || '' }, { status: now_.status || '' }, (was.status || '') + ' -> ' + (now_.status || ''), { related: related(k, now_, state), reason: reasons.get(k + ':' + id) || null });
        const rest = { a: {}, b: {} }; for (const f of Object.keys(ch.a)) if (f !== 'status' || !['t', 's', 'pr'].includes(k)) { rest.a[f] = ch.a[f]; rest.b[f] = ch.b[f]; }
        if (Object.keys(rest.a).length) AL(['sp', 'tp', 'pp', 'cp'].includes(k) && now_.fxs === 'corrected' && was.fxs !== 'corrected' ? 'fx-correction' : 'update', k, id, shown(k, rest.a), shown(k, rest.b), Object.keys(rest.a).join(','), { reason: reasons.get(k + ':' + id) || null, related: related(k, now_, state) });
        store.updateRow(db, k, now_);
      }
    }
    // settings, currencies, rates, reminder completions
    if (old.set === null || stable(old.set) !== stable(state.set)) { dirty = true; if (old.set) { const c = changed(old.set, state.set); AL('settings-change', 'settings', null, c.a, c.b); } db.exec('DELETE FROM settings'); for (const [key, v] of Object.entries(state.set)) db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run(key, JSON.stringify(v)); }
    const rr = Object.fromEntries(Object.entries(A.rates).map(([c, r]) => [c, { r: r.r, ...(r.t != null ? { t: r.t } : {}), ...(r.type != null ? { type: r.type } : {}) }]));
    if (old.set === null || stable(old.cur) !== stable(A.cur) || stable(old.rates) !== stable(rr)) {
      dirty = true;
      const oldRates = old.rates || {};
      if (old.set !== null && stable(old.cur) !== stable(A.cur)) AL('currency-change', 'currencies', null, old.cur, A.cur);
      db.exec('DELETE FROM exchange_rates_current'); db.exec('DELETE FROM currencies'); A.cur.forEach((c, i) => db.prepare('INSERT INTO currencies(code,name,seq) VALUES(?,?,?)').run(c.c, c.n, i));
      for (const [code, r] of Object.entries(A.rates)) { db.prepare('INSERT INTO exchange_rates_current(code,rate,saved_at,rate_type) VALUES(?,?,?,?)').run(code, r.r, r.t ?? null, r.type ?? null);
        const was = oldRates[code]; if (!was || was.r !== r.r || was.t !== r.t) { db.prepare('INSERT INTO exchange_rate_history(code,rate,saved_at,rate_type,recorded_at) VALUES(?,?,?,?,?)').run(code, r.r, r.t ?? null, r.type ?? null, now); if (old.set !== null) AL('rate-change', 'rate', null, was ? { code, rate: was.r, type: was.type, at: was.t } : { code }, { code, rate: r.r, type: r.type, at: r.t }); } }
    }
    const oldRd = new Set(Object.keys(old.rd || {})), newRd = new Set(A.rd.map(([a, b]) => a + '|' + b));
    if ([...oldRd].some(k => !newRd.has(k)) || [...newRd].some(k => !oldRd.has(k))) dirty = true;
    for (const key of oldRd) if (!newRd.has(key)) { const [a, b] = key.split('|'); db.prepare('DELETE FROM reminder_completions WHERE reminder_id=? AND date=?').run(+a, b); }
    for (const key of newRd) if (!oldRd.has(key)) { const [a, b] = key.split('|'); db.prepare('INSERT INTO reminder_completions(reminder_id,date) VALUES(?,?)').run(+a, b); }
    // counters
    const max = Math.max(0, ...ORDER.flatMap(k => [...A.keep[k].keys()]), db.prepare('SELECT COALESCE(MAX(id),0) m FROM id_registry').get().m);
    const next = Math.max(Number.isInteger(state.id) ? state.id : 0, max + 1);
    const prevNext = db.prepare("SELECT value FROM schema_meta WHERE key='next_id'").get(); if (!dirty && (!prevNext || +prevNext.value !== next)) dirty = true;
    if (!dirty) return { rev: cur, changed: {} };
    const meta = db.prepare('INSERT OR REPLACE INTO schema_meta(key,value) VALUES(?,?)'); meta.run('next_id', String(next)); meta.run('legacy_data_version', '5'); meta.run('rev', String(cur + 1));
    // proof: what the database now returns must equal what the client sent
    const diff = roundTripDiff(state, assemble(db), A); if (diff.length) throw new SaveError(500, 'Internal check failed; the save was rolled back.', diff.slice(0, 10));
    const fk = db.prepare('PRAGMA foreign_key_check').all(); if (fk.length) throw new SaveError(500, 'Foreign-key check failed; the save was rolled back.', fk.slice(0, 5));
    return { rev: cur + 1, changed: Object.fromEntries(ORDER.map(k => [k, { added: ins[k].length, updated: upd[k].length, removed: del[k].length }]).filter(([, v]) => v.added + v.updated + v.removed)) };
  });
}
// normalise an incoming row the way the database returns it, so unchanged rows are not rewritten
function canon(k, r) { const o = JSON.parse(JSON.stringify(r)); delete o.__nullify; delete o.__dropLinks; const nf = { tt: ['t', 'subj'], sub: ['inst'], pr: ['subj', 't', 's'], rc: ['subj', 'inst'], l: ['tt'] }[k] || []; for (const f of nf) if (o[f] === 0 || o[f] === '') delete o[f]; if (o.ex && !Object.keys(o.ex).length) delete o.ex; for (const [f, sp] of Object.entries(E[k].cols)) if (sp[0] === 'b' && o[f] === true) o[f] = 1; return o; }
module.exports = { applySave, getState, impact, SaveError, getRev, DEFAULT, hasHistory };
