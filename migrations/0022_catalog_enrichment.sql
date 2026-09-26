PRAGMA foreign_keys = ON;

-- Commodity facts are valuable on every published hotel, not just the top 250.
-- Queue only deterministic official-site work here; expensive evidence research
-- remains restricted to the priority cohort.
INSERT INTO hotel_enrichment_queue
  (id,hotel_id,task_type,status,priority,source_hint,created_at,updated_at)
SELECT
  'catalog-facts-' || h.id,h.id,'facts_core','queued',
  COALESCE(p.priority_rank,5000),'official_hotel_site',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM hotels h
LEFT JOIN hotel_enrichment_profiles p ON p.hotel_id=h.id
WHERE h.is_published=1
  AND h.website IS NOT NULL AND trim(h.website)<>''
  AND (
    h.city IS NULL OR trim(h.city)='' OR
    (h.address IS NULL OR trim(h.address)='') AND (h.formatted_address IS NULL OR trim(h.formatted_address)='') OR
    h.phone IS NULL OR trim(h.phone)='' OR
    h.description IS NULL OR length(trim(h.description))<80 OR
    h.lat IS NULL OR h.lng IS NULL OR
    h.hotel_category IS NULL OR trim(h.hotel_category)=''
  )
ON CONFLICT(hotel_id,task_type) DO UPDATE SET
  status=CASE WHEN hotel_enrichment_queue.status='working' THEN 'working' ELSE 'queued' END,
  priority=excluded.priority,source_hint=excluded.source_hint,updated_at=CURRENT_TIMESTAMP;

INSERT INTO hotel_enrichment_queue
  (id,hotel_id,task_type,status,priority,source_hint,created_at,updated_at)
SELECT
  'catalog-city-' || h.id,h.id,'city_review','queued',
  COALESCE(p.priority_rank,5000)+5,'official_hotel_site',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM hotels h
LEFT JOIN hotel_enrichment_profiles p ON p.hotel_id=h.id
WHERE h.is_published=1
  AND h.website IS NOT NULL AND trim(h.website)<>''
  AND (h.city IS NULL OR trim(h.city)='')
ON CONFLICT(hotel_id,task_type) DO UPDATE SET
  status=CASE WHEN hotel_enrichment_queue.status='working' THEN 'working' ELSE 'queued' END,
  priority=excluded.priority,source_hint=excluded.source_hint,updated_at=CURRENT_TIMESTAMP;

INSERT INTO hotel_enrichment_queue
  (id,hotel_id,task_type,status,priority,source_hint,created_at,updated_at)
SELECT
  'catalog-booking-' || h.id,h.id,'booking_link','queued',
  COALESCE(p.priority_rank,5000)+10,'official_hotel_site',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM hotels h
LEFT JOIN hotel_enrichment_profiles p ON p.hotel_id=h.id
WHERE h.is_published=1
  AND h.website IS NOT NULL AND trim(h.website)<>''
  AND NOT EXISTS (
    SELECT 1 FROM hotel_booking_links bl WHERE bl.hotel_id=h.id AND bl.enabled=1
  )
ON CONFLICT(hotel_id,task_type) DO UPDATE SET
  status=CASE WHEN hotel_enrichment_queue.status='working' THEN 'working' ELSE 'queued' END,
  priority=excluded.priority,source_hint=excluded.source_hint,updated_at=CURRENT_TIMESTAMP;

-- Any trusted production metadata created before this expansion can now be
-- promoted outside the priority-250 cohort on the next catalog drain.
UPDATE hotel_nuitee_audit
SET canonical_status='pending',canonical_fields=0,canonical_at=NULL,updated_at=CURRENT_TIMESTAMP
WHERE environment='production'
  AND mapping_status='mapped'
  AND mapping_confidence='high'
  AND metadata_status='complete'
  AND hotel_id IN (
    SELECT p.hotel_id FROM hotel_enrichment_profiles p WHERE p.cohort='long_tail'
  );
