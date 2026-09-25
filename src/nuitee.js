const nowIso=()=>new Date().toISOString();

function config(env){
  const key=String(env.NUITEE_API_KEY||"").trim();
  return {
    key,
    baseUrl:String(env.NUITEE_BASE_URL||"https://api.liteapi.travel/v3.0").replace(/\/$/,""),
    environment:key.startsWith("sand_")?"sandbox":key.startsWith("prod_")?"production":"unknown",
    currency:String(env.RATE_CURRENCY||"USD").toUpperCase(),
    nationality:String(env.RATE_GUEST_NATIONALITY||"US").toUpperCase()
  };
}

export function nuiteeEnvironment(env){return config(env).environment;}

async function request(env,path,{method="GET",query=null,body=null,timeoutMs=18000}={}){
  const cfg=config(env);
  if(!cfg.key)return {ok:false,status:0,error:"nuitee_not_configured"};
  const u=new URL(cfg.baseUrl+path);
  for(const [k,v] of Object.entries(query||{}))if(v!==undefined&&v!==null&&v!=="")u.searchParams.set(k,String(v));
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeoutMs);
  try{
    const r=await fetch(u.toString(),{
      method,
      headers:{"X-API-Key":cfg.key,"accept":"application/json",...(body?{"content-type":"application/json"}:{})},
      body:body?JSON.stringify(body):undefined,
      signal:ctl.signal
    });
    let data={};try{data=await r.json()}catch{}
    if(!r.ok)return {ok:false,status:r.status,error:String(data?.error?.message||data?.message||data?.error||("http_"+r.status)).slice(0,800),data};
    return {ok:true,status:r.status,data};
  }catch(e){
    return {ok:false,status:0,error:String(e?.name==="AbortError"?"timeout":e?.message||e).slice(0,800)};
  }finally{clearTimeout(timer)}
}

function norm(v=""){
  return String(v).normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
    .replace(/&/g," and ").replace(/[^a-z0-9]+/g," ").trim();
}
function words(v){return new Set(norm(v).split(/\s+/).filter(Boolean).filter(x=>x!=="the"));}
export function nameSimilarity(a,b){
  const na=norm(a),nb=norm(b);if(!na||!nb)return 0;if(na===nb)return 1;
  const A=words(a),B=words(b),inter=[...A].filter(x=>B.has(x)).length,union=new Set([...A,...B]).size;
  const jac=union?inter/union:0,containment=Math.min(A.size,B.size)?inter/Math.min(A.size,B.size):0;
  return Math.max(jac,containment*0.9);
}
export function haversineKm(aLat,aLng,bLat,bLng){
  const vals=[aLat,aLng,bLat,bLng].map(Number);if(vals.some(x=>!Number.isFinite(x)))return null;
  const [la1,lo1,la2,lo2]=vals.map(x=>x*Math.PI/180),dlat=la2-la1,dlon=lo2-lo1;
  const h=Math.sin(dlat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dlon/2)**2;
  return 6371*2*Math.asin(Math.sqrt(h));
}
function candidates(payload){
  if(Array.isArray(payload?.data))return payload.data;
  if(Array.isArray(payload?.hotels))return payload.hotels;
  if(Array.isArray(payload))return payload;
  return [];
}
function hotelId(x){return String(x?.id??x?.hotelId??x?.hotel_id??"").trim();}
function coords(x){
  const l=x?.location||x?.coordinates||x?.gps_coordinates||{};
  return {lat:Number(x?.latitude??l?.latitude??l?.lat),lng:Number(x?.longitude??l?.longitude??l?.lng)};
}
export function matchNuiteeCandidate(hotel,items=[]){
  const ranked=items.map(item=>{
    const id=hotelId(item),name=String(item?.name??item?.hotelName??"").trim(),c=coords(item);
    const distance=haversineKm(hotel.lat,hotel.lng,c.lat,c.lng),similarity=nameSimilarity(hotel.name,name);
    const score=similarity-(distance==null?0.12:Math.min(distance/4,0.3));
    return {item,id,name,similarity,distance,score};
  }).filter(x=>x.id&&x.name).sort((a,b)=>b.score-a.score);
  const best=ranked[0];if(!best)return null;
  const accepted=best.similarity>=0.7||(best.similarity>=0.52&&best.distance!=null&&best.distance<=0.2);
  if(!accepted)return null;
  return {...best,confidence:best.similarity>=0.84&&(best.distance==null||best.distance<=0.3)?"high":"medium"};
}

export async function findNuiteeHotel(env,hotel){
  const q={hotelName:hotel.name,limit:50,language:"en",timeout:6};
  if(Number.isFinite(Number(hotel.lat))&&Number.isFinite(Number(hotel.lng))){
    q.latitude=Number(hotel.lat);q.longitude=Number(hotel.lng);q.radius=3000;
  }else{
    if(hotel.city)q.cityName=hotel.city;
    if(/^[A-Za-z]{2}$/.test(String(hotel.country||"")))q.countryCode=String(hotel.country).toUpperCase();
  }
  const r=await request(env,"/data/hotels",{query:q});
  if(!r.ok)return r;
  const match=matchNuiteeCandidate(hotel,candidates(r.data));
  if(!match)return {ok:false,error:"nuitee_no_confident_hotel_match",candidate_count:candidates(r.data).length};
  return {ok:true,match,environment:config(env).environment};
}

function num(v){const n=Number(v);return Number.isFinite(n)&&n>0?n:null;}
function money(v,currency){
  if(Array.isArray(v)){
    const same=v.find(x=>String(x?.currency||"").toUpperCase()===String(currency||"").toUpperCase())||v[0];
    return num(same?.amount);
  }
  return num(v?.amount??v);
}
function allOffers(payload){
  const out=[];
  for(const h of candidates(payload)){
    for(const offer of Array.isArray(h?.roomTypes)?h.roomTypes:[]){
      out.push({hotel:h,offer});
    }
  }
  return out;
}
export function extractNuiteeRate(payload,nights=1,currency="USD"){
  const options=[];
  for(const {hotel,offer} of allOffers(payload)){
    const publicTotal=money(offer?.suggestedSellingPrice,currency);
    const retailTotal=money(offer?.offerRetailRate,currency);
    const total=publicTotal??retailTotal;
    if(total==null)continue;
    const rates=Array.isArray(offer?.rates)?offer.rates:[];
    const first=rates[0]||{};
    options.push({
      nightly_rate:total/Math.max(Number(nights)||1,1),
      currency:String(offer?.suggestedSellingPrice?.currency||offer?.offerRetailRate?.currency||currency||"USD").toUpperCase(),
      room_type:String(first?.name||offer?.roomName||"").slice(0,240)||null,
      rate_name:String(first?.boardName||first?.boardType||offer?.rateType||"").slice(0,160)||null,
      taxes_fees_included:null,
      public_total:publicTotal,
      bookable_total:retailTotal,
      offer_id:String(offer?.offerId||"")||null,
      hotel_id:hotelId(hotel)
    });
  }
  options.sort((a,b)=>a.nightly_rate-b.nightly_rate);
  return options[0]||null;
}

export async function fetchNuiteeRates(env,hotelIdValue,window){
  const cfg=config(env);
  return request(env,"/hotels/rates",{
    method:"POST",
    timeoutMs:22000,
    body:{
      hotelIds:[String(hotelIdValue)],
      checkin:window.checkin,
      checkout:window.checkout,
      currency:cfg.currency,
      guestNationality:cfg.nationality,
      occupancies:[{adults:2}],
      includeHotelData:true,
      limit:10,
      timeout:10
    }
  });
}

export async function fetchNuiteeReviews(env,hotelIdValue){
  const r=await request(env,"/data/reviews",{query:{hotelId:String(hotelIdValue),limit:20,offset:0,timeout:6,getSentiment:true}});
  if(!r.ok)return r;
  return {ok:true,data:r.data,environment:config(env).environment};
}

function sentimentLabel(score){
  const n=Number(score);if(!Number.isFinite(n))return "neutral";
  return n>=7.5?"positive":n>=6?"neutral":n>=4?"mixed":"negative";
}
export function summarizeNuiteeSentiment(payload,hotelIdValue){
  const s=payload?.sentimentAnalysis||payload?.data?.sentimentAnalysis||payload?.meta?.sentimentAnalysis;
  if(!s||!Array.isArray(s.categories)||!s.categories.length)return null;
  const cats=s.categories.map(x=>({name:String(x?.name||"").trim(),rating:Number(x?.rating)}))
    .filter(x=>x.name&&Number.isFinite(x.rating)).sort((a,b)=>b.rating-a.rating);
  if(!cats.length)return null;
  const avg=cats.reduce((a,x)=>a+x.rating,0)/cats.length,top=cats.slice(0,2),bottom=[...cats].sort((a,b)=>a.rating-b.rating).slice(0,2);
  const summary=[
    "Nuitee's aggregated guest-review sentiment averages "+avg.toFixed(1)+"/10.",
    top.length?"Stronger areas: "+top.map(x=>x.name+" "+x.rating.toFixed(1)+"/10").join(", ")+".":"",
    bottom.length?"Weaker areas: "+bottom.map(x=>x.name+" "+x.rating.toFixed(1)+"/10").join(", ")+".":""
  ].filter(Boolean).join(" ");
  return {
    source_url:"https://api.liteapi.travel/v3.0/data/reviews?hotelId="+encodeURIComponent(String(hotelIdValue))+"&getSentiment=true",
    source_title:"Nuitee Connect aggregated guest reviews",
    sentiment:sentimentLabel(avg),
    summary,
    attributes:cats.slice(0,8).map(x=>x.name),
    best_for:(Array.isArray(s.pros)?s.pros:[]).slice(0,8).map(String),
    avoid_if:(Array.isArray(s.cons)?s.cons:[]).slice(0,8).map(String),
    tradeoffs:bottom.filter(x=>x.rating<6.5).map(x=>x.name+" "+x.rating.toFixed(1)+"/10"),
    price_mentioned:null,
    trip_context:"Aggregated guest reviews",
    confidence:cats.length>=5?"high":cats.length>=3?"medium":"low",
    categories:cats
  };
}


export async function fetchNuiteeHotelDetails(env,hotelIdValue){
  const r=await request(env,"/data/hotel",{query:{hotelId:String(hotelIdValue),timeout:6,language:"en"}});
  if(!r.ok)return r;
  return {ok:true,data:r.data?.data||r.data,environment:config(env).environment};
}

function cleanArray(v,limit=80){
  return (Array.isArray(v)?v:[]).map(x=>typeof x==="string"?x:(x?.name||x?.title||x?.label||"")).map(x=>String(x).trim()).filter(Boolean).slice(0,limit);
}

export function extractNuiteeMetadata(item){
  const x=item?.data||item||{},loc=x.location||{};
  const images=Array.isArray(x.hotelImages)?x.hotelImages:[];
  const main=String(x.main_photo||images.find(i=>i?.defaultImage)?.url||images[0]?.url||"").trim()||null;
  const description=String(x.hotelDescription||x.description||"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim()||null;
  const amenities=cleanArray(x.hotelFacilities||x.amenities,120);
  const tags=cleanArray(x.tags,50);
  const rooms=Array.isArray(x.rooms)?x.rooms:[];
  return {
    provider_hotel_id:hotelId(x),
    name:String(x.name||x.hotelName||"").trim()||null,
    address:String(x.address||x.formattedAddress||"").trim()||null,
    city:String(x.city||"").trim()||null,
    country:String(x.country||x.countryCode||"").trim()||null,
    lat:Number.isFinite(Number(loc.latitude??x.latitude))?Number(loc.latitude??x.latitude):null,
    lng:Number.isFinite(Number(loc.longitude??x.longitude))?Number(loc.longitude??x.longitude):null,
    star_rating:Number.isFinite(Number(x.starRating??x.stars))?Number(x.starRating??x.stars):null,
    rating:Number.isFinite(Number(x.rating))?Number(x.rating):null,
    description,
    main_photo_url:main,
    amenities,
    tags,
    persona:String(x.persona||"").trim()||null,
    style:String(x.style||"").trim()||null,
    location_type:String(x.location_type||x.locationType||"").trim()||null,
    story:String(x.story||"").trim()||null,
    room_count:rooms.length,
    raw_summary:{
      chain:x.chain||x.chainName||null,
      checkinCheckoutTimes:x.checkinCheckoutTimes||null,
      policies_count:Array.isArray(x.policies)?x.policies.length:0,
      images_count:images.length
    }
  };
}

export async function fetchNuiteeRatesBatch(env,hotelIds,window){
  const cfg=config(env),ids=[...new Set((hotelIds||[]).map(String).filter(Boolean))].slice(0,200);
  if(!ids.length)return {ok:true,data:{data:[]},environment:cfg.environment};
  const r=await request(env,"/hotels/rates",{
    method:"POST",
    timeoutMs:30000,
    body:{
      hotelIds:ids,
      checkin:window.checkin,
      checkout:window.checkout,
      currency:cfg.currency,
      guestNationality:cfg.nationality,
      occupancies:[{adults:2}],
      includeHotelData:false,
      maxRatesPerHotel:1,
      roomMapping:true,
      timeout:12
    }
  });
  if(!r.ok)return r;
  return {ok:true,data:r.data,environment:cfg.environment};
}

export function extractNuiteeRatesByHotel(payload,nights=1,currency="USD"){
  const out=new Map();
  for(const hotel of candidates(payload)){
    const id=hotelId(hotel);if(!id)continue;
    const rate=extractNuiteeRate({data:[hotel]},nights,currency);
    if(rate)out.set(id,rate);
  }
  return out;
}
