'use strict';
// Server-side business validation (M6) for rows that are NEW or CHANGED in a save. Rows that are unchanged are never re-judged, so legacy data
// (for example completed lessons with a zero charge) is preserved exactly until the owner reviews it. Money is integer thousandths.
const MAX_MONEY = 1e12, MAX_RATE = 1e7, MAX_HOURS = 24;
const isDate = s => { if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const d = new Date(s + 'T00:00:00Z'); return !Number.isNaN(+d) && d.toISOString().slice(0, 10) === s && +s.slice(0, 4) >= 2000 && +s.slice(0, 4) <= 2100; };
const isMoney = v => Number.isInteger(v) && Math.abs(v) <= MAX_MONEY;
const plain = (s, max) => typeof s === 'string' && s.length <= max && !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s);
const FREE = r => r && (r.free === 1 || r.free === true) && typeof r.freeReason === 'string' && r.freeReason.trim().length >= 3; // explicit, auditable free / waived work

// ctx: { codes:Set of currency codes, base, rates }
function checkRow(k, r, ctx) {
  const e = []; { const sp = require('./mapping').structProblem(k, r); if (sp) e.push(sp); } const need = (c, m) => { if (!c) e.push(m); };
  const cur = c => c == null || c === '' || ctx.codes.has(c);
  const pct = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
  const rate = v => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= MAX_RATE;
  for (const f of ['name', 'sub', 'uni', 'notes', 'spec', 'country', 'major', 'srcd', 'meth', 'freeReason', 'reason']) if (r[f] !== undefined && r[f] !== null && !plain(String(r[f]), f === 'notes' ? 4000 : 300)) e.push(`${f}: text contains characters that are not allowed or is too long`);
  if (k === 'l') {
    need(isDate(r.date), 'lesson date is not a valid date (YYYY-MM-DD)');
    need(typeof r.d === 'number' && Number.isFinite(r.d) && r.d > 0 && r.d <= MAX_HOURS, `duration must be greater than 0 and at most ${MAX_HOURS} hours`);
    need(isMoney(r.tr) && r.tr >= 0 && isMoney(r.sr) && r.sr >= 0, 'hourly rates must be zero or positive amounts');
    need(isMoney(r.bcost) && r.bcost >= 0 && isMoney(r.bchg) && r.bchg >= 0, 'lesson amounts must be zero or positive');
    need(cur(r.tc) && cur(r.sc) && cur(r.bc), 'lesson currency is not in the currency list');
    for (const f of ['trx', 'srx']) if (r[f] != null) need(rate(r[f]), `${f}: exchange rate must be a positive number`);
    if (r.st === 'Completed') {
      if (!(r.bchg > 0) && !FREE(r)) e.push('a completed lesson with a zero student charge needs the free-session flag and a reason');
      if (!(r.bcost > 0) && !FREE(r) && !(r.waived === 1 && typeof r.freeReason === 'string' && r.freeReason.trim().length >= 3)) e.push('a completed lesson with a zero teacher cost needs the free/waived flag and a reason');
    }
  } else if (k === 'sp' || k === 'tp') {
    need(isDate(r.date), 'payment date is not a valid date (YYYY-MM-DD)');
    need(isMoney(r.amt) && r.amt > 0, 'a payment amount must be greater than zero');
    need(cur(r.cur) && r.cur, 'payment currency is not in the currency list');
    need(rate(r.rx), 'payment exchange rate must be a positive number');
    need(isMoney(r.bamt) && r.bamt > 0, 'the base-currency amount must be greater than zero');
    // B: amount, currency, saved rate and base amount must agree. Legacy rows are never re-judged for things the edit did not touch: when only notes / method / description change,
    // the financial snapshot (owner, date, currency, amounts, rate, source, link) is left exactly as stored and its historical rounding is reported separately.
    const finSame = !!ctx.was && ['p', 'date', 'cur', 'amt', 'rx', 'bamt', 'bc', 'src', 'lk'].every(f => (ctx.was[f] ?? null) === (r[f] ?? null));
    if (!finSame && isMoney(r.amt) && isMoney(r.bamt) && rate(r.rx) && r.cur) {
      if (ctx.base && r.cur === ctx.base) need(r.rx === 1 && r.bamt === r.amt, `a ${ctx.base} payment must have rate 1 and a base amount equal to the amount`);
      else if (!(ctx.base && r.bc && r.bc !== ctx.base)) need(Math.abs(Math.round(r.amt * r.rx) - r.bamt) <= 1, `base amount ${r.bamt / 1000} does not equal amount ${r.amt / 1000} x rate ${r.rx} (rounded to 0.001)`);
    }
    if (k === 'tp' && !finSame) {
      need(r.src == null || r.src === '' || ['Live', 'Recorded', 'Project', 'Other'].includes(r.src), `payment source "${String(r.src).slice(0, 20)}" is not one of Live, Recorded, Project, Other`);
      if (r.src === 'Other') need(typeof r.srcd === 'string' && r.srcd.trim().length >= 3, 'a payment with source Other needs a description');
      if (r.lk) { // the link points at a lesson (source Live), a recorded course (Recorded) or a project (Project); it must exist, belong to this teacher and be in the payment's currency
        const K = ctx.keep, tgt = r.src === 'Live' ? K && K.l && K.l.get(r.lk) : r.src === 'Recorded' ? K && K.rc && K.rc.get(r.lk) : r.src === 'Project' ? K && K.pr && K.pr.get(r.lk) : null, what = { Live: 'lesson', Recorded: 'course', Project: 'project' }[r.src];
        if (!what) e.push(`a payment with source ${r.src || '(none)'} cannot be linked to a lesson, course or project`);
        else if (K) {
          if (!tgt) e.push(`linked ${what} ${r.lk} does not exist`);
          else { const owner = r.src === 'Recorded' ? tgt.inst : tgt.t, cu = r.src === 'Live' ? tgt.tc : tgt.cur;
            if (owner !== r.p) e.push(`linked ${what} ${r.lk} belongs to a different teacher`);
            if ((cu || '') !== (r.cur || '')) e.push(`linked ${what} ${r.lk} is in ${cu}; a ${r.cur} payment cannot be linked to it - record the payment without a link and add a cross-currency settlement`); }
        }
      }
    }
  } else if (k === 'ts') {
    need(isDate(r.date), 'settlement date is required and must be a valid date'); need(isMoney(r.pamt) && r.pamt > 0 && isMoney(r.samt) && r.samt > 0, 'paid and settled amounts must be greater than zero');
    need(rate(r.rx), 'settlement rate must be a positive number'); need(cur(r.pcur) && r.pcur && cur(r.scur) && r.scur && r.pcur !== r.scur, 'a settlement needs two different currencies from the currency list');
    need(r.prov !== 'correction' || (typeof r.reason === 'string' && r.reason.trim().length >= 3), 'a correction settlement needs a reason (at least 3 characters)');
  } else if (k === 'pp') {
    need(isDate(r.date), 'project payment date is required and must be a valid date (YYYY-MM-DD)');
    need(isMoney(r.amt) && r.amt > 0, 'a payment amount must be greater than zero');
    if (r.rx != null) need(rate(r.rx), 'payment exchange rate must be a positive number');
  } else if (k === 'cp') {
    need(isDate(r.date), 'course payment date is required and must be a valid date (YYYY-MM-DD)'); need(isMoney(r.amt) && r.amt > 0, 'a payment amount must be greater than zero');
  } else if (k === 'al') {
    need(isDate(r.date), 'allocation date is required and must be a valid date'); need(isMoney(r.amt) && r.amt > 0, 'an allocated amount must be greater than zero');
  } else if (k === 'ad') {
    need(isDate(r.date), 'the date is required and must be a valid date'); need(isMoney(r.amt) && r.amt > 0, 'the amount must be greater than zero');
    need(typeof r.reason === 'string' && r.reason.trim().length >= 3, 'a reason (at least 3 characters) is required for every refund, credit or resolution'); need(cur(r.cur) && r.cur, 'currency is not in the currency list');
    if (r.rx != null) need(rate(r.rx), 'exchange rate must be a positive number');
  } else if (k === 'pr') {
    need(isMoney(r.rev) && (r.rev > 0 || FREE(r)), 'project revenue must be greater than zero (or marked free with a reason)');
    need(pct(r.share), 'profit share must be between 0 and 100');
    need(cur(r.cur) && r.cur, 'project currency is not in the currency list'); need(rate(r.rx), 'project exchange rate must be a positive number');
    if (r.start) need(isDate(r.start), 'start date is not a valid date'); if (r.due) need(isDate(r.due), 'due date is not a valid date');
    if (r.start && r.due && isDate(r.start) && isDate(r.due)) need(r.due >= r.start, 'due date is before the start date');
    need(isMoney(r.paid0) || r.paid0 == null, 'opening paid amount is not valid'); if (r.paid0 != null) need(r.paid0 >= 0, 'opening paid amount cannot be negative');
  } else if (k === 'rc') {
    need(isMoney(r.price) && (r.price > 0 || FREE(r)), 'course price must be greater than zero (or marked free with a reason)');
    need(Number.isInteger(r.n) && r.n >= 0 && r.n <= 100000, 'student count must be a whole number, zero or more');
    need(pct(r.share), 'profit share must be between 0 and 100'); need(r.cost == null || (isMoney(r.cost) && r.cost >= 0), 'course cost cannot be negative');
    need(cur(r.cur) && r.cur, 'course currency is not in the currency list'); need(rate(r.rx), 'course exchange rate must be a positive number');
    if (r.date) need(isDate(r.date), 'course date is not a valid date');
  } else if (k === 're') {
    need(isMoney(r.price) && (r.price > 0 || FREE(r)), 'enrolment price must be greater than zero (or marked free with a reason)');
    need(isMoney(r.paid) && r.paid >= 0, 'paid amount cannot be negative'); need(r.paid_open == null || (isMoney(r.paid_open) && r.paid_open >= 0), 'opening paid amount cannot be negative'); if (r.date) need(isDate(r.date), 'enrolment date is not a valid date');
  } else if (k === 'sub') {
    need(r.tr == null || (isMoney(r.tr) && r.tr >= 0), 'teacher rate cannot be negative'); need(r.sr == null || (isMoney(r.sr) && r.sr >= 0), 'student rate cannot be negative');
  } else if (k === 't') { need(r.rate == null || (isMoney(r.rate) && r.rate >= 0), 'hourly rate cannot be negative'); }
  else if (k === 'tt') { for (const f of ['date', 'a', 'b']) if (r[f]) need(isDate(r[f]), `${f}: not a valid date`); for (const f of ['st', 'en']) if (r[f]) need(/^([01]\d|2[0-3]):[0-5]\d$/.test(r[f]), `${f}: not a valid time (HH:MM)`); }
  return e;
}
function checkSettings(state) {
  const e = [], s = state.set || {}; for (const f of ['tr', 'sr']) if (s[f] !== undefined && s[f] !== '' && !(Number.isFinite(+s[f]) && +s[f] >= 0 && +s[f] <= MAX_MONEY / 1000)) e.push(`setting ${f} must be zero or a positive number`);
  if (s.rfh !== undefined && s.rfh !== '' && s.rfh !== null && !(Number.isInteger(+s.rfh) && +s.rfh >= 1 && +s.rfh <= 720)) e.push('setting rfh (rate freshness in hours) must be a whole number from 1 to 720');
  if (s.recog !== undefined && !['booking', 'delivered'].includes(s.recog)) e.push('setting recog must be "booking" or "delivered"');
  if (s.name !== undefined && !plain(String(s.name), 120)) e.push('academy name contains characters that are not allowed');
  const seen = new Set(); for (const c of state.cur || []) { if (!c || !/^[A-Z]{3}$/.test(c.c || '')) e.push(`currency code "${String(c && c.c).slice(0, 12)}" must be three capital letters`); else if (seen.has(c.c)) e.push(`currency ${c.c} is listed twice`); else seen.add(c.c); if (!c || !plain(String(c.n), 60) || !String(c.n).trim()) e.push(`currency name for ${String(c && c.c).slice(0, 5)} must be plain text up to 60 characters`); }
  for (const [code, r] of Object.entries(state.rates || {})) if (!(r && typeof r.r === 'number' && Number.isFinite(r.r) && r.r > 0 && r.r <= MAX_RATE)) e.push(`exchange rate for ${code.slice(0, 5)} must be a positive number`);
  return e;
}
module.exports = { checkRow, checkSettings, isDate, isMoney, plain, FREE, MAX_MONEY };
