import { refreshHotelEnrichment } from "./enrichment.js";

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
  const model=String(env.EXTERNAL_EVIDENCE_MODEL||"gpt-5.5").trim();
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
        tools:[{type:"web_search",search_context_size:"low",filters:{blocked_domains:[...new Set(blocked)]}}],
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
      if(!normalized||!cited.has(normalized))continue;
      signals.push({...s,source_url:normalized});
    }
    return {ok:true,signals,response_id:data.id||null,model};
  }catch(e){
    return {ok:false,error:String(e?.name==="AbortError"?"timeout":e?.message||e).slice(0,1000)};
  }finally{clearTimeout(timer)}
}

async function claimTasks(db,limit){
  const rows=(await db.prepare(`SELECT q.id queue_id,q.status queue_status,q.attempts,q.priority,h.id hotel_id,h.name,h.city,h.country,h.website
    FROM hotel_enrichment_queue q
    JOIN hotels h ON h.id=q.hotel_id
    JOIN hotel_enrichment_profiles p ON p.hotel_id=h.id AND p.cohort='priority_250'
    WHERE q.task_type='external_evidence' AND (
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

async function writeSignal(db,hotelId,signal,meta){
  const url=safeUrl(signal.source_url); if(!url)return 0;
  const id=crypto.randomUUID(),now=nowIso();
  const result=await db.prepare(`INSERT INTO hotel_external_evidence
    (id,hotel_id,provider,source_url,source_domain,source_title,evidence_type,sentiment,summary,attributes_json,best_for_json,avoid_if_json,tradeoffs_json,price_mentioned,trip_context,confidence,observed_at,metadata_json,created_at,updated_at)
    VALUES (?,?,'openai_web_search',?,?,?,'traveler_experience',?,?,?,?,?,?,?,?,?,?,?, ?,?)
    ON CONFLICT(hotel_id,provider,source_url) DO UPDATE SET
      source_title=excluded.source_title,sentiment=excluded.sentiment,summary=excluded.summary,
      attributes_json=excluded.attributes_json,best_for_json=excluded.best_for_json,avoid_if_json=excluded.avoid_if_json,
      tradeoffs_json=excluded.tradeoffs_json,price_mentioned=excluded.price_mentioned,trip_context=excluded.trip_context,
      confidence=excluded.confidence,observed_at=excluded.observed_at,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at`)
    .bind(id,hotelId,signal.source_url,url.hostname,signal.source_title,signal.sentiment,signal.summary,
      JSON.stringify(signal.attributes||[]),JSON.stringify(signal.best_for||[]),JSON.stringify(signal.avoid_if||[]),JSON.stringify(signal.tradeoffs||[]),
      signal.price_mentioned==null?null:Number(signal.price_mentioned),signal.trip_context||null,signal.confidence||"low",now,JSON.stringify(meta||{}),now,now).run();
  await db.prepare(`INSERT INTO hotel_field_provenance
    (id,hotel_id,field_name,source_type,source_url,source_label,confidence,observed_at,verified_at,metadata_json,created_at,updated_at)
    VALUES (?,?,'external_evidence','openai_web_search',?,?,?,?,NULL,?,?,?)
    ON CONFLICT(hotel_id,field_name,source_type,source_url) DO UPDATE SET
      source_label=excluded.source_label,confidence=excluded.confidence,observed_at=excluded.observed_at,
      metadata_json=excluded.metadata_json,updated_at=excluded.updated_at`)
    .bind(crypto.randomUUID(),hotelId,signal.source_url,signal.source_title||url.hostname,signal.confidence||"low",now,
      JSON.stringify({provider:"openai_web_search"}),now,now).run();
  return Number(result.meta?.changes||0)>0?1:0;
}

export async function drainExternalEvidenceQueue(env,{limit=2}={}){
  if(!String(env.OPENAI_API_KEY||"").trim())return {ok:false,skipped:true,reason:"openai_not_configured"};
  const runId=crypto.randomUUID(),started=nowIso();
  await env.DB.prepare("INSERT INTO hotel_evidence_sync_runs (id,provider,status,started_at) VALUES (?,'openai_web_search','running',?)").bind(runId,started).run();
  const tasks=await claimTasks(env.DB,limit);
  let written=0,failures=0;
  try{
    for(const t of tasks){
      try{
        const research=await researchHotel(env,{name:t.name,city:t.city,country:t.country,website:t.website});
        if(!research.ok){await finish(env.DB,t.queue_id,"failed",research.error);failures++;continue}
        let hotelWritten=0;
        for(const signal of research.signals){
          hotelWritten+=await writeSignal(env.DB,t.hotel_id,signal,{model:research.model,response_id:research.response_id});
        }
        if(hotelWritten>0){written+=hotelWritten;await finish(env.DB,t.queue_id,"complete")}
        else{await finish(env.DB,t.queue_id,"failed","no_citable_independent_evidence");failures++}
      }catch(e){await finish(env.DB,t.queue_id,"failed",e?.message||e);failures++}
    }
    await refreshHotelEnrichment(env.DB);
    await env.DB.prepare("UPDATE hotel_evidence_sync_runs SET status='success',hotels_claimed=?,evidence_written=?,failures=?,finished_at=? WHERE id=?")
      .bind(tasks.length,written,failures,nowIso(),runId).run();
    return {ok:true,claimed:tasks.length,evidence_written:written,failures};
  }catch(e){
    await env.DB.prepare("UPDATE hotel_evidence_sync_runs SET status='failed',hotels_claimed=?,evidence_written=?,failures=?,note=?,finished_at=? WHERE id=?")
      .bind(tasks.length,written,failures,String(e?.message||e).slice(0,1000),nowIso(),runId).run();
    throw e;
  }
}
