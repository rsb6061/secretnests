PRAGMA foreign_keys = ON;

ALTER TABLE hotels ADD COLUMN amenities_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE hotels ADD COLUMN external_review_summary TEXT;
ALTER TABLE hotels ADD COLUMN external_review_sentiment TEXT;
ALTER TABLE hotels ADD COLUMN external_review_confidence TEXT;
ALTER TABLE hotels ADD COLUMN external_review_source TEXT;
ALTER TABLE hotels ADD COLUMN external_review_updated_at TEXT;

ALTER TABLE hotel_nuitee_audit ADD COLUMN canonical_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE hotel_nuitee_audit ADD COLUMN canonical_fields INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hotel_nuitee_audit ADD COLUMN canonical_at TEXT;

CREATE INDEX IF NOT EXISTS idx_nuitee_audit_canonical
  ON hotel_nuitee_audit(mapping_confidence, canonical_status, canonical_at);
