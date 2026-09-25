const nullNum={anyOf:[{type:"number"},{type:"null"}]};
const nullStr={anyOf:[{type:"string"},{type:"null"}]};
const nullBool={anyOf:[{type:"boolean"},{type:"null"}]};

function contributionSchema(){
  return {
    type:"object",
    properties:{
      hotel_name:nullStr,
      city:nullStr,
      country:nullStr,
      stay_period:nullStr,
      stay_month:nullStr,
      nights:{anyOf:[{type:"integer"},{type:"null"}]},
      trip_context:nullStr,
      party_type:nullStr,
      room_type:nullStr,
      booking_channel:nullStr,
      promotion:nullStr,
      paid_nightly_rate:nullNum,
      currency:nullStr,
      rate_basis:{anyOf:[{type:"string",enum:["room_rate","all_in","unknown"]},{type:"null"}]},
      would_pay_again:nullNum,
      would_return:nullBool,
      inclusions:{type:"array",items:{type:"string"}},
      standouts:{type:"array",items:{type:"string"}},
      drawbacks:{type:"array",items:{type:"string"}},
      overall_confidence:{type:"string",enum:["high","medium","low"]}
    },
    required:["hotel_name","city","country","stay_period","stay_month","nights","trip_context","party_type","room_type","booking_channel","promotion","paid_nightly_rate","currency","rate_basis","would_pay_again","would_return","inclusions","standouts","drawbacks","overall_confidence"],
    additionalProperties:false
  };
}

const cleanStr=(v,max=500)=>v==null?null:String(v).trim().slice(0,max)||null;
const cleanNum=(v)=>v==null||v===""?null:(Number.isFinite(Number(v))&&Number(v)>=0&&Number(v)<=100000?Number(v):null);

function explicitStayPeriod(text){
  const source=String(text||"");
  const iso=source.match(/\b(?:19|20)\d{2}[-/]?(?:0?[1-9]|1[0-2])\b/);
  if(iso)return iso[0];
  const month=source.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)(?:\s+(?:19|20)\d{2})?\b/i);
  return month?month[0]:null;
}

function normalize(x,knownHotel,rawText){
  const explicitPeriod=explicitStayPeriod(rawText);
  const parsedMonth=cleanStr(x?.stay_month,20);
  const parsedYear=parsedMonth?.match(/^((?:19|20)\d{2})-/)?.[1]||null;
  const yearExplicit=parsedYear?new RegExp("\\b"+parsedYear+"\\b").test(String(rawText||"")):false;
  return {
    hotel_name:cleanStr(x?.hotel_name,160)||knownHotel?.name||null,
    city:cleanStr(x?.city,120)||knownHotel?.city||null,
    country:cleanStr(x?.country,120)||knownHotel?.country||null,
    stay_period:explicitPeriod||cleanStr(x?.stay_period,80),
    stay_month:parsedYear&&!yearExplicit?null:parsedMonth,
    nights:Number.isInteger(Number(x?.nights))&&Number(x.nights)>0&&Number(x.nights)<=90?Number(x.nights):null,
    trip_context:cleanStr(x?.trip_context,100),
    party_type:cleanStr(x?.party_type,80),
    room_type:cleanStr(x?.room_type,160),
    booking_channel:cleanStr(x?.booking_channel,120),
    promotion:cleanStr(x?.promotion,240),
    paid_nightly_rate:cleanNum(x?.paid_nightly_rate),
    currency:(cleanStr(x?.currency,8)||"USD").toUpperCase(),
    rate_basis:["room_rate","all_in","unknown"].includes(x?.rate_basis)?x.rate_basis:"unknown",
    would_pay_again:cleanNum(x?.would_pay_again),
    would_return:typeof x?.would_return==="boolean"?x.would_return:null,
    inclusions:Array.isArray(x?.inclusions)?x.inclusions.map(v=>cleanStr(v,120)).filter(Boolean).slice(0,20):[],
    standouts:Array.isArray(x?.standouts)?x.standouts.map(v=>cleanStr(v,180)).filter(Boolean).slice(0,12):[],
    drawbacks:Array.isArray(x?.drawbacks)?x.drawbacks.map(v=>cleanStr(v,180)).filter(Boolean).slice(0,12):[],
    overall_confidence:["high","medium","low"].includes(x?.overall_confidence)?x.overall_confidence:"low"
  };
}

export async function parseContribution(env,rawText,knownHotel=null){
  const text=String(rawText||"").trim().slice(0,8000);
  const fallback=normalize({},knownHotel,text);
  if(!text)return {ok:false,error:"empty_text",parsed:fallback,parserVersion:"sn-freeform-v2"};
  if(!env.AI||typeof env.AI.run!=="function"){
    return {ok:true,parsed:fallback,parserVersion:"sn-freeform-v2-fallback",degraded:true};
  }

  const model=String(env.WORKERS_AI_CONTRIBUTION_MODEL||env.WORKERS_AI_EVIDENCE_MODEL||"@cf/meta/llama-3.3-70b-instruct-fp8-fast");
  const known=knownHotel?("\nKnown hotel selected by the user: "+knownHotel.name+", "+[knownHotel.city,knownHotel.country].filter(Boolean).join(", ")+". Use this hotel unless the note clearly says otherwise."):"";
  const prompt=[
    "Extract structured facts from this traveler's own hotel-stay note.",
    "Do not summarize, paraphrase, polish, or rewrite the review. SecretNests keeps the traveler's original words separately.",
    "Rules:",
    "- Use only facts explicitly stated by the traveler or the known selected hotel context.",
    "- Missing facts must stay null. Never invent a date, year, number of nights, cash price, room type, booking channel, perk, promotion, sentiment, or return intent.",
    "- stay_period is the traveler's own explicit time phrase, such as August or August 2023.",
    "- stay_month may be YYYY-MM only when the year is explicitly present in the traveler's note.",
    "- trip_context is a stated trip purpose such as babymoon, honeymoon, anniversary, family trip, business trip, or girls trip.",
    "- party_type is who they explicitly traveled with, such as partner, family, friends, solo. Do not derive it from trip_context alone.",
    "- promotion captures an explicitly stated offer such as buy two nights get one free.",
    "- paid_nightly_rate must be a cash nightly amount. Points are not cash. Never convert points to dollars.",
    "- If the traveler only gives a cash total and an explicit number of nights, you may divide it by nights; otherwise leave paid_nightly_rate null.",
    "- would_pay_again is only a cash amount the traveler explicitly says they would pay again.",
    "- rate_basis is all_in only when taxes/fees are clearly included in the cash nightly amount; room_rate only when clearly before taxes/fees; otherwise unknown.",
    "- Keep inclusions, standouts, and drawbacks concise and factual.",
    known,
    "",
    "Traveler note:",
    text
  ].join("\n");

  try{
    const result=await env.AI.run(model,{
      messages:[
        {role:"system",content:"You conservatively extract metadata from first-party hotel stay notes. You never rewrite the user's review and never infer missing facts."},
        {role:"user",content:prompt}
      ],
      response_format:{type:"json_schema",json_schema:contributionSchema()},
      temperature:0,
      max_tokens:1100
    });
    const raw=result?.response??result;
    const parsed=typeof raw==="string"?JSON.parse(raw):raw;
    return {ok:true,parsed:normalize(parsed,knownHotel,text),parserVersion:"sn-freeform-v2:"+model};
  }catch(e){
    return {ok:true,parsed:fallback,parserVersion:"sn-freeform-v2-fallback",degraded:true,error:String(e?.message||e).slice(0,500)};
  }
}
