-- Hotel enrichment, completeness and priority system
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS hotel_enrichment_profiles (
  hotel_id TEXT PRIMARY KEY REFERENCES hotels(id) ON DELETE CASCADE,
  priority_score REAL NOT NULL DEFAULT 0,
  priority_rank INTEGER,
  cohort TEXT NOT NULL DEFAULT 'long_tail',
  completeness_score REAL NOT NULL DEFAULT 0,
  facts_score REAL NOT NULL DEFAULT 0,
  booking_score REAL NOT NULL DEFAULT 0,
  rate_score REAL NOT NULL DEFAULT 0,
  media_score REAL NOT NULL DEFAULT 0,
  evidence_score REAL NOT NULL DEFAULT 0,
  first_party_score REAL NOT NULL DEFAULT 0,
  missing_json TEXT NOT NULL DEFAULT '[]',
  computed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_enrichment_priority
  ON hotel_enrichment_profiles(cohort, priority_rank, priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_enrichment_completeness
  ON hotel_enrichment_profiles(completeness_score, priority_rank);

CREATE TABLE IF NOT EXISTS hotel_enrichment_queue (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  priority INTEGER NOT NULL DEFAULT 100,
  source_hint TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  locked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(hotel_id, task_type)
);
CREATE INDEX IF NOT EXISTS idx_enrichment_queue_work
  ON hotel_enrichment_queue(status, priority, updated_at);

CREATE TABLE IF NOT EXISTS hotel_field_provenance (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_url TEXT,
  source_label TEXT,
  confidence TEXT,
  observed_at TEXT,
  verified_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(hotel_id, field_name, source_type, source_url)
);
CREATE INDEX IF NOT EXISTS idx_hotel_provenance_hotel
  ON hotel_field_provenance(hotel_id, field_name);

CREATE TABLE IF NOT EXISTS hotel_enrichment_runs (
  id TEXT PRIMARY KEY,
  run_type TEXT NOT NULL,
  status TEXT NOT NULL,
  hotels_scored INTEGER NOT NULL DEFAULT 0,
  queue_items_created INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT
);
