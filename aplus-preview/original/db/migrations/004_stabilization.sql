-- Migration 004 (forward-only, additive). Nothing is dropped, renamed or rewritten; no existing value, id, amount, date or rate changes.
-- M9: save requests are remembered so a retried / double-submitted save is answered with its first result instead of being applied twice.
CREATE TABLE IF NOT EXISTS save_requests(req_id TEXT PRIMARY KEY, rev_before INTEGER NOT NULL, rev_after INTEGER NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL);
-- L6: one row per reminder occurrence that has been surfaced, so it is never surfaced twice.
CREATE TABLE IF NOT EXISTS reminder_log(reminder_id INTEGER NOT NULL, due_date TEXT NOT NULL, surfaced_at TEXT NOT NULL, PRIMARY KEY(reminder_id, due_date));
-- M7: a real reference from a timetable entry to its subject. The legacy free-text column `sub` is kept exactly as it is.
ALTER TABLE timetable_entries ADD COLUMN subj INTEGER REFERENCES subjects(id);
-- Back-fill ONLY where the legacy text matches exactly one subject name (case / spacing-insensitive); ambiguous or unknown text is left NULL (never guessed).
UPDATE timetable_entries SET subj = (SELECT s.id FROM subjects s WHERE lower(trim(s.name)) = lower(trim(timetable_entries.sub)))
  WHERE sub IS NOT NULL AND (SELECT count(*) FROM subjects s WHERE lower(trim(s.name)) = lower(trim(timetable_entries.sub))) = 1;
