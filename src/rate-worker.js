import { refreshHotelEnrichment } from "./enrichment.js";
import { recomputeHotelValuation } from "./value-engine.js";

const nowIso=()=>new Date().toISOString();
const clamp=(n,min,max)=>Math.min(Math.max(Number(n)||min,min),max);

function ymd(d){ return d.toISOString().slice(0,10); }
function addDays(d,days){ const x=new Date(d); x.setUTCDate(x.getUTCDate()+days); return x; }
function nextFriday(base,minimumDays){
  const d=addDays(base,minimumDays);
  const delta=(5-d.getUTCDay()+7)%7;
  return addDays(d,delta);
}

export function rateWindows(base=new Date()){
  return [14,45].map(days=>{
    const checkin=nextFriday(base,days);
    const checkout=addDays(checkin,2);
    return {checkin:ymd(checkin),checkout:ymd(checkout),nights:2,basis:"weekend_2n_2adults_1room"};
  });
}

function bookingConfig(env){
  return {
    token:String(env.BOOKING_DEMAND_API_TOKEN||"").trim(),
    affiliateId:String(env.BOOKING_DEMAND_AFFILIATE_ID||"").trim(),
    baseUrl:String(env.BOOKING_DEMAND_BASE_URL||"https://demandapi.booking.com/3.2").replace(/\/$/,""),
    bookerCountry:String(env.RATE_BOOKER_COUNTRY||"us").toLowerCase(),
    currency:String(env.RATE_CURRENCY||"USD").toUpperCase()
  };
}

async function bookingPost(env,path,body){
  const cfg=bookingConfig(env);
  if(!cfg.token||!cfg.affiliateId) return {ok:false,status:0,error:"booking_demand_not_configured"};
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),12000);
  try{
    const r=await fetch(cfg.baseUrl+path,{
      method:"POST",
      headers:{
        "authorization":"Bearer "+cfg.token,
        "x-affiliate-id":cfg.affiliateId,
        "content-type":"application/json"
      },
      body:JSON.stringify(body),
      signal:ctl.signal
    });
    let data={}; try{data=await r.json()}catch{}
    if(!r.ok)return {ok:false,status:r.status,error:String(data?.message||data?.error||("http_"+r.status)).slice(0,500),data};
    return {ok:true,status:r.status,data};
  }catch(e){
    return {ok:false,status:0,error:String(e?.name==="AbortError"?"timeout":e?.message||e).slice(0,500)};
  }finally{clearTimeout(timer)}
}

function normalizeName(v=""){
  return String(v).normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
    .replace(/&/g," and ").replace(/[^a-z0-9]+/g," ").trim()
    .split(/\s+/).filter(x=>x&&!["the"].includes(x)).join(" ");
}
function tokens(v){ return new Set(normalizeName(v).split(" ").filter(Boolean)); }
function nameSimilarity(a,b){
  const na=normalizeName(a),nb=normalizeName(b);
  if(!na||!nb)return 0;
  if(na===nb)return 1;
  const A=tokens(a),B=tokens(b),inter=[...A].filter(x=>B.has(x)).length,union=new Set([...A,...B]).size;
  const jac=union?inter/union:0;
  const containment=Math.min(A.size,B.size)?inter/Math.min(A.size,B.size):0;
  return Math.max(jac,containment*0.9);
}
function haversineKm(aLat,aLng,bLat,bLng){
  const vals=[aLat,aLng,bLat,bLng].map(Number); if(vals.some(x=>!Number.isFinite(x)))return null;
  const [la1,lo1,la2,lo2]=vals.map(x=>x*Math.PI/180),dlat=la2-la1,dlon=lo2-lo1;
  const h=Math.sin(dlat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dlon/2)**2;
  return 6371*2*Math.asin(Math.sqrt(h));
}
function firstText(v){
  if(typeof v==="string")return v;
  if(v&&typeof v==="object"){
    for(const key of ["en-gb","en-us","en","name"]) if(typeof v[key]==="string")return v[key];
    const first=Object.values(v).find(x=>typeof x==="string"); if(first)return first;
  }
  return "";
}
function detailCoords(d){
  const c=d?.coordinates||d?.location?.coordinates||{};
  return {lat:Number(c.latitude??d?.latitude),lng:Number(c.longitude??d?.longitude)};
}

export function matchBookingCandidate(hotel,details=[]){
  const ranked=details.map(d=>{
    const name=firstText(d?.name||d?.accommodation?.name);
    const c=detailCoords(d),distance=haversineKm(hotel.lat,hotel.lng,c.lat,c.lng);
    const similarity=nameSimilarity(hotel.name,name);
    const score=similarity-(distance==null?0.12:Math.min(distance/4,0.25));
    return {detail:d,id:String(d?.id??d?.accommodation?.id??""),name,similarity,distance,score};
  }).filter(x=>x.id&&x.name).sort((a,b)=>b.score-a.score);
  const best=ranked[0]; if(!best)return null;
  const accepted=best.similarity>=0.68 || (best.similarity>=0.52 && best.distance!=null && best.distance<=0.2);
  if(!accepted)return null;
  return {...best,confidence:best.similarity>=0.82&&best.distance!=null&&best.distance<=0.3?"high":"medium"};
}

function numeric(v){
  if(v==null)return null;
  if(typeof v==="number"&&Number.isFinite(v))return v;
  if(typeof v==="string"&&Number.isFinite(Number(v)))return Number(v);
  if(typeof v==="object"){
    for(const k of ["booker_currency","value","amount","display"]) {
      const n=numeric(v[k]); if(n!=null)return n;
    }
  }
  return null;
}
function flattenProducts(item){
  const products=Array.isArray(item?.products)?item.products:[];
  const recProducts=Array.isArray(item?.recommendation?.products)?item.recommendation.products:[];
  return [...products,...recProducts];
}

export function extractBookerRate(payload,nights=1){
  const item=(Array.isArray(payload?.data)?payload.data[0]:payload?.data)||payload||{};
  const candidates=[];
  const add=(price,product=null)=>{
    const display=numeric(price?.display??price?.book??price);
    const total=numeric(price?.total);
    const value=display??total;
    if(value!=null&&value>0)candidates.push({value,price,product});
  };
  add(item?.recommendation?.price,item?.recommendation);
  for(const p of flattenProducts(item))add(p?.price,p);
  add(item?.price,item);
  if(!candidates.length)return null;
  candidates.sort((a,b)=>a.value-b.value);
  const chosen=candidates[0],currency=firstText(item?.currency?.booker||item?.currency)||"USD";
  const charges=Array.isArray(chosen.price?.charges)?chosen.price.charges:[];
  const excluded=charges.some(c=>{
    const inc=c?.included_in;
    return inc===false || inc?.display===false || inc?.booker_currency===false;
  });
  const room=chosen.product?.room;
  return {
    nightly_rate:chosen.value/Math.max(Number(nights)||1,1),
    currency:String(currency||"USD").toUpperCase(),
    room_type:firstText(room?.name||room)||null,
    rate_name:firstText(chosen.product?.name||chosen.product?.deal?.name)||null,
    taxes_fees_included:charges.length?(!excluded):null,
    raw_total:chosen.value
  };
}

async function getMapping(db,hotelId){
  return db.prepare("SELECT * FROM hotel_provider_mappings WHERE hotel_id=? AND provider='booking_demand' AND status='active'").bind(hotelId).first();
}

async function saveMapping(db,hotelId,match){
  const id=crypto.randomUUID(),now=nowIso();
  await db.prepare(`INSERT INTO hotel_provider_mappings
    (id,hotel_id,provider,provider_hotel_id,status,confidence,source_url,metadata_json,created_at,updated_at)
    VALUES (?,?,'booking_demand',?,'active',?,NULL,?,?,?)
    ON CONFLICT(hotel_id,provider) DO UPDATE SET provider_hotel_id=excluded.provider_hotel_id,status='active',
      confidence=excluded.confidence,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at`)
    .bind(id,hotelId,match.id,match.confidence,JSON.stringify({matched_name:match.name,similarity:match.similarity,distance_km:match.distance}),now,now).run();
}

async function discoverMapping(env,hotel,window){
  if(!Number.isFinite(Number(hotel.lat))||!Number.isFinite(Number(hotel.lng)))return {ok:false,error:"provider_mapping_missing_coordinates"};
  const cfg=bookingConfig(env);
  const search=await bookingPost(env,"/accommodations/search",{
    coordinates:{latitude:Number(hotel.lat),longitude:Number(hotel.lng),radius:1},
    booker:{platform:"desktop",country:cfg.bookerCountry},
    currency:cfg.currency,
    checkin:window.checkin,
    checkout:window.checkout,
    guests:{number_of_rooms:1,number_of_adults:2},
    extras:["products"],
    rows:20
  });
  if(!search.ok)return search;
  const ids=(Array.isArray(search.data?.data)?search.data.data:[]).map(x=>x?.id).filter(Boolean).slice(0,20);
  if(!ids.length)return {ok:false,error:"booking_search_no_candidates"};
  const details=await bookingPost(env,"/accommodations/details",{accommodations:ids,languages:["en-gb"]});
  if(!details.ok)return details;
  const rows=Array.isArray(details.data?.data)?details.data.data:[];
  const match=matchBookingCandidate(hotel,rows);
  if(!match)return {ok:false,error:"booking_mapping_no_confident_match"};
  await saveMapping(env.DB,hotel.id,match);
  return {ok:true,mapping:{provider_hotel_id:match.id},created:true,match};
}

async function fetchAvailability(env,providerHotelId,window){
  const cfg=bookingConfig(env);
  const body={
    accommodations:[Number(providerHotelId)],
    booker:{platform:"desktop",country:cfg.bookerCountry},
    currency:cfg.currency,
    checkin:window.checkin,
    checkout:window.checkout,
    guests:{number_of_rooms:1,number_of_adults:2},
    extras:["products"]
  };
  let result=await bookingPost(env,"/accommodations/availability",body);
  if(!result.ok&&result.status===400){
    const fallback={...body,accommodation:Number(providerHotelId)}; delete fallback.accommodations;
    result=await bookingPost(env,"/accommodations/availability",fallback);
  }
  return result;
}

async function claimTasks(db,limit){
  const rows=(await db.prepare(`SELECT q.id queue_id,q.status queue_status,q.attempts,q.priority,h.id hotel_id,h.name,h.city,h.country,h.lat,h.lng
    FROM hotel_enrichment_queue q
    JOIN hotels h ON h.id=q.hotel_id
    JOIN hotel_enrichment_profiles p ON p.hotel_id=h.id AND p.cohort='priority_250'
    WHERE q.task_type='current_rate' AND (
      q.status='queued'
      OR (q.status='complete' AND NOT EXISTS (
        SELECT 1 FROM hotel_rate_observations ro WHERE ro.hotel_id=h.id AND ro.observed_at>=datetime('now','-24 hours')
      ))
      OR (q.status='failed' AND q.attempts<5 AND q.updated_at<=datetime('now','-12 hours'))
    )
    ORDER BY q.priority,q.updated_at LIMIT ?`).bind(clamp(limit,1,20)).all()).results||[];
  const claimed=[];
  for(const r of rows){
    const out=await db.prepare("UPDATE hotel_enrichment_queue SET status='working',locked_at=?,updated_at=? WHERE id=? AND status=?")
      .bind(nowIso(),nowIso(),r.queue_id,r.queue_status).run();
    if(Number(out.meta?.changes||0)>0)claimed.push(r);
  }
  return claimed;
}

async function finish(db,id,status,error=null){
  await db.prepare("UPDATE hotel_enrichment_queue SET status=?,attempts=attempts+1,last_error=?,locked_at=NULL,updated_at=? WHERE id=?")
    .bind(status,error?String(error).slice(0,1000):null,nowIso(),id).run();
}

export async function drainCurrentRateQueue(env,{limit=6}={}){
  const cfg=bookingConfig(env);
  if(!cfg.token||!cfg.affiliateId)return {ok:false,skipped:true,reason:"booking_demand_not_configured"};
  await env.DB.prepare("UPDATE affiliate_providers SET enabled=1,updated_at=? WHERE id='booking_demand'").bind(nowIso()).run();
  const runId=crypto.randomUUID(),started=nowIso();
  await env.DB.prepare("INSERT INTO hotel_rate_sync_runs (id,provider,status,started_at) VALUES (?,'booking_demand','running',?)").bind(runId,started).run();
  const tasks=await claimTasks(env.DB,limit);
  let observations=0,mappings=0,failures=0;
  try{
    const windows=rateWindows();
    for(const t of tasks){
      try{
        let mapping=await getMapping(env.DB,t.hotel_id);
        if(!mapping){
          const discovered=await discoverMapping(env,{id:t.hotel_id,name:t.name,lat:t.lat,lng:t.lng},windows[0]);
          if(!discovered.ok){await finish(env.DB,t.queue_id,"failed",discovered.error);failures++;continue}
          mapping={provider_hotel_id:discovered.mapping.provider_hotel_id}; mappings++;
        }
        let hotelWritten=0,lastError=null;
        for(const window of windows){
          const response=await fetchAvailability(env,mapping.provider_hotel_id,window);
          if(!response.ok){lastError=response.error;continue}
          const rate=extractBookerRate(response.data,window.nights);
          if(!rate){lastError="booking_availability_no_rate";continue}
          await env.DB.prepare(`INSERT INTO hotel_rate_observations
            (id,hotel_id,provider_id,nightly_rate,currency,checkin_date,checkout_date,room_type,rate_name,taxes_fees_included,booking_url,metadata_json,observed_at)
            VALUES (?,?,'booking_demand',?,?,?,?,?,?,?,NULL,?,?)`)
            .bind(crypto.randomUUID(),t.hotel_id,rate.nightly_rate,rate.currency,window.checkin,window.checkout,rate.room_type,rate.rate_name,
              rate.taxes_fees_included==null?null:rate.taxes_fees_included?1:0,
              JSON.stringify({provider_hotel_id:mapping.provider_hotel_id,rate_basis:window.basis,raw_total:rate.raw_total,nights:window.nights}),
              nowIso()).run();
          hotelWritten++; observations++;
        }
        if(hotelWritten){
          const latest=await env.DB.prepare("SELECT nightly_rate FROM hotel_rate_observations WHERE hotel_id=? ORDER BY observed_at DESC LIMIT 1").bind(t.hotel_id).first();
          await recomputeHotelValuation(env.DB,t.hotel_id,latest?.nightly_rate??null);
          await finish(env.DB,t.queue_id,"complete");
        }else{
          await finish(env.DB,t.queue_id,"failed",lastError||"no_rate_observation_written"); failures++;
        }
      }catch(e){await finish(env.DB,t.queue_id,"failed",e?.message||e);failures++}
    }
    await refreshHotelEnrichment(env.DB);
    await env.DB.prepare("UPDATE hotel_rate_sync_runs SET status='success',hotels_claimed=?,observations_written=?,mappings_created=?,failures=?,finished_at=? WHERE id=?")
      .bind(tasks.length,observations,mappings,failures,nowIso(),runId).run();
    return {ok:true,claimed:tasks.length,observations_written:observations,mappings_created:mappings,failures};
  }catch(e){
    await env.DB.prepare("UPDATE hotel_rate_sync_runs SET status='failed',hotels_claimed=?,observations_written=?,mappings_created=?,failures=?,note=?,finished_at=? WHERE id=?")
      .bind(tasks.length,observations,mappings,failures,String(e?.message||e).slice(0,1000),nowIso(),runId).run();
    throw e;
  }
}
