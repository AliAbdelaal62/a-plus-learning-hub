-- Additive browser-preview schema; original academy schema/version remains unchanged.
CREATE TABLE IF NOT EXISTS preview_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS preview_student_accounts(
 id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE,
 display_name TEXT NOT NULL, student_id INTEGER NOT NULL REFERENCES students(id),
 password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS preview_student_sessions(token_hash TEXT PRIMARY KEY,account_id INTEGER NOT NULL REFERENCES preview_student_accounts(id),expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS preview_requests(
 id INTEGER PRIMARY KEY AUTOINCREMENT,request_key TEXT NOT NULL UNIQUE,kind TEXT NOT NULL,
 actor TEXT NOT NULL,student_id INTEGER REFERENCES students(id),record TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN('Pending','Approved','Rejected')),
 reason TEXT NOT NULL,created_at TEXT NOT NULL,decided_at TEXT,decided_by TEXT,result TEXT
);
CREATE TABLE IF NOT EXISTS preview_shares(
 id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER NOT NULL REFERENCES students(id),
 teacher_id INTEGER REFERENCES teachers(id),kind TEXT NOT NULL,source_id INTEGER NOT NULL,
 title TEXT NOT NULL,body TEXT NOT NULL DEFAULT '',url TEXT NOT NULL DEFAULT '',due_on TEXT,
 released INTEGER NOT NULL DEFAULT 0 CHECK(released IN(0,1)),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 UNIQUE(student_id,kind,source_id,title)
);
CREATE TABLE IF NOT EXISTS preview_submissions(
 id INTEGER PRIMARY KEY AUTOINCREMENT,share_id INTEGER NOT NULL REFERENCES preview_shares(id),
 student_id INTEGER NOT NULL REFERENCES students(id),body TEXT NOT NULL,url TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL, UNIQUE(share_id,student_id)
);
CREATE TABLE IF NOT EXISTS preview_feedback(
 id INTEGER PRIMARY KEY AUTOINCREMENT,submission_id INTEGER NOT NULL UNIQUE REFERENCES preview_submissions(id),
 body TEXT NOT NULL,published INTEGER NOT NULL DEFAULT 0 CHECK(published IN(0,1)),updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS preview_notifications(
 id INTEGER PRIMARY KEY AUTOINCREMENT,event_key TEXT NOT NULL,recipient_kind TEXT NOT NULL CHECK(recipient_kind IN('Student','Teacher')),
 recipient_id INTEGER NOT NULL,kind TEXT NOT NULL,reference TEXT NOT NULL,created_at TEXT NOT NULL,read_at TEXT,
 UNIQUE(event_key,recipient_kind,recipient_id)
);
CREATE TABLE IF NOT EXISTS preview_operation_keys(request_key TEXT PRIMARY KEY,actor TEXT NOT NULL,result TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS preview_reschedule_votes(
 request_id INTEGER NOT NULL REFERENCES preview_requests(id),
 vote_role TEXT NOT NULL CHECK(vote_role IN('Admin','Teacher')),
 voter_id INTEGER NOT NULL REFERENCES team_users(id),
 status TEXT NOT NULL CHECK(status IN('Approved','Rejected')),reason TEXT NOT NULL,created_at TEXT NOT NULL,
 PRIMARY KEY(request_id,vote_role)
);
CREATE TABLE IF NOT EXISTS preview_staff_notifications(
 id INTEGER PRIMARY KEY AUTOINCREMENT,event_key TEXT NOT NULL,recipient_id INTEGER NOT NULL REFERENCES team_users(id),
 kind TEXT NOT NULL,reference TEXT NOT NULL,created_at TEXT NOT NULL,read_at TEXT,
 UNIQUE(event_key,recipient_id)
);
