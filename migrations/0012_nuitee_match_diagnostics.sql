PRAGMA foreign_keys = ON;

ALTER TABLE hotel_nuitee_audit ADD COLUMN mapping_error TEXT;
ALTER TABLE hotel_nuitee_audit ADD COLUMN metadata_error TEXT;
ALTER TABLE hotel_nuitee_audit ADD COLUMN review_error TEXT;
ALTER TABLE hotel_nuitee_audit ADD COLUMN candidate_provider_hotel_id TEXT;
ALTER TABLE hotel_nuitee_audit ADD COLUMN candidate_name TEXT;
ALTER TABLE hotel_nuitee_audit ADD COLUMN candidate_similarity REAL;
ALTER TABLE hotel_nuitee_audit ADD COLUMN candidate_distance_km REAL;
ALTER TABLE hotel_nuitee_audit ADD COLUMN mapping_stage TEXT;

-- Re-run prior bounded failures through the improved matcher. Automatic draining
-- remains disabled until a new diagnostic batch demonstrates acceptable quality.
UPDATE hotel_nuitee_audit
SET mapping_status='pending',
    mapping_error=NULL,
    last_error=NULL,
    updated_at=CURRENT_TIMESTAMP
WHERE mapping_status='failed';

UPDATE hotel_nuitee_audit
SET metadata_status='pending',
    metadata_error=NULL,
    updated_at=CURRENT_TIMESTAMP
WHERE mapping_status IN ('mapped','review') AND metadata_status='failed';

UPDATE hotel_nuitee_audit
SET review_status='pending',
    review_error=NULL,
    updated_at=CURRENT_TIMESTAMP
WHERE mapping_status IN ('mapped','review') AND review_status='failed';
