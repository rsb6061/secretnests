const moneyText=(v)=>v==null||v===""?null:"$"+Math.round(Number(v)).toLocaleString("en-US");

export function buildComparisonPairs(rows,{maxPairs=120,perGroup=4}={}){
  const groups=new Map();
  for(const row of rows||[]){
    if(!row?.slug||!row?.city||!row?.country)continue;
    const key=String(row.city).trim().toLowerCase()+"|"+String(row.country).trim().toLowerCase();
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(row);
  }
  const out=[],seen=new Set();
  for(const hotels of groups.values()){
    const top=hotels.slice(0,Math.max(2,perGroup));
    for(let i=0;i<top.length;i++){
      for(let j=i+1;j<top.length;j++){
        const a=top[i],b=top[j],key=[a.slug,b.slug].sort().join("|");
        if(seen.has(key))continue;
        seen.add(key);
        out.push({
          a,b,
          path:"/compare/"+encodeURIComponent(a.slug)+"-vs-"+encodeURIComponent(b.slug)
        });
        if(out.length>=maxPairs)return out;
      }
    }
  }
  return out;
}

export function hotelSeoCopy(h,{travelerMedian=null,sampleSize=0,currentRate=null}={}){
  const name=String(h?.name||"Hotel").trim();
  const city=String(h?.city||"").trim();
  const country=String(h?.country||"").trim();
  const place=[city,country].filter(Boolean).join(", ");
  const estimatedLow=moneyText(h?.price_estimate_min);
  const estimatedHigh=moneyText(h?.price_estimate_max);
  const current=moneyText(currentRate);
  const median=moneyText(travelerMedian);
  const priceRange=estimatedLow&&estimatedHigh?estimatedLow+"–"+estimatedHigh:estimatedLow||estimatedHigh||null;
  const clip=(value,max)=>{const s=String(value||"").replace(/\s+/g," ").trim();return s.length<=max?s:s.slice(0,max-1).replace(/\s+\S*$/,"")+"…"};

  let title=name+" Review, Prices & Value | SecretNests";
  if(city&&title.length<=54)title=name+" Review & Prices — "+city+" | SecretNests";
  if(title.length>66)title=name+" Review & Prices | SecretNests";
  if(title.length>66)title=clip(name,50)+" | SecretNests";

  const description=Number(sampleSize)>0&&median
    ? clip(name+(place?" in "+place:"")+": hotel review, "+(current?"latest observed rate "+current:priceRange?"estimated rates "+priceRange:"price context")+", traveler would-pay median "+median+", return intent and comparable alternatives.",160)
    : clip(name+(place?" in "+place:"")+": hotel review and "+(current?"latest observed rate "+current:priceRange?"estimated rates "+priceRange:"price context")+", hotel facts, traveler evidence and comparable alternatives. First-party value data builds as stays are added.",160);

  const priceAnswer=current
    ? "The latest observed bookable rate on SecretNests is "+current+" per night. "+(priceRange?"The broader estimated price band is "+priceRange+".":"")
    : priceRange
      ? "SecretNests currently estimates a typical nightly price band of "+priceRange+"."
      : "SecretNests does not yet have enough reliable price data to publish a nightly range.";
  const worthAnswer=Number(sampleSize)>0&&median
    ? "The current SecretNests first-party sample has a median would-pay-again value of "+median+" per night across "+Number(sampleSize)+" published stay"+(Number(sampleSize)===1?"":"s")+". That is an early traveler price signal, not a universal verdict."
    : "SecretNests does not yet have enough first-party stays to publish a traveler fair-value verdict for this hotel. The page shows price context, hotel facts and external traveler evidence separately while the first-party sample builds.";
  return {title,description,priceAnswer,worthAnswer};
}

export function brandSlug(value=""){
  return String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
    .replace(/&/g," and ").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").replace(/-{2,}/g,"-");
}
