-- Migration 003 (forward-only, additive): financial ledger.
-- Nothing is dropped, renamed or rewritten. Every original amount, date, rate and id is untouched.
-- Back-fills only NEW bookkeeping columns, and marks how trustworthy each stored conversion is:
--   fxs = 'stored'   : the payment itself carries its own rate and base amount (student / teacher payments)
--   fxs = 'identity' : payment currency is the base currency: rate 1 by definition (nothing to look up, nothing copied)
--   fxs = 'derived'  : ONLY for payments entered after this migration in a foreign currency: the parent's saved rate at the moment of entry, frozen and flagged as an estimate
--   fxs = 'missing'  : no usable rate exists anywhere; it is listed in the reconciliation report and never guessed
--   fxs = 'corrected': changed later by an audited manual correction (new rows only)

-- ---- H3: frozen conversion on every payment ---------------------------------------------------------------
ALTER TABLE student_payments ADD COLUMN fxs TEXT;
ALTER TABLE teacher_payments ADD COLUMN fxs TEXT;
ALTER TABLE project_payments ADD COLUMN cur TEXT;
ALTER TABLE project_payments ADD COLUMN rx REAL;
ALTER TABLE project_payments ADD COLUMN bamt INTEGER;
ALTER TABLE project_payments ADD COLUMN bc TEXT;
ALTER TABLE project_payments ADD COLUMN fxs TEXT;

UPDATE student_payments SET fxs = CASE WHEN rx > 0 AND bamt IS NOT NULL AND bc IS NOT NULL THEN 'stored' ELSE 'missing' END;
UPDATE teacher_payments SET fxs = CASE WHEN rx > 0 AND bamt IS NOT NULL AND bc IS NOT NULL THEN 'stored' ELSE 'missing' END;
-- Legacy project payments never had a rate of their own. The parent project's CURRENT rate is NOT copied (it is not a transaction-date rate):
--   * payment currency = base currency  -> fxs 'identity': rate 1 and bamt = amt by definition, no historical rate needed
--   * any other currency                -> fxs 'missing': no rate or base amount is invented; it is listed for an audited manual correction
UPDATE project_payments SET cur = (SELECT cur FROM projects WHERE projects.id = project_payments.pr);
UPDATE project_payments SET rx = 1, bamt = amt, bc = cur, fxs = 'identity'
  WHERE cur IS NOT NULL AND cur = (SELECT trim(value, '"') FROM settings WHERE key = 'base');
UPDATE project_payments SET fxs = 'missing' WHERE fxs IS NULL;

-- ---- H5: dated receipts for course enrolments; the old undated "paid" figure becomes a labelled opening balance ----
ALTER TABLE course_enrollments ADD COLUMN paid_open INTEGER;
UPDATE course_enrollments SET paid_open = paid;   -- everything recorded before this migration has no payment date: it is an opening balance

CREATE TABLE course_payments(
  id INTEGER PRIMARY KEY, seq INTEGER NOT NULL,
  re INTEGER NOT NULL REFERENCES course_enrollments(id),
  date TEXT NOT NULL, amt INTEGER NOT NULL CHECK(amt > 0),
  cur TEXT, rx REAL, bamt INTEGER, bc TEXT, fxs TEXT, meth TEXT, notes TEXT, extra_json TEXT);
CREATE INDEX ix_cp_re ON course_payments(re);

-- ---- M1: explicit allocation of a student receipt to a work type and (optionally) one specific charge -------------
CREATE TABLE payment_allocations(
  id INTEGER PRIMARY KEY, seq INTEGER NOT NULL,
  sp INTEGER NOT NULL REFERENCES student_payments(id),
  wt TEXT NOT NULL CHECK(wt IN('Live','Recorded','Project','Other')),
  tk TEXT CHECK(tk IS NULL OR tk IN('lesson','enrollment','project')),
  tid INTEGER, amt INTEGER NOT NULL CHECK(amt > 0), date TEXT NOT NULL, reason TEXT, extra_json TEXT);
CREATE INDEX ix_al_sp ON payment_allocations(sp);
CREATE TRIGGER al_no_overallocation_ins BEFORE INSERT ON payment_allocations
  WHEN (SELECT COALESCE(SUM(amt),0) FROM payment_allocations WHERE sp = NEW.sp) + NEW.amt > (SELECT amt FROM student_payments WHERE id = NEW.sp)
  BEGIN SELECT RAISE(ABORT,'allocations would exceed the payment amount'); END;
CREATE TRIGGER al_no_overallocation_upd BEFORE UPDATE OF amt, sp ON payment_allocations
  WHEN (SELECT COALESCE(SUM(amt),0) FROM payment_allocations WHERE sp = NEW.sp AND id <> NEW.id) + NEW.amt > (SELECT amt FROM student_payments WHERE id = NEW.sp)
  BEGIN SELECT RAISE(ABORT,'allocations would exceed the payment amount'); END;
CREATE TRIGGER sp_amount_not_below_allocations BEFORE UPDATE OF amt ON student_payments
  WHEN NEW.amt < (SELECT COALESCE(SUM(amt),0) FROM payment_allocations WHERE sp = NEW.id)
  BEGIN SELECT RAISE(ABORT,'a payment cannot be reduced below the amount already allocated; remove or reduce the allocations first'); END;

-- ---- M2: refunds, student credit and explicit resolution of money held for a cancelled project ----------------------
--  refund      money returned to the student           credit       money kept by the academy as student credit
--  credit-used student credit applied to a new charge   retained     explicit manual resolution: the academy keeps the money (reason mandatory)
CREATE TABLE student_adjustments(
  id INTEGER PRIMARY KEY, seq INTEGER NOT NULL,
  s INTEGER NOT NULL REFERENCES students(id), pr INTEGER REFERENCES projects(id),
  kind TEXT NOT NULL CHECK(kind IN('refund','credit','credit-used','retained')),
  date TEXT NOT NULL, cur TEXT NOT NULL, amt INTEGER NOT NULL CHECK(amt > 0),
  rx REAL, bamt INTEGER, bc TEXT, fxs TEXT,
  ok TEXT, oid INTEGER,                                   -- original payment reference (kind: sp | pp | cp | opening), when there is one
  reason TEXT NOT NULL CHECK(length(trim(reason)) >= 3), extra_json TEXT);
CREATE INDEX ix_sa_s ON student_adjustments(s);
CREATE INDEX ix_sa_pr ON student_adjustments(pr);

-- ---- id registry guards for the new record kinds (same single shared id counter as the rest of the app) ----------------
CREATE TRIGGER course_payments_id_guard BEFORE INSERT ON course_payments WHEN (SELECT kind FROM id_registry WHERE id=NEW.id) IS NOT 'course_payment' BEGIN SELECT RAISE(ABORT,'id not registered for course_payment'); END;
CREATE TRIGGER course_payments_id_immutable BEFORE UPDATE OF id ON course_payments BEGIN SELECT RAISE(ABORT,'id is immutable'); END;
CREATE TRIGGER payment_allocations_id_guard BEFORE INSERT ON payment_allocations WHEN (SELECT kind FROM id_registry WHERE id=NEW.id) IS NOT 'payment_allocation' BEGIN SELECT RAISE(ABORT,'id not registered for payment_allocation'); END;
CREATE TRIGGER payment_allocations_id_immutable BEFORE UPDATE OF id ON payment_allocations BEGIN SELECT RAISE(ABORT,'id is immutable'); END;
CREATE TRIGGER student_adjustments_id_guard BEFORE INSERT ON student_adjustments WHEN (SELECT kind FROM id_registry WHERE id=NEW.id) IS NOT 'student_adjustment' BEGIN SELECT RAISE(ABORT,'id not registered for student_adjustment'); END;
CREATE TRIGGER student_adjustments_id_immutable BEFORE UPDATE OF id ON student_adjustments BEGIN SELECT RAISE(ABORT,'id is immutable'); END;

-- ---- H6: audit entries can carry a reason and the related student / teacher / project ids ---------------------------------
ALTER TABLE audit_log ADD COLUMN reason TEXT;
ALTER TABLE audit_log ADD COLUMN related_json TEXT;
