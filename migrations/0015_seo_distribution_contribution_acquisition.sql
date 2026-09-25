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


-- Backfill canonical brand metadata for the already-audited trusted Nuitee cohort.
UPDATE hotels
SET brand_name=(
  SELECT trim(json_extract(pm.metadata_json,'$.chain'))
  FROM hotel_provider_metadata pm
  JOIN hotel_nuitee_audit a ON a.hotel_id=pm.hotel_id
  WHERE pm.hotel_id=hotels.id
    AND pm.provider='nuitee_connect'
    AND a.mapping_status='mapped'
    AND a.mapping_confidence='high'
    AND json_extract(pm.metadata_json,'$.chain') IS NOT NULL
    AND trim(json_extract(pm.metadata_json,'$.chain'))<>''
  LIMIT 1
)
WHERE (brand_name IS NULL OR trim(brand_name)='')
  AND EXISTS (
    SELECT 1
    FROM hotel_provider_metadata pm
    JOIN hotel_nuitee_audit a ON a.hotel_id=pm.hotel_id
    WHERE pm.hotel_id=hotels.id
      AND pm.provider='nuitee_connect'
      AND a.mapping_status='mapped'
      AND a.mapping_confidence='high'
      AND json_extract(pm.metadata_json,'$.chain') IS NOT NULL
      AND trim(json_extract(pm.metadata_json,'$.chain'))<>''
  );

INSERT OR IGNORE INTO hotel_field_provenance
  (id,hotel_id,field_name,source_type,source_url,source_label,confidence,observed_at,verified_at,metadata_json,created_at,updated_at)
SELECT
  lower(hex(randomblob(16))),
  h.id,
  'brand_name',
  CASE WHEN a.environment='sandbox' THEN 'nuitee_sandbox' ELSE 'nuitee_connect' END,
  'https://api.liteapi.travel/v3.0/data/hotel?hotelId=' || a.provider_hotel_id,
  'Nuitee Connect',
  'high',
  CURRENT_TIMESTAMP,
  NULL,
  json_object('value',h.brand_name,'provider_hotel_id',a.provider_hotel_id,'environment',a.environment,'canonical_promotion',1),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM hotels h
JOIN hotel_nuitee_audit a ON a.hotel_id=h.id
WHERE h.brand_name IS NOT NULL
  AND trim(h.brand_name)<>''
  AND a.mapping_status='mapped'
  AND a.mapping_confidence='high'
  AND NOT EXISTS (
    SELECT 1 FROM hotel_field_provenance p
    WHERE p.hotel_id=h.id AND p.field_name='brand_name'
      AND p.source_type=CASE WHEN a.environment='sandbox' THEN 'nuitee_sandbox' ELSE 'nuitee_connect' END
  );
