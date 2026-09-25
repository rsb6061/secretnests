import { refreshHotelEnrichment } from "./enrichment.js";

const nowIso=()=>new Date().toISOString();

function safeHttpUrl(value){
  try{
    const u=new URL(String(value||"").trim());
    if(!["http:","https:"].includes(u.protocol))return null;
    const host=u.hostname.toLowerCase();
    if(host==="localhost"||host==="127.0.0.1"||host==="::1"||host.endsWith(".local"))return null;
    return u;
  }catch{return null}
}

function absolutize(base,href){
  try{return new URL(href,base).toString()}catch{return null}
}

function stripHtml(s=""){
  return String(s).replace(/<script\\b[^>]*>[\\s\\S]*?<\\/script>/gi," ")
    .replace(/<style\\b[^>]*>[\\s\\S]*?<\\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;/gi,"'")
    .replace(/\\s+/g," ").trim();
}

function extractJsonLd(html){
  const out=[];
  const re=/<script[^>]+type=["']application\\/ld\\+json[#'][^>]*>([\\s\\S]*?)<\\/script>/gi;
  let m;
  while((m=re.exec(html))&&out.length<20){
    try{
      const parsed=JSON.parse(m[1].trim());
      if(Array.isArray(parsed))out.push(...parsed);
      else if(parsed?.["@graph"]&&Array.isArray(parsed["@graph"]))out.push(...parsed["@graph"]);
      else out.push(parsed);
    }catch{}
  }
  return out.filter(Boolean);
}

function findHotelNode(nodes=[]){
  return nodes.find(n=>{
    const t=n?.["@type"];
    const types=Array.isArray(t)?t:[t];
    return types.some(x=>["Hotel","Resort","LodgingBusiness"].includes(String(x)));
  })||null;
}

function extractMeta(html,name){
  const escaped=String(name).replace(/[.*+?^$()|[\\]\\\\]/g,"\\\\$&");
  const a=new RegExp('<meta[^>]+(?:name|property)=["\\\']'+escaped+'["\\\'][^>]+content=["\\\']([^"\\\']+)["\\\']','i').exec(html);
  const b=new RegExp('<meta[^>]+content=["\\\']([^"\\\']+)["\\\'][^>]+(?:name|property)=["\\\']'+escaped+'["\\\']','i').exec(html);
  return (a?.[1]||b?.[1]||"").trim()||null;
}

function extractLinks(html,base){
  const out=[];
  const re=/<a\\b[^>]*href=["']([^"'#]+)["'][^>]*>([\\s\\S]*?)<\\/a>/gi;
  let m;
  while((m=re.exec(html))&&out.length<1000){
    const url=absolutize(base,m[1]); if(!url)continue;
    out.push({url,text:stripHtml(m[2]).slice(0,160)});
  }
  return out;
}

function normalizePhone(v){
  const s=String(v||"").trim();
  return s&&/[0-9]{6}/.test(s)?s.slice(0,80):null;
}

function deriveOfficialFacts(html,url){
  const nodes=extractJsonLd(html),hotel=findHotelNode(nodes);
  const address=hotel?.address&&typeof hotel.address==="object"?hotel.address:{};
  const geo=hotel?.geo&&typeof hotel.geo==="object"?hotel.geo:{};
  const fields={};
  const city=address.addressLocality||null;
  if(city)fields.city=String(city).slice(0,120);
  if(address.addressRegion)fields.region=String(address.addressRegion).slice(0,120);
  if(address.addressCountry){
    const country=typeof address.addressCountry==="object"?(address.addressCountry.name||address.addressCountry["@id"]):address.addressCountry;
    if(country)fields.country=String(country).slice(0,120);
  }
  const formatted=[address.streetAddress,address.addressLocality,address.addressRegion,address.postalCode,address.addressCountry&&typeof address.addressCountry!=="object"?address.addressCountry:null].filter(Boolean).join(", ");
  if(formatted)fields.formatted_address=formatted.slice(0,500);
  const phone=normalizePhone(hotel?.telephone);
  if(phone)fields.phone=phone;
  const site=safeHttpUrl(hotel?.url||url);
  if(site)fields.website=site.toString();
  const lat=Number(geo.latitude),lng=Number(geo.longitude);
  if(Number.isFinite(lat)&&lat>=-90&&lat<=90)fields.lat=lat;
  if(Number.isFinite(lng)&&lng>=-180&&lng<=180)fields.lng=lng;
  const description=hotel?.description||extractMeta(html,"description")||extractMeta(html,"og:description");
  if(description&&stripHtml(description).length>=40)fields.description=stripHtml(description).slice(0,1200);
  const t=hotel?.["@type"];
  const types=Array.isArray(t)?t:[t];
  if(types.some(x=>String(x)==="Resort"))fields.hotel_category="resort";
  else if(types.some(x=>["Hotel","LodgingBusiness"].includes(String(x))))fields.hotel_category="hotel";
  return fields;
}

function chooseBookingLink(links=[],baseUrl){
  const base=safeHttpUrl(baseUrl);
  const candidates=links.map(l=>({l,score:
    (/\\b(book|booking|reserve|reservation|rooms|availability)\\b/i.test(l.text)?4:0)+
    (/\\b(book|booking|reserve|reservation|availability)\\b/i.test(l.url)?5:0)+
    (base&&safeHttpUrl(l.url)?.hostname===base.hostname?2:0)
  })).filter(x=>x.score>=5).sort((a,b)=>b.score-a.score);
  return candidates[0]?.l?.url||null;
}

function choosePressPage(links=[],baseUrl){
  const base=safeHttpUrl(baseUrl);
  const candidates=links.map(l=>({l,score:
    (/\\b(press|media|newsroom|media center|press room|brand assets|gallery)\\b/i.test(l.text)?5:0)+
    (/\\b(press|media|newsroom|press-room|media-center|gallery)\\b/i.test(l.url)?5:0)+
    (base&&safeHttpUrl(l.url)?.hostname===base.hostname?2:0)
  })).filter(x=>x.score>=5).sort((a,b)=>b.score-a.score);
  return candidates[0]?.l?.url||null;
}

async function provenance(db,hotelId,field,sourceUrl,label,confidence="medium",metadata={}){
  await db.prepare(`INSERT INTO hotel_field_provenance
    (id,hotel_id,field_name,source_type,source_url,source_label,confidence,observed_at,verified_at,metadata_json,created_at,updated_at)
    VALUES (?,?,?,'official_hotel_site',?,?,?,?,?,?,?,?)
    ON CONFLICT(hotel_id,field_name,source_type,source_url) DO UPDATE SET
      source_label=excluded.source_label,confidence=excluded.confidence,observed_at=excluded.observed_at,
      verified_at=excluded.verified_at,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at`)
    .bind(crypto.randomUUID(),hotelId,field,sourceUrl,label,confidence,nowIso(),nowIso(),JSON.stringify(metadata||{}),nowIso(),nowIso()).run();
}

async function finish(db,id,status,error=null){
  await db.prepare("UPDATE hotel_enrichment_queue SET status=?,attempts=attempts+1,last_error=?,locked_at=NULL,updated_at=? WHERE id=?")
    .bind(status,error?String(error).slice(0,1000):null,nowIso(),id).run();
}

async function claimTasks(db,limit=8){
  const rows=(await db.prepare(`SELECT q.id queue_id,q.hotel_id,q.task_type,q.priority,h.name,h.website,h.city,h.country,h.booking_url
    FROM hotel_enrichment_queue q JOIN hotels h ON h.id=q.hotel_id
    WHERE q.status='queued' AND q.task_type IN ('facts_core','city_review','booking_link','licensed_hero')
    ORDER BY q.priority,q.updated_at LIMIT ?`).bind(Math.min(Math.max(Number(limit)||8,1),20)).all()).results||[];
  const claimed=[];
  for(const r of rows){
    const out=await db.prepare("UPDATE hotel_enrichment_queue SET status='working',locked_at=?,updated_at=? WHERE id=? AND status='queued'")
      .bind(nowIso(),nowIso(),r.queue_id).run();
    if(Number(out.meta?.changes||0)>0)claimed.push(r);
  }
  return claimed;
}

async function fetchOfficial(url){
  const u=safeHttpUrl(url); if(!u)return {ok:false,error:"missing_or_invalid_official_url"};
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),10000);
  try{
    const r=await fetch(u,{redirect:"follow",headers:{"user-agent":"SecretNestsBot/1.0 (+https://secretnests.com)"},signal:ctl.signal});
    if(!r.ok)return {ok:false,error:"http_"+r.status};
    const type=r.headers.get("content-type")||"";
    if(!type.includes("text/html"))return {ok:false,error:"non_html"};
    const html=(await r.text()).slice(0,2000000);
    return {ok:true,url:r.url||u.toString(),html};
  }catch(e){return {ok:false,error:String(e?.name==="AbortError"?"timeout":e?.message||e).slice(0,300)}}
  finally{clearTimeout(timer)}
}

export async function drainOfficialHotelQueue(env,{limit=8}={}){
  const db=env.DB;
  const tasks=await claimTasks(db,limit);
  let complete=0,failed=0,skipped=0;
  for(const t of tasks){
    try{
      if(!t.website){
        await finish(db,t.queue_id,"failed","official_website_missing");
        failed++; continue;
      }
      const page=await fetchOfficial(t.website);
      if(!page.ok){
        await finish(db,t.queue_id,"failed",page.error);
        failed++; continue;
      }
      const links=extractLinks(page.html,page.url);
      if(t.task_type==="facts_core"||t.task_type==="city_review"){
        const fields=deriveOfficialFacts(page.html,page.url);
        const updates=[],values=[];
        for(const [k,v] of Object.entries(fields)){
          if(t.task_type==="city_review"&&k!=="city"&&k!=="region"&&k!=="country")continue;
          if(k==="description"&&v.length<40)continue;
          updates.push(k+"=?");values.push(v);
        }
        if(updates.length){
          values.push(nowIso(),t.hotel_id);
          await db.prepare("UPDATE hotels SET "+updates.join(",")+",updated_at=? WHERE id=?").bind(...values).run();
          for(const k of updates.map(x=>x.split("=")[0])) await provenance(db,t.hotel_id,k,page.url,"Official hotel site");
          await finish(db,t.queue_id,"complete"); complete++;
        }else{
          await finish(db,t.queue_id,"failed","no_supported_official_facts_found"); failed++;
        }
      }else if(t.task_type==="booking_link"){
        const booking=chooseBookingLink(links,page.url)||t.booking_url;
        if(!booking){
          await finish(db,t.queue_id,"failed","no_booking_link_discovered"); failed++; continue;
        }
        await db.prepare("INSERT INTO hotel_booking_links (id,hotel_id,provider_id,destination_url,priority,enabled,metadata_json,created_at,updated_at) VALUES (?,?,'direct',?,10,1,?,?,?) ON CONFLICT(hotel_id,provider_id,destination_url) DO UPDATE SET enabled=1,priority=MIN(priority,10),updated_at=excluded.updated_at")
          .bind(crypto.randomUUID(),t.hotel_id,booking,JSON.stringify({source:"official_site_discovery",source_url:page.url}),nowIso(),nowIso()).run();
        await provenance(db,t.hotel_id,"booking_url",page.url,"Official hotel site","high",{destination_url:booking});
        await finish(db,t.queue_id,"complete"); complete++;
      }else if(t.task_type==="licensed_hero"){
        const press=choosePressPage(links,page.url);
        if(!press){
          await finish(db,t.queue_id,"failed","no_press_or_media_page_discovered"); failed++; continue;
        }
        await db.prepare(`INSERT INTO media_ingest_requests
          (id,hotel_id,source_type,source_url,source_provider,proposed_rights_status,permission_reference,attribution_text,status,created_at)
          VALUES (?,?,'hotel_press_page',?,'official_hotel_site','needs_review',NULL,NULL,'pending',?)`)
          .bind(crypto.randomUUID(),t.hotel_id,press,nowIso()).run();
        await provenance(db,t.hotel_id,"licensed_hero_candidate",page.url,"Official hotel site","medium",{press_page:press});
        await finish(db,t.queue_id,"complete"); complete++;
      }else{
        await finish(db,t.queue_id,"queued"); skipped++;
      }
    }catch(e){
      await finish(db,t.queue_id,"failed",e?.message||e); failed++;
    }
  }
  await refreshHotelEnrichment(db);
  return {ok:true,claimed:tasks.length,complete,failed,skipped};
}
