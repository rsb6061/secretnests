PRAGMA foreign_keys = ON;

ALTER TABLE hotels ADD COLUMN brand_name TEXT;

ALTER TABLE trip_submissions ADD COLUMN contribution_source TEXT;
ALTER TABLE trip_submissions ADD COLUMN contribution_campaign TEXT;
ALTER TABLE trip_submissions ADD COLUMN contribution_referrer TEXT;

ALTER TABLE analytics_events ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS contribution_campaigns (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  channel TEXT NOT NULL,
  target_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_contribution_campaigns_status
  ON contribution_campaigns(status, created_at);

INSERT OR IGNORE INTO contribution_campaigns (id,code,name,channel,target_count,status)
VALUES
  ('campaign-founder-network','founder-network','Founder network','direct',75,'active'),
  ('campaign-luxury-creators','luxury-travel-creators','Luxury travel creator outreach','creator_outreach',125,'active'),
  ('campaign-guest-referrals','guest-referrals','Guest referrals','referral',100,'active');
