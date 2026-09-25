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
      stay_month:nullStr,
      nights:{anyOf:[{type:"integer"},{type:"null"}]},
      party_type:nullStr,
      room_type:nullStr,
      booking_channel:nullStr,
      paid_nightly_rate:nullNum,
      currency:nullStr,
      rate_basis:{anyOf:[{type:"string",enum:["room_rate","all_in","unknown"]},{type:"null"}]},
      would_pay_again:nullNum,
      would_return:nullBool,
      inclusions:{type:"array",items:{type:"string"}},
      standouts:{type:"array",items:{type:"string"}},
      drawbacks:{type:"array",items:{type:"string"}},
      review_text:nullStr,
      overall_confidence:{type:"string",enum:["high","medium","low"]}
    },
    required:["hotel_name","city","country","stay_month","nights","party_type","room_type","booking_channel","paid_nightly_rate","currency","rate_basis","would_pay_again","would_return","inclusions","standouts","drawbacks","review_text","overall_confidence"],
    additionalProperties:false
  };
}

const cleanStr=(v,max=500)=>v==null?null:String(v).trim().slice(0,max)||null;
const cleanNum=(v)=>v==null||v===""?null:(Number.isFinite(Number(v))&&Number(v)>=0&&Number(v)<=100000?Number(v):null);

function normalize(x,knownHotel){
  return {
    hotel_name:cleanStr(x?.hotel_name,160)||knownHotel?.name||null,
    city:cleanStr(x?.city,120)||knownHotel?.city||null,
    country:cleanStr(x?.country,120)||knownHotel?.country||null,
    stay_month:cleanStr(x?.stay_month,20),
    nights:Number.isInteger(Number(x?.nights))&&Number(x.nights)>0&&Number(x.nights)<=90?Number(x.nights):null,
    party_type:cleanStr(x?.party_type,80),
    room_type:cleanStr(x?.room_type,160),
    booking_channel:cleanStr(x?.booking_channel,120),
    paid_nightly_rate:cleanNum(x?.paid_nightly_rate),
    currency:(cleanStr(x?.currency,8)||"USD").toUpperCase(),
    rate_basis:["room_rate","all_in","unknown"].includes(x?.rate_basis)?x.rate_basis:"unknown",
    would_pay_again:cleanNum(x?.would_pay_again),
    would_return:typeof x?.would_return==="boolean"?x.would_return:null,
    inclusions:Array.isArray(x?.inclusions)?x.inclusions.map(v=>cleanStr(v,120)).filter(Boolean).slice(0,20):[],
    standouts:Array.isArray(x?.standouts)?x.standouts.map(v=>cleanStr(v,180)).filter(Boolean).slice(0,12):[],
    drawbacks:Array.isArray(x?.drawbacks)?x.drawbacks.map(v=>cleanStr(v,180)).filter(Boolean).slice(0,12):[],
    review_text:cleanStr(x?.review_text,3000),
    overall_confidence:["high","medium","low"].includes(x?.overall_confidence)?x.overall_confidence:"low"
  };
}

export async function parseContribution(env,rawText,knownHotel=null){
  const text=String(rawText||"").trim().slice(0,8000);
  const fallback=normalize({},knownHotel);
  if(!text)return {ok:false,error:"empty_text",parsed:fallback,parserVersion:"sn-freeform-v1"};
  if(!env.AI||typeof env.AI.run!=="function"){
    return {ok:true,parsed:fallback,parserVersion:"sn-freeform-v1-fallback",degraded:true};
  }

  const model=String(env.WORKERS_AI_CONTRIBUTION_MODEL||env.WORKERS_AI_EVIDENCE_MODEL||"@cf/meta/llama-3.3-70b-instruct-fp8-fast");
  const known=knownHotel?("\nKnown hotel selected by the user: "+knownHotel.name+", "+[knownHotel.city,knownHotel.country].filter(Boolean).join(", ")+". Use this hotel unless the text clearly says otherwise."):"";
  const prompt=[
    "Extract structured facts from this traveler's own hotel-stay note.",
    "Rules:",
    "- Use only facts explicitly stated by the traveler or the known selected hotel context.",
    "- Never invent a date, price, room type, booking channel, perk, sentiment, or return intent.",
    "- paid_nightly_rate must be a nightly amount. If the traveler only gives a total and nights are known, you may divide the total by nights; otherwise leave it null.",
    "- would_pay_again is the price the traveler says they would happily pay again, not the paid price.",
    "- rate_basis is all_in only when taxes/fees/inclusions are clearly described as included in that quoted nightly amount; room_rate only when clearly before taxes/fees; otherwise unknown.",
    "- stay_month should be YYYY-MM when possible. If only a month without year is stated, leave it null and preserve the context in review_text.",
    "- review_text should be a concise neutral paraphrase of the traveler's own note, preserving useful tradeoffs without adding facts.",
    "- Keep standouts and drawbacks concise.",
    known,
    "",
    "Traveler note:",
    text
  ].join("\n");

  try{
    const result=await env.AI.run(model,{
      messages:[
        {role:"system",content:"You conservatively structure first-party hotel stay data. Missing facts stay null."},
        {role:"user",content:prompt}
      ],
      response_format:{type:"json_schema",json_schema:contributionSchema()},
      temperature:0,
      max_tokens:1200
    });
    const raw=result?.response??result;
    const parsed=typeof raw==="string"?JSON.parse(raw):raw;
    return {ok:true,parsed:normalize(parsed,knownHotel),parserVersion:"sn-freeform-v1:"+model};
  }catch(e){
    return {ok:true,parsed:fallback,parserVersion:"sn-freeform-v1-fallback",degraded:true,error:String(e?.message||e).slice(0,500)};
  }
}
