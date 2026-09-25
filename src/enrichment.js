const nowIso = () => new Date().toISOString();

function reviewScore(count=0){
  const n=Number(count||0);
  return n>=5000?20:n>=1000?17:n>=300?14:n>=100?10:n>=20?6:n>0?3:0;
}
function ratingScore(rating=0){
  const n=Number(rating||0);
  return n>=4.8?10:n>=4.6?8:n>=4.4?6:n>=4.2?4:n>0?2:0;
}
function priceScore(max=0,min=0){
  const n=Number(max||min||0);
  return n>=1500?15:n>=1000?13:n>=700?10:n>=500?7:n>=300?4:n>0?2:0;
}
function priorityScore(h){
  return Math.min(25,Number(h.reddit_mention_count||0)*4)
    + reviewScore(h.google_review_count)
    + ratingScore(h.google_rating)
    + priceScore(h.price_estimate_max,h.price_estimate_min)
    + Math.min(20,Number(h.first_party_stays||0)*4)
    + (Number(h.booking_links||0)>0?5:0)
    + (Number(h.current_rates||0)>0?5:0);
}

function completeness(h){
  let facts=0;
  if(h.city)facts+=3;
  if(h.website)facts+=4;
  if(h.address||h.formatted_address)facts+=3;
  if(h.phone)facts+=2;
  if((h.description||"").length>=80)facts+=4;
  if(h.hotel_category)facts+=2;
  if(h.lat!=null&&h.lng!=null)facts+=3;
  if(h.highlights_json&&h.highlights_json!=="[]")facts+=2;
  if(h.best_for_json&&h.best_for_json!=="[]")facts+=1;
  if(h.not_ideal_for_json&&h.not_ideal_for_json!=="[]")facts+=1;
  const booking=Number(h.booking_links||0)>0?20:0;
  const rate=Number(h.current_rates||0)>0?20:0;
  const media=Number(h.licensed_media||0)>0?15:0;
  const evidence=Number(h.external_evidence||0)>0?10:0;
  const firstParty=Number(h.first_party_stays||0)>0?10:0;
  const missing=[];
  if(facts<25)missing.push("facts_core");
  if(!h.city)missing.push("city_review");
  if(!booking)missing.push("booking_link");
  if(!rate)missing.push("current_rate");
  if(!media)missing.push("licensed_hero");
  if(!evidence)missing.push("external_evidence");
  if(!firstParty)missing.push("first_party_value");
  return {facts,booking,rate,media,evidence,firstParty,total:facts+booking+rate+media+evidence+firstParty,missing};
}

async function batch(db,statements,size=75){
  for(let i=0;i<statements.length;i+=size) await db.batch(statements.slice(i,i+size));
}

export async function refreshHotelEnrichment(db){
  const runId=crypto.randomUUID(),started=nowIso();
  await db.prepare("INSERT INTO hotel_enrichment_runs (id,run_type,status,started_at) VALUES (?,'priority_refresh','running',?)").bind(runId,started).run();
  try{
    const rows=(await db.prepare(`SELECT h.*,
      (SELECT COUNT(*) FROM stays s WHERE s.hotel_id=h.id AND COALESCE(s.verification_method,'')<>'demo') first_party_stays,
      (SELECT COUNT(*) FROM hotel_booking_links bl WHERE bl.hotel_id=h.id AND bl.enabled=1) booking_links,
      (SELECT COUNT(*) FROM hotel_rate_observations ro WHERE ro.hotel_id=h.id AND ro.observed_at>=datetime('now','-45 days')) current_rates,
      (SELECT COUNT(*) FROM media_assets ma WHERE ma.hotel_id=h.id AND ma.rights_status IN ('owned_user_upload','hotel_authorized','licensed_api','licensed_public')) licensed_media,
      ((SELECT COUNT(*) FROM reddit_evidence re WHERE re.hotel_id=h.id) + (SELECT COUNT(*) FROM hotel_external_evidence he WHERE he.hotel_id=h.id)) external_evidence
      FROM hotels h WHERE h.is_published=1`).all()).results||[];

    const scored=rows.map(h=>({h,priority:priorityScore(h),complete:completeness(h)}))
      .sort((a,b)=>b.priority-a.priority || Number(b.h.google_review_count||0)-Number(a.h.google_review_count||0) || String(a.h.name).localeCompare(String(b.h.name)));

    const profileStatements=[];
    const queueStatements=[];
    const queuedTypes=new Set();

    scored.forEach((x,index)=>{
      const rank=index+1,cohort=rank<=250?"priority_250":"long_tail",computed=nowIso();
      profileStatements.push(db.prepare(`INSERT INTO hotel_enrichment_profiles
        (hotel_id,priority_score,priority_rank,cohort,completeness_score,facts_score,booking_score,rate_score,media_score,evidence_score,first_party_score,missing_json,computed_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(hotel_id) DO UPDATE SET priority_score=excluded.priority_score,priority_rank=excluded.priority_rank,cohort=excluded.cohort,
        completeness_score=excluded.completeness_score,facts_score=excluded.facts_score,booking_score=excluded.booking_score,rate_score=excluded.rate_score,
        media_score=excluded.media_score,evidence_score=excluded.evidence_score,first_party_score=excluded.first_party_score,missing_json=excluded.missing_json,computed_at=excluded.computed_at`)
        .bind(x.h.id,x.priority,rank,cohort,x.complete.total,x.complete.facts,x.complete.booking,x.complete.rate,x.complete.media,x.complete.evidence,x.complete.firstParty,JSON.stringify(x.complete.missing),computed));

      if(rank<=250){
        const taskHints={
          facts_core:"official_hotel_site",
          city_review:"manual_geography_review",
          booking_link:"travelpayouts_or_direct",
          current_rate:"rate_provider",
          licensed_hero:"hotel_press_or_licensed_api",
          external_evidence:"structured_public_evidence",
          first_party_value:"traveler_contribution"
        };
        for(const taskType of Object.keys(taskHints)){
          const missing=x.complete.missing.includes(taskType);
          const taskWeight={facts_core:0,city_review:5,booking_link:10,licensed_hero:20,current_rate:30,external_evidence:40,first_party_value:50}[taskType]??60;
          const priority=Math.max(1,rank+taskWeight);
          queueStatements.push(db.prepare(`INSERT INTO hotel_enrichment_queue
            (id,hotel_id,task_type,status,priority,source_hint,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?)
            ON CONFLICT(hotel_id,task_type) DO UPDATE SET
              status=CASE WHEN excluded.status='complete' THEN 'complete' WHEN hotel_enrichment_queue.status='working' THEN 'working' ELSE 'queued' END,
              priority=excluded.priority,source_hint=excluded.source_hint,updated_at=excluded.updated_at`)
            .bind(crypto.randomUUID(),x.h.id,taskType,missing?"queued":"complete",priority,taskHints[taskType],computed,computed));
          if(missing)queuedTypes.add(x.h.id+"|"+taskType);
        }
      }
    });

    await batch(db,profileStatements);
    await batch(db,queueStatements);
    await db.prepare("UPDATE hotel_enrichment_runs SET status='success',hotels_scored=?,queue_items_created=?,finished_at=? WHERE id=?")
      .bind(scored.length,queuedTypes.size,nowIso(),runId).run();

    const top=scored.slice(0,250);
    return {
      ok:true,
      hotels_scored:scored.length,
      priority_250:top.length,
      avg_completeness:top.length?Math.round(top.reduce((s,x)=>s+x.complete.total,0)/top.length):0,
      queue_items:queuedTypes.size
    };
  }catch(e){
    await db.prepare("UPDATE hotel_enrichment_runs SET status='failed',note=?,finished_at=? WHERE id=?").bind(String(e?.message||e).slice(0,1000),nowIso(),runId).run();
    throw e;
  }
}
