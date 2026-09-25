const safeUrl=(v)=>{try{const u=new URL(String(v||""));return ["http:","https:"].includes(u.protocol)?u:null}catch{return null}};
const norm=(v="")=>String(v).normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/&/g," and ").replace(/[^a-z0-9]+/g," ").trim();
const words=(v)=>new Set(norm(v).split(/\s+/).filter(Boolean).filter(x=>x!=="the"));

export function nameSimilarity(a,b){
  const na=norm(a),nb=norm(b);
  if(!na||!nb)return 0;
  if(na===nb)return 1;
  const A=words(a),B=words(b),inter=[...A].filter(x=>B.has(x)).length,union=new Set([...A,...B]).size;
  const jac=union?inter/union:0,containment=Math.min(A.size,B.size)?inter/Math.min(A.size,B.size):0;
  return Math.max(jac,containment*0.9);
}

export function haversineKm(aLat,aLng,bLat,bLng){
  const vals=[aLat,aLng,bLat,bLng].map(Number); if(vals.some(x=>!Number.isFinite(x)))return null;
  const [la1,lo1,la2,lo2]=vals.map(x=>x*Math.PI/180),dlat=la2-la1,dlon=lo2-lo1;
  const h=Math.sin(dlat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dlon/2)**2;
  return 6371*2*Math.asin(Math.sqrt(h));
}

function coords(item){
  const c=item?.gps_coordinates||item?.coordinates||{};
  return {lat:Number(c.latitude??item?.latitude),lng:Number(c.longitude??item?.longitude)};
}

export function matchSerpHotelCandidate(hotel,items=[]){
  const ranked=items.map(item=>{
    const name=String(item?.name||"").trim(),id=String(item?.property_token||"").trim(),c=coords(item);
    const distance=haversineKm(hotel.lat,hotel.lng,c.lat,c.lng),similarity=nameSimilarity(hotel.name,name);
    const score=similarity-(distance==null?0.1:Math.min(distance/4,0.28));
    return {item,id,name,similarity,distance,score};
  }).filter(x=>x.name&&x.id).sort((a,b)=>b.score-a.score);
  const best=ranked[0]; if(!best)return null;
  const accepted=best.similarity>=0.7 || (best.similarity>=0.5&&best.distance!=null&&best.distance<=0.15);
  if(!accepted)return null;
  return {...best,confidence:best.similarity>=0.84&&(best.distance==null||best.distance<=0.25)?"high":"medium"};
}

export function serpHotelCandidates(payload){
  const out=[];
  if(payload&&payload.name&&payload.property_token)out.push(payload);
  for(const key of ["properties","ads"]){
    for(const x of Array.isArray(payload?.[key])?payload[key]:[])out.push(x);
  }
  return out;
}

function num(v){const n=Number(v);return Number.isFinite(n)&&n>0?n:null}

export function extractSerpHotelRate(item,nights=1,currency="USD"){
  if(!item)return null;
  const nightly=num(item?.rate_per_night?.extracted_lowest)??num(item?.extracted_price);
  const total=num(item?.total_rate?.extracted_lowest);
  const value=nightly??(total!=null?total/Math.max(Number(nights)||1,1):null);
  if(value==null)return null;
  const before=num(item?.rate_per_night?.extracted_before_taxes_fees);
  const sources=(Array.isArray(item?.prices)?item.prices:[]).slice(0,8).map(p=>({
    source:String(p?.source||"").slice(0,120),
    nightly:num(p?.rate_per_night?.extracted_lowest)??num(p?.extracted_price),
    before_taxes_fees:num(p?.rate_per_night?.extracted_before_taxes_fees)
  })).filter(x=>x.source||x.nightly);
  return {
    nightly_rate:value,
    currency:String(currency||"USD").toUpperCase(),
    room_type:null,
    rate_name:"Google Hotels lowest displayed rate",
    taxes_fees_included:before!=null?true:null,
    booking_url:null,
    raw_total:total,
    before_taxes_fees:before,
    price_sources:sources
  };
}

export async function serpapiGet(env,params){
  const key=String(env.SERPAPI_API_KEY||"").trim();
  if(!key)return {ok:false,status:0,error:"serpapi_not_configured"};
  const u=new URL("https://serpapi.com/search.json");
  for(const [k,v] of Object.entries(params||{}))if(v!==undefined&&v!==null&&v!=="")u.searchParams.set(k,String(v));
  u.searchParams.set("api_key",key);
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),20000);
  try{
    const r=await fetch(u.toString(),{signal:ctl.signal,headers:{"accept":"application/json"}});
    let data={};try{data=await r.json()}catch{}
    if(!r.ok||data?.error)return {ok:false,status:r.status,error:String(data?.error||("http_"+r.status)).slice(0,800)};
    return {ok:true,status:r.status,data};
  }catch(e){
    return {ok:false,status:0,error:String(e?.name==="AbortError"?"timeout":e?.message||e).slice(0,800)};
  }finally{clearTimeout(timer)}
}

export async function findSerpHotelProperty(env,hotel,window,propertyToken=null){
  const base={
    engine:"google_hotels",
    q:[hotel.name,hotel.city,hotel.country].filter(Boolean).join(" "),
    gl:String(env.RATE_BOOKER_COUNTRY||"us").toLowerCase(),
    hl:"en",
    currency:String(env.RATE_CURRENCY||"USD").toUpperCase(),
    check_in_date:window.checkin,
    check_out_date:window.checkout,
    adults:2,
    children:0
  };
  let response=await serpapiGet(env,propertyToken?{...base,property_token:propertyToken}:base);
  if(!response.ok)return response;
  let candidates=serpHotelCandidates(response.data);
  let match=propertyToken?candidates.map(item=>({item,id:String(item?.property_token||propertyToken),name:String(item?.name||hotel.name),similarity:nameSimilarity(hotel.name,item?.name||hotel.name),distance:haversineKm(hotel.lat,hotel.lng,coords(item).lat,coords(item).lng),confidence:"high"})).find(x=>x.id===String(propertyToken)):null;
  if(!match)match=matchSerpHotelCandidate(hotel,candidates);
  if(!match&&propertyToken){
    response=await serpapiGet(env,base);
    if(!response.ok)return response;
    candidates=serpHotelCandidates(response.data);
    match=matchSerpHotelCandidate(hotel,candidates);
  }
  if(!match)return {ok:false,error:"serpapi_no_confident_hotel_match"};
  return {ok:true,match,payload:response.data,search_id:response.data?.search_metadata?.id||null};
}

export async function fetchSerpHotelReviews(env,propertyToken){
  const r=await serpapiGet(env,{engine:"google_hotels_reviews",property_token:propertyToken,hl:"en",sort_by:2});
  if(!r.ok)return r;
  return {ok:true,reviews:Array.isArray(r.data?.reviews)?r.data.reviews:[],search_id:r.data?.search_metadata?.id||null};
}

export function canonicalReviewUrl(review,hotel){
  const direct=safeUrl(review?.link);
  if(direct&&direct.hostname&&!/serpapi\.com$/i.test(direct.hostname))return direct.toString();
  const source=String(review?.source||"").toLowerCase();
  if(source==="google"){
    const q=encodeURIComponent([hotel.name,hotel.city,hotel.country].filter(Boolean).join(" "));
    return "https://www.google.com/travel/hotels?q="+q;
  }
  const user=safeUrl(review?.user?.link);
  if(user&&source&&user.hostname&&!/serpapi\.com$/i.test(user.hostname))return user.toString();
  return null;
}

export function reviewGroups(reviews,hotel,{maxReviews=8,maxGroups=4}={}){
  const groups=new Map();
  for(const r of (Array.isArray(reviews)?reviews:[]).slice(0,maxReviews)){
    const snippet=String(r?.snippet||"").trim(); if(snippet.length<25)continue;
    const url=canonicalReviewUrl(r,hotel); if(!url)continue;
    const source=String(r?.source||new URL(url).hostname).slice(0,100);
    const key=url;
    if(!groups.has(key))groups.set(key,{id:"g"+(groups.size+1),source,source_url:url,reviews:[]});
    groups.get(key).reviews.push({
      rating:Number.isFinite(Number(r?.rating))?Number(r.rating):null,
      best_rating:Number.isFinite(Number(r?.best_rating))?Number(r.best_rating):null,
      date:String(r?.date||"").slice(0,80),
      snippet:snippet.slice(0,1600),
      subratings:r?.subratings&&typeof r.subratings==="object"?r.subratings:{},
      highlights:Array.isArray(r?.hotel_highlights)?r.hotel_highlights.slice(0,8):[],
      attributes:Array.isArray(r?.attributes)?r.attributes.slice(0,8).map(a=>({name:String(a?.name||"").slice(0,80),snippet:String(a?.snippet||"").slice(0,500)})):[]
    });
    if(groups.size>=maxGroups&&![...groups.keys()].includes(key))break;
  }
  return [...groups.values()].slice(0,maxGroups);
}
