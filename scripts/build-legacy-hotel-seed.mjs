import fs from "node:fs";
import path from "node:path";

const dir = path.resolve("data/legacy");
const coreFiles = fs.readdirSync(dir).filter((name) => /^hotels-core-\d+\.json$/.test(name)).sort();
const contentFiles = fs.readdirSync(dir).filter((name) => /^hotel-content-\d+\.sanitized\.json$/.test(name)).sort();

const rows = coreFiles.flatMap((name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")));
const contentRows = contentFiles.flatMap((name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")));
const contentById = new Map(contentRows.map((r) => [r.id, r]));

const q = (v) => v == null ? "NULL" : "'" + String(v).replaceAll("'", "''") + "'";
const n = (v) => v == null || v === "" ? "NULL" : Number(v);
const b = (v) => v ? 1 : 0;
const j = (v) => q(JSON.stringify(v ?? []));
const clean = (v) => v == null ? null : String(v).trim() || null;
const slugify = (v) => String(v || "")
  .normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase().replace(/&/g," and ").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").replace(/-{2,}/g,"-");

const canonicalSlugs = new Map();
for (const r of rows) {
  const base = slugify(r.name) || ("hotel-" + String(r.id).slice(0,8));
  let slug = base, i = 2;
  while ([...canonicalSlugs.values()].includes(slug)) slug = base + "-" + i++;
  canonicalSlugs.set(r.id, slug);
}

const statements = [  ...rows.map((r) => {
    const c = contentById.get(r.id) || {};
    return `INSERT INTO hotels (
      id,name,slug,google_place_id,description,country,city,region,lat,lng,website,phone,
      google_rating,google_review_count,google_price_level,hotel_category,
      reddit_mention_count,is_published,published_at,booking_url,
      highlights_json,best_for_json,not_ideal_for_json,
      price_estimate_min,price_estimate_max,created_at,updated_at
    ) VALUES (
      ${q(r.id)},${q(clean(r.name))},${q(canonicalSlugs.get(r.id))},${q(clean(r.google_place_id))},${q(clean(c.description))},
      ${q(clean(r.country))},${q(clean(r.city))},${q(clean(r.region))},${n(r.lat)},${n(r.lng)},${q(clean(r.website))},${q(clean(r.phone))},
      ${n(r.google_rating)},${n(r.google_review_count)},${n(r.google_price_level)},${q(r.hotel_category)},
      ${n(r.reddit_mention_count) ?? 0},${b(r.is_published)},${q(r.published_at)},${q(r.booking_url)},
      ${j(c.highlights)},${j(c.best_for)},${j(c.not_ideal_for)},
      ${n(r.price_estimate_min)},${n(r.price_estimate_max)},${q(r.created_at)},${q(r.updated_at)}
    ) ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, slug=excluded.slug, google_place_id=excluded.google_place_id,
      description=COALESCE(excluded.description,hotels.description),
      country=excluded.country, city=excluded.city, region=excluded.region,
      lat=excluded.lat, lng=excluded.lng, website=excluded.website, phone=excluded.phone,
      google_rating=excluded.google_rating, google_review_count=excluded.google_review_count,
      google_price_level=excluded.google_price_level, hotel_category=excluded.hotel_category,
      reddit_mention_count=excluded.reddit_mention_count, is_published=excluded.is_published,
      published_at=excluded.published_at, booking_url=excluded.booking_url,
      highlights_json=CASE WHEN excluded.highlights_json='[]' THEN hotels.highlights_json ELSE excluded.highlights_json END,
      best_for_json=CASE WHEN excluded.best_for_json='[]' THEN hotels.best_for_json ELSE excluded.best_for_json END,
      not_ideal_for_json=CASE WHEN excluded.not_ideal_for_json='[]' THEN hotels.not_ideal_for_json ELSE excluded.not_ideal_for_json END,
      price_estimate_min=excluded.price_estimate_min, price_estimate_max=excluded.price_estimate_max,
      updated_at=excluded.updated_at;`;
  }),
  ...rows.filter(r => clean(r.slug) && clean(r.slug) !== canonicalSlugs.get(r.id)).map(r =>
    `INSERT INTO hotel_slug_aliases (alias_slug,hotel_id) VALUES (${q(clean(r.slug))},${q(r.id)})
     ON CONFLICT(alias_slug) DO UPDATE SET hotel_id=excluded.hotel_id;`
  ),
  ...rows.filter(r => clean(r.booking_url)).map(r =>
    `INSERT INTO hotel_booking_links (id,hotel_id,provider_id,destination_url,priority,enabled,metadata_json)
     VALUES (${q("legacy-direct-"+r.id)},${q(r.id)},'direct',${q(clean(r.booking_url))},10,1,'{"source":"legacy"}')
     ON CONFLICT(id) DO UPDATE SET destination_url=excluded.destination_url,enabled=1;`
  ),];

fs.mkdirSync(".generated", { recursive: true });
fs.writeFileSync(".generated/legacy-hotels.sql", statements.join("\n"));
console.log(`Built D1 seed for ${rows.length} hotels from ${coreFiles.length} core files; merged ${contentRows.length} sanitized content records from ${contentFiles.length} files.`);
