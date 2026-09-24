-- SecretNests launch-readiness additions
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS trip_submissions (
  id TEXT PRIMARY KEY,
  contact_email TEXT,
  hotel_name TEXT NOT NULL,
  city TEXT,
  stay_month TEXT,
  paid_nightly_rate REAL,
  would_pay_again REAL,
  room_type TEXT,
  booking_channel TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_trip_submissions_status_created
  ON trip_submissions(status, created_at);

CREATE INDEX IF NOT EXISTS idx_trip_submissions_hotel
  ON trip_submissions(hotel_name);
