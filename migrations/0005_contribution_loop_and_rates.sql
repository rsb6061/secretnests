-- SecretNests contribution loop and current-rate ingestion
PRAGMA foreign_keys = ON;

ALTER TABLE trip_submissions ADD COLUMN hotel_id TEXT REFERENCES hotels(id) ON DELETE SET NULL;
ALTER TABLE trip_submissions ADD COLUMN nights INTEGER;
ALTER TABLE trip_submissions ADD COLUMN party_type TEXT;
ALTER TABLE trip_submissions ADD COLUMN would_return INTEGER;
ALTER TABLE trip_submissions ADD COLUMN perks_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE trip_submissions ADD COLUMN inclusions_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE trip_submissions ADD COLUMN rate_basis TEXT;
ALTER TABLE trip_submissions ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'unverified';

ALTER TABLE stays ADD COLUMN perks_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE stays ADD COLUMN inclusions_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE stays ADD COLUMN rate_basis TEXT;

CREATE TABLE IF NOT EXISTS submission_verification_artifacts (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES trip_submissions(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  mime_type TEXT,
  file_size INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  redaction_status TEXT NOT NULL DEFAULT 'pending',
  reviewer_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_submission_verification_submission
  ON submission_verification_artifacts(submission_id, status);

CREATE TABLE IF NOT EXISTS hotel_rate_observations (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  provider_id TEXT REFERENCES affiliate_providers(id) ON DELETE SET NULL,
  nightly_rate REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  checkin_date TEXT,
  checkout_date TEXT,
  room_type TEXT,
  rate_name TEXT,
  taxes_fees_included INTEGER,
  booking_url TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rate_observations_hotel_observed
  ON hotel_rate_observations(hotel_id, observed_at DESC);
