PRAGMA foreign_keys = ON;

-- Reuse only production, active, high-confidence Nuitee metadata to fill
-- geography gaps without making new paid provider calls.
UPDATE hotels
SET city=(
      SELECT pm.city
      FROM hotel_provider_metadata pm
      JOIN hotel_provider_mappings map
        ON map.hotel_id=pm.hotel_id
       AND map.provider='nuitee_connect'
       AND map.status='active'
       AND map.confidence='high'
      WHERE pm.hotel_id=hotels.id
        AND pm.provider='nuitee_connect'
        AND pm.environment='production'
        AND pm.city IS NOT NULL
        AND trim(pm.city)<>''
      ORDER BY pm.observed_at DESC LIMIT 1
    ),
    updated_at=CURRENT_TIMESTAMP
WHERE is_published=1
  AND (city IS NULL OR trim(city)='')
  AND EXISTS (
    SELECT 1 FROM hotel_provider_metadata pm
    JOIN hotel_provider_mappings map
      ON map.hotel_id=pm.hotel_id
     AND map.provider='nuitee_connect'
     AND map.status='active'
     AND map.confidence='high'
    WHERE pm.hotel_id=hotels.id
      AND pm.provider='nuitee_connect'
      AND pm.environment='production'
      AND pm.city IS NOT NULL
      AND trim(pm.city)<>''
  );

UPDATE hotels
SET formatted_address=(
      SELECT pm.address
      FROM hotel_provider_metadata pm
      JOIN hotel_provider_mappings map
        ON map.hotel_id=pm.hotel_id
       AND map.provider='nuitee_connect'
       AND map.status='active'
       AND map.confidence='high'
      WHERE pm.hotel_id=hotels.id
        AND pm.provider='nuitee_connect'
        AND pm.environment='production'
        AND pm.address IS NOT NULL
        AND trim(pm.address)<>''
      ORDER BY pm.observed_at DESC LIMIT 1
    ),
    updated_at=CURRENT_TIMESTAMP
WHERE is_published=1
  AND (formatted_address IS NULL OR trim(formatted_address)='')
  AND EXISTS (
    SELECT 1 FROM hotel_provider_metadata pm
    JOIN hotel_provider_mappings map
      ON map.hotel_id=pm.hotel_id
     AND map.provider='nuitee_connect'
     AND map.status='active'
     AND map.confidence='high'
    WHERE pm.hotel_id=hotels.id
      AND pm.provider='nuitee_connect'
      AND pm.environment='production'
      AND pm.address IS NOT NULL
      AND trim(pm.address)<>''
  );

-- Promote a single trusted provider hero only when no publishable image exists.
INSERT INTO media_assets (
  id,hotel_id,creator_id,source_type,source_url,source_provider,
  attribution_text,rights_status,permission_reference,original_url,created_at
)
SELECT
  'nuitee-hero-' || h.id,h.id,NULL,'provider_api',pm.main_photo_url,'nuitee_connect',
  'Hotel image via Nuitee Connect','licensed_api','nuitee_connect_api',
  pm.main_photo_url,CURRENT_TIMESTAMP
FROM hotels h
JOIN hotel_provider_metadata pm
  ON pm.hotel_id=h.id AND pm.provider='nuitee_connect' AND pm.environment='production'
JOIN hotel_provider_mappings map
  ON map.hotel_id=h.id AND map.provider='nuitee_connect' AND map.status='active' AND map.confidence='high'
WHERE h.is_published=1
  AND pm.main_photo_url IS NOT NULL
  AND trim(pm.main_photo_url)<>''
  AND NOT EXISTS (
    SELECT 1 FROM media_assets ma
    WHERE ma.hotel_id=h.id
      AND ma.rights_status IN ('owned_user_upload','hotel_authorized','licensed_api','licensed_public')
  )
ON CONFLICT(id) DO NOTHING;

-- Put every remaining missing-city record into the existing official-site
-- geography resolver. No LLM/API spend is required for this queue.
INSERT INTO hotel_enrichment_queue (
  id,hotel_id,task_type,status,priority,source_hint,created_at,updated_at
)
SELECT
  'city-review-' || h.id,h.id,'city_review','queued',
  COALESCE(p.priority_rank,5000),'official_hotel_site',
  CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM hotels h
LEFT JOIN hotel_enrichment_profiles p ON p.hotel_id=h.id
WHERE h.is_published=1
  AND (h.city IS NULL OR trim(h.city)='')
ON CONFLICT(hotel_id,task_type) DO UPDATE SET
  status=CASE WHEN hotel_enrichment_queue.status='working' THEN 'working' ELSE 'queued' END,
  priority=excluded.priority,
  source_hint='official_hotel_site',
  updated_at=CURRENT_TIMESTAMP;
