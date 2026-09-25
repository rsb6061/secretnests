PRAGMA foreign_keys = ON;

-- Keep travel context distinct from who traveled and preserve explicit offers
-- as first-party structured facts rather than burying them in free text.
ALTER TABLE trip_submissions ADD COLUMN trip_context TEXT;
ALTER TABLE trip_submissions ADD COLUMN promotion TEXT;

ALTER TABLE stays ADD COLUMN trip_context TEXT;
ALTER TABLE stays ADD COLUMN promotion TEXT;
