ALTER TABLE posts ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE posts ADD COLUMN updated_at TEXT;
ALTER TABLE guestbook ADD COLUMN user_id TEXT;
ALTER TABLE guestbook ADD COLUMN owner_hash TEXT;
ALTER TABLE members ADD COLUMN deleted_at TEXT;
CREATE TABLE community_comments(id INTEGER PRIMARY KEY AUTOINCREMENT,post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES members(user_id),author TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT,version INTEGER NOT NULL DEFAULT 1);
CREATE INDEX community_comments_post ON community_comments(post_id,id);
CREATE TABLE content_filters(id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL CHECK(kind IN ('keyword','regex')),expression TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL,created_by TEXT NOT NULL);
-- Curated common expressions, checked 2026-10-27; not an imported third-party corpus.
INSERT INTO content_filters(kind,expression,created_at,created_by) VALUES
 ('keyword','씨발','2026-10-27','system'),('keyword','씨팔','2026-10-27','system'),('keyword','개새끼','2026-10-27','system'),('keyword','개자식','2026-10-27','system'),('keyword','병신','2026-10-27','system'),('keyword','지랄','2026-10-27','system'),('keyword','씹새끼','2026-10-27','system'),('keyword','미친놈','2026-10-27','system'),('keyword','ㅅㅂ','2026-10-27','system'),('keyword','ㅂㅅ','2026-10-27','system'),
 ('regex','[씨시][\s._-]{0,3}[발빨팔]','2026-10-27','system'),('regex','개[\s._-]{0,3}새[\s._-]{0,3}끼','2026-10-27','system');
CREATE TABLE moderation_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id TEXT NOT NULL,action TEXT NOT NULL,expression TEXT NOT NULL,created_at TEXT NOT NULL);
ALTER TABLE auth_credentials ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE auth_password_resets(token_hash TEXT PRIMARY KEY NOT NULL,user_id TEXT NOT NULL UNIQUE REFERENCES members(user_id),expires_at INTEGER NOT NULL,consumed_by TEXT,created_at TEXT NOT NULL);
CREATE TABLE auth_retired_identities(user_id TEXT PRIMARY KEY NOT NULL);
CREATE TRIGGER protect_last_master_withdrawal BEFORE UPDATE OF deleted_at ON members
WHEN OLD.role='master' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND (SELECT count(*) FROM members WHERE role='master' AND deleted_at IS NULL)<=1
BEGIN SELECT RAISE(ABORT,'last master cannot withdraw'); END;
