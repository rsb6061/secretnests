import fs from "node:fs";
import path from "node:path";

const dir = path.resolve("data/legacy");
const files = fs.readdirSync(dir).filter(n => /^reddit-evidence-\d+\.json$/.test(n)).sort();
const rows = files.flatMap(n => JSON.parse(fs.readFileSync(path.join(dir,n),"utf8")));

const q = v => v == null ? "NULL" : "'" + String(v).replaceAll("'","''") + "'";
const j = v => q(JSON.stringify(v ?? []));
const n = v => v == null || v === "" ? "NULL" : Number(v);

const sql = [
  "BEGIN TRANSACTION;",
  ...rows.map(r => `INSERT INTO reddit_evidence (
    id,post_id,hotel_id,hotel_name_raw,sentiment,best_for_json,avoid_if_json,tradeoffs_json,
    regret_signal,price_mentioned,trip_context,confidence,source_url,created_at
  ) VALUES (
    ${q(r.id)},${q(r.post_id)},${q(r.hotel_id)},${q(r.hotel_name_raw)},${q(r.sentiment)},
    ${j(r.best_for)},${j(r.avoid_if)},${j(r.tradeoffs)},${r.regret_signal?1:0},
    ${n(r.price_mentioned)},${q(r.trip_context)},${q(r.confidence)},${q(r.source_url)},${q(r.created_at)}
  ) ON CONFLICT(id) DO UPDATE SET
    sentiment=excluded.sentiment,
    best_for_json=excluded.best_for_json,
    avoid_if_json=excluded.avoid_if_json,
    tradeoffs_json=excluded.tradeoffs_json,
    regret_signal=excluded.regret_signal,
    price_mentioned=excluded.price_mentioned,
    trip_context=excluded.trip_context,
    confidence=excluded.confidence,
    source_url=excluded.source_url;`),
  "COMMIT;"
];

fs.mkdirSync(".generated",{recursive:true});
fs.writeFileSync(".generated/reddit-evidence.sql",sql.join("\n"));
console.log(`Built D1 seed for ${rows.length} structured Reddit evidence rows.`);
