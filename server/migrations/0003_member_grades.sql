ALTER TABLE members ADD COLUMN email TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN role TEXT NOT NULL DEFAULT 'preliminary' CHECK(role IN ('preliminary','general','paid','master'));
ALTER TABLE members ADD COLUMN business_name TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN business_size TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN contact_name TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN job_title TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN phone TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN profile_completed_at TEXT;
ALTER TABLE members ADD COLUMN updated_at TEXT;
ALTER TABLE members ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
CREATE INDEX members_email ON members(email);
CREATE TABLE member_paid_requests (
 id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES members(user_id),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
 note TEXT NOT NULL, created_at TEXT NOT NULL, reviewed_at TEXT, reviewed_by TEXT,
 review_note TEXT NOT NULL DEFAULT '', amount INTEGER NOT NULL DEFAULT 0, payment_reference TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX member_one_pending_request ON member_paid_requests(user_id) WHERE status='pending';
CREATE TABLE member_audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT, operation_id TEXT NOT NULL UNIQUE, actor_id TEXT NOT NULL,target_id TEXT NOT NULL,
 action TEXT NOT NULL,old_role TEXT NOT NULL,new_role TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL
);
ALTER TABLE posts ADD COLUMN answer TEXT NOT NULL DEFAULT '';
ALTER TABLE posts ADD COLUMN answered_at TEXT;
ALTER TABLE posts ADD COLUMN answered_by TEXT;
