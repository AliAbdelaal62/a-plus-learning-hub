-- Migration 002 (forward-only): richer, append-only audit log. Existing rows are untouched; new columns are NULL for them.
ALTER TABLE audit_log ADD COLUMN after_json TEXT;
ALTER TABLE audit_log ADD COLUMN actor TEXT;
CREATE INDEX ix_audit_entity ON audit_log(entity, entity_id);
CREATE INDEX ix_audit_at ON audit_log(at);
-- append-only: the application can add audit rows but never change or remove them
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT,'audit_log is append-only'); END;
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT,'audit_log is append-only'); END;
