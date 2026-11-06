'use strict';
// M4: the business calendar is Africa/Cairo. These helpers turn an instant into the Cairo calendar date / time (DST-aware) and never use the machine's zone or UTC.
const TZ = 'Africa/Cairo';
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function parts(d = new Date()) { const o = {}; for (const p of fmt.formatToParts(d)) o[p.type] = p.value; return o; }
const today = (d = new Date()) => { const p = parts(d); return `${p.year}-${p.month}-${p.day}`; };
const nowTime = (d = new Date()) => { const p = parts(d); return `${p.hour}:${p.minute}`; };
const addDays = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.toISOString().slice(0, 10); }; // pure calendar arithmetic: no zone involved
module.exports = { TZ, today, nowTime, addDays, parts };
