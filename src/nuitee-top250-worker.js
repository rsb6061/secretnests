import {
  findNuiteeHotel,
  fetchNuiteeHotelDetails,
  extractNuiteeMetadata,
  fetchNuiteeReviews,
  summarizeNuiteeSentiment,
  fetchNuiteeRatesBatch,
  extractNuiteeRatesByHotel,
  nuiteeEnvironment
} from "./nuitee.js";

const nowIso=()=>new Date().toISOString();
const clamp=(n,min,max)=>Math.min(Math.max(Number(n)||min,min),max);

function addDays(base,days){const d=new Date(base);d.setUTCDate(d.getUTCDate()+days);return d;}
function ymd(d){return d.toISOString().slice(0,10);}
function nextFriday(base,minimumDays){
  const d=addDays(base,minimumDays),delta=(5-d.getUTCDay()+7)%7;
  return addDays(d,delta);
}
export function nuiteeCoverageWindows(base=new Date()){
  return [14,45,90].map(days=>{
    const checkin=nextFriday(base,days),checkout=addDays(checkin,2);
    return {checkin:ymd(checkin),checkout:ymd(checkout),nights:2,basis:"sandbox_coverage_2n_2adults"};
  });
}

async function chunks(items,size,fn){
  const out=[];
  for(let i=0;i<items.length;i+=size){
    out.push(...await Promise.all(items.slice(i,i+size).map(fn)));
  }
  return out;
}

async function upsertAudit(db,hotelId,patch={}){
  const now=nowIso();
  const current=await db.prepare("SELECT * FROM hotel_nuitee_audit WHERE hotel_id=?").bind(hotelId).first();
  const row={
    provider_hotel_id:patch.provider_hotel_id??current?.provider_hotel_id??null,
    environment:patch.environment??current?.environment??null,
    mapping_status:patch.mapping_status??current?.mapping_status??"pending",
    mapping_confidence:patch.mapping_confidence??current?.mapping_confidence??null,
    name_similarity:patch.name_similarity??current?.name_similarity??null,
    distance_km:patch.distance_km??current?.distance_km??null,
    metadata_status:patch.metadata_status??current?.metadata_status??"pending",
    metadata_fields:patch.metadata_fields??current?.metadata_fields??0,
    review_status:patch.review_status??current?.review_status??"pending",
    rate_windows_tested:patch.rate_windows_tested??current?.rate_windows_tested??0,
    rate_windows_with_inventory:patch.rate_windows_with_inventory??current?.rate_windows_with_inventory??0,
    rate_coverage_pct:patch.rate_coverage_pct??current?.rate_coverage_pct??null,
    last_error:Object.prototype.hasOwnProperty.call(patch,"last_error")?patch.last_error:(current?.last_error??null),
    mapped_at:patch.mapped_at??current?.mapped_at??null,
    metadata_at:patch.metadata_at??current?.metadata_at??null,
    review_at:patch.review_at??current?.review_at??null,
    rate_audited_at:patch.rate_audited_at??current?.rate_audited_at??null
  };
  await db.prepare(`INSERT INTO hotel_nuitee_audit
    (hotel_id,provider_hotel_id,environment,mapping_status,mapping_confidence,name_similarity,distance_km,metadata_status,metadata_fields,
     review_status,rate_windows_tested,rate_windows_with_inventory,rate_coverage_pct,last_error,mapped_at,metadata_at,review_at,rate_audited_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(hotel_id) DO UPDATE SET provider_hotel_id=excluded.provider_hotel_id,environment=excluded.environment,
      mapping_status=excluded.mapping_status,mapping_confidence=excluded.mapping_confidence,name_similarity=excluded.name_similarity,
      distance_km=excluded.distance_km,metadata_status=excluded.metadata_status,metadata_fields=excluded.metadata_fields,
      review_status=excluded.review_status,rate_windows_tested=excluded.rate_windows_tested,
      rate_windows_with_inventory=excluded.rate_windows_with_inventory,rate_coverage_pct=excluded.rate_coverage_pct,
      last_error=excluded.last_error,mapped_at=excluded.mapped_at,metadata_at=excluded.metadata_at,review_at=excluded.review_at,
      rate_audited_at=excluded.rate_audited_at,updated_at=excluded.updated_at`)
    .bind(hotelId,row.provider_hotel_id,row.environment,row.mapping_status,row.mapping_confidence,row.name_similarity,row.distance_km,
      row.metadata_status,row.metadata_fields,row.review_status,row.rate_windows_tested,row.rate_windows_with_inventory,row.rate_coverage_pct,
      row.last_error,row.mapped_at,row.metadata_at,row.review_at,row.rate_audited_at,now).run();

  const diagnostics=["mapping_error","metadata_error","review_error","candidate_provider_hotel_id","candidate_name",
    "candidate_similarity","candidate_distance_km","mapping_stage"];
  const sets=[],values=[];
  for(const key of diagnostics){
    if(Object.prototype.hasOwnProperty.call(patch,key)){sets.push(key+"=?");values.push(patch[key]??null)}
  }
  if(sets.length){
    values.push(now,hotelId);
    await db.prepare("UPDATE hotel_nuitee_audit SET "+sets.join(",")+",updated_at=? WHERE hotel_id=?").bind(...values).run();
  }
}
async function saveMapping(db,hotelId,match,environment){
  const now=nowIso(),status=match.confidence==="high"?"mapped":"review";
  await db.prepare(`INSERT INTO hotel_provider_mappings
    (id,hotel_id,provider,provider_hotel_id,status,confidence,source_url,metadata_json,created_at,updated_at)
    VALUES (?,?,'nuitee_connect',?,'active',?,NULL,?,?,?)
    ON CONFLICT(hotel_id,provider) DO UPDATE SET provider_hotel_id=excluded.provider_hotel_id,status='active',
      confidence=excluded.confidence,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at`)
    .bind(crypto.randomUUID(),hotelId,match.id,match.confidence||"medium",
      JSON.stringify({matched_name:match.name,similarity:match.similarity,distance_km:match.distance,environment,mapping_stage:match.stage||null}),now,now).run();
  await upsertAudit(db,hotelId,{
    provider_hotel_id:match.id,environment,mapping_status:status,mapping_confidence:match.confidence||"medium",
    name_similarity:match.similarity,distance_km:match.distance,last_error:null,mapping_error:null,mapping_stage:match.stage||null,
    candidate_provider_hotel_id:null,candidate_name:null,candidate_similarity:null,candidate_distance_km:null,mapped_at:now
  });
}

function metadataFieldCount(m){
  return ["name","address","city","country","lat","lng","star_rating","rating","description","main_photo_url"]
    .reduce((n,k)=>n+(m?.[k]!=null&&m?.[k]!==""?1:0),0)
    +(m?.amenities?.length?1:0)+(m?.tags?.length?1:0);
}

async function saveMetadata(db,hotel,providerId,metadata,environment,confidence){
  const now=nowIso(),sourceUrl="https://api.liteapi.travel/v3.0/data/hotel?hotelId="+encodeURIComponent(providerId);
  await db.prepare(`INSERT INTO hotel_provider_metadata
    (id,hotel_id,provider,provider_hotel_id,environment,star_rating,guest_rating,address,city,country,lat,lng,main_photo_url,description,
     amenities_json,tags_json,metadata_json,observed_at,created_at,updated_at)
    VALUES (?,?,'nuitee_connect',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(hotel_id,provider) DO UPDATE SET provider_hotel_id=excluded.provider_hotel_id,environment=excluded.environment,
      star_rating=excluded.star_rating,guest_rating=excluded.guest_rating,address=excluded.address,city=excluded.city,country=excluded.country,
      lat=excluded.lat,lng=excluded.lng,main_photo_url=excluded.main_photo_url,description=excluded.description,
      amenities_json=excluded.amenities_json,tags_json=excluded.tags_json,metadata_json=excluded.metadata_json,
      observed_at=excluded.observed_at,updated_at=excluded.updated_at`)
    .bind(crypto.randomUUID(),hotel.id,providerId,environment,metadata.star_rating,metadata.rating,metadata.address,metadata.city,metadata.country,
      metadata.lat,metadata.lng,metadata.main_photo_url,metadata.description,JSON.stringify(metadata.amenities||[]),JSON.stringify(metadata.tags||[]),
      JSON.stringify({persona:metadata.persona,style:metadata.style,location_type:metadata.location_type,story:metadata.story,room_count:metadata.room_count,...metadata.raw_summary}),
      now,now,now).run();

  const updates=[],values=[];
  if(confidence==="high"){
    if(!hotel.city&&metadata.city){updates.push("city=?");values.push(metadata.city)}
    if(!hotel.formatted_address&&metadata.address){updates.push("formatted_address=?");values.push(metadata.address)}
    if(hotel.lat==null&&metadata.lat!=null){updates.push("lat=?");values.push(metadata.lat)}
    if(hotel.lng==null&&metadata.lng!=null){updates.push("lng=?");values.push(metadata.lng)}
    if(!hotel.hotel_category&&metadata.star_rating){updates.push("hotel_category=?");values.push(Number(metadata.star_rating).toFixed(0)+"-star hotel")}
  }
  if(updates.length){
    values.push(now,hotel.id);
    await db.prepare("UPDATE hotels SET "+updates.join(",")+",updated_at=? WHERE id=?").bind(...values).run();
  }

  const provenanceFields=[
    ["provider_mapping",providerId],
    ["provider_metadata",metadataFieldCount(metadata)]
  ];
  for(const [field,value] of provenanceFields){
    await db.prepare(`INSERT INTO hotel_field_provenance
      (id,hotel_id,field_name,source_type,source_url,source_label,confidence,observed_at,verified_at,metadata_json,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,NULL,?,?,?)
      ON CONFLICT(hotel_id,field_name,source_type,source_url) DO UPDATE SET
        source_label=excluded.source_label,confidence=excluded.confidence,observed_at=excluded.observed_at,
        metadata_json=excluded.metadata_json,updated_at=excluded.updated_at`)
      .bind(crypto.randomUUID(),hotel.id,field,environment==="sandbox"?"nuitee_sandbox":"nuitee_connect",sourceUrl,
        "Nuitee Connect",confidence||"medium",now,JSON.stringify({value,provider_hotel_id:providerId,environment}),now,now).run();
  }
  await upsertAudit(db,hotel.id,{metadata_status:"complete",metadata_fields:metadataFieldCount(metadata),metadata_at:now,metadata_error:null});
  return updates.length;
}

async function processMappingHotel(env,row){
  const environment=nuiteeEnvironment(env);
  try{
    let mapping=await env.DB.prepare("SELECT * FROM hotel_provider_mappings WHERE hotel_id=? AND provider='nuitee_connect' AND status='active'").bind(row.id).first();
    let confidence=mapping?.confidence||null,providerId=mapping?.provider_hotel_id||null;
    if(!providerId){
      const found=await findNuiteeHotel(env,row);
      if(!found.ok){
        await upsertAudit(env.DB,row.id,{
          environment,mapping_status:"failed",last_error:found.error,mapping_error:found.error,
          candidate_provider_hotel_id:found.candidate?.id||null,candidate_name:found.candidate?.name||null,
          candidate_similarity:found.candidate?.similarity??null,candidate_distance_km:found.candidate?.distance??null,
          mapping_stage:found.candidate?.stage||null
        });
        return {mapped:0,metadata:0,failed:1};
      }
      await saveMapping(env.DB,row.id,found.match,environment);
      providerId=found.match.id;confidence=found.match.confidence;
    }else{
      let meta={};try{meta=JSON.parse(mapping.metadata_json||"{}")}catch{}
      await upsertAudit(env.DB,row.id,{
        provider_hotel_id:providerId,environment,mapping_status:confidence==="high"?"mapped":"review",mapping_confidence:confidence,
        name_similarity:meta.similarity??null,distance_km:meta.distance_km??null,mapped_at:mapping.updated_at||nowIso(),mapping_error:null,
        mapping_stage:meta.mapping_stage??null
      });
    }
    const details=await fetchNuiteeHotelDetails(env,providerId);
    if(!details.ok){
      await upsertAudit(env.DB,row.id,{metadata_status:"failed",metadata_error:details.error,last_error:details.error});
      return {mapped:1,metadata:0,failed:1};
    }
    const metadata=extractNuiteeMetadata(details.data);
    await saveMetadata(env.DB,row,providerId,metadata,environment,confidence);
    return {mapped:1,metadata:1,failed:0};
  }catch(e){
    await upsertAudit(env.DB,row.id,{mapping_error:String(e?.message||e).slice(0,800),last_error:String(e?.message||e).slice(0,800)});
    return {mapped:0,metadata:0,failed:1};
  }
}

async function mappingBatch(env,limit){
  const rows=(await env.DB.prepare(`SELECT h.*,p.priority_rank
    FROM hotel_enrichment_profiles p
    JOIN hotels h ON h.id=p.hotel_id
    LEFT JOIN hotel_nuitee_audit a ON a.hotel_id=h.id
    WHERE p.cohort='priority_250' AND (
      a.hotel_id IS NULL OR a.mapping_status='pending' OR a.metadata_status='pending'
    )
    ORDER BY p.priority_rank LIMIT ?`).bind(clamp(limit,1,40)).all()).results||[];
  const results=await chunks(rows,2,row=>processMappingHotel(env,row));
  return {
    claimed:rows.length,
    mapped:results.reduce((n,x)=>n+x.mapped,0),
    metadata:results.reduce((n,x)=>n+x.metadata,0),
    failures:results.reduce((n,x)=>n+x.failed,0)
  };
}

async function saveReviewEvidence(env,row,signal,environment){
  const provider=environment==="sandbox"?"nuitee_reviews_sandbox":"nuitee_reviews",now=nowIso();
  const url=signal.source_url;
  await env.DB.prepare(`INSERT INTO hotel_external_evidence
    (id,hotel_id,provider,source_url,source_domain,source_title,evidence_type,sentiment,summary,attributes_json,best_for_json,avoid_if_json,
     tradeoffs_json,price_mentioned,trip_context,confidence,observed_at,metadata_json,created_at,updated_at)
    VALUES (?,?,?,?,? ,?,'traveler_experience',?,?,?,?,?,?,?,?,?,?,?, ?,?)
    ON CONFLICT(hotel_id,provider,source_url) DO UPDATE SET source_title=excluded.source_title,sentiment=excluded.sentiment,
      summary=excluded.summary,attributes_json=excluded.attributes_json,best_for_json=excluded.best_for_json,
      avoid_if_json=excluded.avoid_if_json,tradeoffs_json=excluded.tradeoffs_json,trip_context=excluded.trip_context,
      confidence=excluded.confidence,observed_at=excluded.observed_at,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at`)
    .bind(crypto.randomUUID(),row.hotel_id,provider,url,"api.liteapi.travel",signal.source_title,signal.sentiment,signal.summary,
      JSON.stringify(signal.attributes||[]),JSON.stringify(signal.best_for||[]),JSON.stringify(signal.avoid_if||[]),JSON.stringify(signal.tradeoffs||[]),
      null,signal.trip_context,signal.confidence,now,JSON.stringify({provider_hotel_id:row.provider_hotel_id,environment,categories:signal.categories||[]}),now,now).run();
  await upsertAudit(env.DB,row.hotel_id,{review_status:"complete",review_at:now,review_error:null});
}

async function reviewBatch(env,limit){
  const environment=nuiteeEnvironment(env);
  const rows=(await env.DB.prepare(`SELECT a.hotel_id,a.provider_hotel_id,p.priority_rank
    FROM hotel_nuitee_audit a JOIN hotel_enrichment_profiles p ON p.hotel_id=a.hotel_id
    WHERE p.cohort='priority_250' AND a.mapping_status IN ('mapped','review') AND a.review_status='pending'
    ORDER BY p.priority_rank LIMIT ?`).bind(clamp(limit,1,20)).all()).results||[];
  const results=await chunks(rows,2,async row=>{
    try{
      const reviews=await fetchNuiteeReviews(env,row.provider_hotel_id);
      if(!reviews.ok){await upsertAudit(env.DB,row.hotel_id,{review_status:"failed",review_error:reviews.error,last_error:reviews.error});return {written:0,failed:1}}
      const signal=summarizeNuiteeSentiment(reviews.data,row.provider_hotel_id);
      if(!signal){await upsertAudit(env.DB,row.hotel_id,{review_status:"unavailable",review_at:nowIso(),review_error:null});return {written:0,failed:0}}
      await saveReviewEvidence(env,row,signal,environment);
      return {written:1,failed:0};
    }catch(e){
      await upsertAudit(env.DB,row.hotel_id,{review_status:"failed",review_error:String(e?.message||e).slice(0,800),last_error:String(e?.message||e).slice(0,800)});
      return {written:0,failed:1};
    }
  });
  return {claimed:rows.length,written:results.reduce((n,x)=>n+x.written,0),failures:results.reduce((n,x)=>n+x.failed,0)};
}

async function rateCoverageBatch(env,limit){
  const environment=nuiteeEnvironment(env),provider=environment==="sandbox"?"nuitee_sandbox":"nuitee_connect";
  const rows=(await env.DB.prepare(`SELECT a.hotel_id,a.provider_hotel_id,p.priority_rank
    FROM hotel_nuitee_audit a JOIN hotel_enrichment_profiles p ON p.hotel_id=a.hotel_id
    WHERE p.cohort='priority_250' AND a.mapping_status IN ('mapped','review') AND a.rate_audited_at IS NULL
    ORDER BY p.priority_rank LIMIT ?`).bind(clamp(limit,1,200)).all()).results||[];
  if(!rows.length)return {claimed:0,windows:0,observations:0,failures:0};
  const byProvider=new Map(rows.map(r=>[String(r.provider_hotel_id),r]));
  const counts=new Map(rows.map(r=>[r.hotel_id,{tested:0,withRate:0}]));
  let observations=0,failures=0;
  for(const window of nuiteeCoverageWindows()){
    const response=await fetchNuiteeRatesBatch(env,[...byProvider.keys()],window);
    if(!response.ok){failures+=rows.length;continue}
    const rates=extractNuiteeRatesByHotel(response.data,window.nights,String(env.RATE_CURRENCY||"USD"));
    for(const row of rows){
      const c=counts.get(row.hotel_id);c.tested++;
      const rate=rates.get(String(row.provider_hotel_id));
      if(!rate)continue;
      c.withRate++;
      await env.DB.prepare(`INSERT INTO hotel_rate_observations
        (id,hotel_id,provider_id,nightly_rate,currency,checkin_date,checkout_date,room_type,rate_name,taxes_fees_included,booking_url,metadata_json,observed_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,NULL,?,?)`)
        .bind(crypto.randomUUID(),row.hotel_id,provider,rate.nightly_rate,rate.currency,window.checkin,window.checkout,rate.room_type,rate.rate_name,
          rate.taxes_fees_included==null?null:rate.taxes_fees_included?1:0,
          JSON.stringify({provider_hotel_id:row.provider_hotel_id,environment,rate_basis:window.basis,public_total:rate.public_total,bookable_total:rate.bookable_total,offer_id:rate.offer_id,audit_only:environment==="sandbox"}),
          nowIso()).run();
      observations++;
    }
  }
  const auditedAt=nowIso();
  for(const row of rows){
    const c=counts.get(row.hotel_id),pct=c.tested?Math.round(c.withRate/c.tested*100):0;
    await upsertAudit(env.DB,row.hotel_id,{rate_windows_tested:c.tested,rate_windows_with_inventory:c.withRate,rate_coverage_pct:pct,rate_audited_at:auditedAt});
  }
  return {claimed:rows.length,windows:nuiteeCoverageWindows().length,observations,failures};
}

export async function runNuiteeTop250Enrichment(env,{mapLimit=24,reviewLimit=12,rateLimit=100}={}){
  const environment=nuiteeEnvironment(env);
  if(environment==="unknown")return {ok:false,skipped:true,reason:"nuitee_not_configured"};
  const runId=crypto.randomUUID(),started=nowIso();
  await env.DB.prepare("INSERT INTO hotel_nuitee_batch_runs (id,run_type,environment,status,started_at) VALUES (?,'top250_enrichment',?,'running',?)")
    .bind(runId,environment,started).run();
  try{
    const mapping=await mappingBatch(env,mapLimit);
    const reviews=await reviewBatch(env,reviewLimit);
    const rates=await rateCoverageBatch(env,rateLimit);
    const failures=mapping.failures+reviews.failures+rates.failures;
    await env.DB.prepare(`UPDATE hotel_nuitee_batch_runs SET status='success',hotels_claimed=?,hotels_mapped=?,metadata_written=?,
      reviews_written=?,rate_windows_tested=?,rate_observations_written=?,failures=?,finished_at=? WHERE id=?`)
      .bind(mapping.claimed,mapping.mapped,mapping.metadata,reviews.written,rates.claimed*rates.windows,rates.observations,failures,nowIso(),runId).run();
    const summary=await getNuiteeTop250Summary(env.DB);
    return {ok:true,environment,mapping,reviews,rates,summary};
  }catch(e){
    await env.DB.prepare("UPDATE hotel_nuitee_batch_runs SET status='failed',note=?,finished_at=? WHERE id=?")
      .bind(String(e?.message||e).slice(0,1000),nowIso(),runId).run();
    throw e;
  }
}

export async function getNuiteeTop250Summary(db){
  const row=await db.prepare(`SELECT
    COUNT(*) priority_total,
    SUM(CASE WHEN a.mapping_status IN ('mapped','review') THEN 1 ELSE 0 END) mapped,
    SUM(CASE WHEN a.mapping_confidence='high' THEN 1 ELSE 0 END) high_confidence,
    SUM(CASE WHEN a.mapping_status='review' THEN 1 ELSE 0 END) needs_review,
    SUM(CASE WHEN a.mapping_status='failed' THEN 1 ELSE 0 END) mapping_failed,
    SUM(CASE WHEN a.metadata_status='complete' THEN 1 ELSE 0 END) metadata_complete,
    SUM(CASE WHEN a.review_status='complete' THEN 1 ELSE 0 END) reviews_available,
    SUM(CASE WHEN a.review_status='unavailable' THEN 1 ELSE 0 END) reviews_unavailable,
    SUM(CASE WHEN a.rate_audited_at IS NOT NULL THEN 1 ELSE 0 END) rate_audited,
    ROUND(AVG(CASE WHEN a.rate_audited_at IS NOT NULL THEN a.rate_coverage_pct END),1) avg_rate_coverage
    FROM hotel_enrichment_profiles p
    JOIN hotels h ON h.id=p.hotel_id
    LEFT JOIN hotel_nuitee_audit a ON a.hotel_id=h.id
    WHERE p.cohort='priority_250'`).first();
  return row||{};
}

export async function resetNuiteeAuditHotel(db,hotelId){
  await db.prepare(`INSERT INTO hotel_nuitee_audit (hotel_id,mapping_status,metadata_status,review_status,updated_at)
    VALUES (?,'pending','pending','pending',?)
    ON CONFLICT(hotel_id) DO UPDATE SET mapping_status='pending',metadata_status='pending',review_status='pending',
      rate_audited_at=NULL,last_error=NULL,updated_at=excluded.updated_at`).bind(hotelId,nowIso()).run();
  return {ok:true,hotel_id:hotelId};
}
