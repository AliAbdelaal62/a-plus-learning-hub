-- A+ Hub schema v3, migration 001. Forward-only. Money = integer thousandths. Rates = exact REAL (never rounded to thousandths).
-- Record IDs keep the legacy single shared counter: id_registry makes every id unique across all tables and is never deleted from.
CREATE TABLE schema_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE id_registry(id INTEGER PRIMARY KEY, kind TEXT NOT NULL);
CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE currencies(code TEXT PRIMARY KEY, name TEXT NOT NULL, seq INTEGER NOT NULL);
CREATE TABLE exchange_rates_current(code TEXT PRIMARY KEY REFERENCES currencies(code), rate REAL NOT NULL CHECK(rate>0), saved_at TEXT, rate_type TEXT);
CREATE TABLE exchange_rate_history(id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, rate REAL NOT NULL CHECK(rate>0), saved_at TEXT, rate_type TEXT, recorded_at TEXT NOT NULL);

CREATE TABLE teachers(id INTEGER PRIMARY KEY, seq INTEGER NOT NULL, name TEXT NOT NULL, phone TEXT, email TEXT, spec TEXT, cur TEXT, rate INTEGER,
  status TEXT NOT NULL CHECK(status IN('Active','Inactive')), notes TEXT, archived_at TEXT, extra_json TEXT);
CREATE TABLE students(id INTEGER PRIMARY KEY, seq INTEGER NOT NULL, name TEXT NOT NULL, uni TEXT, country TEXT, major TEXT, lv TEXT, cur TEXT, phone TEXT, email TEXT,
  status TEXT NOT NULL CHECK(status IN('Active','Inactive')), notes TEXT, archived_at TEXT, extra_json TEXT);
CREATE TABLE subjects(id INTEGER PRIMARY KEY, seq INTEGER NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN('Live','Recorded','Project')), uni TEXT,
  inst INTEGER REFERENCES teachers(id), lv TEXT, tc TEXT, tr INTEGER, sc TEXT, sr INTEGER, extra_json TEXT);
CREATE TABLE subject_students(subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE, student_id INTEGER NOT NULL REFERENCES students(id), pos INTEGER NOT NULL, PRIMARY KEY(subject_id,student_id));

CREATE TABLE timetable_entries(id INTEGER PRIMARY KEY, seq INTEGER NOT NULL, sched TEXT NOT NULL CHECK(sched IN('one','rec')), wt TEXT CHECK(wt IS NULL OR wt IN('Live','Project','Recorded')),
  date TEXT, day TEXT, dw INTEGER, a TEXT, b TEXT, st TEXT, en TEXT, t INTEGER REFERENCES teachers(id), lv TEXT, sub TEXT, notes TEXT,
  done INTEGER, hist TEXT, rs INTEGER, archived_at TEXT, extra_json TEXT);
CREATE TABLE timetable_students(tt INTEGER NOT NULL REFERENCES timetable_entries(id) ON DELETE CASCADE, student_id INTEGER NOT NULL REFERENCES students(id), pos INTEGER NOT NULL, PRIMARY KEY(tt,student_id));
-- one row per occurrence date of a recurring series; flags are independent so an occurrence can be moved AND done; nothing here touches the series
CREATE TABLE timetable_occurrences(tt INTEGER NOT NULL REFERENCES timetable_entries(id) ON DELETE CASCADE, od TEXT NOT NULL, done INTEGER, cancelled INTEGER, skipped INTEGER, deleted INTEGER,
  moved_date TEXT, moved_st TEXT, moved_en TEXT, hist TEXT, extra_json TEXT, PRIMARY KEY(tt,od));

CREATE TABLE lessons(id INTEGER PRIMARY KEY, seq INTEGER NOT NULL, date TEXT NOT NULL, t INTEGER NOT NULL REFERENCES teachers(id), s INTEGER NOT NULL REFERENCES students(id),
  sub INTEGER NOT NULL REFERENCES subjects(id), lv TEXT, d REAL NOT NULL, tr INTEGER, sr INTEGER,
  st TEXT NOT NULL CHECK(st IN('Completed','Cancelled','Rescheduled','No Show')), tc TEXT, sc TEXT, trx REAL, srx REAL, bc TEXT, bcost INTEGER NOT NULL, bchg INTEGER NOT NULL, rt TEXT,
  oc INTEGER, og INTEGER, ts TEXT, te TEXT, notes TEXT, tt INTEGER REFERENCES timetable_entries(id) ON DELETE SET NULL, od TEXT, extra_json TEXT);
CREATE TABLE student_payments(id INTEGER PRIMARY KEY, seq INTEGER NOT NULL, p INTEGER NOT NULL REFERENCES students(id), date TEXT NOT NULL, cur TEXT, amt INTEGER NOT NULL, rx REAL, rt TEXT,
  bamt INTEGER NOT NULL, bc TEXT, meth TEXT, notes TEXT, extra_json TEXT);
CREATE TABLE teacher_payments(id INTEGER PRIMARY KEY, seq INTEGER NOT NULL, p INTEGER NOT NULL REFERENCES teachers(id), date TEXT NOT NULL, cur TEXT, amt INTEGER NOT NULL, rx REAL, rt TEXT,
  bamt INTEGER NOT NULL, bc TEXT, meth TEXT, notes TEXT, src TEXT, srcd TEXT, lk INTEGER, extra_json TEXT);

CREATE TABLE projects(id INTEGER PRIMARY KEY, seq INTEGER NOT NULL, name TEXT NOT NULL, sub TEXT, subj INTEGER REFERENCES subjects(id), uni TEXT, t INTEGER REFERENCES teachers(id), s INTEGER REFERENCES students(id), lv TEXT,
  status TEXT NOT NULL CHECK(status IN('Not Started','In Progress','Completed','Cancelled')), cur TEXT, rev INTEGER NOT NULL, share REAL, rx REAL, rt TEXT, bc TEXT, start TEXT, due TEXT, paid0 INTEGER, notes TEXT, extra_json TEXT);
CREATE TABLE project_payments(id INTEGER PRIMARY KEY, seq INTEGER NOT NULL, pr INTEGER NOT NULL REFERENCES projects(id), date TEXT, amt INTEGER NOT NULL, meth TEXT, notes TEXT, extra_json TEXT);
CREATE TABLE recorded_courses(id INTEGER PRIMARY KEY, seq INTEGER NOT NULL, name TEXT NOT NULL, sub TEXT, subj INTEGER REFERENCES subjects(id), uni TEXT, inst INTEGER REFERENCES teachers(id), lv TEXT, cur TEXT,
  rx REAL, rt TEXT, bc TEXT, cost INTEGER, price INTEGER NOT NULL, n INTEGER NOT NULL, share REAL, date TEXT, notes TEXT, extra_json TEXT);
-- enrolment paid is ONE running total in the legacy data: kept as an opening balance, never split into invented payments
CREATE TABLE course_enrollments(id INTEGER PRIMARY KEY, seq INTEGER NOT NULL, rc INTEGER NOT NULL REFERENCES recorded_courses(id), s INTEGER NOT NULL REFERENCES students(id), date TEXT, price INTEGER NOT NULL, paid INTEGER NOT NULL, extra_json TEXT);
CREATE TABLE course_reminders(id INTEGER PRIMARY KEY, seq INTEGER NOT NULL, name TEXT, rc INTEGER NOT NULL REFERENCES recorded_courses(id), days TEXT, time TEXT, a TEXT, b TEXT, f TEXT, extra_json TEXT);
CREATE TABLE reminder_completions(reminder_id INTEGER NOT NULL REFERENCES course_reminders(id) ON DELETE CASCADE, date TEXT NOT NULL, PRIMARY KEY(reminder_id,date));

CREATE TABLE audit_log(id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, action TEXT NOT NULL, entity TEXT, entity_id INTEGER, before_json TEXT, detail TEXT);
CREATE TABLE migration_runs(id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL, mode TEXT NOT NULL, source_sha256 TEXT, status TEXT NOT NULL, report_json TEXT);
CREATE TABLE migration_quarantine(id INTEGER PRIMARY KEY AUTOINCREMENT, run_id INTEGER REFERENCES migration_runs(id), entity TEXT NOT NULL, legacy_id INTEGER, reason TEXT NOT NULL, row_json TEXT NOT NULL);

CREATE INDEX ix_lessons_t ON lessons(t); CREATE INDEX ix_lessons_s ON lessons(s); CREATE INDEX ix_lessons_date ON lessons(date); CREATE INDEX ix_lessons_tt ON lessons(tt);
CREATE INDEX ix_sp_p ON student_payments(p); CREATE INDEX ix_tp_p ON teacher_payments(p); CREATE INDEX ix_pp_pr ON project_payments(pr);
CREATE INDEX ix_re_rc ON course_enrollments(rc); CREATE INDEX ix_re_s ON course_enrollments(s); CREATE INDEX ix_rm_rc ON course_reminders(rc);

-- every record id must be registered (kind matches) before insert: ids stay unique across ALL tables and are never reused
CREATE TRIGGER teachers_id_guard BEFORE INSERT ON teachers WHEN (SELECT kind FROM id_registry WHERE id=NEW.id) IS NOT 'teacher' BEGIN SELECT RAISE(ABORT,'id not registered for teacher'); END;
CREATE TRIGGER teachers_id_immutable BEFORE UPDATE OF id ON teachers BEGIN SELECT RAISE(ABORT,'id is immutable'); END;
CREATE TRIGGER students_id_guard BEFORE INSERT ON students WHEN (SELECT kind FROM id_registry WHERE id=NEW.id) IS NOT 'student' BEGIN SELECT RAISE(ABORT,'id not registered for student'); END;
CREATE TRIGGER students_id_immutable BEFORE UPDATE OF id ON students BEGIN SELECT RAISE(ABORT,'id is immutable'); END;
CREATE TRIGGER subjects_id_guard BEFORE INSERT ON subjects WHEN (SELECT kind FROM id_registry WHERE id=NEW.id) IS NOT 'subject' BEGIN SELECT RAISE(ABORT,'id not registered for subject'); END;
CREATE TRIGGER subjects_id_immutable BEFORE UPDATE OF id ON subjects BEGIN SELECT RAISE(ABORT,'id is immutable'); END;
CREATE TRIGGER lessons_id_guard BEFORE INSERT ON lessons WHEN (SELECT kind FROM id_registry WHERE id=NEW.id) IS NOT 'lesson' BEGIN SELECT RAISE(ABORT,'id not registered for lesson'); END;
CREATE TRIGGER lessons_id_immutable BEFORE UPDATE OF id ON lessons BEGIN SELECT RAISE(ABORT,'id is immutable'); END;
CREATE TRIGGER student_payments_id_guard BEFORE INSERT ON student_payments WHEN (SELECT kind FROM id_registry WHERE id=NEW.id) IS NOT 'student_payment' BEGIN SELECT RAISE(ABORT,'id not registered for student_payment'); END;
CREATE TRIGGER student_payments_id_immutable BEFORE UPDATE OF id ON student_payments BEGIN SELECT RAISE(ABORT,'id is immutable'); END;
CREATE TRIGGER teacher_payments_id_guard BEFORE INSERT ON teacher_payments WHEN (SELECT kind FROM id_registry WHERE id=NEW.id) IS NOT 'teacher_payment' BEGIN SELECT RAISE(ABORT,'id not registered for teacher_payment'); END;
CREATE TRIGGER teacher_payments_id_immutable BEFORE UPDATE OF id ON teacher_payments BEGIN SELECT RAISE(ABORT,'id is immutable'); END;
CREATE TRIGGER timetable_entries_id_guard BEFORE INSERT ON timetable_entries WHEN (SELECT kind FROM id_registry WHERE id=NEW.id) IS NOT 'timetable' BEGIN SELECT RAISE(ABORT,'id not registered for timetable'); END;
CREATE TRIGGER timetable_entries_id_immutable BEFORE UPDATE OF id ON timetable_entries BEGIN SELECT RAISE(ABORT,'id is immutable'); END;
CREATE TRIGGER projects_id_guard BEFORE INSERT ON projects WHEN (SELECT kind FROM id_registry WHERE id=NEW.id) IS NOT 'project' BEGIN SELECT RAISE(ABORT,'id not registered for project'); END;
CREATE TRIGGER projects_id_immutable BEFORE UPDATE OF id ON projects BEGIN SELECT RAISE(ABORT,'id is immutable'); END;
CREATE TRIGGER project_payments_id_guard BEFORE INSERT ON project_payments WHEN (SELECT kind FROM id_registry WHERE id=NEW.id) IS NOT 'project_payment' BEGIN SELECT RAISE(ABORT,'id not registered for project_payment'); END;
CREATE TRIGGER project_payments_id_immutable BEFORE UPDATE OF id ON project_payments BEGIN SELECT RAISE(ABORT,'id is immutable'); END;
CREATE TRIGGER recorded_courses_id_guard BEFORE INSERT ON recorded_courses WHEN (SELECT kind FROM id_registry WHERE id=NEW.id) IS NOT 'course' BEGIN SELECT RAISE(ABORT,'id not registered for course'); END;
CREATE TRIGGER recorded_courses_id_immutable BEFORE UPDATE OF id ON recorded_courses BEGIN SELECT RAISE(ABORT,'id is immutable'); END;
CREATE TRIGGER course_enrollments_id_guard BEFORE INSERT ON course_enrollments WHEN (SELECT kind FROM id_registry WHERE id=NEW.id) IS NOT 'enrollment' BEGIN SELECT RAISE(ABORT,'id not registered for enrollment'); END;
CREATE TRIGGER course_enrollments_id_immutable BEFORE UPDATE OF id ON course_enrollments BEGIN SELECT RAISE(ABORT,'id is immutable'); END;
CREATE TRIGGER course_reminders_id_guard BEFORE INSERT ON course_reminders WHEN (SELECT kind FROM id_registry WHERE id=NEW.id) IS NOT 'reminder' BEGIN SELECT RAISE(ABORT,'id not registered for reminder'); END;
CREATE TRIGGER course_reminders_id_immutable BEFORE UPDATE OF id ON course_reminders BEGIN SELECT RAISE(ABORT,'id is immutable'); END;
CREATE TRIGGER id_registry_nodelete BEFORE DELETE ON id_registry BEGIN SELECT RAISE(ABORT,'ids are never reused'); END;
