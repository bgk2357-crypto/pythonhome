CREATE TABLE auth_credentials (
 email TEXT PRIMARY KEY NOT NULL COLLATE NOCASE,
 user_id TEXT NOT NULL UNIQUE REFERENCES members(user_id),
 password_hash TEXT,
 google_user_id TEXT UNIQUE,
 updated_at TEXT NOT NULL
);
-- Reserve unambiguous existing emails without changing member IDs, profiles or grades.
INSERT OR IGNORE INTO auth_credentials(email,user_id,google_user_id,updated_at)
 SELECT lower(trim(m.email)),m.user_id,CASE WHEN m.user_id LIKE 'google:%' THEN m.user_id ELSE NULL END,COALESCE(m.updated_at,m.created_at)
 FROM members m WHERE trim(m.email)<>'' AND instr(m.email,'@')>1
 AND NOT EXISTS(SELECT 1 FROM members other WHERE lower(trim(other.email))=lower(trim(m.email)) AND other.user_id<>m.user_id);
CREATE TABLE auth_rate_limits (key TEXT PRIMARY KEY NOT NULL, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
