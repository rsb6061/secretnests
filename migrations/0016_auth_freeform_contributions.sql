PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS auth_login_states (
  state TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  return_to TEXT NOT NULL DEFAULT '/',
  popup INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_auth_login_states_expires ON auth_login_states(expires_at);

CREATE TABLE IF NOT EXISTS contribution_drafts (
  id TEXT PRIMARY KEY,
  creator_id TEXT REFERENCES creator_profiles(id) ON DELETE SET NULL,
  hotel_id TEXT REFERENCES hotels(id) ON DELETE SET NULL,
  raw_text TEXT NOT NULL,
  parsed_json TEXT NOT NULL DEFAULT '{}',
  parser_version TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  contribution_source TEXT,
  contribution_campaign TEXT,
  contribution_referrer TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contribution_drafts_status ON contribution_drafts(status,created_at);
CREATE INDEX IF NOT EXISTS idx_contribution_drafts_creator ON contribution_drafts(creator_id,created_at);

CREATE TABLE IF NOT EXISTS contribution_draft_assets (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES contribution_drafts(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  file_size INTEGER,
  asset_role TEXT NOT NULL DEFAULT 'unclassified',
  rights_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_contribution_draft_assets_draft ON contribution_draft_assets(draft_id,asset_role);

ALTER TABLE trip_submissions ADD COLUMN creator_id TEXT REFERENCES creator_profiles(id) ON DELETE SET NULL;
ALTER TABLE trip_submissions ADD COLUMN raw_text TEXT;
ALTER TABLE trip_submissions ADD COLUMN parsed_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE trip_submissions ADD COLUMN parser_version TEXT;
ALTER TABLE trip_submissions ADD COLUMN user_confirmed_at TEXT;
ALTER TABLE trip_submissions ADD COLUMN draft_id TEXT;

CREATE INDEX IF NOT EXISTS idx_trip_submissions_creator ON trip_submissions(creator_id,created_at);
CREATE INDEX IF NOT EXISTS idx_trip_submissions_draft ON trip_submissions(draft_id);
