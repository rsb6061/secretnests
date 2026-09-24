import fs from "node:fs";
import path from "node:path";

const dir = path.resolve("data/legacy");
const files = fs.readdirSync(dir)
  .filter((name) => /^hotels-core-\d+\.json$/.test(name))
  .sort();

const rows = files.flatMap((name) =>
  JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"))
);

const q = (v) => v == null ? "NULL" : "'" + String(v).replaceAll("'", "''") + "'";
const n = (v) => v == null || v === "" ? "NULL" : Number(v);
const b = (v) => v ? 1 : 0;

const statements = [
  "BEGIN TRANSACTION;",
  ...rows.map((r) => `INSERT INTO hotels (
    id,name,slug,google_place_id,country,city,region,lat,lng,website,phone,
    google_rating,google_review_count,google_price_level,hotel_category,
    reddit_mention_count,is_published,published_at,booking_url,
    price_estimate_min,price_estimate_max,created_at,updated_at
  ) VALUES (
    ${q(r.id)},${q(r.name)},${q(r.slug)},${q(r.google_place_id)},${q(r.country)},
    ${q(r.city)},${q(r.region)},${n(r.lat)},${n(r.lng)},${q(r.website)},${q(r.phone)},
    ${n(r.google_rating)},${n(r.google_review_count)},${n(r.google_price_level)},${q(r.hotel_category)},
    ${n(r.reddit_mention_count) ?? 0},${b(r.is_published)},${q(r.published_at)},${q(r.booking_url)},
    ${n(r.price_estimate_min)},${n(r.price_estimate_max)},${q(r.created_at)},${q(r.updated_at)}
  ) ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, slug=excluded.slug, google_place_id=excluded.google_place_id,
    country=excluded.country, city=excluded.city, region=excluded.region,
    lat=excluded.lat, lng=excluded.lng, website=excluded.website, phone=excluded.phone,
    google_rating=excluded.google_rating, google_review_count=excluded.google_review_count,
    google_price_level=excluded.google_price_level, hotel_category=excluded.hotel_category,
    reddit_mention_count=excluded.reddit_mention_count, is_published=excluded.is_published,
    published_at=excluded.published_at, booking_url=excluded.booking_url,
    price_estimate_min=excluded.price_estimate_min, price_estimate_max=excluded.price_estimate_max,
    updated_at=excluded.updated_at;`),
  "COMMIT;"
];

fs.mkdirSync(".generated", { recursive: true });
fs.writeFileSync(".generated/legacy-hotels.sql", statements.join("\n"));
console.log(`Built D1 seed for ${rows.length} hotels from ${files.length} files.`);
