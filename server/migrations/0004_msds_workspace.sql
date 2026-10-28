CREATE TABLE msds_assets (
 id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES members(user_id),
 payload TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
 file_name TEXT NOT NULL DEFAULT '', file_size INTEGER NOT NULL DEFAULT 0,
 updated_at TEXT NOT NULL, last_op TEXT NOT NULL
);
CREATE INDEX msds_assets_owner ON msds_assets(user_id,updated_at);
CREATE TABLE msds_original_chunks (
 asset_id TEXT NOT NULL REFERENCES msds_assets(id) ON DELETE CASCADE,
 part INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(asset_id,part)
);
CREATE TABLE msds_workspace_settings (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES members(user_id),
 payload TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1
);
