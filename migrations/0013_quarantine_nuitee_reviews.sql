PRAGMA foreign_keys = ON;

UPDATE hotel_provider_mappings
SET status='review', updated_at=CURRENT_TIMESTAMP
WHERE provider='nuitee_connect' AND confidence<>'high'
  AND hotel_id IN (SELECT hotel_id FROM hotel_nuitee_audit WHERE mapping_status='review');

DELETE FROM hotel_rate_observations
WHERE provider_id='nuitee_sandbox'
  AND hotel_id IN (SELECT hotel_id FROM hotel_nuitee_audit WHERE mapping_status='review');

DELETE FROM hotel_external_evidence
WHERE provider='nuitee_reviews_sandbox'
  AND hotel_id IN (SELECT hotel_id FROM hotel_nuitee_audit WHERE mapping_status='review');

UPDATE hotel_nuitee_audit
SET review_status='pending', rate_windows_tested=0, rate_windows_with_inventory=0,
    rate_coverage_pct=NULL, review_at=NULL, rate_audited_at=NULL, updated_at=CURRENT_TIMESTAMP
WHERE mapping_status='review';
