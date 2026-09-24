import { REDDIT_EVIDENCE } from "./bootstrap-reddit.js";
const val=(v)=>v===""||v==null?null:v;

export async function seedRedditPart(env,part){
  const size=50,start=part*size,rows=REDDIT_EVIDENCE.slice(start,start+size);
  if(!rows.length)return {ok:false,error:"invalid_part"};
  const statements=rows.map(r=>env.DB.prepare(`INSERT INTO reddit_evidence
    (id,post_id,hotel_id,hotel_name_raw,sentiment,best_for_json,avoid_if_json,tradeoffs_json,regret_signal,price_mentioned,trip_context,confidence,source_url,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET sentiment=excluded.sentiment,best_for_json=excluded.best_for_json,avoid_if_json=excluded.avoid_if_json,tradeoffs_json=excluded.tradeoffs_json,regret_signal=excluded.regret_signal,price_mentioned=excluded.price_mentioned,trip_context=excluded.trip_context,confidence=excluded.confidence,source_url=excluded.source_url`)
    .bind(r.id,r.post_id,r.hotel_id,r.hotel_name_raw,val(r.sentiment),JSON.stringify(r.best_for||[]),JSON.stringify(r.avoid_if||[]),JSON.stringify(r.tradeoffs||[]),r.regret_signal?1:0,val(r.price_mentioned),val(r.trip_context),val(r.confidence),val(r.source_url),val(r.created_at)));
  await env.DB.batch(statements);
  return {ok:true,part,count:rows.length,start};
}
