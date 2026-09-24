-- SecretNests product/analytics expansion
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  hotel_id TEXT REFERENCES hotels(id) ON DELETE SET NULL,
  creator_id TEXT REFERENCES creator_profiles(id) ON DELETE SET NULL,
  list_id TEXT REFERENCES lists(id) ON DELETE SET NULL,
  path TEXT,
  session_id TEXT,
  referrer TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_analytics_event_name_created ON analytics_events(event_name, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_hotel_created ON analytics_events(hotel_id, created_at);

CREATE TABLE IF NOT EXISTS auth_identities (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_subject TEXT NOT NULL,
  email TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  creator_id TEXT REFERENCES creator_profiles(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, provider_subject)
);

CREATE INDEX IF NOT EXISTS idx_auth_email ON auth_identities(email);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  auth_identity_id TEXT NOT NULL REFERENCES auth_identities(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS stay_verification_artifacts (
  id TEXT PRIMARY KEY,
  stay_id TEXT NOT NULL REFERENCES stays(id) ON DELETE CASCADE,
  r2_key TEXT,
  source_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  redaction_status TEXT NOT NULL DEFAULT 'pending',
  reviewer_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_stay_verification_stay ON stay_verification_artifacts(stay_id);
