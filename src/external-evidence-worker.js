import { refreshHotelEnrichment } from "./enrichment.js";
import { findSerpHotelProperty, fetchSerpHotelReviews, reviewGroups } from "./serpapi.js";

const nowIso=()=>new Date().toISOString();
const clamp=(n,min,max)=>Math.min(Math.max(Number(n)||min,min),max);

function safeUrl(v){
  try{const u=new URL(String(v||""));return ["http:","https:"].includes(u.protocol)?u:null}catch{return null}
}
function normalizeUrl(v){
  const u=safeUrl(v); if(!u)return null;
  u.hash=""; for(const k of [...u.searchParams.keys()]) if(/^utm_|^(gclid|fbclid)$/i.test(k))u.searchParams.delete(k);
  return u.toString().replace(/\/$/,"");
}

function blockedSource(v,domains=[]){
  const u=safeUrl(v); if(!u)return true;
  const host=u.hostname.toLowerCase().replace(/^www\./,"");
  return domains.some(d=>host===d||host.endsWith("."+d));
}

export function citationUrls(response){
  const out=new Set();
  for(const item of Array.isArray(response?.output)?response.output:[]){
    if(item?.type==="message"){
      for(const c of Array.isArray(item.content)?item.content:[]){
        for(const a of Array.isArray(c?.annotations)?c.annotations:[]){
          const u=normalizeUrl(a?.url||a?.url_citation?.url); if(u)out.add(u);
        }
      }
    }
    if(item?.type==="web_search_call"){
      for(const s of Array.isArray(item?.action?.sources)?item.action.sources:[]){
        const u=normalizeUrl(s?.url); if(u)out.add(u);
      }
    }
  }
  return out;
}

function outputText(response){
  const chunks=[];
  for(const item of Array.isArray(response?.output)?response.output:[]){
    if(item?.type!=="message")continue;
    for(const c of Array.isArray(item.content)?item.content:[]) if(c?.type==="output_text"&&typeof c.text==="string")chunks.push(c.text);
  }
  return chunks.join("\n").trim();
}

function schema(){
  return {
    type:"object",
    properties:{
      signals:{
        type:"array",
        items:{
          type:"object",
          properties:{
            source_url:{type:"string"},
            source_title:{type:"string"},
            sentiment:{type:"string",enum:["positive","mixed","neutral","negative"]},
            summary:{type:"string"},
            attributes:{type:"array",items:{type:"string"}},
            best_for:{type:"array",items:{type:"string"}},
            avoid_if:{type:"array",items:{type:"string"}},
            tradeoffs:{type:"array",items:{type:"string"}},
            price_mentioned:{anyOf:[{type:"number"},{type:"null"}]},
            trip_context:{type:"string"},
            confidence:{type:"string",enum:["high","medium","low"]}
          },
          required:["source_url","source_title","sentiment","summary","attributes","best_for","avoid_if","tradeoffs","price_mentioned","trip_context","confidence"],
          additionalProperties:false
        }
      }
    },
    required:["signals"],
    additionalProperties:false
  };
}

async function researchHotel(env,hotel){
  const key=String(env.OPENAI_API_KEY||"").trim();
  if(!key)return {ok:false,error:"openai_not_configured"};
  const model=String(env.EXTERNAL_EVIDENCE_MODEL||"gpt-5.6-luna").trim();
  const blocked=["reddit.com"];
  const official=safeUrl(hotel.website); if(official?.hostname)blocked.push(official.hostname.replace(/^www\./,""));
  const prompt=`Search the public web for independent traveler experience evidence about this hotel:
Hotel: ${hotel.name}
Location: ${[hotel.city,hotel.country].filter(Boolean).join(", ")}

Return at most 4 distinct, useful signals from independent sources actually consulted by web search.
Rules:
- Do not use the hotel's official website or official marketing material.
- Do not use Reddit; SecretNests handles its legacy Reddit evidence separately.
- Prefer independent traveler forums, review platforms, or editorial reviews that describe firsthand experience.
- Never copy or quote review text. Paraphrase the evidence into short factual summaries.
- Do not invent prices, sentiment, sources, URLs, or traveler context.
- Do not estimate what the hotel is "worth" and do not create SecretNests first-party valuation data.
- source_url must be the exact URL of a source actually consulted.
- If evidence is weak or ambiguous, return fewer signals or an empty array.`;
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),25000);
  try{
    const r=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{"authorization":"Bearer "+key,"content-type":"application/json"},
      body:JSON.stringify({
        model,
        tools:[{type:"web_search",search_context_size:"low"}],
        include:["web_search_call.action.sources"],
        input:prompt,
        text:{format:{type:"json_schema",name:"hotel_external_evidence",strict:true,schema:schema()}},
        max_output_tokens:1200
      }),
      signal:ctl.signal
    });
    let data={};try{data=await r.json()}catch{}
    if(!r.ok)return {ok:false,error:String(data?.error?.message||data?.error||("http_"+r.status)).slice(0,1000)};
    let parsed; try{parsed=JSON.parse(outputText(data))}catch{return {ok:false,error:"invalid_structured_output"}}
    const cited=citationUrls(data),signals=[];
    for(const s of Array.isArray(parsed?.signals)?parsed.signals.slice(0,4):[]){
      const normalized=normalizeUrl(s.source_url);
      if(!normalized||!cited.has(normalized)||blockedSource(normalized,[...new Set(blocked)]))continue;
      signals.push({...s,source_url:normalized});
    }
    return {ok:true,signals,response_id:data.id||null,model};
  }catch(e){
    return {ok:false,error:String(e?.name==="AbortError"?"timeout":e?.message||e).slice(0,1000)};
  }finally{clearTimeout(timer)}
}

async function claimTasks(db,limit,mode="pilot"){
  const pilot=String(mode||"pilot").toLowerCase()!=="full";
  const rows=(await db.prepare(`SELECT q.id queue_id,q.status queue_status,q.attempts,q.priority,h.id hotel_id,h.name,h.city,h.country,h.website,h.lat,h.lng
    FROM hotel_enrichment_queue q
    JOIN hotels h ON h.id=q.hotel_id
    JOIN hotel_enrichment_profiles p ON p.hotel_id=h.id AND p.cohort='priority_250'
    WHERE q.task_type='external_evidence' ${pilot?"AND p.priority_rank<=10":""} AND (
      q.status='queued'
      OR (q.status='failed' AND q.attempts<3 AND q.updated_at<=datetime('now','-7 days'))
    )
    ORDER BY q.priority,q.updated_at LIMIT ?`).bind(clamp(limit,1,5)).all()).results||[];
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

async function writeSignal(db,hotelId,signal,meta,provider="openai_web_search"){
  const url=safeUrl(signal.source_url); if(!url)return 0;
  const id=crypto.randomUUID(),now=nowIso();
  const result=await db.prepare(`INSERT INTO hotel_external_evidence
    (id,hotel_id,provider,source_url,source_domain,source_title,evidence_type,sentiment,summary,attributes_json,best_for_json,avoid_if_json,tradeoffs_json,price_mentioned,trip_context,confidence,observed_at,metadata_json,created_at,updated_at)
    VALUES (?,?,?, ?,?,?,'traveler_experience',?,?,?,?,?,?,?,?,?,?,?, ?,?)
    ON CONFLICT(hotel_id,provider,source_url) DO UPDATE SET
      source_title=excluded.source_title,sentiment=excluded.sentiment,summary=excluded.summary,
      attributes_json=excluded.attributes_json,best_for_json=excluded.best_for_json,avoid_if_json=excluded.avoid_if_json,
      tradeoffs_json=excluded.tradeoffs_json,price_mentioned=excluded.price_mentioned,trip_context=excluded.trip_context,
      confidence=excluded.confidence,observed_at=excluded.observed_at,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at`)
    .bind(id,hotelId,provider,signal.source_url,url.hostname,signal.source_title,signal.sentiment,signal.summary,
      JSON.stringify(signal.attributes||[]),JSON.stringify(signal.best_for||[]),JSON.stringify(signal.avoid_if||[]),JSON.stringify(signal.tradeoffs||[]),
      signal.price_mentioned==null?null:Number(signal.price_mentioned),signal.trip_context||null,signal.confidence||"low",now,JSON.stringify(meta||{}),now,now).run();
  await db.prepare(`INSERT INTO hotel_field_provenance
    (id,hotel_id,field_name,source_type,source_url,source_label,confidence,observed_at,verified_at,metadata_json,created_at,updated_at)
    VALUES (?,?,'external_evidence',?,?,?,?,?,NULL,?,?,?)
    ON CONFLICT(hotel_id,field_name,source_type,source_url) DO UPDATE SET
      source_label=excluded.source_label,confidence=excluded.confidence,observed_at=excluded.observed_at,
      metadata_json=excluded.metadata_json,updated_at=excluded.updated_at`)
    .bind(crypto.randomUUID(),hotelId,provider,signal.source_url,signal.source_title||url.hostname,signal.confidence||"low",now,
      JSON.stringify({provider}),now,now).run();
  return Number(result.meta?.changes||0)>0?1:0;
}


function evidenceWindow(base=new Date()){
  const checkin=new Date(base);checkin.setUTCDate(checkin.getUTCDate()+21);
  const checkout=new Date(checkin);checkout.setUTCDate(checkout.getUTCDate()+2);
  return {checkin:checkin.toISOString().slice(0,10),checkout:checkout.toISOString().slice(0,10),nights:2};
}

async function serpMapping(db,hotelId){
  return db.prepare("SELECT * FROM hotel_provider_mappings WHERE hotel_id=? AND provider='serpapi_google_hotels' AND status='active'").bind(hotelId).first();
}

async function ensureSerpMapping(env,hotel){
  let mapping=await serpMapping(env.DB,hotel.id);
  if(mapping)return {ok:true,property_token:mapping.provider_hotel_id};
  const found=await findSerpHotelProperty(env,hotel,evidenceWindow(),null);
  if(!found.ok)return found;
  const now=nowIso();
  await env.DB.prepare(`INSERT INTO hotel_provider_mappings
    (id,hotel_id,provider,provider_hotel_id,status,confidence,source_url,metadata_json,created_at,updated_at)
    VALUES (?,?,'serpapi_google_hotels',?,'active',?,NULL,?,?,?)
    ON CONFLICT(hotel_id,provider) DO UPDATE SET provider_hotel_id=excluded.provider_hotel_id,status='active',
      confidence=excluded.confidence,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at`)
    .bind(crypto.randomUUID(),hotel.id,found.match.id,found.match.confidence||"medium",
      JSON.stringify({matched_name:found.match.name,similarity:found.match.similarity,distance_km:found.match.distance}),now,now).run();
  return {ok:true,property_token:found.match.id};
}

function workersEvidenceSchema(){
  return {
    type:"object",
    properties:{
      signals:{
        type:"array",
        items:{
          type:"object",
          properties:{
            source_group_id:{type:"string"},
            sentiment:{type:"string",enum:["positive","mixed","neutral","negative"]},
            summary:{type:"string"},
            attributes:{type:"array",items:{type:"string"}},
            best_for:{type:"array",items:{type:"string"}},
            avoid_if:{type:"array",items:{type:"string"}},
            tradeoffs:{type:"array",items:{type:"string"}},
            price_mentioned:{anyOf:[{type:"number"},{type:"null"}]},
            trip_context:{type:"string"},
            confidence:{type:"string",enum:["high","medium","low"]}
          },
          required:["source_group_id","sentiment","summary","attributes","best_for","avoid_if","tradeoffs","price_mentioned","trip_context","confidence"],
          additionalProperties:false
        }
      }
    },
    required:["signals"],
    additionalProperties:false
  };
}

async function researchHotelWithSerp(env,hotel){
  if(!String(env.SERPAPI_API_KEY||"").trim())return {ok:false,error:"serpapi_not_configured"};
  if(!env.AI||typeof env.AI.run!=="function")return {ok:false,error:"workers_ai_not_configured"};
  const mapping=await ensureSerpMapping(env,hotel);
  if(!mapping.ok)return mapping;
  const reviewResult=await fetchSerpHotelReviews(env,mapping.property_token);
  if(!reviewResult.ok)return reviewResult;
  const groups=reviewGroups(reviewResult.reviews,hotel,{maxReviews:10,maxGroups:4});
  if(!groups.length)return {ok:false,error:"serpapi_reviews_no_citable_groups"};
  const model=String(env.WORKERS_AI_EVIDENCE_MODEL||"@cf/meta/llama-3.3-70b-instruct-fp8-fast");
  const input=groups.map(g=>({source_group_id:g.id,source:g.source,source_url:g.source_url,reviews:g.reviews}));
  const prompt=`Hotel: ${hotel.name}
Location: ${[hotel.city,hotel.country].filter(Boolean).join(", ")}

Below are recent traveler reviews grouped by their verifiable source URL. Convert them into concise structured traveler evidence.
Rules:
- Return at most one signal per source_group_id.
- Use only facts explicitly supported by the supplied reviews.
- Paraphrase; never quote or closely reproduce review wording.
- Do not estimate SecretNests fair value or willingness-to-pay.
- Only include price_mentioned when a review explicitly states a numeric price.
- Treat disagreement across reviews as mixed sentiment/tradeoffs rather than choosing a side.
- Do not output names of reviewers.
- source_group_id must exactly match one of the supplied IDs.

Evidence groups:
${JSON.stringify(input)}`;
  let result;
  try{
    result=await env.AI.run(model,{
      messages:[
        {role:"system",content:"You structure independent hotel traveler evidence conservatively. Never invent facts."},
        {role:"user",content:prompt}
      ],
      response_format:{type:"json_schema",json_schema:workersEvidenceSchema()},
      temperature:0.1,
      max_tokens:1200
    });
  }catch(e){return {ok:false,error:"workers_ai_"+String(e?.message||e).slice(0,700)}}
  const raw=result?.response??result;
  let parsed;
  try{parsed=typeof raw==="string"?JSON.parse(raw):raw}catch{return {ok:false,error:"workers_ai_invalid_json"}}
  const byId=new Map(groups.map(g=>[g.id,g])),signals=[];
  for(const x of Array.isArray(parsed?.signals)?parsed.signals.slice(0,4):[]){
    const group=byId.get(String(x.source_group_id||""));if(!group)continue;
    signals.push({
      source_url:group.source_url,
      source_title:(group.source||"Traveler reviews")+" traveler reviews",
      sentiment:x.sentiment,
      summary:String(x.summary||"").slice(0,700),
      attributes:Array.isArray(x.attributes)?x.attributes.slice(0,12):[],
      best_for:Array.isArray(x.best_for)?x.best_for.slice(0,8):[],
      avoid_if:Array.isArray(x.avoid_if)?x.avoid_if.slice(0,8):[],
      tradeoffs:Array.isArray(x.tradeoffs)?x.tradeoffs.slice(0,8):[],
      price_mentioned:x.price_mentioned==null?null:Number(x.price_mentioned),
      trip_context:String(x.trip_context||"").slice(0,250),
      confidence:x.confidence||"low",
      source_group_id:group.id,
      source:group.source
    });
  }
  return {ok:true,signals,model,search_id:reviewResult.search_id,property_token:mapping.property_token};
}

export async function drainExternalEvidenceQueue(env,{limit=2}={}){
  const useSerp=Boolean(String(env.SERPAPI_API_KEY||"").trim()&&env.AI&&typeof env.AI.run==="function");
  const useOpenAI=Boolean(String(env.OPENAI_API_KEY||"").trim());
  if(!useSerp&&!useOpenAI)return {ok:false,skipped:true,reason:"evidence_provider_not_configured",providers:["serpapi_workers_ai","openai_web_search"]};
  const provider=useSerp?"serpapi_workers_ai":"openai_web_search";
  const runId=crypto.randomUUID(),started=nowIso();
  await env.DB.prepare("INSERT INTO hotel_evidence_sync_runs (id,provider,status,started_at) VALUES (?,?, 'running',?)").bind(runId,provider,started).run();
  const mode=String(env.MARKET_INTELLIGENCE_MODE||"pilot").toLowerCase()==="full"?"full":"pilot";
  const tasks=await claimTasks(env.DB,limit,mode);
  let written=0,failures=0;
  try{
    for(const t of tasks){
      try{
        const hotel={id:t.hotel_id,name:t.name,city:t.city,country:t.country,website:t.website,lat:t.lat,lng:t.lng};
        const research=useSerp?await researchHotelWithSerp(env,hotel):await researchHotel(env,hotel);
        if(!research.ok){await finish(env.DB,t.queue_id,"failed",research.error);failures++;continue}
        let hotelWritten=0;
        for(const signal of research.signals){
          const meta=useSerp
            ?{model:research.model,serpapi_search_id:research.search_id,provider_hotel_id:research.property_token,source_group_id:signal.source_group_id,source:signal.source}
            :{model:research.model,response_id:research.response_id};
          hotelWritten+=await writeSignal(env.DB,t.hotel_id,signal,meta,provider);
        }
        if(hotelWritten>0){written+=hotelWritten;await finish(env.DB,t.queue_id,"complete")}
        else{await finish(env.DB,t.queue_id,"failed","no_citable_independent_evidence");failures++}
      }catch(e){await finish(env.DB,t.queue_id,"failed",e?.message||e);failures++}
    }
    await refreshHotelEnrichment(env.DB);
    await env.DB.prepare("UPDATE hotel_evidence_sync_runs SET status='success',hotels_claimed=?,evidence_written=?,failures=?,finished_at=? WHERE id=?")
      .bind(tasks.length,written,failures,nowIso(),runId).run();
    return {ok:true,provider,mode,claimed:tasks.length,evidence_written:written,failures};
  }catch(e){
    await env.DB.prepare("UPDATE hotel_evidence_sync_runs SET status='failed',hotels_claimed=?,evidence_written=?,failures=?,note=?,finished_at=? WHERE id=?")
      .bind(tasks.length,written,failures,String(e?.message||e).slice(0,1000),nowIso(),runId).run();
    throw e;
  }
}
