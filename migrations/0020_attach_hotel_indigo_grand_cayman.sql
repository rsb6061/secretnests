PRAGMA foreign_keys = ON;

-- Ensure the first live authenticated review has a canonical hotel to attach to.
-- Prefer an existing published Hotel Indigo Grand Cayman record if enrichment
-- has already created one; otherwise seed the official IHG property.
INSERT INTO hotels (
  id,name,slug,description,country,city,address,formatted_address,website,
  hotel_category,is_published,published_at,created_at,updated_at
)
SELECT
  'official-ihg-gcmsm',
  'Hotel Indigo Grand Cayman',
  'hotel-indigo-grand-cayman',
  'A Hotel Indigo resort steps from Seven Mile Beach with ocean-view rooms, a pool deck, Beach Club access and on-site dining.',
  'Cayman Islands',
  'Grand Cayman',
  '32 Seafire Way',
  '32 Seafire Way, Seven Mile Beach, Grand Cayman, KY1-1301, Cayman Islands',
  'https://www.ihg.com/hotelindigo/hotels/us/en/grand-cayman/gcmsm/hoteldetail',
  'Hotel Indigo',
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM hotels
  WHERE lower(name) LIKE '%hotel indigo%'
    AND lower(name) LIKE '%grand cayman%'
);

UPDATE trip_submissions
SET hotel_id=(
  SELECT id FROM hotels
  WHERE is_published=1
    AND lower(name) LIKE '%hotel indigo%'
    AND lower(name) LIKE '%grand cayman%'
  ORDER BY CASE WHEN lower(name)='hotel indigo grand cayman' THEN 0 ELSE 1 END
  LIMIT 1
)
WHERE hotel_id IS NULL
  AND lower(hotel_name) LIKE '%hotel indigo%'
  AND lower(hotel_name) LIKE '%grand cayman%';

INSERT INTO stays (
  id,creator_id,hotel_id,stay_month,nights,party_type,trip_context,promotion,
  room_type,booking_channel,paid_nightly_rate,currency,verified,
  verification_method,created_at,updated_at,perks_json,inclusions_json,rate_basis
)
SELECT
  'submission-' || ts.id,ts.creator_id,ts.hotel_id,ts.stay_month,ts.nights,
  ts.party_type,ts.trip_context,ts.promotion,ts.room_type,ts.booking_channel,
  ts.paid_nightly_rate,'USD',0,'first_party_submission',ts.created_at,
  CURRENT_TIMESTAMP,COALESCE(ts.perks_json,'[]'),COALESCE(ts.inclusions_json,'[]'),
  ts.rate_basis
FROM trip_submissions ts
WHERE ts.status IN ('pending','matched')
  AND ts.creator_id IS NOT NULL
  AND ts.hotel_id IS NOT NULL
ON CONFLICT(id) DO NOTHING;

INSERT INTO value_opinions (
  id,stay_id,creator_id,hotel_id,paid_nightly_rate,would_pay_again,currency,created_at
)
SELECT
  'value-' || ts.id,'submission-' || ts.id,ts.creator_id,ts.hotel_id,
  ts.paid_nightly_rate,ts.would_pay_again,'USD',ts.created_at
FROM trip_submissions ts
WHERE ts.status IN ('pending','matched')
  AND ts.creator_id IS NOT NULL
  AND ts.hotel_id IS NOT NULL
  AND ts.would_pay_again IS NOT NULL
ON CONFLICT(id) DO NOTHING;

INSERT INTO trip_reports (
  id,stay_id,creator_id,hotel_id,title,review_text,verdict,would_return,
  standout_json,disappointments_json,status,published_at,created_at,updated_at
)
SELECT
  'report-' || ts.id,'submission-' || ts.id,ts.creator_id,ts.hotel_id,
  ts.hotel_name,COALESCE(NULLIF(ts.notes,''),ts.raw_text),
  'first_party_submission',ts.would_return,'[]','[]','published',
  CURRENT_TIMESTAMP,ts.created_at,CURRENT_TIMESTAMP
FROM trip_submissions ts
WHERE ts.status IN ('pending','matched')
  AND ts.creator_id IS NOT NULL
  AND ts.hotel_id IS NOT NULL
ON CONFLICT(stay_id) DO UPDATE SET
  review_text=excluded.review_text,
  would_return=excluded.would_return,
  status='published',
  updated_at=excluded.updated_at;

UPDATE trip_submissions
SET status='approved',reviewed_at=CURRENT_TIMESTAMP
WHERE status IN ('pending','matched')
  AND creator_id IS NOT NULL
  AND hotel_id IS NOT NULL;
