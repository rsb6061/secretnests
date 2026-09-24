const ORIGIN = "https://secretnests.com";

const esc = (v = "") => String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const attr = (v = "") => esc(v).replace(/\n/g," ");
const money = (v) => v == null || v === "" ? "—" : "$" + Number(v).toLocaleString(undefined,{maximumFractionDigits:0});
const safeJson = (v, fallback=[]) => { try { return JSON.parse(v ?? "") } catch { return fallback } };
const nowIso = () => new Date().toISOString();

function headers(extra={}) {
  return {
    "content-type":"text/html; charset=utf-8",
    "x-content-type-options":"nosniff",
    "referrer-policy":"strict-origin-when-cross-origin",
    "permissions-policy":"camera=(), microphone=(), geolocation=()",
    "content-security-policy":"default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.clarity.ms; connect-src 'self' https://www.google-analytics.com https://*.clarity.ms; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    ...extra
  };
}

function analytics(env){
  const ga = env.GA4_MEASUREMENT_ID ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${attr(env.GA4_MEASUREMENT_ID)}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${attr(env.GA4_MEASUREMENT_ID)}',{send_page_view:true});</script>` : "";
  const clarity = env.CLARITY_PROJECT_ID ? `<script>(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script","${attr(env.CLARITY_PROJECT_ID)}");</script>` : "";
  return ga + clarity;
}

function page(body, env, {
  title="SecretNests",
  description="Real travelers share what they paid, what they'd pay again, and which luxury hotels are actually worth the splurge.",
  canonical="/",
  jsonLd=null
}={}) {
  const canonicalUrl = canonical.startsWith("http") ? canonical : ORIGIN + canonical;
  return new Response(`<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${attr(description)}">
<link rel="canonical" href="${attr(canonicalUrl)}"><meta property="og:title" content="${attr(title)}"><meta property="og:description" content="${attr(description)}"><meta property="og:url" content="${attr(canonicalUrl)}"><meta property="og:type" content="website">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g,"\\u003c")}</script>` : ""}
${analytics(env)}
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#111;background:#fff}*{box-sizing:border-box}body{margin:0;background:#fff;color:#111}a{color:inherit}.wrap{max-width:1160px;margin:auto;padding:24px}header{display:flex;justify-content:space-between;gap:20px;align-items:center;border-bottom:1px solid #ececec}.brand{font-family:Georgia,serif;font-size:25px;font-weight:700;text-decoration:none}nav{display:flex;gap:16px;align-items:center;flex-wrap:wrap}nav a{text-decoration:none}.hero{padding:70px 0 42px}.hero h1,h1,h2,h3{font-family:Georgia,serif}.hero h1{font-size:clamp(42px,7vw,76px);line-height:1;max-width:900px;margin:0 0 20px}.hero p{font-size:20px;line-height:1.55;max-width:790px;color:#444}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:18px}.card{border:1px solid #ddd;border-radius:14px;padding:20px;text-decoration:none}.card:hover{border-color:#999}.eyebrow{text-transform:uppercase;font-size:12px;letter-spacing:.12em;color:#666}.metric{font-size:28px;font-weight:700}.quote{border-left:3px solid #111;padding-left:20px;margin:26px 0}.muted{color:#666}.pill{display:inline-block;padding:7px 11px;border:1px solid #ccc;border-radius:999px;margin:4px 4px 4px 0}.stats{display:flex;gap:28px;flex-wrap:wrap;margin:24px 0}.stat strong{display:block;font-size:24px}.list{padding:0;list-style:none}.list li{padding:14px 0;border-bottom:1px solid #eee}.value{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.value>div{border:1px solid #ddd;border-radius:12px;padding:16px}.search{display:flex;gap:10px;max-width:760px}.search input,.search select,.search textarea{width:100%;padding:14px 15px;border:1px solid #bbb;border-radius:10px;font:inherit}.search button,.btn{border:0;background:#111;color:#fff;padding:14px 18px;border-radius:10px;font:inherit;text-decoration:none;display:inline-block;cursor:pointer}.filters{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}.section{padding:42px 0}.hotel-row{display:grid;grid-template-columns:1fr auto;gap:20px;align-items:start}.kicker{font-size:14px;color:#666}.notice{border:1px solid #ddd;background:#fafafa;border-radius:12px;padding:16px}.error{border-color:#d99;background:#fff7f7}.footer{margin-top:70px;border-top:1px solid #eee;padding:30px 24px;color:#666}.two{display:grid;grid-template-columns:1.5fr 1fr;gap:26px}@media(max-width:760px){.value{grid-template-columns:1fr 1fr}.two{grid-template-columns:1fr}.search{flex-direction:column}.hotel-row{grid-template-columns:1fr}}
</style></head><body>${body}<footer class="footer wrap">SecretNests · Luxury hotel value, according to people who actually stayed.</footer>
<script>document.addEventListener('click',function(e){var a=e.target.closest('[data-event]');if(!a)return;fetch('/api/events',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:a.dataset.event,hotel_id:a.dataset.hotelId||null,creator_id:a.dataset.creatorId||null,list_id:a.dataset.listId||null,path:location.pathname})}).catch(function(){})})</script>
</body></html>`,{headers:headers()});
}

const json = (data,status=200) => new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});

const shell = (content) => `<header class="wrap"><a class="brand" href="/">SecretNests</a><nav><a href="/destinations">Destinations</a><a href="/creators">Travelers</a><a href="/add-your-trip">Add Your Trip</a><a href="/about">How it works</a></nav></header><main class="wrap">${content}</main>`;

async function home(env){
  let hotelCount=0;
  try { hotelCount=(await env.DB.prepare("SELECT COUNT(*) AS n FROM hotels WHERE is_published=1").first())?.n||0; } catch {}
  let top=[];
  try { top=(await env.DB.prepare("SELECT name,slug,city,country,price_estimate_min,price_estimate_max,google_rating FROM hotels WHERE is_published=1 ORDER BY reddit_mention_count DESC,google_rating DESC LIMIT 6").all()).results||[]; } catch {}
  return page(shell(`
<section class="hero"><div class="eyebrow">Luxury hotel value, according to people who actually stayed</div><h1>What should this hotel cost?</h1><p>Search luxury hotels by destination, then compare what travelers paid, what they would pay again, and whether the current rate looks justified.</p>
<form class="search" action="/search" method="get"><input name="q" placeholder="Hotel, city, country, or style" aria-label="Search hotels"><button>Search</button></form></section>
<section class="grid"><div class="card"><div class="eyebrow">Value intelligence</div><h2>Paid vs. worth</h2><p>Price-sensitive hotel opinions, not generic star ratings.</p></div><div class="card"><div class="eyebrow">Traveler portfolios</div><h2>Follow taste</h2><p>Public stays, trip reports, and lists tied to identifiable traveler taste.</p></div><div class="card"><div class="eyebrow">Booking attribution</div><h2>Creators earn from outcomes</h2><p>Revenue can follow attributable bookings, never review positivity.</p></div></section>
<section class="section"><h2>Explore the current hotel corpus</h2><div class="grid">${top.map(h=>`<a class="card" href="/hotel/${encodeURIComponent(h.slug)}"><div class="eyebrow">${esc([h.city,h.country].filter(Boolean).join(", "))}</div><h3>${esc(h.name)}</h3><p class="muted">${money(h.price_estimate_min)}–${money(h.price_estimate_max)} estimated nightly range</p></a>`).join("")}</div><p class="muted" style="margin-top:18px">${hotelCount ? hotelCount+" published hotels in the current corpus." : "Cloudflare data bootstrap pending."}</p></section>`),env,{title:"SecretNests | What should this hotel cost?",canonical:"/"});
}

async function searchPage(request,env){
  const url=new URL(request.url); const q=(url.searchParams.get("q")||"").trim();
  let rows=[];
  if(q){
    const like="%"+q.toLowerCase()+"%";
    rows=(await env.DB.prepare(`SELECT name,slug,city,country,description,price_estimate_min,price_estimate_max,google_rating,reddit_mention_count
      FROM hotels WHERE is_published=1 AND (lower(name) LIKE ? OR lower(city) LIKE ? OR lower(country) LIKE ? OR lower(COALESCE(description,'')) LIKE ?)
      ORDER BY CASE WHEN lower(name)=lower(?) THEN 0 ELSE 1 END, reddit_mention_count DESC, google_rating DESC LIMIT 60`).bind(like,like,like,like,q).all()).results||[];
  }
  return page(shell(`<section class="hero" style="padding-bottom:24px"><div class="eyebrow">Hotel search</div><h1>${q?esc(q):"Find a hotel worth the rate"}</h1><form class="search" action="/search"><input name="q" value="${attr(q)}" placeholder="Hotel, city, country, or style"><button>Search</button></form></section>
<section><p class="muted">${q ? rows.length+" matches" : "Search by hotel, city, country, or a phrase such as design hotel."}</p><ul class="list">${rows.map(h=>`<li class="hotel-row"><div><a href="/hotel/${encodeURIComponent(h.slug)}"><strong>${esc(h.name)}</strong></a><div class="kicker">${esc([h.city,h.country].filter(Boolean).join(", "))}</div><p>${esc((h.description||"").slice(0,220))}</p></div><div>${money(h.price_estimate_min)}–${money(h.price_estimate_max)}</div></li>`).join("")|| (q?'<li class="muted">No matching hotels yet.</li>':"")}</ul></section>`),env,{title:q?`${q} hotel search | SecretNests`:"Hotel search | SecretNests",canonical:"/search"+(q?"?q="+encodeURIComponent(q):"")});
}

async function destinationsPage(env){
  const rows=(await env.DB.prepare(`SELECT city,country,COUNT(*) n FROM hotels WHERE is_published=1 AND city IS NOT NULL AND city<>'' GROUP BY city,country ORDER BY n DESC,city LIMIT 120`).all()).results||[];
  return page(shell(`<section class="hero" style="padding-bottom:24px"><div class="eyebrow">Destinations</div><h1>Where should your hotel budget go?</h1><p>Browse destinations in the current SecretNests hotel corpus.</p></section><div class="grid">${rows.map(x=>`<a class="card" href="/destination/${encodeURIComponent((x.city+"-"+(x.country||"")).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""))}?city=${encodeURIComponent(x.city)}&country=${encodeURIComponent(x.country||"")}"><strong>${esc(x.city)}</strong><br><span class="muted">${esc(x.country||"")} · ${x.n} hotels</span></a>`).join("")}</div>`),env,{title:"Luxury hotel destinations | SecretNests",canonical:"/destinations"});
}

async function destinationPage(request,env){
  const u=new URL(request.url), city=(u.searchParams.get("city")||"").trim(), country=(u.searchParams.get("country")||"").trim();
  if(!city)return new Response("Destination not found",{status:404});
  const rows=(await env.DB.prepare(`SELECT name,slug,city,country,description,price_estimate_min,price_estimate_max,google_rating,reddit_mention_count FROM hotels WHERE is_published=1 AND lower(city)=lower(?) AND (?='' OR lower(country)=lower(?)) ORDER BY reddit_mention_count DESC,google_rating DESC,name`).bind(city,country,country).all()).results||[];
  return page(shell(`<section class="hero" style="padding-bottom:24px"><div class="eyebrow">${esc(country)}</div><h1>Luxury hotels in ${esc(city)}</h1><p>Compare price context and traveler value signals before you book.</p></section><div class="grid">${rows.map(h=>`<a class="card" href="/hotel/${encodeURIComponent(h.slug)}"><h3>${esc(h.name)}</h3><p class="muted">${money(h.price_estimate_min)}–${money(h.price_estimate_max)} estimated nightly range</p><p>${esc((h.description||"").slice(0,180))}</p></a>`).join("")}</div>`),env,{title:`Best-value luxury hotels in ${city} | SecretNests`,description:`Luxury hotels in ${city}, ${country}: traveler value context, price ranges, and hotel comparisons.`,canonical:u.pathname+"?city="+encodeURIComponent(city)+"&country="+encodeURIComponent(country)});
}

async function creatorsPage(env){
  const rows=(await env.DB.prepare(`SELECT cp.handle,cp.display_name,cp.bio,(SELECT COUNT(*) FROM stays s WHERE s.creator_id=cp.id) stay_count,(SELECT COUNT(*) FROM lists l WHERE l.creator_id=cp.id AND l.is_public=1) list_count FROM creator_profiles cp WHERE cp.is_public=1 ORDER BY stay_count DESC,cp.display_name LIMIT 100`).all()).results||[];
  return page(shell(`<section class="hero" style="padding-bottom:24px"><div class="eyebrow">Travelers</div><h1>Follow people whose hotel taste you trust.</h1></section><div class="grid">${rows.map(c=>`<a class="card" href="/@${encodeURIComponent(c.handle)}"><h3>${esc(c.display_name)}</h3><div class="kicker">@${esc(c.handle)} · ${c.stay_count||0} stays · ${c.list_count||0} lists</div><p>${esc(c.bio||"")}</p></a>`).join("")||'<div class="notice">Creator profiles will appear as travelers begin publishing stays and lists.</div>'}</div>`),env,{title:"Hotel travelers & creators | SecretNests",canonical:"/creators"});
}

async function creatorPage(handle, env){
  const creator=await env.DB.prepare(`SELECT cp.*,(SELECT COUNT(*) FROM stays s WHERE s.creator_id=cp.id) stay_count,(SELECT COUNT(*) FROM trip_reports tr WHERE tr.creator_id=cp.id AND tr.status='published') report_count,(SELECT COUNT(*) FROM lists l WHERE l.creator_id=cp.id AND l.is_public=1) list_count,(SELECT COUNT(*) FROM booking_conversions bc WHERE bc.creator_id=cp.id AND bc.status IN ('confirmed','completed')) booking_count,(SELECT COALESCE(SUM(amount),0) FROM creator_earnings ce WHERE ce.creator_id=cp.id) earnings FROM creator_profiles cp WHERE lower(cp.handle)=lower(?) AND cp.is_public=1`).bind(handle).first();
  if(!creator) return new Response("Creator not found",{status:404});
  const lists=(await env.DB.prepare("SELECT id,slug,title,description FROM lists WHERE creator_id=? AND is_public=1 ORDER BY created_at DESC LIMIT 30").bind(creator.id).all()).results||[];
  const stays=(await env.DB.prepare(`SELECT s.stay_month,s.paid_nightly_rate,h.name,h.slug,h.city,h.country,vo.would_pay_again,tr.would_return FROM stays s JOIN hotels h ON h.id=s.hotel_id LEFT JOIN value_opinions vo ON vo.stay_id=s.id LEFT JOIN trip_reports tr ON tr.stay_id=s.id WHERE s.creator_id=? ORDER BY s.stay_month DESC,s.created_at DESC LIMIT 40`).bind(creator.id).all()).results||[];
  const tastes=safeJson(creator.taste_profile_json,[]);
  return page(shell(`<section class="hero" style="padding-bottom:20px"><div class="eyebrow">@${esc(creator.handle)}</div><h1>${esc(creator.display_name)}</h1><p>${esc(creator.bio||"")}</p></section><div class="stats"><div class="stat"><strong>${creator.stay_count||0}</strong><span>stays</span></div><div class="stat"><strong>${creator.report_count||0}</strong><span>trip reports</span></div><div class="stat"><strong>${creator.list_count||0}</strong><span>public lists</span></div><div class="stat"><strong>${creator.booking_count||0}</strong><span>bookings generated</span></div><div class="stat"><strong>${money(creator.earnings||0)}</strong><span>earned</span></div></div><h2>Taste profile</h2><div>${tastes.map(t=>`<span class="pill">${esc(t)}</span>`).join("")||'<span class="muted">Taste profile not added yet.</span>'}</div><section class="section"><h2>Recent stays</h2><ul class="list">${stays.map(s=>`<li><a href="/hotel/${encodeURIComponent(s.slug)}"><strong>${esc(s.name)}</strong></a> · ${esc([s.city,s.country].filter(Boolean).join(", "))}<br><span class="muted">Stayed ${esc(s.stay_month||"—")} · paid ${money(s.paid_nightly_rate)} · would pay again ${money(s.would_pay_again)} · would return ${s.would_return==null?"—":s.would_return?"Yes":"No"}</span></li>`).join("")||'<li class="muted">No public stays yet.</li>'}</ul></section><section><h2>Lists</h2><ul class="list">${lists.map(l=>`<li><a href="/@${encodeURIComponent(creator.handle)}/lists/${encodeURIComponent(l.slug)}"><strong>${esc(l.title)}</strong></a><br><span class="muted">${esc(l.description||"")}</span></li>`).join("")||'<li class="muted">No public lists yet.</li>'}</ul></section>`),env,{title:`${creator.display_name} (@${creator.handle}) | SecretNests`,canonical:"/@"+encodeURIComponent(creator.handle)});
}

async function hotelPage(slug, env){
  const h=await env.DB.prepare("SELECT * FROM hotels WHERE slug=? AND is_published=1").bind(slug).first();
  if(!h) return new Response("Hotel not found",{status:404});
  const v=await env.DB.prepare("SELECT * FROM hotel_value_snapshots WHERE hotel_id=? ORDER BY calculated_at DESC LIMIT 1").bind(h.id).first();
  const evidence=(await env.DB.prepare("SELECT sentiment,price_mentioned,trip_context,confidence,source_url FROM reddit_evidence WHERE hotel_id=? ORDER BY created_at DESC LIMIT 8").bind(h.id).all()).results||[];
  const comps=(await env.DB.prepare(`SELECT name,slug,city,country,price_estimate_min,price_estimate_max FROM hotels WHERE is_published=1 AND id<>? AND ((city IS NOT NULL AND city=?) OR (country IS NOT NULL AND country=?)) ORDER BY ABS(COALESCE(price_estimate_min,0)-COALESCE(?,0)),reddit_mention_count DESC LIMIT 4`).bind(h.id,h.city||"",h.country||"",h.price_estimate_min||0).all()).results||[];
  const highlights=safeJson(h.highlights_json,[]), bestFor=safeJson(h.best_for_json,[]), notIdeal=safeJson(h.not_ideal_for_json,[]);
  const location=[h.city,h.country].filter(Boolean).join(", ");
  const valueBlock=v?`<section><h2>What travelers think it's worth</h2><div class="value"><div><div class="eyebrow">Traveler range</div><strong>${money(v.traveler_low)}–${money(v.traveler_high)}</strong></div><div><div class="eyebrow">Median would pay</div><strong>${money(v.median_would_pay)}</strong></div><div><div class="eyebrow">Current price</div><strong>${money(v.current_price)}</strong></div><div><div class="eyebrow">Sample</div><strong>${esc(v.sample_size)}</strong> stays</div></div><p><strong>Value:</strong> ${esc(v.value_classification||"insufficient data")}</p></section>`:`<section><h2>What travelers think it's worth</h2><p class="muted">Not enough first-party stay data yet. Add your stay to help establish the fair-value range.</p></section>`;
  const jsonLd={"@context":"https://schema.org","@type":"Hotel","name":h.name,"description":h.description||undefined,"url":ORIGIN+"/hotel/"+h.slug,"address":h.formatted_address||h.address||undefined,"telephone":h.phone||undefined,"sameAs":h.website?[h.website]:undefined,"aggregateRating":h.google_rating?{"@type":"AggregateRating","ratingValue":h.google_rating,"reviewCount":h.google_review_count||undefined}:undefined};
  return page(shell(`<section class="hero" style="padding-bottom:28px"><div class="eyebrow">${esc(location)}</div><h1>${esc(h.name)}</h1><p>${esc(h.description||"")}</p><div class="filters">${highlights.slice(0,5).map(x=>`<span class="pill">${esc(x)}</span>`).join("")}</div></section><div class="two"><div>${valueBlock}<section class="section"><h2>Price context</h2><p>Existing estimated range: <strong>${money(h.price_estimate_min)}–${money(h.price_estimate_max)}</strong> per night.</p>${h.booking_url?`<a class="btn" data-event="outbound_booking_click" data-hotel-id="${attr(h.id)}" href="/out/${encodeURIComponent(h.slug)}" rel="nofollow sponsored">Check booking options</a>`:""}</section><section><h2>Traveler evidence</h2><ul class="list">${evidence.map(e=>`<li>${e.price_mentioned?`<strong>${money(e.price_mentioned)}</strong> · `:""}${esc(e.trip_context||e.sentiment||"Traveler mention")} ${e.source_url?`<a href="${attr(e.source_url)}" rel="nofollow noopener">source</a>`:""}</li>`).join("")||'<li class="muted">No structured traveler evidence yet.</li>'}</ul></section></div><aside><div class="card"><h3>Best for</h3><div>${bestFor.map(x=>`<span class="pill">${esc(x)}</span>`).join("")||'<span class="muted">Not classified yet.</span>'}</div><h3>Not ideal for</h3><div>${notIdeal.map(x=>`<span class="pill">${esc(x)}</span>`).join("")||'<span class="muted">Not classified yet.</span>'}</div></div></aside></div><section class="section"><h2>Nearby / comparable alternatives</h2><div class="grid">${comps.map(c=>`<a class="card" href="/hotel/${encodeURIComponent(c.slug)}"><strong>${esc(c.name)}</strong><br><span class="muted">${esc([c.city,c.country].filter(Boolean).join(", "))} · ${money(c.price_estimate_min)}–${money(c.price_estimate_max)}</span></a>`).join("")}</div></section>`),env,{title:`${h.name}: price, value & traveler evidence | SecretNests`,description:h.description||`${h.name} in ${location}: traveler price context and value.`,canonical:"/hotel/"+encodeURIComponent(h.slug),jsonLd});
}

async function listPage(handle, slug, env){
  const l=await env.DB.prepare(`SELECT l.*,cp.handle,cp.display_name FROM lists l JOIN creator_profiles cp ON cp.id=l.creator_id WHERE lower(cp.handle)=lower(?) AND l.slug=? AND l.is_public=1 AND cp.is_public=1`).bind(handle,slug).first();
  if(!l)return new Response("List not found",{status:404});
  const items=(await env.DB.prepare(`SELECT h.name,h.slug,h.city,h.country,li.note,li.rank FROM list_items li JOIN hotels h ON h.id=li.hotel_id WHERE li.list_id=? ORDER BY COALESCE(li.rank,999999),li.created_at`).bind(l.id).all()).results||[];
  return page(shell(`<section class="hero" style="padding-bottom:20px"><div class="eyebrow">A list by <a href="/@${encodeURIComponent(l.handle)}">@${esc(l.handle)}</a></div><h1>${esc(l.title)}</h1><p>${esc(l.description||"")}</p></section><ul class="list">${items.map((x,i)=>`<li><a href="/hotel/${encodeURIComponent(x.slug)}"><strong>${x.rank||i+1}. ${esc(x.name)}</strong></a> · ${esc([x.city,x.country].filter(Boolean).join(", "))}<br><span class="muted">${esc(x.note||"")}</span></li>`).join("")||'<li class="muted">No hotels added yet.</li>'}</ul>`),env,{title:`${l.title} by @${l.handle} | SecretNests`,canonical:`/@${encodeURIComponent(l.handle)}/lists/${encodeURIComponent(l.slug)}`});
}

async function addTripPage(env){
  return page(shell(`<section class="hero" style="padding-bottom:26px"><div class="eyebrow">Add Your Trip</div><h1>Turn a hotel stay into useful price intelligence.</h1><p>SecretNests is designed to capture what you paid, what you would pay again, room context, and whether you would return.</p></section><div class="notice"><strong>Creator submissions are staged but not open yet.</strong><p>We are intentionally launching public hotel discovery before enabling account creation and stay publishing. This avoids carrying Floot auth into production. The D1 schema already supports verified stays, trip reports, value opinions, lists, and creator earnings.</p></div>`),env,{title:"Add Your Trip | SecretNests",canonical:"/add-your-trip"});
}

async function aboutPage(env){
  return page(shell(`<section class="hero"><div class="eyebrow">How it works</div><h1>A hotel can be excellent and still not be worth the rate.</h1><p>SecretNests separates quality from value. Travelers record actual paid prices and the price they would happily pay again; those observations can be aggregated into a traveler-assessed fair-value range.</p></section><div class="grid"><div class="card"><h3>1. Stay</h3><p>Log the hotel, date, room context, booking channel and what you paid.</p></div><div class="card"><h3>2. Value it</h3><p>Say what you would pay again and when the hotel becomes hard to justify.</p></div><div class="card"><h3>3. Publish taste</h3><p>Build lists and a public travel portfolio other travelers can follow.</p></div></div>`),env,{title:"How SecretNests works",canonical:"/about"});
}

async function apiHotels(request,env){
  const url=new URL(request.url); const limit=Math.min(Math.max(Number(url.searchParams.get("limit")||24),1),100);
  const city=(url.searchParams.get("city")||"").trim();
  const rows=city?await env.DB.prepare("SELECT id,name,slug,city,country,price_estimate_min,price_estimate_max,google_rating,reddit_mention_count FROM hotels WHERE is_published=1 AND lower(city)=lower(?) ORDER BY reddit_mention_count DESC,google_rating DESC LIMIT ?").bind(city,limit).all():await env.DB.prepare("SELECT id,name,slug,city,country,price_estimate_min,price_estimate_max,google_rating,reddit_mention_count FROM hotels WHERE is_published=1 ORDER BY reddit_mention_count DESC,google_rating DESC LIMIT ?").bind(limit).all();
  return json(rows.results||[]);
}

async function recordEvent(request,env){
  let body={}; try{body=await request.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  const allowed=new Set(["hotel_view","creator_view","list_view","value_view","outbound_booking_click","search"]);
  if(!allowed.has(body.name))return json({ok:false,error:"invalid_event"},400);
  try{
    const id=crypto.randomUUID();
    await env.DB.prepare("INSERT INTO analytics_events (id,event_name,hotel_id,creator_id,list_id,path,session_id,referrer,user_agent,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .bind(id,body.name,body.hotel_id||null,body.creator_id||null,body.list_id||null,body.path||null,body.session_id||null,request.headers.get("referer"),request.headers.get("user-agent"),nowIso()).run();
  }catch(e){console.error("analytics_event_failed",e?.message||e)}
  return json({ok:true});
}

async function outbound(slug,request,env){
  const h=await env.DB.prepare("SELECT id,booking_url FROM hotels WHERE slug=? AND is_published=1").bind(slug).first();
  if(!h?.booking_url)return new Response("Booking link unavailable",{status:404});
  try{
    const clickId=crypto.randomUUID();
    await env.DB.prepare("INSERT INTO affiliate_clicks (id,hotel_id,provider,destination_url,session_id,referrer,created_at) VALUES (?,?,?,?,?,?,?)").bind(clickId,h.id,"legacy",h.booking_url,null,request.headers.get("referer"),nowIso()).run();
  }catch(e){console.error("affiliate_click_failed",e?.message||e)}
  return Response.redirect(h.booking_url,302);
}

async function sitemap(env){
  const urls=[ORIGIN+"/",ORIGIN+"/search",ORIGIN+"/destinations",ORIGIN+"/creators",ORIGIN+"/about",ORIGIN+"/add-your-trip"];
  try{
    const hotels=(await env.DB.prepare("SELECT slug FROM hotels WHERE is_published=1").all()).results||[];
    const creators=(await env.DB.prepare("SELECT handle FROM creator_profiles WHERE is_public=1").all()).results||[];
    const lists=(await env.DB.prepare("SELECT cp.handle,l.slug FROM lists l JOIN creator_profiles cp ON cp.id=l.creator_id WHERE l.is_public=1 AND cp.is_public=1").all()).results||[];
    urls.push(...hotels.map(x=>ORIGIN+"/hotel/"+encodeURIComponent(x.slug)),...creators.map(x=>ORIGIN+"/@"+encodeURIComponent(x.handle)),...lists.map(x=>ORIGIN+"/@"+encodeURIComponent(x.handle)+"/lists/"+encodeURIComponent(x.slug)));
  }catch(e){console.error("sitemap_failed",e?.message||e)}
  return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(u=>'<url><loc>'+esc(u)+'</loc></url>').join("")+'</urlset>',{headers:{"content-type":"application/xml; charset=utf-8","cache-control":"public,max-age=900"}});
}

async function route(request,env){
  const url=new URL(request.url);
  if(url.hostname==="www.secretnests.com") return Response.redirect(ORIGIN+url.pathname+url.search,301);
  if(request.method==="GET" && url.pathname==="/")return home(env);
  if(request.method==="GET" && url.pathname==="/search")return searchPage(request,env);
  if(request.method==="GET" && url.pathname==="/destinations")return destinationsPage(env);
  if(request.method==="GET" && /^\/destination\//.test(url.pathname))return destinationPage(request,env);
  if(request.method==="GET" && url.pathname==="/creators")return creatorsPage(env);
  if(request.method==="GET" && url.pathname==="/add-your-trip")return addTripPage(env);
  if(request.method==="GET" && url.pathname==="/about")return aboutPage(env);
  if(request.method==="GET" && url.pathname==="/api/hotels")return apiHotels(request,env);
  if(request.method==="POST" && url.pathname==="/api/events")return recordEvent(request,env);
  if(request.method==="GET" && url.pathname==="/health")return json({ok:true,service:"secretnests",runtime:"cloudflare-worker"});
  if(request.method==="GET" && url.pathname==="/sitemap.xml")return sitemap(env);
  const out=url.pathname.match(/^\/out\/([^/]+)$/); if(request.method==="GET"&&out)return outbound(decodeURIComponent(out[1]),request,env);
  const hotel=url.pathname.match(/^\/hotel\/([^/]+)$/); if(request.method==="GET"&&hotel)return hotelPage(decodeURIComponent(hotel[1]),env);
  const list=url.pathname.match(/^\/@([^/]+)\/lists\/([^/]+)$/); if(request.method==="GET"&&list)return listPage(decodeURIComponent(list[1]),decodeURIComponent(list[2]),env);
  const creator=url.pathname.match(/^\/@([^/]+)$/); if(request.method==="GET"&&creator)return creatorPage(decodeURIComponent(creator[1]),env);
  if(request.method==="GET" && url.pathname==="/robots.txt")return new Response("User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /out/\nSitemap: https://secretnests.com/sitemap.xml\n",{headers:{"content-type":"text/plain; charset=utf-8","cache-control":"public,max-age=3600"}});
  if(request.method==="GET" && url.pathname==="/llms.txt")return new Response("# SecretNests\n\nSecretNests is a traveler-led luxury hotel valuation and taste network. Core data includes actual paid prices, traveler willingness-to-pay, hotel value ranges, public creator lists and attributable booking outcomes.\n\nCanonical site: https://secretnests.com\nHotel pages: /hotel/{slug}\nCreators: /@{handle}\nLists: /@{handle}/lists/{slug}\n",{headers:{"content-type":"text/plain; charset=utf-8","cache-control":"public,max-age=3600"}});
  return new Response("Not found",{status:404,headers:{"content-type":"text/plain; charset=utf-8"}});
}

export default {
  async fetch(request,env,ctx){
    const requestId=crypto.randomUUID();
    const started=Date.now();
    try{
      const response=await route(request,env);
      const h=new Headers(response.headers); h.set("x-request-id",requestId);
      console.log(JSON.stringify({type:"request",request_id:requestId,method:request.method,path:new URL(request.url).pathname,status:response.status,duration_ms:Date.now()-started}));
      return new Response(response.body,{status:response.status,statusText:response.statusText,headers:h});
    }catch(e){
      console.error(JSON.stringify({type:"error",request_id:requestId,path:new URL(request.url).pathname,message:e?.message||String(e),stack:e?.stack||null}));
      const body=`<!doctype html><title>SecretNests</title><meta name="viewport" content="width=device-width"><body style="font-family:system-ui;padding:40px"><h1>Something went wrong.</h1><p>Please try again shortly.</p><p>Request ID: ${esc(requestId)}</p></body>`;
      return new Response(body,{status:500,headers:headers({"x-request-id":requestId})});
    }
  }
};
