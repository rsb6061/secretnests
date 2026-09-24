-- SecretNests product expansion: valuation, aliases, affiliates, moderation, media rights, abuse controls
PRAGMA foreign_keys = ON;

ALTER TABLE creator_profiles ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0;

ALTER TABLE hotel_value_snapshots ADD COLUMN confidence TEXT;
ALTER TABLE hotel_value_snapshots ADD COLUMN p25_would_pay REAL;
ALTER TABLE hotel_value_snapshots ADD COLUMN p75_would_pay REAL;
ALTER TABLE hotel_value_snapshots ADD COLUMN methodology_version TEXT;

CREATE TABLE IF NOT EXISTS hotel_slug_aliases (
  alias_slug TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_hotel_slug_alias_hotel ON hotel_slug_aliases(hotel_id);

CREATE TABLE IF NOT EXISTS affiliate_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hotel_booking_links (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES affiliate_providers(id) ON DELETE CASCADE,
  destination_url TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  enabled INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(hotel_id, provider_id, destination_url)
);
CREATE INDEX IF NOT EXISTS idx_booking_links_hotel ON hotel_booking_links(hotel_id, enabled, priority);

CREATE TABLE IF NOT EXISTS submission_moderation (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES trip_submissions(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  hotel_id TEXT REFERENCES hotels(id) ON DELETE SET NULL,
  moderator_email TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_submission_moderation_submission ON submission_moderation(submission_id, created_at);

CREATE TABLE IF NOT EXISTS media_rights_reviews (
  id TEXT PRIMARY KEY,
  media_asset_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  reviewer_email TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_media_rights_review_asset ON media_rights_reviews(media_asset_id, created_at);

CREATE TABLE IF NOT EXISTS media_ingest_requests (
  id TEXT PRIMARY KEY,
  hotel_id TEXT REFERENCES hotels(id) ON DELETE CASCADE,
  creator_id TEXT REFERENCES creator_profiles(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL,
  source_url TEXT,
  source_provider TEXT,
  proposed_rights_status TEXT NOT NULL DEFAULT 'needs_review',
  permission_reference TEXT,
  attribution_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_media_ingest_status ON media_ingest_requests(status, created_at);

CREATE TABLE IF NOT EXISTS request_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS zero_result_searches (
  id TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  session_id TEXT,
  path TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_zero_search_created ON zero_result_searches(created_at);
