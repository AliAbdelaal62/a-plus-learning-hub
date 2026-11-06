-- Migration 005 (forward-only, additive). Nothing is dropped, renamed or rewritten; no existing value, id, amount, date or rate changes.
-- C: explicit cross-currency settlement of a teacher payment. A settlement says "this much of payment #tp (in its own currency) settles this much of obligation (lesson / course / project) in the obligation's currency, at this rate".
--    Historical payments get NO settlement rows: they stay exactly as recorded and are reported as unresolved (never guessed).
CREATE TABLE teacher_settlements(
  id INTEGER PRIMARY KEY, seq INTEGER NOT NULL,
  tp INTEGER NOT NULL REFERENCES teacher_payments(id),
  ok TEXT NOT NULL CHECK(ok IN('lesson','course','project')), oid INTEGER NOT NULL,           -- the obligation settled
  pcur TEXT NOT NULL, pamt INTEGER NOT NULL CHECK(pamt > 0),                                    -- currency and amount PAID that is used for this settlement
  scur TEXT NOT NULL, samt INTEGER NOT NULL CHECK(samt > 0),                                    -- currency and amount SETTLED on the obligation
  rx REAL NOT NULL CHECK(rx > 0),                                                               -- units of scur per 1 unit of pcur (direction: pcur -> scur)
  date TEXT NOT NULL,                                                                           -- settlement date
  prov TEXT NOT NULL DEFAULT 'new' CHECK(prov IN('new','correction')),                          -- provenance: 'correction' = recorded later for a historical payment (reason mandatory)
  reason TEXT, extra_json TEXT,
  CHECK(pcur <> scur), CHECK(prov = 'new' OR length(trim(coalesce(reason,''))) >= 3));
CREATE INDEX ix_ts_tp ON teacher_settlements(tp);
CREATE INDEX ix_ts_ob ON teacher_settlements(ok, oid);
CREATE TRIGGER teacher_settlements_id_guard BEFORE INSERT ON teacher_settlements WHEN (SELECT kind FROM id_registry WHERE id=NEW.id) IS NOT 'teacher_settlement' BEGIN SELECT RAISE(ABORT,'id not registered for teacher_settlement'); END;
CREATE TRIGGER teacher_settlements_id_immutable BEFORE UPDATE OF id ON teacher_settlements BEGIN SELECT RAISE(ABORT,'id is immutable'); END;
-- conservation: settlements can never use more of a payment than the payment holds
CREATE TRIGGER ts_no_overuse_ins BEFORE INSERT ON teacher_settlements
  WHEN (SELECT COALESCE(SUM(pamt),0) FROM teacher_settlements WHERE tp = NEW.tp) + NEW.pamt > (SELECT amt FROM teacher_payments WHERE id = NEW.tp)
  BEGIN SELECT RAISE(ABORT,'settlements would use more than the payment amount'); END;
CREATE TRIGGER ts_no_overuse_upd BEFORE UPDATE OF pamt, tp ON teacher_settlements
  WHEN (SELECT COALESCE(SUM(pamt),0) FROM teacher_settlements WHERE tp = NEW.tp AND id <> NEW.id) + NEW.pamt > (SELECT amt FROM teacher_payments WHERE id = NEW.tp)
  BEGIN SELECT RAISE(ABORT,'settlements would use more than the payment amount'); END;
CREATE TRIGGER tp_amount_not_below_settlements BEFORE UPDATE OF amt ON teacher_payments
  WHEN NEW.amt < (SELECT COALESCE(SUM(pamt),0) FROM teacher_settlements WHERE tp = NEW.id)
  BEGIN SELECT RAISE(ABORT,'a payment cannot be reduced below the amount already used by settlements'); END;

-- I: indexes for query paths that exist in the code (lookups by linked service, owner and date); no data is touched
CREATE INDEX IF NOT EXISTS ix_tp_lk ON teacher_payments(lk);
CREATE INDEX IF NOT EXISTS ix_tp_date ON teacher_payments(date);
CREATE INDEX IF NOT EXISTS ix_sp_date ON student_payments(date);
CREATE INDEX IF NOT EXISTS ix_lessons_sub ON lessons(sub);
CREATE INDEX IF NOT EXISTS ix_pr_s ON projects(s);
CREATE INDEX IF NOT EXISTS ix_pr_t ON projects(t);
CREATE INDEX IF NOT EXISTS ix_rc_inst ON recorded_courses(inst);
CREATE INDEX IF NOT EXISTS ix_tt_t ON timetable_entries(t);
