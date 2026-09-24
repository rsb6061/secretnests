-- SecretNests Cloudflare D1 schema
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS hotels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  google_place_id TEXT,
  description TEXT,
  country TEXT,
  city TEXT,
  region TEXT,
  lat REAL,
  lng REAL,
  address TEXT,
  formatted_address TEXT,
  website TEXT,
  phone TEXT,
  google_rating REAL,
  google_review_count INTEGER,
  google_price_level INTEGER,
  hotel_category TEXT,
  reddit_mention_count INTEGER NOT NULL DEFAULT 0,
  is_published INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  booking_url TEXT,
  highlights_json TEXT,
  best_for_json TEXT,
  not_ideal_for_json TEXT,
  price_estimate_min INTEGER,
  price_estimate_max INTEGER,
  created_at TEXT,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_hotels_slug ON hotels(slug);
CREATE INDEX IF NOT EXISTS idx_hotels_city ON hotels(city);
CREATE INDEX IF NOT EXISTS idx_hotels_country ON hotels(country);
CREATE INDEX IF NOT EXISTS idx_hotels_published ON hotels(is_published);

CREATE TABLE IF NOT EXISTS creator_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE,
  handle TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  taste_profile_json TEXT NOT NULL DEFAULT '[]',
  is_public INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stays (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,
  hotel_id TEXT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  stay_month TEXT,
  nights INTEGER,
  party_type TEXT,
  room_type TEXT,
  booking_channel TEXT,
  paid_nightly_rate REAL,
  total_paid REAL,
  currency TEXT NOT NULL DEFAULT 'USD',
  verified INTEGER NOT NULL DEFAULT 0,
  verification_method TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stays_creator ON stays(creator_id);
CREATE INDEX IF NOT EXISTS idx_stays_hotel ON stays(hotel_id);

CREATE TABLE IF NOT EXISTS trip_reports (
  id TEXT PRIMARY KEY,
  stay_id TEXT NOT NULL UNIQUE REFERENCES stays(id) ON DELETE CASCADE,
  creator_id TEXT NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,
  hotel_id TEXT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  title TEXT,
  review_text TEXT,
  verdict TEXT,
  would_return INTEGER,
  standout_json TEXT NOT NULL DEFAULT '[]',
  disappointments_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS value_opinions (
  id TEXT PRIMARY KEY,
  stay_id TEXT NOT NULL REFERENCES stays(id) ON DELETE CASCADE,
  creator_id TEXT NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,
  hotel_id TEXT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  paid_nightly_rate REAL,
  would_pay_again REAL,
  worth_it_below REAL,
  hard_to_justify_above REAL,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_value_hotel ON value_opinions(hotel_id);

CREATE TABLE IF NOT EXISTS hotel_value_snapshots (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  traveler_low REAL,
  traveler_high REAL,
  median_would_pay REAL,
  sample_size INTEGER NOT NULL DEFAULT 0,
  current_price REAL,
  value_classification TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  calculated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lists (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  is_public INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(creator_id, slug)
);

CREATE TABLE IF NOT EXISTS list_items (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  hotel_id TEXT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  note TEXT,
  rank INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(list_id, hotel_id)
);

CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id TEXT PRIMARY KEY,
  hotel_id TEXT REFERENCES hotels(id) ON DELETE SET NULL,
  creator_id TEXT REFERENCES creator_profiles(id) ON DELETE SET NULL,
  list_id TEXT REFERENCES lists(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  destination_url TEXT NOT NULL,
  partner_sub_id TEXT,
  session_id TEXT,
  referrer TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS booking_conversions (
  id TEXT PRIMARY KEY,
  click_id TEXT REFERENCES affiliate_clicks(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  partner_booking_id TEXT,
  hotel_id TEXT REFERENCES hotels(id) ON DELETE SET NULL,
  creator_id TEXT REFERENCES creator_profiles(id) ON DELETE SET NULL,
  booking_value REAL,
  commission_value REAL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT,
  booked_at TEXT,
  stay_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS creator_earnings (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,
  booking_conversion_id TEXT REFERENCES booking_conversions(id) ON DELETE SET NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at TEXT
);

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  hotel_id TEXT REFERENCES hotels(id) ON DELETE CASCADE,
  creator_id TEXT REFERENCES creator_profiles(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL,
  source_url TEXT,
  source_provider TEXT,
  photographer TEXT,
  license_code TEXT,
  license_url TEXT,
  attribution_text TEXT,
  rights_status TEXT NOT NULL DEFAULT 'needs_review',
  permission_reference TEXT,
  original_url TEXT,
  r2_key TEXT,
  width INTEGER,
  height INTEGER,
  mime_type TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_media_hotel ON media_assets(hotel_id);
CREATE INDEX IF NOT EXISTS idx_media_rights ON media_assets(rights_status);

CREATE TABLE IF NOT EXISTS reddit_evidence (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  hotel_id TEXT NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  hotel_name_raw TEXT NOT NULL,
  sentiment TEXT,
  attributes_json TEXT,
  best_for_json TEXT,
  avoid_if_json TEXT,
  tradeoffs_json TEXT,
  regret_signal INTEGER NOT NULL DEFAULT 0,
  price_mentioned REAL,
  trip_context TEXT,
  confidence TEXT,
  source_url TEXT,
  created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_reddit_evidence_hotel ON reddit_evidence(hotel_id);
