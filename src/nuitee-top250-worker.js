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
    VALUES (?,?,'nuitee_connect',?,?,?,NULL,?,?,?)
    ON CONFLICT(hotel_id,provider) DO UPDATE SET provider_hotel_id=excluded.provider_hotel_id,status=excluded.status,
      confidence=excluded.confidence,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at`)
    .bind(crypto.randomUUID(),hotelId,match.id,match.confidence==="high"?"active":"review",match.confidence||"medium",
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

  if(environment==="production"&&confidence==="high"&&metadata.main_photo_url){
    await db.prepare(`INSERT INTO media_assets
      (id,hotel_id,creator_id,source_type,source_url,source_provider,attribution_text,rights_status,permission_reference,original_url,created_at)
      SELECT ?,?,NULL,'provider_api',?,'nuitee_connect','Hotel image via Nuitee Connect','licensed_api','nuitee_connect_api',?,?
      WHERE NOT EXISTS (
        SELECT 1 FROM media_assets
        WHERE hotel_id=? AND rights_status IN ('owned_user_upload','hotel_authorized','licensed_api','licensed_public')
      )`)
      .bind("nuitee-hero-"+hotel.id,hotel.id,metadata.main_photo_url,metadata.main_photo_url,now,hotel.id).run();
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

async function mappingBatch(env,limit,cohort="priority_250"){
  const rows=(await env.DB.prepare(`SELECT h.*,p.priority_rank
    FROM hotel_enrichment_profiles p
    JOIN hotels h ON h.id=p.hotel_id
    LEFT JOIN hotel_nuitee_audit a ON a.hotel_id=h.id
    WHERE p.cohort=? AND (
      a.hotel_id IS NULL
      OR a.mapping_status='pending'
      OR (a.mapping_status IN ('mapped','review') AND a.metadata_status='pending')
    )
    ORDER BY p.priority_rank LIMIT ?`).bind(cohort,clamp(limit,1,40)).all()).results||[];
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
    WHERE p.cohort='priority_250' AND a.mapping_status='mapped' AND a.review_status='pending'
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

async function rateCoverageBatch(env,limit,cohort="priority_250"){
  const environment=nuiteeEnvironment(env),provider=environment==="sandbox"?"nuitee_sandbox":"nuitee_connect";
  const rows=(await env.DB.prepare(`SELECT a.hotel_id,a.provider_hotel_id,p.priority_rank
    FROM hotel_nuitee_audit a JOIN hotel_enrichment_profiles p ON p.hotel_id=a.hotel_id
    WHERE p.cohort=? AND a.mapping_status='mapped' AND a.mapping_confidence='high' AND a.rate_audited_at IS NULL
    ORDER BY p.priority_rank LIMIT ?`).bind(cohort,clamp(limit,1,200)).all()).results||[];
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


function parseArray(value){
  try{const x=JSON.parse(value||"[]");return Array.isArray(x)?x:[]}catch{return []}
}

async function saveCanonicalProvenance(db,hotelId,fieldName,sourceType,sourceUrl,confidence,value,providerHotelId,environment){
  const now=nowIso();
  await db.prepare(`INSERT INTO hotel_field_provenance
    (id,hotel_id,field_name,source_type,source_url,source_label,confidence,observed_at,verified_at,metadata_json,created_at,updated_at)
    VALUES (?,?,?,?,?,'Nuitee Connect',?,?,NULL,?,?,?)
    ON CONFLICT(hotel_id,field_name,source_type,source_url) DO UPDATE SET
      confidence=excluded.confidence,observed_at=excluded.observed_at,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at`)
    .bind(crypto.randomUUID(),hotelId,fieldName,sourceType,sourceUrl,confidence||"high",now,
      JSON.stringify({value,provider_hotel_id:providerHotelId,environment,canonical_promotion:true}),now,now).run();
}

export async function promoteTrustedNuiteeMetadata(env,{limit=200,cohort="priority_250",includeReviews=true}={}){
  const rows=(await env.DB.prepare(`SELECT
      h.id,h.city,h.country,h.address,h.formatted_address,h.lat,h.lng,h.hotel_category,h.brand_name,h.description,h.amenities_json,
      h.external_review_summary,h.external_review_sentiment,h.external_review_confidence,h.external_review_source,
      a.provider_hotel_id,a.environment,a.mapping_confidence,p.priority_rank,
      pm.star_rating provider_star_rating,pm.address provider_address,pm.city provider_city,pm.country provider_country,
      pm.lat provider_lat,pm.lng provider_lng,pm.description provider_description,pm.amenities_json provider_amenities_json,
      json_extract(pm.metadata_json,'$.chain') provider_chain,
      (SELECT he.provider FROM hotel_external_evidence he WHERE he.hotel_id=h.id AND he.provider LIKE 'nuitee_reviews%' ORDER BY he.observed_at DESC LIMIT 1) review_provider,
      (SELECT he.summary FROM hotel_external_evidence he WHERE he.hotel_id=h.id AND he.provider LIKE 'nuitee_reviews%' ORDER BY he.observed_at DESC LIMIT 1) review_summary,
      (SELECT he.sentiment FROM hotel_external_evidence he WHERE he.hotel_id=h.id AND he.provider LIKE 'nuitee_reviews%' ORDER BY he.observed_at DESC LIMIT 1) review_sentiment,
      (SELECT he.confidence FROM hotel_external_evidence he WHERE he.hotel_id=h.id AND he.provider LIKE 'nuitee_reviews%' ORDER BY he.observed_at DESC LIMIT 1) review_confidence,
      (SELECT he.source_url FROM hotel_external_evidence he WHERE he.hotel_id=h.id AND he.provider LIKE 'nuitee_reviews%' ORDER BY he.observed_at DESC LIMIT 1) review_source_url
    FROM hotel_nuitee_audit a
    JOIN hotel_enrichment_profiles p ON p.hotel_id=a.hotel_id
    JOIN hotels h ON h.id=a.hotel_id
    JOIN hotel_provider_metadata pm ON pm.hotel_id=h.id AND pm.provider='nuitee_connect'
    WHERE p.cohort=?
      AND a.environment='production'
      AND pm.environment='production'
      AND a.mapping_status='mapped'
      AND a.mapping_confidence='high'
      AND a.metadata_status='complete'
      AND COALESCE(a.canonical_status,'pending')<>'complete'
    ORDER BY p.priority_rank
    LIMIT ?`).bind(cohort,clamp(limit,1,500)).all()).results||[];

  let hotelsUpdated=0,fieldsWritten=0,reviewSignals=0;
  for(const row of rows){
    const updates=[],values=[],provenance=[];
    const detailsUrl="https://api.liteapi.travel/v3.0/data/hotel?hotelId="+encodeURIComponent(row.provider_hotel_id);
    const sourceType=row.environment==="sandbox"?"nuitee_sandbox":"nuitee_connect";
    const add=(column,value)=>{
      if(value==null||value==="")return;
      updates.push(column+"=?");values.push(value);
      provenance.push({field:column,value,sourceType,url:detailsUrl,confidence:"high"});
    };

    if(!row.city&&row.provider_city)add("city",row.provider_city);
    if(!row.country&&row.provider_country)add("country",row.provider_country);
    if(!row.address&&row.provider_address)add("address",row.provider_address);
    if(!row.formatted_address&&row.provider_address)add("formatted_address",row.provider_address);
    if(row.lat==null&&row.provider_lat!=null)add("lat",row.provider_lat);
    if(row.lng==null&&row.provider_lng!=null)add("lng",row.provider_lng);
    if(!row.hotel_category&&row.provider_star_rating)add("hotel_category",Number(row.provider_star_rating).toFixed(0)+"-star hotel");
    if(!row.brand_name&&String(row.provider_chain||"").trim())add("brand_name",String(row.provider_chain).trim().slice(0,160));
    if(!String(row.description||"").trim()&&String(row.provider_description||"").trim())add("description",String(row.provider_description).trim().slice(0,4000));

    const existingAmenities=parseArray(row.amenities_json);
    const providerAmenities=parseArray(row.provider_amenities_json).map(x=>String(x).trim()).filter(Boolean).slice(0,120);
    if(!existingAmenities.length&&providerAmenities.length)add("amenities_json",JSON.stringify(providerAmenities));

    if(includeReviews&&!row.external_review_summary&&row.review_summary){
      const reviewSummary=String(row.review_summary).slice(0,1200);
      updates.push("external_review_summary=?");values.push(reviewSummary);
      updates.push("external_review_sentiment=?");values.push(row.review_sentiment||null);
      updates.push("external_review_confidence=?");values.push(row.review_confidence||null);
      updates.push("external_review_source=?");values.push(row.review_provider||null);
      updates.push("external_review_updated_at=?");values.push(nowIso());
      provenance.push({
        field:"external_review_summary",value:reviewSummary,
        sourceType:row.review_provider||"nuitee_reviews",url:row.review_source_url||detailsUrl,
        confidence:row.review_confidence||"medium"
      });
      reviewSignals++;
    }

    const sameText=(a,b)=>String(a||"").trim().toLowerCase()===String(b||"").trim().toLowerCase();
    const confirmations=[
      ["city",row.city,row.provider_city],["country",row.country,row.provider_country],
      ["address",row.address,row.provider_address],["formatted_address",row.formatted_address,row.provider_address]
    ];
    for(const [field,current,providerValue] of confirmations){
      if(current&&providerValue&&sameText(current,providerValue)){
        provenance.push({field,value:current,sourceType,url:detailsUrl,confidence:"high"});
      }
    }
    if(row.lat!=null&&row.provider_lat!=null&&Math.abs(Number(row.lat)-Number(row.provider_lat))<=0.01)
      provenance.push({field:"lat",value:row.lat,sourceType,url:detailsUrl,confidence:"high"});
    if(row.lng!=null&&row.provider_lng!=null&&Math.abs(Number(row.lng)-Number(row.provider_lng))<=0.01)
      provenance.push({field:"lng",value:row.lng,sourceType,url:detailsUrl,confidence:"high"});

    if(updates.length){
      values.push(nowIso(),row.id);
      await env.DB.prepare("UPDATE hotels SET "+updates.join(",")+",updated_at=? WHERE id=?").bind(...values).run();
      hotelsUpdated++;fieldsWritten+=updates.length;
      for(const p of provenance){
        await saveCanonicalProvenance(env.DB,row.id,p.field,p.sourceType,p.url,p.confidence,p.value,row.provider_hotel_id,row.environment);
      }
    }
    await env.DB.prepare("UPDATE hotel_nuitee_audit SET canonical_status='complete',canonical_fields=?,canonical_at=?,updated_at=? WHERE hotel_id=?")
      .bind(updates.length,nowIso(),nowIso(),row.id).run();
  }
  return {claimed:rows.length,hotels_updated:hotelsUpdated,fields_written:fieldsWritten,review_signals_promoted:reviewSignals};
}

export async function runNuiteeCatalogEnrichment(env,{mapLimit=8,rateLimit=0,canonicalLimit=80}={}){
  const environment=nuiteeEnvironment(env);
  if(environment!=="production")return {ok:false,skipped:true,reason:environment==="unknown"?"nuitee_not_configured":"production_key_required"};
  const runId=crypto.randomUUID(),started=nowIso();
  await env.DB.prepare("INSERT INTO hotel_nuitee_batch_runs (id,run_type,environment,status,started_at) VALUES (?,'catalog_enrichment',?,'running',?)")
    .bind(runId,environment,started).run();
  try{
    const mapping=await mappingBatch(env,mapLimit,"long_tail");
    const rates=Number(rateLimit)>0?await rateCoverageBatch(env,rateLimit,"long_tail"):{claimed:0,windows:0,observations:0,failures:0};
    const canonical=await promoteTrustedNuiteeMetadata(env,{limit:canonicalLimit,cohort:"long_tail",includeReviews:false});
    const failures=mapping.failures+rates.failures;
    await env.DB.prepare(`UPDATE hotel_nuitee_batch_runs SET status='success',hotels_claimed=?,hotels_mapped=?,metadata_written=?,
      reviews_written=0,rate_windows_tested=?,rate_observations_written=?,failures=?,finished_at=? WHERE id=?`)
      .bind(mapping.claimed,mapping.mapped,mapping.metadata,rates.claimed*rates.windows,rates.observations,failures,nowIso(),runId).run();
    const summary=await getNuiteeCatalogSummary(env.DB);
    return {ok:true,environment,mapping,rates,canonical,summary};
  }catch(e){
    await env.DB.prepare("UPDATE hotel_nuitee_batch_runs SET status='failed',note=?,finished_at=? WHERE id=?")
      .bind(String(e?.message||e).slice(0,1000),nowIso(),runId).run();
    throw e;
  }
}

export async function getNuiteeCatalogSummary(db){
  const row=await db.prepare(`SELECT
    COUNT(*) published_total,
    SUM(CASE WHEN p.cohort='priority_250' THEN 1 ELSE 0 END) priority_total,
    SUM(CASE WHEN p.cohort='long_tail' THEN 1 ELSE 0 END) long_tail_total,
    SUM(CASE WHEN a.mapping_status='mapped' AND a.mapping_confidence='high' THEN 1 ELSE 0 END) high_confidence_mapped,
    SUM(CASE WHEN a.metadata_status='complete' AND a.environment='production' THEN 1 ELSE 0 END) production_metadata_complete,
    SUM(CASE WHEN a.rate_audited_at IS NOT NULL THEN 1 ELSE 0 END) rate_audited,
    SUM(CASE WHEN h.city IS NULL OR trim(h.city)='' THEN 1 ELSE 0 END) missing_city,
    SUM(CASE WHEN h.formatted_address IS NULL OR trim(h.formatted_address)='' THEN 1 ELSE 0 END) missing_address,
    SUM(CASE WHEN h.website IS NULL OR trim(h.website)='' THEN 1 ELSE 0 END) missing_website,
    SUM(CASE WHEN h.description IS NULL OR length(trim(h.description))<80 THEN 1 ELSE 0 END) missing_description,
    SUM(CASE WHEN h.amenities_json IS NULL OR h.amenities_json='[]' THEN 1 ELSE 0 END) missing_amenities,
    SUM(CASE WHEN NOT EXISTS (
      SELECT 1 FROM media_assets ma WHERE ma.hotel_id=h.id
      AND ma.rights_status IN ('owned_user_upload','hotel_authorized','licensed_api','licensed_public')
    ) THEN 1 ELSE 0 END) missing_publishable_media
    FROM hotels h
    JOIN hotel_enrichment_profiles p ON p.hotel_id=h.id
    LEFT JOIN hotel_nuitee_audit a ON a.hotel_id=h.id
    WHERE h.is_published=1`).first();
  return row||{};
}

export async function runNuiteeTop250Enrichment(env,{mapLimit=24,reviewLimit=12,rateLimit=100,canonicalLimit=200}={}){
  const environment=nuiteeEnvironment(env);
  if(environment==="unknown")return {ok:false,skipped:true,reason:"nuitee_not_configured"};
  const runId=crypto.randomUUID(),started=nowIso();
  await env.DB.prepare("INSERT INTO hotel_nuitee_batch_runs (id,run_type,environment,status,started_at) VALUES (?,'top250_enrichment',?,'running',?)")
    .bind(runId,environment,started).run();
  try{
    const mapping=await mappingBatch(env,mapLimit,"priority_250");
    const reviews=await reviewBatch(env,reviewLimit);
    const rates=await rateCoverageBatch(env,rateLimit,"priority_250");
    const canonical=await promoteTrustedNuiteeMetadata(env,{limit:canonicalLimit,cohort:"priority_250",includeReviews:true});
    const failures=mapping.failures+reviews.failures+rates.failures;
    await env.DB.prepare(`UPDATE hotel_nuitee_batch_runs SET status='success',hotels_claimed=?,hotels_mapped=?,metadata_written=?,
      reviews_written=?,rate_windows_tested=?,rate_observations_written=?,failures=?,finished_at=? WHERE id=?`)
      .bind(mapping.claimed,mapping.mapped,mapping.metadata,reviews.written,rates.claimed*rates.windows,rates.observations,failures,nowIso(),runId).run();
    const summary=await getNuiteeTop250Summary(env.DB);
    return {ok:true,environment,mapping,reviews,rates,canonical,summary};
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
    SUM(CASE WHEN a.canonical_status='complete' THEN 1 ELSE 0 END) canonical_complete,
    SUM(CASE WHEN a.canonical_status='complete' AND a.canonical_fields>0 THEN 1 ELSE 0 END) canonical_updated,
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
      rate_audited_at=NULL,last_error=NULL,mapping_error=NULL,metadata_error=NULL,review_error=NULL,
      candidate_provider_hotel_id=NULL,candidate_name=NULL,candidate_similarity=NULL,candidate_distance_km=NULL,mapping_stage=NULL,
      updated_at=excluded.updated_at`).bind(hotelId,nowIso()).run();
  return {ok:true,hotel_id:hotelId};
}


export async function approveNuiteeAuditHotel(db,hotelId){
  const audit=await db.prepare("SELECT provider_hotel_id,mapping_status FROM hotel_nuitee_audit WHERE hotel_id=?").bind(hotelId).first();
  if(!audit?.provider_hotel_id||audit.mapping_status!=="review")return {ok:false,hotel_id:hotelId,reason:"not_reviewable"};
  const now=nowIso();
  await db.prepare("UPDATE hotel_nuitee_audit SET mapping_status='mapped',last_error=NULL,mapping_error=NULL,updated_at=? WHERE hotel_id=?").bind(now,hotelId).run();
  await db.prepare("UPDATE hotel_provider_mappings SET status='active',updated_at=? WHERE hotel_id=? AND provider='nuitee_connect' AND provider_hotel_id=?").bind(now,hotelId,audit.provider_hotel_id).run();
  return {ok:true,hotel_id:hotelId,provider_hotel_id:audit.provider_hotel_id};
}
