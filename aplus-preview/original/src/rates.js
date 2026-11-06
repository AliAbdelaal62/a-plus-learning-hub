'use strict';
// M5: what a saved exchange rate may be called. 'current' = refreshed recently, 'stale' = old (never shown as Live), 'missing' = no usable value, 'manual' = typed by hand.
const STALE_HOURS = 36;
function status(entry, base, code, now = Date.now(), staleHours = STALE_HOURS) {
  if (code === base) return { state: 'base', label: 'Base currency (1)' };
  if (!entry || !(entry.r > 0)) return { state: 'missing', label: 'No rate' };
  const t = entry.t ? Date.parse(entry.t) : NaN;
  if ((entry.type || '') === 'Manual') return { state: 'manual', label: 'Manual' + (Number.isFinite(t) ? ' (' + entry.t.slice(0, 10) + ')' : '') };
  if (!Number.isFinite(t)) return { state: 'stale', label: 'Unknown age - not Live' };
  const h = (now - t) / 36e5;
  if (h > staleHours || h < -1) return { state: 'stale', label: 'Stale (' + entry.t.slice(0, 10) + ')', ageHours: Math.round(h) };
  return { state: 'current', label: entry.type === 'Live' ? 'Live' : (entry.type || 'Saved'), ageHours: Math.round(h) };
}
const hoursOf = st => { const v = Number(st && st.set && st.set.rfh); return Number.isFinite(v) && v >= 1 && v <= 720 ? v : STALE_HOURS; }; // the owner's freshness setting, else the 36 h default
function report(st, now = Date.now()) { const base = st.set.base, h = hoursOf(st); return Object.fromEntries((st.cur || []).map(c => [c.c, status((st.rates || {})[c.c], base, c.c, now, h)])); }
module.exports = { status, report, hoursOf, STALE_HOURS };
