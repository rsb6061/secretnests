PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS hotel_provider_metadata (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_hotel_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  star_rating REAL,
  guest_rating REAL,
  address TEXT,
  city TEXT,
  country TEXT,
  lat REAL,
  lng REAL,
  main_photo_url TEXT,
  description TEXT,
  amenities_json TEXT NOT NULL DEFAULT '[]',
  tags_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(hotel_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_provider_metadata_provider
  ON hotel_provider_metadata(provider, observed_at DESC);

CREATE TABLE IF NOT EXISTS hotel_nuitee_audit (
  hotel_id TEXT PRIMARY KEY REFERENCES hotels(id) ON DELETE CASCADE,
  provider_hotel_id TEXT,
  environment TEXT,
  mapping_status TEXT NOT NULL DEFAULT 'pending',
  mapping_confidence TEXT,
  name_similarity REAL,
  distance_km REAL,
  metadata_status TEXT NOT NULL DEFAULT 'pending',
  metadata_fields INTEGER NOT NULL DEFAULT 0,
  review_status TEXT NOT NULL DEFAULT 'pending',
  rate_windows_tested INTEGER NOT NULL DEFAULT 0,
  rate_windows_with_inventory INTEGER NOT NULL DEFAULT 0,
  rate_coverage_pct REAL,
  last_error TEXT,
  mapped_at TEXT,
  metadata_at TEXT,
  review_at TEXT,
  rate_audited_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_nuitee_audit_mapping
  ON hotel_nuitee_audit(mapping_status, mapping_confidence);
CREATE INDEX IF NOT EXISTS idx_nuitee_audit_rate
  ON hotel_nuitee_audit(rate_audited_at);

CREATE TABLE IF NOT EXISTS hotel_nuitee_batch_runs (
  id TEXT PRIMARY KEY,
  run_type TEXT NOT NULL,
  environment TEXT NOT NULL,
  status TEXT NOT NULL,
  hotels_claimed INTEGER NOT NULL DEFAULT 0,
  hotels_mapped INTEGER NOT NULL DEFAULT 0,
  metadata_written INTEGER NOT NULL DEFAULT 0,
  reviews_written INTEGER NOT NULL DEFAULT 0,
  rate_windows_tested INTEGER NOT NULL DEFAULT 0,
  rate_observations_written INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_nuitee_batch_runs_started
  ON hotel_nuitee_batch_runs(started_at DESC);
