import { currentCreator, authConfigured } from "./auth.js";
import { parseContribution } from "./contribution-parser.js";
import { sameOrigin, bodyTooLarge, enforceRateLimit } from "./security.js";

const safeJson=(v,fallback={})=>{try{return JSON.parse(v||"")}catch{return fallback}};
const nowIso=()=>new Date().toISOString();
const clean=(v,max=3000)=>String(v==null?"":v).trim().slice(0,max);
const numberOrNull=(v)=>{
  const raw=clean(v,32);
  if(!raw)return null;
  const n=Number(raw);
  return Number.isFinite(n)&&n>=0&&n<=100000?n:null;
};
const intOrNull=(v,min,max)=>{
  const raw=clean(v,16);
  if(!raw)return null;
  const n=Number(raw);
  return Number.isInteger(n)&&n>=min&&n<=max?n:null;
};
function field(form,name,fallback=null){
  const raw=form.get(name);
  return raw==null||String(raw).trim()===""?fallback:String(raw).trim();
}
async function exactHotel(db,name,city=""){
  if(!name)return null;
  return db.prepare("SELECT id,name,slug,city,country FROM hotels WHERE is_published=1 AND lower(name)=lower(?) ORDER BY CASE WHEN lower(COALESCE(city,''))=lower(?) THEN 0 ELSE 1 END LIMIT 1")
    .bind(name,city||"").first();
}
function formatMoney(v,money){
  return v==null?"Not captured":money(v);
}
function summaryItem(label,value){
  return '<div><div class="kicker">'+label+'</div><strong>'+value+'</strong></div>';
}
function roleLabel(role){
  return role==="receipt_private"?"Receipt / folio · private":"Hotel photo · public";
}

export async function addTripPage(request,env,ui){
  const url=new URL(request.url);
  const draftId=clean(url.searchParams.get("draft"),100);
  const user=await currentCreator(request,env);
  if(draftId){
    const draft=await env.DB.prepare("SELECT * FROM contribution_drafts WHERE id=? AND status='draft' AND expires_at>? LIMIT 1").bind(draftId,nowIso()).first();
    if(!draft)return new Response("Draft not found or expired.",{status:404});
    const parsed=safeJson(draft.parsed_json,{});
    const assets=(await env.DB.prepare("SELECT id,original_name,mime_type,asset_role,rights_status FROM contribution_draft_assets WHERE draft_id=? ORDER BY created_at").bind(draft.id).all()).results||[];
    const matched=draft.hotel_id?await env.DB.prepare("SELECT id,name,slug,city,country FROM hotels WHERE id=? LIMIT 1").bind(draft.hotel_id).first():null;
    const hotelName=parsed.hotel_name||matched?.name||"";
    const city=parsed.city||matched?.city||"";
    const returnLabel=parsed.would_return==null?"Not captured":parsed.would_return?"Yes":"No";
    const assetHtml=assets.length?'<div class="notice" style="margin-top:18px"><strong>Uploads</strong><ul class="list">'+assets.map(a=>'<li>'+ui.esc(a.original_name||"Upload")+' · '+ui.esc(roleLabel(a.asset_role))+'</li>').join("")+'</ul></div>':"";
    const authNote=user?'<div class="notice" style="margin-top:18px"><strong>Signed in as @'+ui.esc(user.handle)+'</strong><p class="muted">This stay will be attached to your traveler profile after moderation.</p></div>':'<p class="muted" style="margin-top:14px">You will sign in with Google before publishing. Your draft is already saved.</p>';
    const missing=[];
    if(!hotelName)missing.push("hotel");
    if(parsed.paid_nightly_rate==null)missing.push("what you paid per night");
    if(parsed.would_pay_again==null)missing.push("what you would happily pay again");
    const missingHtml=missing.length?'<div class="notice" style="margin:18px 0"><strong>One more thing.</strong><p>We still need '+ui.esc(missing.join(", "))+' before this can become useful hotel value data.</p></div>':"";
    const reviewForm=
      '<form id="confirm-stay" class="card" method="post" action="/add-your-trip/publish" style="max-width:900px">'+
      '<input type="hidden" name="draft_id" value="'+ui.attr(draft.id)+'">'+
      '<input type="hidden" name="hotel_id" value="'+ui.attr(matched?.id||"")+'">'+
      '<div class="eyebrow">We parsed this from your note</div>'+
      '<h2 style="margin-top:6px">'+ui.esc(hotelName||"Your stay")+'</h2>'+
      '<div class="proof" style="margin-top:18px">'+
        summaryItem("Paid / night",formatMoney(parsed.paid_nightly_rate,ui.money))+
        summaryItem("Would pay again",formatMoney(parsed.would_pay_again,ui.money))+
        summaryItem("Would return",ui.esc(returnLabel))+
        summaryItem("Stay",ui.esc([parsed.stay_month,parsed.nights?parsed.nights+" nights":null].filter(Boolean).join(" · ")||"Not captured"))+
      '</div>'+
      missingHtml+
      '<p style="font-size:17px">'+ui.esc(parsed.review_text||draft.raw_text)+'</p>'+
      (parsed.inclusions?.length?'<p><strong>Included / perks:</strong> '+parsed.inclusions.map(ui.esc).join(" · ")+'</p>':"")+
      assetHtml+
      '<details style="margin-top:22px"><summary style="cursor:pointer;font-weight:650">Fix anything we parsed wrong</summary>'+
        '<div class="mini-grid" style="margin-top:16px">'+
          '<p><label>Hotel<br><input name="hotel_name" required maxlength="160" value="'+ui.attr(hotelName)+'"></label></p>'+
          '<p><label>City / destination<br><input name="city" maxlength="120" value="'+ui.attr(city)+'"></label></p>'+
          '<p><label>Stay month<br><input name="stay_month" type="month" value="'+ui.attr(parsed.stay_month||"")+'"></label></p>'+
          '<p><label>Nights<br><input name="nights" type="number" min="1" max="90" value="'+ui.attr(parsed.nights??"")+'"></label></p>'+
          '<p><label><strong>What you paid per night</strong><br><input name="paid_nightly_rate" type="number" min="0" max="100000" step="0.01" required value="'+ui.attr(parsed.paid_nightly_rate??"")+'"></label></p>'+
          '<p><label><strong>What you would happily pay again</strong><br><input name="would_pay_again" type="number" min="0" max="100000" step="0.01" required value="'+ui.attr(parsed.would_pay_again??"")+'"></label></p>'+
          '<p><label>Room type<br><input name="room_type" maxlength="160" value="'+ui.attr(parsed.room_type||"")+'"></label></p>'+
          '<p><label>Booking method<br><input name="booking_channel" maxlength="120" value="'+ui.attr(parsed.booking_channel||"")+'"></label></p>'+
          '<p><label>Who were you with?<br><input name="party_type" maxlength="80" value="'+ui.attr(parsed.party_type||"")+'"></label></p>'+
          '<p><label>Would you return?<br><select name="would_return"><option value="">Not sure / not stated</option><option value="1"'+(parsed.would_return===true?" selected":"")+'>Yes</option><option value="0"'+(parsed.would_return===false?" selected":"")+'>No</option></select></label></p>'+
          '<p><label>Rate basis<br><select name="rate_basis"><option value="unknown">Not sure</option><option value="room_rate"'+(parsed.rate_basis==="room_rate"?" selected":"")+'>Before taxes / fees</option><option value="all_in"'+(parsed.rate_basis==="all_in"?" selected":"")+'>All-in</option></select></label></p>'+
        '</div>'+
        '<p><label>Traveler note we will publish as your take<br><textarea name="review_text" maxlength="3000" rows="5">'+ui.esc(parsed.review_text||draft.raw_text)+'</textarea></label></p>'+
      '</details>'+
      authNote+
      '<div class="hero-actions">'+
        (user?'<button class="btn" type="submit">Publish my stay →</button>':(authConfigured(env)?'<button class="btn" type="button" id="google-signin">Continue with Google →</button>':'<button class="btn" type="button" disabled>Google sign-in setup required</button>'))+
        '<a class="btn secondary" href="/add-your-trip">Start over</a>'+
      '</div>'+
      '</form>';
    const script=!user&&authConfigured(env)?
      '<script>(function(){var form=document.getElementById("confirm-stay"),btn=document.getElementById("google-signin"),key="sn-draft-'+ui.attr(draft.id)+'";try{var saved=JSON.parse(sessionStorage.getItem(key)||"{}");Object.keys(saved).forEach(function(name){var el=form.elements[name];if(el&&saved[name]!=null)el.value=saved[name]})}catch{}if(btn)btn.addEventListener("click",function(){var saved={};new FormData(form).forEach(function(v,k){if(typeof v==="string")saved[k]=v});sessionStorage.setItem(key,JSON.stringify(saved));var ret="/add-your-trip?draft='+encodeURIComponent(draft.id)+'",url="/login?popup=1&return_to="+encodeURIComponent(ret),w=window.open(url,"secretnests-auth","popup=yes,width=520,height=720");if(!w)location.href="/login?return_to="+encodeURIComponent(ret)});window.addEventListener("message",function(e){if(e.origin!==location.origin||!e.data||e.data.type!=="secretnests-auth"||!e.data.ok)return;location.reload()})})();</script>':"";
    const body='<section class="hero" style="padding-bottom:22px"><div class="eyebrow">Review your stay</div><h1>Make sure we got the useful parts right.</h1><p>We keep your original note, but only confirmed structured fields can affect hotel value data.</p></section>'+reviewForm+script;
    return ui.page(ui.shell(body),env,{title:"Review your hotel stay | SecretNests",canonical:"/add-your-trip",robots:"noindex,follow"});
  }

  const hotelSlug=clean(url.searchParams.get("hotel"),160);
  const acquisitionSource=clean(url.searchParams.get("src"),80),acquisitionCampaign=clean(url.searchParams.get("campaign"),120);
  const prefilled=hotelSlug?await env.DB.prepare("SELECT id,name,slug,city,country FROM hotels WHERE slug=? AND is_published=1").bind(hotelSlug).first():null;
  const enabled=String(env.SUBMISSIONS_ENABLED||"false").toLowerCase()==="true";
  const body=enabled?
    '<section class="hero" id="add-your-stay" style="padding-bottom:22px"><div class="eyebrow">Add Your Trip</div><h1>'+(prefilled?"Tell us about your stay at "+ui.esc(prefilled.name):"Tell us about your hotel stay.")+'</h1><p>Write naturally. We will pull out the useful details and let you confirm them before anything is published.</p></section>'+
    '<form class="card" data-autoevent="contribution_started" data-hotel-id="'+ui.attr(prefilled?.id||"")+'" method="post" action="/add-your-trip" enctype="multipart/form-data" style="max-width:900px">'+
      '<div style="display:none"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>'+
      '<input type="hidden" name="hotel_id" value="'+ui.attr(prefilled?.id||"")+'">'+
      '<input type="hidden" name="contribution_source" data-acquisition="source" value="'+ui.attr(acquisitionSource)+'">'+
      '<input type="hidden" name="contribution_campaign" data-acquisition="campaign" value="'+ui.attr(acquisitionCampaign)+'">'+
      '<label><strong>Tell us what happened</strong><br><textarea name="raw_text" required minlength="20" maxlength="8000" rows="11" placeholder="Example: Stayed at Fairmont Banff Springs for 3 nights with my partner in August. Paid about $620/night all-in through Amex FHR. Got breakfast, a property credit and an upgrade. Gorgeous setting and great spa, but the room felt dated. I would happily pay $500/night and would definitely return around that price." style="margin-top:8px;font-size:18px;line-height:1.6"></textarea></label>'+
      '<p class="muted">Helpful details: where and when you stayed, who you traveled with, what you paid, what you would happily pay again, whether you would return, room type, booking method, perks, and what was actually worth knowing.</p>'+
      '<div class="notice" style="margin-top:22px"><strong>Add photos or a receipt</strong><p class="muted">Hotel photos can be public. Receipts / folios stay private and are only used to verify the rate. Up to 6 files, 8 MB each.</p><input id="stay-files" name="files" type="file" multiple accept=".pdf,image/jpeg,image/png,image/webp"><div id="file-roles" style="margin-top:12px"></div><label id="photo-rights-wrap" style="display:none;margin-top:12px"><input id="photo-rights" name="photo_rights" type="checkbox" value="1"> I took these public hotel photos or otherwise have the right to share them.</label></div>'+
      (user?'<p class="muted">Signed in as <a href="/@'+encodeURIComponent(user.handle)+'"><strong>@'+ui.esc(user.handle)+'</strong></a>.</p>':'<p class="muted">No login yet. You will sign in with Google only when you are ready to publish.</p>')+
      '<p><button class="btn" type="submit">Continue →</button></p>'+
    '</form>'+
    '<script>(function(){var input=document.getElementById("stay-files"),box=document.getElementById("file-roles"),rights=document.getElementById("photo-rights"),wrap=document.getElementById("photo-rights-wrap");function render(){box.innerHTML="";var hasPublic=false;Array.from(input.files||[]).forEach(function(f,i){var row=document.createElement("div");row.style.cssText="display:flex;gap:10px;align-items:center;margin:8px 0;flex-wrap:wrap";var name=document.createElement("span");name.textContent=f.name;name.style.flex="1";var sel=document.createElement("select");sel.name="asset_role_"+i;sel.style.maxWidth="260px";sel.innerHTML="<option value=\"public_photo\">Hotel photo · public</option><option value=\"receipt_private\">Receipt / folio · private</option>";if(f.type==="application/pdf")sel.value="receipt_private";if(sel.value==="public_photo")hasPublic=true;sel.addEventListener("change",renderRights);row.append(name,sel);box.appendChild(row)});renderRights()}function renderRights(){var sels=box.querySelectorAll("select"),hasPublic=Array.from(sels).some(function(s){return s.value==="public_photo"});wrap.style.display=hasPublic?"block":"none";rights.required=hasPublic}input.addEventListener("change",render)})();</script>'
    :'<section class="hero"><div class="eyebrow">Add Your Trip</div><h1>Turn a hotel stay into useful price intelligence.</h1><p>Creator submissions are temporarily closed.</p></section>';
  return ui.page(ui.shell(body),env,{title:"Add Your Trip | SecretNests",canonical:"/add-your-trip"});
}

export async function createTripDraft(request,env,ui){
  if(String(env.SUBMISSIONS_ENABLED||"false").toLowerCase()!=="true")return new Response("Submissions are disabled.",{status:503});
  if(!sameOrigin(request,ui.ORIGIN))return new Response("Origin rejected.",{status:403});
  if(bodyTooLarge(request,28*1024*1024))return new Response("Upload too large.",{status:413});
  const rl=await enforceRateLimit(request,env,"trip_draft",12,3600);
  if(!rl.ok)return new Response("Too many attempts. Try again later.",{status:429});
  const form=await request.formData();
  if(form.get("website"))return Response.redirect(ui.ORIGIN+"/add-your-trip",303);
  const rawText=clean(form.get("raw_text"),8000);
  if(rawText.length<20)return new Response("Tell us a little more about the stay.",{status:400});
  let hotelId=clean(form.get("hotel_id"),100)||null;
  let knownHotel=null;
  if(hotelId){
    knownHotel=await env.DB.prepare("SELECT id,name,slug,city,country FROM hotels WHERE id=? AND is_published=1 LIMIT 1").bind(hotelId).first();
    if(!knownHotel)hotelId=null;
  }
  const parsedResult=await parseContribution(env,rawText,knownHotel);
  const parsed=parsedResult.parsed||{};
  if(!hotelId&&parsed.hotel_name){
    const match=await exactHotel(env.DB,parsed.hotel_name,parsed.city||"");
    hotelId=match?.id||null;
    if(match){
      parsed.hotel_name=match.name;
      parsed.city=parsed.city||match.city;
      parsed.country=parsed.country||match.country;
    }
  }
  const user=await currentCreator(request,env);
  const id=crypto.randomUUID(),created=nowIso(),expires=new Date(Date.now()+7*24*60*60*1000).toISOString();
  const source=clean(form.get("contribution_source"),80)||null,campaign=clean(form.get("contribution_campaign"),120)||null;
  const referrer=String(request.headers.get("referer")||"").slice(0,500)||null;
  await env.DB.prepare("INSERT INTO contribution_drafts (id,creator_id,hotel_id,raw_text,parsed_json,parser_version,status,contribution_source,contribution_campaign,contribution_referrer,created_at,updated_at,expires_at) VALUES (?,?,?,?,?,?,'draft',?,?,?,?,?,?)")
    .bind(id,user?.creator_id||null,hotelId,rawText,JSON.stringify(parsed),parsedResult.parserVersion||"sn-freeform-v1",source,campaign,referrer,created,created,expires).run();

  const files=form.getAll("files").filter(f=>f&&typeof f.arrayBuffer==="function"&&f.size>0);
  if(files.length>6)return new Response("Please upload no more than 6 files.",{status:400});
  const allowed=new Set(["application/pdf","image/jpeg","image/png","image/webp"]);
  let total=0,hasPublic=false;
  for(let i=0;i<files.length;i++){
    const file=files[i];
    total+=Number(file.size||0);
    if(!allowed.has(file.type))return new Response("One of the uploads is not a supported image or PDF.",{status:415});
    if(file.size>8*1024*1024||total>24*1024*1024)return new Response("Uploads are too large.",{status:413});
    let role=clean(form.get("asset_role_"+i),40);
    if(file.type==="application/pdf")role="receipt_private";
    if(!["public_photo","receipt_private"].includes(role))role=file.type==="application/pdf"?"receipt_private":"public_photo";
    if(role==="public_photo")hasPublic=true;
  }
  if(hasPublic&&String(form.get("photo_rights")||"")!=="1")return new Response("Please confirm you have the right to share the public hotel photos.",{status:400});
  for(let i=0;i<files.length;i++){
    const file=files[i],assetId=crypto.randomUUID();
    let role=clean(form.get("asset_role_"+i),40);
    if(file.type==="application/pdf")role="receipt_private";
    if(!["public_photo","receipt_private"].includes(role))role=file.type==="application/pdf"?"receipt_private":"public_photo";
    const key="contribution-drafts/"+id+"/"+assetId;
    await env.MEDIA.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:file.type}});
    await env.DB.prepare("INSERT INTO contribution_draft_assets (id,draft_id,r2_key,original_name,mime_type,file_size,asset_role,rights_status,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind(assetId,id,key,clean(file.name,240)||null,file.type,file.size,role,role==="public_photo"?"owned_user_upload":"private_verification",created).run();
  }
  return Response.redirect(ui.ORIGIN+"/add-your-trip?draft="+encodeURIComponent(id),303);
}

export async function publishTripDraft(request,env,ui){
  if(!sameOrigin(request,ui.ORIGIN))return new Response("Origin rejected.",{status:403});
  if(bodyTooLarge(request,128*1024))return new Response("Payload too large.",{status:413});
  const user=await currentCreator(request,env);
  if(!user)return new Response("Sign in with Google before publishing.",{status:401});
  const form=await request.formData();
  const draftId=clean(form.get("draft_id"),100);
  const draft=await env.DB.prepare("SELECT * FROM contribution_drafts WHERE id=? AND status='draft' AND expires_at>? LIMIT 1").bind(draftId,nowIso()).first();
  if(!draft)return new Response("Draft not found or already submitted.",{status:404});
  const parsed=safeJson(draft.parsed_json,{});
  const hotelName=clean(field(form,"hotel_name",parsed.hotel_name),160);
  const city=clean(field(form,"city",parsed.city),120);
  if(!hotelName)return new Response("Hotel name is required.",{status:400});
  const paid=numberOrNull(field(form,"paid_nightly_rate",parsed.paid_nightly_rate));
  const wouldPay=numberOrNull(field(form,"would_pay_again",parsed.would_pay_again));
  if(paid==null||wouldPay==null)return new Response("Paid nightly rate and what you would pay again are required.",{status:400});
  const stayMonth=clean(field(form,"stay_month",parsed.stay_month),20)||null;
  const nights=intOrNull(field(form,"nights",parsed.nights),1,90);
  const roomType=clean(field(form,"room_type",parsed.room_type),160)||null;
  const booking=clean(field(form,"booking_channel",parsed.booking_channel),120)||null;
  const party=clean(field(form,"party_type",parsed.party_type),80)||null;
  const rateBasis=["room_rate","all_in","unknown"].includes(field(form,"rate_basis",parsed.rate_basis))?field(form,"rate_basis",parsed.rate_basis):"unknown";
  const wr=field(form,"would_return",parsed.would_return===true?"1":parsed.would_return===false?"0":"");
  const wouldReturn=wr==="1"?1:wr==="0"?0:null;
  const reviewText=clean(field(form,"review_text",parsed.review_text||draft.raw_text),3000)||null;
  let hotelId=clean(form.get("hotel_id"),100)||draft.hotel_id||null;
  if(hotelId){
    const h=await env.DB.prepare("SELECT id,name,city FROM hotels WHERE id=? AND is_published=1 LIMIT 1").bind(hotelId).first();
    if(!h||h.name.toLowerCase()!==hotelName.toLowerCase())hotelId=null;
  }
  if(!hotelId){
    const match=await exactHotel(env.DB,hotelName,city);
    hotelId=match?.id||null;
  }
  const finalParsed={...parsed,hotel_name:hotelName,city:city||null,stay_month:stayMonth,nights,party_type:party,room_type:roomType,booking_channel:booking,paid_nightly_rate:paid,would_pay_again:wouldPay,would_return:wouldReturn==null?null:Boolean(wouldReturn),rate_basis:rateBasis,review_text:reviewText};
  const assets=(await env.DB.prepare("SELECT * FROM contribution_draft_assets WHERE draft_id=? ORDER BY created_at").bind(draft.id).all()).results||[];
  const hasReceipt=assets.some(a=>a.asset_role==="receipt_private");
  const id=crypto.randomUUID(),created=nowIso();
  await env.DB.prepare("INSERT INTO trip_submissions (id,contact_email,hotel_name,city,stay_month,paid_nightly_rate,would_pay_again,room_type,booking_channel,notes,status,created_at,hotel_id,nights,party_type,would_return,perks_json,inclusions_json,rate_basis,verification_status,contribution_source,contribution_campaign,contribution_referrer,creator_id,raw_text,parsed_json,parser_version,user_confirmed_at,draft_id) VALUES (?,?,?,?,?,?,?,?,?,?, 'pending',?,?,?,?,?,'[]',?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id,user.email||null,hotelName,city||null,stayMonth,paid,wouldPay,roomType,booking,reviewText,created,hotelId,nights,party,wouldReturn,JSON.stringify(parsed.inclusions||[]),rateBasis,hasReceipt?"pending":"unverified",draft.contribution_source,draft.contribution_campaign,draft.contribution_referrer,user.creator_id,draft.raw_text,JSON.stringify(finalParsed),draft.parser_version,created,draft.id).run();
  for(const asset of assets.filter(a=>a.asset_role==="receipt_private")){
    await env.DB.prepare("INSERT INTO submission_verification_artifacts (id,submission_id,r2_key,mime_type,file_size,status,redaction_status,created_at) VALUES (?,?,?,?,?,'pending','pending',?)")
      .bind(asset.id,id,asset.r2_key,asset.mime_type,asset.file_size,created).run();
  }
  await env.DB.prepare("UPDATE contribution_drafts SET creator_id=?,status='submitted',parsed_json=?,updated_at=? WHERE id=?")
    .bind(user.creator_id,JSON.stringify(finalParsed),created,draft.id).run();
  const matched=hotelId?await env.DB.prepare("SELECT id,name,slug FROM hotels WHERE id=? LIMIT 1").bind(hotelId).first():null;
  const snapshot=hotelId?await env.DB.prepare("SELECT median_would_pay,sample_size FROM hotel_value_snapshots WHERE hotel_id=? ORDER BY calculated_at DESC LIMIT 1").bind(hotelId).first():null;
  const pct=paid>0?Math.round((wouldPay-paid)/paid*100):null;
  const comparison=pct==null?"":pct===0?"the same as you paid":pct>0?pct+"% more than you paid":Math.abs(pct)+"% less than you paid";
  const hotelUrl=matched?"/hotel/"+encodeURIComponent(matched.slug):"/@"+encodeURIComponent(user.handle);
  const body=
    '<section class="hero" data-autoevent="contribution_submitted" data-hotel-id="'+ui.attr(hotelId||"")+'"><div class="eyebrow">Trip received</div><h1>Your take is captured.</h1><p>Your submission is in moderation before it affects the public hotel page or traveler-value range.'+(hasReceipt?" Your receipt / folio remains private.":"")+'</p></section>'+
    '<div class="take-card"><div class="eyebrow">'+(matched?ui.esc(matched.name):ui.esc(hotelName))+'</div><h2>Paid vs. worth</h2><div class="take-grid">'+
      summaryItem("You paid",ui.money(paid)+" / night")+
      summaryItem("You would pay again",ui.money(wouldPay)+(comparison?" · "+ui.esc(comparison):""))+
      summaryItem("Current traveler median",snapshot?.sample_size?ui.money(snapshot.median_would_pay):"Building")+
    '</div><p class="muted">When approved, this stay is attributed to <a href="/@'+encodeURIComponent(user.handle)+'"><strong>@'+ui.esc(user.handle)+'</strong></a>.</p><div class="hero-actions"><a class="btn" href="'+ui.attr(hotelUrl)+'">'+(matched?"Back to hotel":"View my profile")+'</a><a class="btn secondary" href="/add-your-trip">Add another stay</a></div></div>';
  return ui.page(ui.shell(body),env,{title:"Trip received | SecretNests",canonical:"/add-your-trip",robots:"noindex,follow"});
}

export async function promoteDraftMedia(env,submission,creatorId,hotelId,attributionText){
  if(!submission?.draft_id||!hotelId||!creatorId)return 0;
  const assets=(await env.DB.prepare("SELECT * FROM contribution_draft_assets WHERE draft_id=? AND asset_role='public_photo' AND rights_status='owned_user_upload' ORDER BY created_at").bind(submission.draft_id).all()).results||[];
  let promoted=0;
  for(const asset of assets){
    const id="contribution-"+asset.id;
    const out=await env.DB.prepare("INSERT INTO media_assets (id,hotel_id,creator_id,source_type,source_provider,attribution_text,rights_status,permission_reference,r2_key,mime_type,created_at) VALUES (?,?,?,'user_upload','secretnests_first_party',?,'owned_user_upload',?,?,?,?) ON CONFLICT(id) DO UPDATE SET hotel_id=excluded.hotel_id,creator_id=excluded.creator_id,attribution_text=excluded.attribution_text,rights_status=excluded.rights_status,r2_key=excluded.r2_key,mime_type=excluded.mime_type")
      .bind(id,hotelId,creatorId,attributionText||null,"contribution:"+submission.id,asset.r2_key,asset.mime_type,nowIso()).run();
    promoted+=Number(out.meta?.changes||0)>0?1:0;
  }
  return promoted;
}
