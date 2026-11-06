-- Administrative records only. No historical financial or teaching rows are rewritten.
CREATE TABLE service_registrations (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 student_id INTEGER NOT NULL REFERENCES students(id),
 teacher_id INTEGER REFERENCES teachers(id),
 subject_id INTEGER NOT NULL REFERENCES subjects(id),
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
 starts_on TEXT NOT NULL, ends_on TEXT,
 status TEXT NOT NULL CHECK(status IN ('Active','Paused','Completed','Cancelled')),
 goal TEXT NOT NULL DEFAULT '',
 billing_basis TEXT NOT NULL CHECK(billing_basis IN ('Per lesson','Package','Course','Project')),
 agreed_price INTEGER CHECK(agreed_price IS NULL OR agreed_price>=0),
 -- Currency catalog is replaced transactionally by the legacy settings save.
 -- Validate agreement currency in the API; preserve the historical code here.
 currency TEXT,
 planned_sessions INTEGER CHECK(planned_sessions IS NULL OR planned_sessions>0),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX ix_registration_student ON service_registrations(student_id,status);
CREATE INDEX ix_registration_teacher ON service_registrations(teacher_id,status);
CREATE TABLE lesson_attendance (
 lesson_id INTEGER PRIMARY KEY REFERENCES lessons(id),
 status TEXT NOT NULL CHECK(status IN ('Present','Late','Excused','Absent')),
 note TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL
);
CREATE TABLE lesson_journals (
 lesson_id INTEGER PRIMARY KEY REFERENCES lessons(id),
 taught TEXT NOT NULL DEFAULT '', next_step TEXT NOT NULL DEFAULT '',
 homework TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL
);
CREATE TABLE followup_tasks (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
 owner TEXT NOT NULL CHECK(length(trim(owner)) BETWEEN 1 AND 100),
 due_on TEXT NOT NULL,
 priority TEXT NOT NULL CHECK(priority IN ('Normal','High')),
 status TEXT NOT NULL CHECK(status IN ('Open','In Progress','Done','Cancelled')),
 student_id INTEGER REFERENCES students(id), teacher_id INTEGER REFERENCES teachers(id),
 registration_id INTEGER REFERENCES service_registrations(id),
 detail TEXT NOT NULL DEFAULT '', result TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX ix_tasks_due ON followup_tasks(status,due_on,priority);
CREATE INDEX ix_tasks_student ON followup_tasks(student_id,status);
