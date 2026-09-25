-- Travelpayouts monetization rails
PRAGMA foreign_keys = ON;

CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_conversions_provider_partner_booking
  ON booking_conversions(provider, partner_booking_id)
  WHERE partner_booking_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS affiliate_sync_runs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  sync_type TEXT NOT NULL,
  campaign_id TEXT,
  status TEXT NOT NULL,
  rows_seen INTEGER NOT NULL DEFAULT 0,
  rows_written INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_affiliate_sync_provider_started
  ON affiliate_sync_runs(provider, started_at DESC);
