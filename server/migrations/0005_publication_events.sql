CREATE TABLE msds_publication_events (
 id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES members(user_id),
 asset_id TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX msds_publication_events_owner ON msds_publication_events(user_id,created_at);
