const esc = (v = "") => String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));

const page = (body, title = "SecretNests", description = "Real travelers share what they paid, what they'd pay again, and which luxury hotels are actually worth the splurge.") => new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}">
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#111;background:#fff}*{box-sizing:border-box}
body{margin:0}a{color:inherit}.wrap{max-width:1120px;margin:auto;padding:28px}header{display:flex;justify-content:space-between;gap:20px;align-items:center;border-bottom:1px solid #eee}
.brand{font-family:Georgia,serif;font-size:24px;font-weight:700;text-decoration:none}nav{display:flex;gap:18px}
.hero{padding:72px 0 48px}.hero h1,h1,h2{font-family:Georgia,serif}.hero h1{font-size:clamp(44px,7vw,78px);line-height:.98;max-width:880px;margin:0 0 22px}
.hero p{font-size:20px;line-height:1.5;max-width:760px;color:#444}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px}
.card{border:1px solid #ddd;border-radius:14px;padding:22px}.eyebrow{text-transform:uppercase;font-size:12px;letter-spacing:.12em;color:#666}.metric{font-size:28px;font-weight:700}
.quote{border-left:3px solid #111;padding-left:20px;margin:26px 0}.muted{color:#666}.pill{display:inline-block;padding:8px 12px;border:1px solid #ccc;border-radius:999px;margin:4px 4px 4px 0}
.stats{display:flex;gap:28px;flex-wrap:wrap;margin:24px 0}.stat strong{display:block;font-size:24px}.list{padding:0;list-style:none}.list li{padding:14px 0;border-bottom:1px solid #eee}
.value{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.value>div{border:1px solid #ddd;border-radius:12px;padding:16px}@media(max-width:700px){.value{grid-template-columns:1fr 1fr}}
</style></head><body>${body}</body></html>`,{headers:{"content-type":"text/html; charset=utf-8"}});

const json = data => new Response(JSON.stringify(data),{headers:{"content-type":"application/json; charset=utf-8"}});

const shell = (content) => `<header class="wrap"><a class="brand" href="/">SecretNests</a><nav><a href="/creators">Travelers</a><a href="/about">How it works</a></nav></header><main class="wrap">${content}</main>`;

async function home(env){
  let hotelCount=0;
  try { hotelCount=(await env.DB.prepare("SELECT COUNT(*) AS n FROM hotels WHERE is_published=1").first())?.n||0; } catch {}
  return page(shell(`
<section class="hero"><div class="eyebrow">Luxury hotel value, according to people who actually stayed</div>
<h1>What should this hotel cost?</h1>
<p>Real travelers share what they paid, what they'd happily pay again, and the hotels they think are actually worth the splurge.</p></section>
<section class="grid">
<div class="card"><div class="eyebrow">Creator profiles</div><h2>Your hotel taste becomes an asset.</h2><p>Build a public portfolio of stays, trip reports and lists. Earn from attributable bookings—not from writing positive reviews.</p></div>
<div class="card"><div class="eyebrow">Value range</div><h2>What would you pay again?</h2><p>We aggregate actual paid prices and willingness-to-pay into traveler-assessed fair-value ranges.</p></div>
<div class="card"><div class="eyebrow">Public lists</div><h2>Follow taste, not averages.</h2><p>Hotels I'd pay $500+ for again. Great hotels ruined by bad rooms. Luxury hotels actually worth $1,000.</p></div>
</section>
<section style="padding:64px 0"><div class="quote"><strong>Paid:</strong> $725<br><strong>Would pay again:</strong> $475<br><strong>Traveler range:</strong> $450–575<br><strong>Current price:</strong> $710<br><strong>Value:</strong> materially above traveler-assessed fair value</div>
<p class="muted">${hotelCount ? hotelCount+" published hotels in the current corpus." : "Cloudflare data bootstrap in progress."}</p></section>`), "SecretNests | What should this hotel cost?");
}

async function creatorPage(handle, env){
  const creator=await env.DB.prepare(`SELECT cp.*,
    (SELECT COUNT(*) FROM stays s WHERE s.creator_id=cp.id) stay_count,
    (SELECT COUNT(*) FROM trip_reports tr WHERE tr.creator_id=cp.id AND tr.status='published') report_count,
    (SELECT COUNT(*) FROM lists l WHERE l.creator_id=cp.id AND l.is_public=1) list_count,
    (SELECT COUNT(*) FROM booking_conversions bc WHERE bc.creator_id=cp.id AND bc.status IN ('confirmed','completed')) booking_count,
    (SELECT COALESCE(SUM(amount),0) FROM creator_earnings ce WHERE ce.creator_id=cp.id) earnings
    FROM creator_profiles cp WHERE lower(cp.handle)=lower(?) AND cp.is_public=1`).bind(handle).first();
  if(!creator) return new Response("Creator not found",{status:404});
  const lists=(await env.DB.prepare("SELECT slug,title,description FROM lists WHERE creator_id=? AND is_public=1 ORDER BY created_at DESC LIMIT 30").bind(creator.id).all()).results||[];
  let tastes=[]; try{tastes=JSON.parse(creator.taste_profile_json||"[]")}catch{}
  return page(shell(`
<section class="hero" style="padding-bottom:20px"><div class="eyebrow">@${esc(creator.handle)}</div><h1>${esc(creator.display_name)}</h1><p>${esc(creator.bio||"")}</p></section>
<div class="stats">
<div class="stat"><strong>${creator.stay_count||0}</strong><span>stays</span></div>
<div class="stat"><strong>${creator.report_count||0}</strong><span>trip reports</span></div>
<div class="stat"><strong>${creator.list_count||0}</strong><span>public lists</span></div>
<div class="stat"><strong>${creator.booking_count||0}</strong><span>bookings generated</span></div>
<div class="stat"><strong>$${Number(creator.earnings||0).toLocaleString(undefined,{maximumFractionDigits:0})}</strong><span>earned</span></div>
</div>
<h2>Taste profile</h2><div>${tastes.map(t=>`<span class="pill">${esc(t)}</span>`).join("")||'<span class="muted">Taste profile not added yet.</span>'}</div>
<h2 style="margin-top:46px">Lists</h2><ul class="list">${lists.map(l=>`<li><a href="/@${encodeURIComponent(creator.handle)}/lists/${encodeURIComponent(l.slug)}"><strong>${esc(l.title)}</strong></a><br><span class="muted">${esc(l.description||"")}</span></li>`).join("")||'<li class="muted">No public lists yet.</li>'}</ul>
`), `${creator.display_name} (@${creator.handle}) | SecretNests`);
}

async function hotelPage(slug, env){
  const h=await env.DB.prepare("SELECT * FROM hotels WHERE slug=? AND is_published=1").bind(slug).first();
  if(!h) return new Response("Hotel not found",{status:404});
  const v=await env.DB.prepare("SELECT * FROM hotel_value_snapshots WHERE hotel_id=? ORDER BY calculated_at DESC LIMIT 1").bind(h.id).first();
  const location=[h.city,h.country].filter(Boolean).join(", ");
  const valueBlock=v?`<section><h2>What travelers think it's worth</h2><div class="value">
<div><div class="eyebrow">Traveler range</div><strong>$${esc(v.traveler_low)}–${esc(v.traveler_high)}</strong></div>
<div><div class="eyebrow">Median would pay</div><strong>$${esc(v.median_would_pay)}</strong></div>
<div><div class="eyebrow">Current price</div><strong>${v.current_price?"$"+esc(v.current_price):"—"}</strong></div>
<div><div class="eyebrow">Sample</div><strong>${esc(v.sample_size)}</strong> stays</div></div>
<p><strong>Value:</strong> ${esc(v.value_classification||"insufficient data")}</p></section>`:
`<section><h2>What travelers think it's worth</h2><p class="muted">Not enough first-party stay data yet. Be one of the first travelers to add a paid price and what you'd pay again.</p></section>`;
  return page(shell(`<section class="hero" style="padding-bottom:28px"><div class="eyebrow">${esc(location)}</div><h1>${esc(h.name)}</h1><p>${esc(h.description||"")}</p></section>${valueBlock}
<section style="margin-top:48px"><h2>Price context</h2><p>Existing estimated range: ${h.price_estimate_min?"$"+h.price_estimate_min:"—"}–${h.price_estimate_max?"$"+h.price_estimate_max:"—"} per night.</p></section>`), `${h.name} value & traveler prices | SecretNests`, h.description||`${h.name} in ${location}: traveler price context and value.`);
}

async function listPage(handle, slug, env){
  const l=await env.DB.prepare(`SELECT l.*,cp.handle,cp.display_name FROM lists l JOIN creator_profiles cp ON cp.id=l.creator_id WHERE lower(cp.handle)=lower(?) AND l.slug=? AND l.is_public=1 AND cp.is_public=1`).bind(handle,slug).first();
  if(!l)return new Response("List not found",{status:404});
  const items=(await env.DB.prepare(`SELECT h.name,h.slug,h.city,h.country,li.note,li.rank FROM list_items li JOIN hotels h ON h.id=li.hotel_id WHERE li.list_id=? ORDER BY COALESCE(li.rank,999999),li.created_at`).bind(l.id).all()).results||[];
  return page(shell(`<section class="hero" style="padding-bottom:20px"><div class="eyebrow">A list by <a href="/@${encodeURIComponent(l.handle)}">@${esc(l.handle)}</a></div><h1>${esc(l.title)}</h1><p>${esc(l.description||"")}</p></section>
<ul class="list">${items.map((x,i)=>`<li><a href="/hotel/${encodeURIComponent(x.slug)}"><strong>${x.rank||i+1}. ${esc(x.name)}</strong></a> · ${esc([x.city,x.country].filter(Boolean).join(", "))}<br><span class="muted">${esc(x.note||"")}</span></li>`).join("")||'<li class="muted">No hotels added yet.</li>'}</ul>`), `${l.title} by @${l.handle} | SecretNests`);
}

async function apiHotels(request,env){
  const url=new URL(request.url); const limit=Math.min(Number(url.searchParams.get("limit")||24),100);
  const rows=await env.DB.prepare("SELECT id,name,slug,city,country,price_estimate_min,price_estimate_max,google_rating,reddit_mention_count FROM hotels WHERE is_published=1 ORDER BY reddit_mention_count DESC,google_rating DESC LIMIT ?").bind(limit).all();
  return json(rows.results||[]);
}

async function sitemap(env){
  const origin="https://secretnests.com";
  const urls=[origin+"/"];
  try{
    const hotels=(await env.DB.prepare("SELECT slug FROM hotels WHERE is_published=1").all()).results||[];
    const creators=(await env.DB.prepare("SELECT handle FROM creator_profiles WHERE is_public=1").all()).results||[];
    const lists=(await env.DB.prepare("SELECT cp.handle,l.slug FROM lists l JOIN creator_profiles cp ON cp.id=l.creator_id WHERE l.is_public=1 AND cp.is_public=1").all()).results||[];
    urls.push(...hotels.map(x=>origin+"/hotel/"+encodeURIComponent(x.slug)),...creators.map(x=>origin+"/@"+encodeURIComponent(x.handle)),...lists.map(x=>origin+"/@"+encodeURIComponent(x.handle)+"/lists/"+encodeURIComponent(x.slug)));
  }catch{}
  return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(u=>'<url><loc>'+esc(u)+'</loc></url>').join("")+'</urlset>',{headers:{"content-type":"application/xml; charset=utf-8"}});
}

export default { async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==="/")return home(env);
  if(url.pathname==="/api/hotels")return apiHotels(request,env);
  if(url.pathname==="/health")return json({ok:true,service:"secretnests"});
  if(url.pathname==="/sitemap.xml")return sitemap(env);
  const hotel=url.pathname.match(/^\/hotel\/([^/]+)$/); if(hotel)return hotelPage(decodeURIComponent(hotel[1]),env);
  const list=url.pathname.match(/^\/@([^/]+)\/lists\/([^/]+)$/); if(list)return listPage(decodeURIComponent(list[1]),decodeURIComponent(list[2]),env);
  const creator=url.pathname.match(/^\/@([^/]+)$/); if(creator)return creatorPage(decodeURIComponent(creator[1]),env);
  if(url.pathname==="/robots.txt")return new Response("User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: https://secretnests.com/sitemap.xml\n",{headers:{"content-type":"text/plain"}});
  if(url.pathname==="/llms.txt")return new Response("# SecretNests\n\nSecretNests is a traveler-led luxury hotel valuation and taste network. Core data includes actual paid prices, traveler willingness-to-pay, hotel value ranges, public creator lists and attributable booking outcomes.\n",{headers:{"content-type":"text/plain"}});
  return new Response("Not found",{status:404});
}};
