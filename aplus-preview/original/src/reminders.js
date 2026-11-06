'use strict';
// L6: reminders. The rule is the page's own (day-of-week + repeat frequency from the start date), ported 1:1 so the server and the page agree.
// What this can do: while the app is running the page polls /api/reminders and shows what is due; each occurrence is surfaced once (reminder_log).
// What it cannot do: deliver anything while the app is closed. For that, /api/reminders.ics exports upcoming occurrences with stable UIDs for any calendar app (re-importing never duplicates).
const cairo = require('./cairo'); const log = require('./log');
const FQ = { 'Weekly': 1, 'Every 2 weeks': 2, 'Every 4 weeks': 4, 'Once (first week only)': 0 }; // identical to the page's table
function occurrences(st, a, b) {
  const out = [];
  for (const r of st.rm || []) for (let d = a; d <= b; d = cairo.addDays(d, 1)) {
    if (!r.a || d < r.a || (r.b && d > r.b)) continue;
    if (!(r.days || []).includes(new Date(d + 'T00:00:00Z').getUTCDay())) continue;
    const wk = Math.floor((new Date(d) - new Date(r.a)) / 864e5 / 7), k = FQ[r.f] ?? 1; if (k ? wk % k : wk) continue;
    out.push({ id: r.id, name: r.name, rc: r.rc, date: d, time: r.time || '' });
  }
  return out.sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time));
}
// due now = date/time already reached in Cairo, within the look-back window, not marked Done, not yet surfaced
function due(db, st, now = new Date(), lookbackDays = 7) {
  const today = cairo.today(now), t = cairo.nowTime(now);
  const seen = new Set(db.prepare('SELECT reminder_id||\'|\'||due_date k FROM reminder_log').all().map(r => r.k));
  return occurrences(st, cairo.addDays(today, -lookbackDays), today).filter(o => (o.date < today || o.time <= t) && !(st.rd || {})[o.id + '|' + o.date] && !seen.has(o.id + '|' + o.date));
}
function ack(db, id, date, now = new Date()) {
  if (!Number.isInteger(id) || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) { const e = new Error('bad reminder reference'); e.code = 400; throw e; }
  if (!db.prepare('SELECT 1 x FROM course_reminders WHERE id=?').get(id)) { const e = new Error('no such reminder'); e.code = 404; throw e; }
  const r = db.prepare('INSERT OR IGNORE INTO reminder_log(reminder_id,due_date,surfaced_at) VALUES(?,?,?)').run(id, date, now.toISOString()); return { acknowledged: true, first: r.changes === 1 };
}
const esc = s => String(s || '').replace(/[\;,]/g, m => '\\' + m).replace(/\r?\n/g, '\\n');
function ics(st, courses, now = new Date(), days = 60) {
  const a = cairo.today(now), b = cairo.addDays(a, days), nm = new Map((courses || []).map(c => [c.id, c.name]));
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//A+ Hub//reminders//EN', 'CALSCALE:GREGORIAN'];
  for (const o of occurrences(st, a, b)) { if ((st.rd || {})[o.id + '|' + o.date]) continue; const d = o.date.replace(/-/g, ''), t = (o.time || '09:00').padStart(5, '0').replace(':', '') + '00';
    L.push('BEGIN:VEVENT', `UID:aplus-rm-${o.id}-${o.date}@localhost`, `DTSTAMP:${now.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`, `DTSTART;TZID=Africa/Cairo:${d}T${t}`, `SUMMARY:${esc(o.name || 'Reminder')}`, `DESCRIPTION:${esc(nm.get(o.rc) || '')}`, 'END:VEVENT'); }
  L.push('END:VCALENDAR'); return L.join('\r\n') + '\r\n';
}
module.exports = { occurrences, due, ack, ics, FQ };
