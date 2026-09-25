-- Market-intelligence workers: live rates + provenance-backed external evidence
PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO affiliate_providers (id,name,provider_type,enabled,config_json)
VALUES ('booking_demand','Booking.com Demand API','rate_api',0,'{}');

CREATE TABLE IF NOT EXISTS hotel_provider_mappings (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_hotel_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  confidence TEXT,
  source_url TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(hotel_id, provider),
  UNIQUE(provider, provider_hotel_id)
);
CREATE INDEX IF NOT EXISTS idx_provider_mappings_provider
  ON hotel_provider_mappings(provider, status);

CREATE TABLE IF NOT EXISTS hotel_external_evidence (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_domain TEXT,
  source_title TEXT,
  evidence_type TEXT NOT NULL DEFAULT 'traveler_experience',
  sentiment TEXT,
  summary TEXT NOT NULL,
  attributes_json TEXT NOT NULL DEFAULT '[]',
  best_for_json TEXT NOT NULL DEFAULT '[]',
  avoid_if_json TEXT NOT NULL DEFAULT '[]',
  tradeoffs_json TEXT NOT NULL DEFAULT '[]',
  price_mentioned REAL,
  trip_context TEXT,
  confidence TEXT,
  source_published_at TEXT,
  observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(hotel_id, provider, source_url)
);
CREATE INDEX IF NOT EXISTS idx_external_evidence_hotel
  ON hotel_external_evidence(hotel_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_external_evidence_provider
  ON hotel_external_evidence(provider, observed_at DESC);

CREATE TABLE IF NOT EXISTS hotel_rate_sync_runs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  hotels_claimed INTEGER NOT NULL DEFAULT 0,
  observations_written INTEGER NOT NULL DEFAULT 0,
  mappings_created INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_rate_sync_runs_started
  ON hotel_rate_sync_runs(provider, started_at DESC);

CREATE TABLE IF NOT EXISTS hotel_evidence_sync_runs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  hotels_claimed INTEGER NOT NULL DEFAULT 0,
  evidence_written INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_evidence_sync_runs_started
  ON hotel_evidence_sync_runs(provider, started_at DESC);
