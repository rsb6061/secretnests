PRAGMA foreign_keys = ON;

-- Free the intended public handle for the first authenticated traveler while
-- keeping the old illustrative profile clearly separated from real data.
UPDATE creator_profiles
SET handle='demo-rebecca',
    display_name=CASE WHEN display_name='Rebecca' THEN 'Rebecca (demo)' ELSE display_name END,
    updated_at=CURRENT_TIMESTAMP
WHERE id='demo-rebecca' AND lower(handle)='rebecca';

UPDATE creator_profiles
SET handle='rebecca',
    is_demo=0,
    updated_at=CURRENT_TIMESTAMP
WHERE lower(handle)='myersrebeccal' AND COALESCE(is_demo,0)=0;

-- Backfill already-submitted authenticated contributions that have a canonical
-- hotel match. These should have been live immediately rather than waiting for
-- a manual moderation pass.
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
ON CONFLICT(stay_id) DO NOTHING;

INSERT INTO media_assets (
  id,hotel_id,creator_id,source_type,source_provider,attribution_text,
  rights_status,permission_reference,r2_key,mime_type,created_at
)
SELECT
  'contribution-' || a.id,ts.hotel_id,ts.creator_id,'user_upload',
  'secretnests_first_party',cp.display_name,'owned_user_upload',
  'contribution:' || ts.id,a.r2_key,a.mime_type,a.created_at
FROM contribution_draft_assets a
JOIN contribution_drafts d ON d.id=a.draft_id
JOIN trip_submissions ts ON ts.draft_id=d.id
JOIN creator_profiles cp ON cp.id=ts.creator_id
WHERE ts.status IN ('pending','matched')
  AND ts.creator_id IS NOT NULL
  AND ts.hotel_id IS NOT NULL
  AND a.asset_role='public_photo'
  AND a.rights_status='owned_user_upload'
ON CONFLICT(id) DO NOTHING;

UPDATE trip_submissions
SET status='approved',
    reviewed_at=CURRENT_TIMESTAMP
WHERE status IN ('pending','matched')
  AND creator_id IS NOT NULL
  AND hotel_id IS NOT NULL;
