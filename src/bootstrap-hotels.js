import { CORE_HOTELS } from "./bootstrap-core.js";
import { HOTEL_CONTENT_A } from "./bootstrap-content-a.js";
import { HOTEL_CONTENT_B } from "./bootstrap-content-b.js";

const contentById=new Map([...HOTEL_CONTENT_A,...HOTEL_CONTENT_B].map(x=>[x.id,x]));
const slugify=(v="")=>String(v).normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/&/g," and ").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").replace(/-{2,}/g,"-");
const val=(v)=>v===""||v==null?null:v;

export async function seedHotelPart(env,part){
  const size=40,start=part*size,rows=CORE_HOTELS.slice(start,start+size);
  if(!rows.length)return {ok:false,error:"invalid_part"};
  const used=new Set();
  for(const h of CORE_HOTELS){
    let s=slugify(h.name)||("hotel-"+String(h.id).slice(0,8)),base=s,n=2;
    while(used.has(s))s=base+"-"+n++;
    used.add(s); h.__canonical=s;
  }
  const statements=rows.map(r=>{
    const c=contentById.get(r.id)||{};
    return env.DB.prepare(`INSERT INTO hotels
      (id,name,slug,google_place_id,description,country,city,region,lat,lng,website,phone,google_rating,google_review_count,google_price_level,hotel_category,reddit_mention_count,is_published,published_at,booking_url,highlights_json,best_for_json,not_ideal_for_json,price_estimate_min,price_estimate_max,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,slug=excluded.slug,google_place_id=excluded.google_place_id,description=excluded.description,country=excluded.country,city=excluded.city,region=excluded.region,lat=excluded.lat,lng=excluded.lng,website=excluded.website,phone=excluded.phone,google_rating=excluded.google_rating,google_review_count=excluded.google_review_count,google_price_level=excluded.google_price_level,hotel_category=excluded.hotel_category,reddit_mention_count=excluded.reddit_mention_count,is_published=excluded.is_published,published_at=excluded.published_at,booking_url=excluded.booking_url,highlights_json=excluded.highlights_json,best_for_json=excluded.best_for_json,not_ideal_for_json=excluded.not_ideal_for_json,price_estimate_min=excluded.price_estimate_min,price_estimate_max=excluded.price_estimate_max,updated_at=excluded.updated_at`)
      .bind(r.id,r.name,r.__canonical,val(r.google_place_id),val(c.description),val(r.country),val(r.city),val(r.region),val(r.lat),val(r.lng),val(r.website),val(r.phone),val(r.google_rating),val(r.google_review_count),val(r.google_price_level),val(r.hotel_category),Number(r.reddit_mention_count||0),r.is_published?1:0,val(r.published_at),val(r.booking_url),JSON.stringify(c.highlights||[]),JSON.stringify(c.best_for||[]),JSON.stringify(c.not_ideal_for||[]),val(r.price_estimate_min),val(r.price_estimate_max),val(r.created_at),val(r.updated_at));
  });
  await env.DB.batch(statements);
  const aliases=rows.filter(r=>r.slug&&r.slug!==r.__canonical).map(r=>env.DB.prepare("INSERT INTO hotel_slug_aliases (alias_slug,hotel_id) VALUES (?,?) ON CONFLICT(alias_slug) DO UPDATE SET hotel_id=excluded.hotel_id").bind(r.slug,r.id));
  if(aliases.length)await env.DB.batch(aliases);
  const booking=rows.filter(r=>r.booking_url).map(r=>env.DB.prepare("INSERT INTO hotel_booking_links (id,hotel_id,provider_id,destination_url,priority,enabled,metadata_json) VALUES (?,?,?,?,10,1,'{\"source\":\"legacy\"}') ON CONFLICT(id) DO UPDATE SET destination_url=excluded.destination_url,enabled=1").bind("legacy-direct-"+r.id,r.id,"direct",r.booking_url));
  if(booking.length)await env.DB.batch(booking);
  return {ok:true,part,count:rows.length,start};
}
