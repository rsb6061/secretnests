import { recomputeHotelValuation } from "./value-engine.js";
import { sameOrigin, bodyTooLarge, enforceRateLimit, adminEmail, safeLogError } from "./security.js";

const ORIGIN = "https://secretnests.com";

const esc = (v = "") => String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const attr = (v = "") => esc(v).replace(/\n/g," ");
const money = (v) => v == null || v === "" ? "—" : "$" + Number(v).toLocaleString(undefined,{maximumFractionDigits:0});
const safeJson = (v, fallback=[]) => { try { return JSON.parse(v ?? "") } catch { return fallback } };
const nowIso = () => new Date().toISOString();
const slugify = (v="") => String(v).normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/&/g," and ").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").replace(/-{2,}/g,"-");

function headers(extra={}) {
  return {
    "content-type":"text/html; charset=utf-8",
    "x-content-type-options":"nosniff",
    "referrer-policy":"strict-origin-when-cross-origin",
    "permissions-policy":"camera=(), microphone=(), geolocation=()",
    "content-security-policy":"default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.clarity.ms; connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://*.clarity.ms; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
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
  jsonLd=null,
  robots="index,follow"
}={}) {
  const canonicalUrl = canonical.startsWith("http") ? canonical : ORIGIN + canonical;
  return new Response(`<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${attr(description)}"><meta name="robots" content="${attr(robots)}">${env.GOOGLE_SITE_VERIFICATION ? `<meta name="google-site-verification" content="${attr(env.GOOGLE_SITE_VERIFICATION)}">` : ""}
<link rel="canonical" href="${attr(canonicalUrl)}"><meta property="og:title" content="${attr(title)}"><meta property="og:description" content="${attr(description)}"><meta property="og:url" content="${attr(canonicalUrl)}"><meta property="og:type" content="website">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g,"\\u003c")}</script>` : ""}
${analytics(env)}
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#111;background:#fff}*{box-sizing:border-box}body{margin:0;background:#fff;color:#111}a{color:inherit}.wrap{max-width:1160px;margin:auto;padding:24px}header{display:flex;justify-content:space-between;gap:20px;align-items:center;border-bottom:1px solid #ececec}.brand{font-family:Georgia,serif;font-size:25px;font-weight:700;text-decoration:none}nav{display:flex;gap:16px;align-items:center;flex-wrap:wrap}nav a{text-decoration:none}.hero{padding:70px 0 42px}.hero h1,h1,h2,h3{font-family:Georgia,serif}.hero h1{font-size:clamp(42px,7vw,76px);line-height:1;max-width:900px;margin:0 0 20px}.hero p{font-size:20px;line-height:1.55;max-width:790px;color:#444}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:18px}.card{border:1px solid #ddd;border-radius:14px;padding:20px;text-decoration:none}.card:hover{border-color:#999}.eyebrow{text-transform:uppercase;font-size:12px;letter-spacing:.12em;color:#666}.metric{font-size:28px;font-weight:700}.quote{border-left:3px solid #111;padding-left:20px;margin:26px 0}.muted{color:#666}.pill{display:inline-block;padding:7px 11px;border:1px solid #ccc;border-radius:999px;margin:4px 4px 4px 0}.stats{display:flex;gap:28px;flex-wrap:wrap;margin:24px 0}.stat strong{display:block;font-size:24px}.list{padding:0;list-style:none}.list li{padding:14px 0;border-bottom:1px solid #eee}.value{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.value>div{border:1px solid #ddd;border-radius:12px;padding:16px}.search{display:flex;gap:10px;max-width:760px}.search input,.search select,.search textarea{width:100%;padding:14px 15px;border:1px solid #bbb;border-radius:10px;font:inherit}.search button,.btn{border:0;background:#111;color:#fff;padding:14px 18px;border-radius:10px;font:inherit;text-decoration:none;display:inline-block;cursor:pointer}.filters{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}.section{padding:42px 0}.hotel-row{display:grid;grid-template-columns:1fr auto;gap:20px;align-items:start}.kicker{font-size:14px;color:#666}.notice{border:1px solid #ddd;background:#fafafa;border-radius:12px;padding:16px}.error{border-color:#d99;background:#fff7f7}.footer{margin-top:70px;border-top:1px solid #eee;padding:30px 24px;color:#666}.hero-media{width:100%;max-height:620px;object-fit:cover;border-radius:16px;margin:18px 0 8px;background:#f4f4f4}.two{display:grid;grid-template-columns:1.5fr 1fr;gap:26px}@media(max-width:760px){.value{grid-template-columns:1fr 1fr}.two{grid-template-columns:1fr}.search{flex-direction:column}.hotel-row{grid-template-columns:1fr}}
</style></head><body>${body}<footer class="footer wrap">SecretNests · Luxury hotel value, according to people who actually stayed.</footer>
<script>(function(){var k='sn_session_id',sid=sessionStorage.getItem(k);if(!sid){sid=crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+Math.random().toString(36).slice(2);sessionStorage.setItem(k,sid)}function send(p){p.session_id=sid;p.path=location.pathname;fetch('/api/events',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(p),keepalive:true}).catch(function(){})}send({name:'page_view'});document.addEventListener('click',function(e){var a=e.target.closest('[data-event]');if(!a)return;send({name:a.dataset.event,hotel_id:a.dataset.hotelId||null,creator_id:a.dataset.creatorId||null,list_id:a.dataset.listId||null})})})();</script>
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
  const url=new URL(request.url);
  const q=(url.searchParams.get("q")||"").trim();
  let rows=[];
  if(q){
    const tokens=[...new Set(q.toLowerCase().split(/\s+/).map(x=>x.replace(/[^a-z0-9'-]/g,"")).filter(Boolean))].slice(0,6);
    if(tokens.length){
      const tokenClause=tokens.map(()=>"(lower(name) LIKE ? OR lower(COALESCE(city,'')) LIKE ? OR lower(COALESCE(country,'')) LIKE ? OR lower(COALESCE(description,'')) LIKE ? OR lower(COALESCE(highlights_json,'')) LIKE ? OR lower(COALESCE(best_for_json,'')) LIKE ?)").join(" AND ");
      const params=tokens.flatMap(t=>Array(6).fill("%"+t+"%"));
      rows=(await env.DB.prepare(`SELECT name,slug,city,country,description,price_estimate_min,price_estimate_max,google_rating,reddit_mention_count
        FROM hotels WHERE is_published=1 AND ${tokenClause}
        ORDER BY CASE WHEN lower(name)=lower(?) THEN 0 WHEN lower(name) LIKE lower(?) THEN 1 ELSE 2 END,
        reddit_mention_count DESC,google_rating DESC LIMIT 60`)
        .bind(...params,q,"%"+q+"%").all()).results||[];
    }
  }
  if(q && rows.length===0){ try{ await env.DB.prepare("INSERT INTO zero_result_searches (id,query,path,created_at) VALUES (?,?,?,?)").bind(crypto.randomUUID(),q,"/search",nowIso()).run(); }catch{} }
  return page(shell(`<section class="hero" style="padding-bottom:24px"><div class="eyebrow">Hotel search</div><h1>${q?esc(q):"Find a hotel worth the rate"}</h1><form class="search" action="/search"><input name="q" value="${attr(q)}" placeholder="Hotel, city, country, or style"><button data-event="search">Search</button></form></section>
<section><p class="muted">${q ? rows.length+" matches" : "Search by hotel, city, country, or phrases such as quiet design hotel or Maldives food."}</p><ul class="list">${rows.map(h=>`<li class="hotel-row"><div><a href="/hotel/${encodeURIComponent(h.slug)}"><strong>${esc(h.name)}</strong></a><div class="kicker">${esc([h.city,h.country].filter(Boolean).join(", "))}</div><p>${esc((h.description||"").slice(0,220))}</p></div><div>${money(h.price_estimate_min)}–${money(h.price_estimate_max)}</div></li>`).join("")|| (q?'<li class="muted">No matching hotels yet.</li>':"")}</ul></section>`),env,{title:q?`${q} hotel search | SecretNests`:"Hotel search | SecretNests",canonical:"/search"+(q?"?q="+encodeURIComponent(q):""),robots:"noindex,follow"});
}

async function destinationsPage(env){
  const rows=(await env.DB.prepare("SELECT city,country,COUNT(*) n FROM hotels WHERE is_published=1 AND city IS NOT NULL AND city<>'' GROUP BY city,country ORDER BY n DESC,city LIMIT 250").all()).results||[];
  return page(shell(\`<section class="hero" style="padding-bottom:24px"><div class="eyebrow">Destinations</div><h1>Where should your hotel budget go?</h1><p>Browse destinations in the current SecretNests hotel corpus.</p></section><div class="grid">\${rows.map(x=>\`<a class="card" href="/destinations/\${encodeURIComponent(slugify(x.country))}/\${encodeURIComponent(slugify(x.city))}"><strong>\${esc(x.city)}</strong><br><span class="muted">\${esc(x.country||"")} · \${x.n} hotels</span></a>\`).join("")}</div>\`),env,{title:"Luxury hotel destinations | SecretNests",canonical:"/destinations"});
}

async function destinationPage(countrySlug,citySlug,env){
  const places=(await env.DB.prepare("SELECT DISTINCT city,country FROM hotels WHERE is_published=1 AND city IS NOT NULL AND city<>''").all()).results||[];
  const place=places.find(x=>slugify(x.country)===countrySlug&&slugify(x.city)===citySlug);
  if(!place)return new Response("Destination not found",{status:404});
  const rows=(await env.DB.prepare("SELECT name,slug,city,country,description,price_estimate_min,price_estimate_max,google_rating,reddit_mention_count FROM hotels WHERE is_published=1 AND lower(city)=lower(?) AND lower(country)=lower(?) ORDER BY reddit_mention_count DESC,google_rating DESC,name").bind(place.city,place.country).all()).results||[];
  const canonical="/destinations/"+slugify(place.country)+"/"+slugify(place.city);
  return page(shell(\`<section class="hero" style="padding-bottom:24px"><div class="eyebrow">\${esc(place.country)}</div><h1>Luxury hotels in \${esc(place.city)}</h1><p>Compare price context and traveler value signals before you book.</p></section><div class="grid">\${rows.map(h=>\`<a class="card" href="/hotel/\${encodeURIComponent(h.slug)}"><h3>\${esc(h.name)}</h3><p class="muted">\${money(h.price_estimate_min)}–\${money(h.price_estimate_max)} estimated nightly range</p><p>\${esc((h.description||"").slice(0,180))}</p></a>\`).join("")}</div>\`),env,{title:\`Best-value luxury hotels in \${place.city} | SecretNests\`,description:\`Luxury hotels in \${place.city}, \${place.country}: traveler value context, price ranges, and hotel comparisons.\`,canonical});
}

async function legacyDestinationRedirect(request,env){
  const u=new URL(request.url), city=(u.searchParams.get("city")||"").trim(), country=(u.searchParams.get("country")||"").trim();
  if(!city||!country)return new Response("Destination not found",{status:404});
  return Response.redirect(ORIGIN+"/destinations/"+slugify(country)+"/"+slugify(city),301);
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
  return page(shell(`<section class="hero" style="padding-bottom:20px"><div class="eyebrow">@${esc(creator.handle)}${creator.is_demo?" · Demo profile":""}</div><h1>${esc(creator.display_name)}</h1><p>${esc(creator.bio||"")}</p>${creator.is_demo?'<div class="notice"><strong>Illustrative demo data.</strong> This profile demonstrates the product and does not claim these are real stays.</div>':""}</section><div class="stats"><div class="stat"><strong>${creator.stay_count||0}</strong><span>stays</span></div><div class="stat"><strong>${creator.report_count||0}</strong><span>trip reports</span></div><div class="stat"><strong>${creator.list_count||0}</strong><span>public lists</span></div><div class="stat"><strong>${creator.booking_count||0}</strong><span>bookings generated</span></div><div class="stat"><strong>${money(creator.earnings||0)}</strong><span>earned</span></div></div><h2>Taste profile</h2><div>${tastes.map(t=>`<span class="pill">${esc(t)}</span>`).join("")||'<span class="muted">Taste profile not added yet.</span>'}</div><section class="section"><h2>Recent stays</h2><ul class="list">${stays.map(s=>`<li><a href="/hotel/${encodeURIComponent(s.slug)}"><strong>${esc(s.name)}</strong></a> · ${esc([s.city,s.country].filter(Boolean).join(", "))}<br><span class="muted">Stayed ${esc(s.stay_month||"—")} · paid ${money(s.paid_nightly_rate)} · would pay again ${money(s.would_pay_again)} · would return ${s.would_return==null?"—":s.would_return?"Yes":"No"}</span></li>`).join("")||'<li class="muted">No public stays yet.</li>'}</ul></section><section><h2>Lists</h2><ul class="list">${lists.map(l=>`<li><a href="/@${encodeURIComponent(creator.handle)}/lists/${encodeURIComponent(l.slug)}"><strong>${esc(l.title)}</strong></a><br><span class="muted">${esc(l.description||"")}</span></li>`).join("")||'<li class="muted">No public lists yet.</li>'}</ul></section>`),env,{title:`${creator.display_name} (@${creator.handle}) | SecretNests`,canonical:"/@"+encodeURIComponent(creator.handle),robots:creator.is_demo?"noindex,follow":"index,follow"});
}

async function hotelPage(slug, env){
  let h=await env.DB.prepare("SELECT * FROM hotels WHERE slug=? AND is_published=1").bind(slug).first();
  if(!h){
    h=await env.DB.prepare("SELECT h.* FROM hotel_slug_aliases a JOIN hotels h ON h.id=a.hotel_id WHERE a.alias_slug=? AND h.is_published=1").bind(slug).first();
    if(h) return Response.redirect(ORIGIN+"/hotel/"+encodeURIComponent(h.slug),301);
    return new Response("Hotel not found",{status:404});
  }
  const v=await env.DB.prepare("SELECT * FROM hotel_value_snapshots WHERE hotel_id=? ORDER BY calculated_at DESC LIMIT 1").bind(h.id).first();
  const media=await env.DB.prepare(`SELECT id,r2_key,source_url,attribution_text,rights_status FROM media_assets
    WHERE hotel_id=? AND rights_status IN ('owned_user_upload','hotel_authorized','licensed_api','licensed_public')
    ORDER BY CASE rights_status WHEN 'owned_user_upload' THEN 0 WHEN 'hotel_authorized' THEN 1 ELSE 2 END,created_at
    LIMIT 1`).bind(h.id).first();
  const mediaUrl=media ? (media.r2_key ? "/media/"+encodeURIComponent(media.id) : media.source_url) : null;
  const evidence=(await env.DB.prepare("SELECT sentiment,price_mentioned,trip_context,confidence,source_url FROM reddit_evidence WHERE hotel_id=? ORDER BY created_at DESC LIMIT 8").bind(h.id).all()).results||[];
  const comps=(await env.DB.prepare(`SELECT name,slug,city,country,price_estimate_min,price_estimate_max FROM hotels WHERE is_published=1 AND id<>? AND ((city IS NOT NULL AND city=?) OR (country IS NOT NULL AND country=?)) ORDER BY ABS(COALESCE(price_estimate_min,0)-COALESCE(?,0)),reddit_mention_count DESC LIMIT 4`).bind(h.id,h.city||"",h.country||"",h.price_estimate_min||0).all()).results||[];
  const highlights=safeJson(h.highlights_json,[]), bestFor=safeJson(h.best_for_json,[]), notIdeal=safeJson(h.not_ideal_for_json,[]);
  const location=[h.city,h.country].filter(Boolean).join(", ");
  const valueBlock=v?`<section><h2>What travelers think it's worth</h2><div class="value"><div><div class="eyebrow">Traveler range</div><strong>${money(v.traveler_low)}–${money(v.traveler_high)}</strong></div><div><div class="eyebrow">Median would pay</div><strong>${money(v.median_would_pay)}</strong></div><div><div class="eyebrow">Current price</div><strong>${money(v.current_price)}</strong></div><div><div class="eyebrow">Sample</div><strong>${esc(v.sample_size)}</strong> stays</div></div><p><strong>Value:</strong> ${esc(v.value_classification||"insufficient data")} · <span class="muted">${esc(v.confidence||"insufficient")} confidence · ${esc(v.methodology_version||"legacy")}</span></p></section>`:`<section><h2>What travelers think it's worth</h2><p class="muted">Not enough first-party stay data yet. Add your stay to help establish the fair-value range.</p></section>`;
  const jsonLd={"@context":"https://schema.org","@type":"Hotel","name":h.name,"description":h.description||undefined,"url":ORIGIN+"/hotel/"+h.slug,"image":mediaUrl?(mediaUrl.startsWith("http")?mediaUrl:ORIGIN+mediaUrl):undefined,"address":h.formatted_address||h.address||undefined,"telephone":h.phone||undefined,"sameAs":h.website?[h.website]:undefined,"aggregateRating":h.google_rating?{"@type":"AggregateRating","ratingValue":h.google_rating,"reviewCount":h.google_review_count||undefined}:undefined};
  return page(shell(`<section class="hero" style="padding-bottom:28px"><div class="eyebrow">${esc(location)}</div><h1>${esc(h.name)}</h1>${mediaUrl?`<img class="hero-media" src="${attr(mediaUrl)}" alt="${attr(h.name)}">${media.attribution_text?`<div class="kicker">${esc(media.attribution_text)}</div>`:""}`:""}<p>${esc(h.description||"")}</p><div class="filters">${highlights.slice(0,5).map(x=>`<span class="pill">${esc(x)}</span>`).join("")}</div></section><div class="two"><div>${valueBlock}<section class="section"><h2>Price context</h2><p>Existing estimated range: <strong>${money(h.price_estimate_min)}–${money(h.price_estimate_max)}</strong> per night.</p>${h.booking_url?`<a class="btn" data-event="outbound_booking_click" data-hotel-id="${attr(h.id)}" href="/out/${encodeURIComponent(h.slug)}" rel="nofollow sponsored">Check booking options</a>`:""}</section><section><h2>Traveler evidence</h2><ul class="list">${evidence.map(e=>`<li>${e.price_mentioned?`<strong>${money(e.price_mentioned)}</strong> · `:""}${esc(e.trip_context||e.sentiment||"Traveler mention")} ${e.source_url?`<a href="${attr(e.source_url)}" rel="nofollow noopener">source</a>`:""}</li>`).join("")||'<li class="muted">No structured traveler evidence yet.</li>'}</ul></section></div><aside><div class="card"><h3>Best for</h3><div>${bestFor.map(x=>`<span class="pill">${esc(x)}</span>`).join("")||'<span class="muted">Not classified yet.</span>'}</div><h3>Not ideal for</h3><div>${notIdeal.map(x=>`<span class="pill">${esc(x)}</span>`).join("")||'<span class="muted">Not classified yet.</span>'}</div></div></aside></div><section class="section"><h2>Nearby / comparable alternatives</h2><div class="grid">${comps.map(c=>`<a class="card" href="/hotel/${encodeURIComponent(c.slug)}"><strong>${esc(c.name)}</strong><br><span class="muted">${esc([c.city,c.country].filter(Boolean).join(", "))} · ${money(c.price_estimate_min)}–${money(c.price_estimate_max)}</span></a>`).join("")}</div></section>`),env,{title:`${h.name}: price, value & traveler evidence | SecretNests`,description:h.description||`${h.name} in ${location}: traveler price context and value.`,canonical:"/hotel/"+encodeURIComponent(h.slug),jsonLd});
}

async function listPage(handle, slug, env){
  const l=await env.DB.prepare(`SELECT l.*,cp.handle,cp.display_name FROM lists l JOIN creator_profiles cp ON cp.id=l.creator_id WHERE lower(cp.handle)=lower(?) AND l.slug=? AND l.is_public=1 AND cp.is_public=1`).bind(handle,slug).first();
  if(!l)return new Response("List not found",{status:404});
  const items=(await env.DB.prepare(`SELECT h.name,h.slug,h.city,h.country,li.note,li.rank FROM list_items li JOIN hotels h ON h.id=li.hotel_id WHERE li.list_id=? ORDER BY COALESCE(li.rank,999999),li.created_at`).bind(l.id).all()).results||[];
  return page(shell(`<section class="hero" style="padding-bottom:20px"><div class="eyebrow">A list by <a href="/@${encodeURIComponent(l.handle)}">@${esc(l.handle)}</a></div><h1>${esc(l.title)}</h1><p>${esc(l.description||"")}</p></section><ul class="list">${items.map((x,i)=>`<li><a href="/hotel/${encodeURIComponent(x.slug)}"><strong>${x.rank||i+1}. ${esc(x.name)}</strong></a> · ${esc([x.city,x.country].filter(Boolean).join(", "))}<br><span class="muted">${esc(x.note||"")}</span></li>`).join("")||'<li class="muted">No hotels added yet.</li>'}</ul>`),env,{title:`${l.title} by @${l.handle} | SecretNests`,canonical:`/@${encodeURIComponent(l.handle)}/lists/${encodeURIComponent(l.slug)}`});
}

async function addTripPage(env){
  const enabled=String(env.SUBMISSIONS_ENABLED||"false").toLowerCase()==="true";
  const body=enabled
    ? `<section class="hero" style="padding-bottom:26px"><div class="eyebrow">Add Your Trip</div><h1>Turn a hotel stay into useful price intelligence.</h1><p>Tell us what you paid, what you would pay again, and the room context. Submissions enter a review queue before publication.</p></section>
<form class="card" method="post" action="/add-your-trip" style="max-width:760px">
  <div style="display:none"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>
  <p><label>Hotel name<br><input name="hotel_name" required maxlength="160" style="width:100%;padding:12px"></label></p>
  <p><label>City / destination<br><input name="city" maxlength="120" style="width:100%;padding:12px"></label></p>
  <p><label>Stay month<br><input name="stay_month" type="month" style="width:100%;padding:12px"></label></p>
  <div class="two"><p><label>What you paid per night<br><input name="paid_nightly_rate" type="number" min="0" max="100000" step="0.01" style="width:100%;padding:12px"></label></p><p><label>What you'd happily pay again<br><input name="would_pay_again" type="number" min="0" max="100000" step="0.01" style="width:100%;padding:12px"></label></p></div>
  <p><label>Room type<br><input name="room_type" maxlength="160" style="width:100%;padding:12px"></label></p>
  <p><label>Booking channel<br><input name="booking_channel" maxlength="120" placeholder="Direct, Amex FHR, Chase, Booking.com, advisor…" style="width:100%;padding:12px"></label></p>
  <p><label>Anything travelers should know<br><textarea name="notes" maxlength="3000" rows="6" style="width:100%;padding:12px"></textarea></label></p>
  <p><label>Email for follow-up (optional)<br><input name="contact_email" type="email" maxlength="254" style="width:100%;padding:12px"></label></p>
  <button class="btn" type="submit">Submit stay</button>
</form>`
    : `<section class="hero" style="padding-bottom:26px"><div class="eyebrow">Add Your Trip</div><h1>Turn a hotel stay into useful price intelligence.</h1><p>SecretNests is designed to capture what you paid, what you would pay again, room context, and whether you would return.</p></section><div class="notice"><strong>Creator submissions are staged but not open yet.</strong><p>The Cloudflare-native submission flow is built and can be enabled with <code>SUBMISSIONS_ENABLED=true</code> after the production database is live. No Floot authentication is required.</p></div>`;
  return page(shell(body),env,{title:"Add Your Trip | SecretNests",canonical:"/add-your-trip"});
}

async function submitTrip(request,env){
  if(String(env.SUBMISSIONS_ENABLED||"false").toLowerCase()!=="true") return json({ok:false,error:"submissions_disabled"},503);
  if(!sameOrigin(request,ORIGIN)) return json({ok:false,error:"origin_rejected"},403);
  if(bodyTooLarge(request,65536)) return json({ok:false,error:"payload_too_large"},413);
  const rl=await enforceRateLimit(request,env,"trip_submission",10,3600); if(!rl.ok)return json({ok:false,error:"rate_limited"},429);
  const form=await request.formData();
  if(form.get("website")) return Response.redirect(ORIGIN+"/add-your-trip?submitted=1",303);
  const clean=(name,max=3000)=>String(form.get(name)||"").trim().slice(0,max);
  const hotelName=clean("hotel_name",160);
  if(!hotelName) return json({ok:false,error:"hotel_name_required"},400);
  const num=(name)=>{const raw=clean(name,32); if(!raw)return null; const v=Number(raw); return Number.isFinite(v)&&v>=0&&v<=100000?v:null};
  const email=clean("contact_email",254);
  if(email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ok:false,error:"invalid_email"},400);
  const id=crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO trip_submissions
    (id,contact_email,hotel_name,city,stay_month,paid_nightly_rate,would_pay_again,room_type,booking_channel,notes,status,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,email||null,hotelName,clean("city",120)||null,clean("stay_month",20)||null,num("paid_nightly_rate"),num("would_pay_again"),clean("room_type",160)||null,clean("booking_channel",120)||null,clean("notes",3000)||null,"pending",nowIso()).run();
  return page(shell(`<section class="hero"><div class="eyebrow">Trip received</div><h1>Thanks. Your stay is in the review queue.</h1><p>We’ll use the price and context to improve SecretNests value intelligence after review.</p><p><a class="btn" href="/">Back to SecretNests</a></p></section>`),env,{title:"Trip received | SecretNests",canonical:"/add-your-trip"});
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
  if(!sameOrigin(request,ORIGIN)) return json({ok:false,error:"origin_rejected"},403);
  if(bodyTooLarge(request,8192)) return json({ok:false,error:"payload_too_large"},413);
  const rl=await enforceRateLimit(request,env,"analytics",300,3600); if(!rl.ok)return json({ok:false,error:"rate_limited"},429);
  let body={}; try{body=await request.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  const allowed=new Set(["page_view","hotel_view","creator_view","list_view","value_view","outbound_booking_click","search"]);
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
  if(!h)return new Response("Hotel not found",{status:404});
  let link=await env.DB.prepare(\`SELECT bl.destination_url,bl.provider_id,p.provider_type,p.config_json
    FROM hotel_booking_links bl JOIN affiliate_providers p ON p.id=bl.provider_id
    WHERE bl.hotel_id=? AND bl.enabled=1 AND p.enabled=1 ORDER BY bl.priority,bl.created_at LIMIT 1\`).bind(h.id).first();
  if(!link && h.booking_url) link={destination_url:h.booking_url,provider_id:"direct",provider_type:"direct",config_json:"{}"};
  if(!link?.destination_url)return new Response("Booking link unavailable",{status:404});
  const clickId=crypto.randomUUID();
  const destination=String(link.destination_url).replaceAll("{subid}",encodeURIComponent(clickId));
  try{
    await env.DB.prepare("INSERT INTO affiliate_clicks (id,hotel_id,provider,destination_url,partner_sub_id,session_id,referrer,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(clickId,h.id,link.provider_id,destination,clickId,null,request.headers.get("referer"),nowIso()).run();
  }catch(e){console.error("affiliate_click_failed",safeLogError(e))}
  return Response.redirect(destination,302);
}

async function mediaAsset(id,env){
  const m=await env.DB.prepare(`SELECT id,r2_key,mime_type,rights_status FROM media_assets
    WHERE id=? AND rights_status IN ('owned_user_upload','hotel_authorized','licensed_api','licensed_public')`).bind(id).first();
  if(!m?.r2_key) return new Response("Media not found",{status:404});
  const obj=await env.MEDIA.get(m.r2_key);
  if(!obj) return new Response("Media not found",{status:404});
  const h=new Headers();
  h.set("content-type",m.mime_type||obj.httpMetadata?.contentType||"application/octet-stream");
  h.set("cache-control","public,max-age=86400");
  h.set("x-content-type-options","nosniff");
  return new Response(obj.body,{headers:h});
}

async function comparisonPage(pair,env){
  const positions=[]; let at=pair.indexOf("-vs-");
  while(at>=0){positions.push(at);at=pair.indexOf("-vs-",at+4)}
  let a=null,b=null;
  for(const pos of positions){
    const as=pair.slice(0,pos), bs=pair.slice(pos+4);
    const rows=(await env.DB.prepare("SELECT h.*,v.median_would_pay,v.traveler_low,v.traveler_high,v.sample_size,v.confidence FROM hotels h LEFT JOIN hotel_value_snapshots v ON v.id=(SELECT id FROM hotel_value_snapshots WHERE hotel_id=h.id ORDER BY calculated_at DESC LIMIT 1) WHERE h.is_published=1 AND h.slug IN (?,?)").bind(as,bs).all()).results||[];
    a=rows.find(x=>x.slug===as); b=rows.find(x=>x.slug===bs);
    if(a&&b)break;
  }
  if(!a||!b)return new Response("Comparison not found",{status:404});
  const card=x=>\`<div class="card"><div class="eyebrow">\${esc([x.city,x.country].filter(Boolean).join(", "))}</div><h2><a href="/hotel/\${encodeURIComponent(x.slug)}">\${esc(x.name)}</a></h2><p>Estimated rate: <strong>\${money(x.price_estimate_min)}–\${money(x.price_estimate_max)}</strong></p><p>Traveler assessed: <strong>\${x.median_would_pay?money(x.traveler_low)+"–"+money(x.traveler_high):"not enough data"}</strong></p><p class="muted">\${x.sample_size?x.sample_size+" value observations · "+(x.confidence||"")+" confidence":"First-party value sample pending"}</p></div>\`;
  return page(shell(\`<section class="hero"><div class="eyebrow">Hotel comparison</div><h1>\${esc(a.name)} vs. \${esc(b.name)}</h1><p>Side-by-side price and traveler-value context. SecretNests does not declare a universal winner; the useful question is which property better fits your price and preferences.</p></section><div class="grid">\${card(a)}\${card(b)}</div>\`),env,{title:\`\${a.name} vs. \${b.name}: price & value | SecretNests\`,description:\`Compare \${a.name} and \${b.name} using price context and traveler-assessed value.\`,canonical:"/compare/"+pair});
}

async function valueHub(env){
  return page(shell(\`<section class="hero"><div class="eyebrow">Value discovery</div><h1>Where is luxury actually worth the rate?</h1><p>Browse price-sensitive collections built from traveler value opinions where available, with clearly labeled estimated-price fallbacks.</p></section><div class="grid">
  <a class="card" href="/value/under-500"><h2>Worth up to $500</h2><p>Hotels with traveler-assessed willingness-to-pay at or below $500.</p></a>
  <a class="card" href="/value/around-1000"><h2>Around $1,000</h2><p>High-end stays travelers assess near the four-figure mark.</p></a>
  <a class="card" href="/value/regrets-over-800"><h2>Regrets over $800</h2><p>First-party stays where the traveler paid $800+ and would not return.</p></a>
  <a class="card" href="/value/where-500-buys-most"><h2>Where $500 buys the most</h2><p>Destinations with the deepest estimated luxury-hotel inventory near this budget.</p></a>
</div>\`),env,{title:"Luxury hotel value discovery | SecretNests",canonical:"/value"});
}

async function valueCollection(kind,env){
  let title="",description="",rows=[];
  if(kind==="under-500"){
    title="Luxury hotels travelers value at $500 or less";
    description="Traveler-assessed willingness-to-pay, not rack-rate marketing.";
    rows=(await env.DB.prepare(\`SELECT h.name,h.slug,h.city,h.country,v.median_would_pay,v.traveler_low,v.traveler_high,v.sample_size,v.confidence
      FROM hotels h JOIN hotel_value_snapshots v ON v.id=(SELECT id FROM hotel_value_snapshots WHERE hotel_id=h.id ORDER BY calculated_at DESC LIMIT 1)
      WHERE h.is_published=1 AND v.sample_size>0 AND v.median_would_pay<=500 ORDER BY v.sample_size DESC,v.median_would_pay DESC LIMIT 100\`).all()).results||[];
  }else if(kind==="around-1000"){
    title="Luxury hotels travelers value around $1,000";
    description="Hotels with traveler-assessed median willingness-to-pay between $800 and $1,200.";
    rows=(await env.DB.prepare(\`SELECT h.name,h.slug,h.city,h.country,v.median_would_pay,v.traveler_low,v.traveler_high,v.sample_size,v.confidence
      FROM hotels h JOIN hotel_value_snapshots v ON v.id=(SELECT id FROM hotel_value_snapshots WHERE hotel_id=h.id ORDER BY calculated_at DESC LIMIT 1)
      WHERE h.is_published=1 AND v.sample_size>0 AND v.median_would_pay BETWEEN 800 AND 1200 ORDER BY v.sample_size DESC,v.median_would_pay DESC LIMIT 100\`).all()).results||[];
  }else if(kind==="regrets-over-800"){
    title="$800+ hotel stays travelers would not repeat";
    description="First-party stay observations where paid nightly rate was at least $800 and would-return was No.";
    rows=(await env.DB.prepare(\`SELECT h.name,h.slug,h.city,h.country,s.paid_nightly_rate,vo.would_pay_again,COUNT(*) sample_size
      FROM stays s JOIN hotels h ON h.id=s.hotel_id JOIN trip_reports tr ON tr.stay_id=s.id LEFT JOIN value_opinions vo ON vo.stay_id=s.id
      WHERE h.is_published=1 AND s.paid_nightly_rate>=800 AND tr.would_return=0 AND COALESCE(s.verification_method,'')<>'demo'
      GROUP BY h.id ORDER BY s.paid_nightly_rate DESC LIMIT 100\`).all()).results||[];
  }else if(kind==="where-500-buys-most"){
    title="Where roughly $500 buys the most luxury-hotel choice";
    description="Destination inventory based on SecretNests estimated price bands; this page is not a traveler fair-value claim.";
    const places=(await env.DB.prepare(\`SELECT city,country,COUNT(*) sample_size,AVG(COALESCE(price_estimate_max,price_estimate_min)) median_would_pay
      FROM hotels WHERE is_published=1 AND city IS NOT NULL AND COALESCE(price_estimate_max,999999)<=600 GROUP BY city,country HAVING COUNT(*)>=2 ORDER BY sample_size DESC LIMIT 100\`).all()).results||[];
    return page(shell(\`<section class="hero"><div class="eyebrow">Value discovery</div><h1>\${esc(title)}</h1><p>\${esc(description)}</p></section><ul class="list">\${places.map(x=>\`<li><a href="/destinations/\${slugify(x.country)}/\${slugify(x.city)}"><strong>\${esc(x.city)}, \${esc(x.country)}</strong></a> · \${x.sample_size} hotels in the estimated ≤$600 band</li>\`).join("")||'<li class="muted">No qualifying destinations yet.</li>'}</ul>\`),env,{title:title+" | SecretNests",canonical:"/value/"+kind});
  }else return new Response("Value collection not found",{status:404});
  return page(shell(\`<section class="hero"><div class="eyebrow">Value discovery</div><h1>\${esc(title)}</h1><p>\${esc(description)}</p></section><ul class="list">\${rows.map(x=>\`<li><a href="/hotel/\${encodeURIComponent(x.slug)}"><strong>\${esc(x.name)}</strong></a> · \${esc([x.city,x.country].filter(Boolean).join(", "))}<br><span class="muted">\${x.median_would_pay?("traveler median "+money(x.median_would_pay)+" · "):""}\${x.paid_nightly_rate?("paid "+money(x.paid_nightly_rate)+" · "):""}\${x.sample_size||0} observation(s)</span></li>\`).join("")||'<li class="muted">Not enough first-party value data yet.</li>'}</ul>\`),env,{title:title+" | SecretNests",canonical:"/value/"+kind});
}

async function countryValuePage(countrySlug,env){
  const countries=(await env.DB.prepare("SELECT DISTINCT country FROM hotels WHERE is_published=1 AND country IS NOT NULL").all()).results||[];
  const match=countries.find(x=>slugify(x.country)===countrySlug);
  if(!match)return new Response("Country not found",{status:404});
  const rows=(await env.DB.prepare(\`SELECT h.name,h.slug,h.city,h.country,v.median_would_pay,v.sample_size,v.value_classification
    FROM hotels h LEFT JOIN hotel_value_snapshots v ON v.id=(SELECT id FROM hotel_value_snapshots WHERE hotel_id=h.id ORDER BY calculated_at DESC LIMIT 1)
    WHERE h.is_published=1 AND lower(h.country)=lower(?) ORDER BY COALESCE(v.sample_size,0) DESC,h.reddit_mention_count DESC,h.google_rating DESC LIMIT 150\`).bind(match.country).all()).results||[];
  return page(shell(\`<section class="hero"><div class="eyebrow">Country value guide</div><h1>Luxury hotel value in \${esc(match.country)}</h1><p>Traveler-assessed value where first-party data exists, with hotel discovery coverage beneath it.</p></section><ul class="list">\${rows.map(x=>\`<li><a href="/hotel/\${encodeURIComponent(x.slug)}"><strong>\${esc(x.name)}</strong></a> · \${esc(x.city||"")}<br><span class="muted">\${x.median_would_pay?"traveler median "+money(x.median_would_pay)+" · "+esc(x.value_classification||""):"fair-value sample pending"}</span></li>\`).join("")}</ul>\`),env,{title:\`Best-value luxury hotels in \${match.country} | SecretNests\`,canonical:"/value/country/"+countrySlug});
}

async function legalPage(kind,env){
  const pages={
    privacy:{title:"Privacy",body:\`<h1>Privacy</h1><p>SecretNests collects the information you submit, limited technical request data needed to operate the service, and pseudonymous product analytics. Contact email on a trip submission is used for follow-up and moderation and is not published with a stay.</p><p>Receipt or folio verification artifacts, when enabled, are stored separately with explicit redaction and review states. SecretNests does not intentionally store raw payment-card data.</p><p>Third-party analytics may include Google Analytics and Microsoft Clarity when configured. Booking links may send you to a third-party provider whose privacy practices apply after you leave SecretNests.</p>\`},
    terms:{title:"Terms",body:\`<h1>Terms</h1><p>Submit only hotel experiences, text, and media you have the right to share. You grant SecretNests a non-exclusive license to host, format, display, and analyze submitted material for operating and improving the service. You retain ownership of your original material.</p><p>Do not submit false stays, manipulated receipts, unlawful material, or content that infringes another person's rights. SecretNests may label, moderate, reject, or remove submissions to preserve data integrity.</p>\`},
    disclosures:{title:"Disclosures",body:\`<h1>Affiliate & review disclosures</h1><p>SecretNests may earn a commission when a traveler books through certain links. A creator may also receive a share of attributable booking revenue. Compensation is tied to attributable commercial outcomes, never to whether a hotel review is positive, negative, or favorable to a particular property.</p><p>When a review or recommendation has a material connection, incentive, free stay, discount, creator revenue share, or other relevant relationship, SecretNests policy requires a clear disclosure. Incentives must never be conditioned, expressly or implicitly, on a particular review sentiment.</p><p>Demo profiles and illustrative seed content are explicitly labeled and are not represented as genuine stays.</p>\`}
  };
  const p=pages[kind]; if(!p)return new Response("Not found",{status:404});
  return page(shell(\`<section class="hero"><div class="eyebrow">SecretNests policy</div>\${p.body}</section>\`),env,{title:p.title+" | SecretNests",canonical:"/"+kind});
}

async function adminSubmissions(request,env){
  const moderator=adminEmail(request,env);
  if(!moderator)return new Response("Not found",{status:404});
  if(request.method==="GET"){
    const rows=(await env.DB.prepare("SELECT id,contact_email,hotel_name,city,stay_month,paid_nightly_rate,would_pay_again,room_type,booking_channel,notes,status,created_at FROM trip_submissions WHERE status IN ('pending','matched') ORDER BY created_at LIMIT 200").all()).results||[];
    return json({ok:true,submissions:rows});
  }
  if(bodyTooLarge(request,32768))return json({ok:false,error:"payload_too_large"},413);
  let body={};try{body=await request.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  const submission=await env.DB.prepare("SELECT * FROM trip_submissions WHERE id=?").bind(body.id).first();
  if(!submission)return json({ok:false,error:"not_found"},404);
  if(body.action==="reject"){
    await env.DB.prepare("UPDATE trip_submissions SET status='rejected',reviewed_at=? WHERE id=?").bind(nowIso(),submission.id).run();
    await env.DB.prepare("INSERT INTO submission_moderation (id,submission_id,action,moderator_email,note,created_at) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(),submission.id,"reject",moderator,String(body.note||"").slice(0,1000),nowIso()).run();
    return json({ok:true,status:"rejected"});
  }
  if(body.action!=="approve"||!body.hotel_id)return json({ok:false,error:"invalid_action"},400);
  const hotel=await env.DB.prepare("SELECT id FROM hotels WHERE id=?").bind(body.hotel_id).first();
  if(!hotel)return json({ok:false,error:"invalid_hotel"},400);
  const creatorId="system-community-intake";
  await env.DB.prepare("INSERT INTO creator_profiles (id,user_id,handle,display_name,bio,taste_profile_json,is_public,is_demo,created_at,updated_at) VALUES (?,?,?,?,?,'[]',0,0,?,?) ON CONFLICT(id) DO NOTHING")
    .bind(creatorId,null,"community-intake","Community intake","Internal moderation identity for approved anonymous trip submissions.",nowIso(),nowIso()).run();
  const stayId="submission-"+submission.id;
  await env.DB.prepare(\`INSERT INTO stays (id,creator_id,hotel_id,stay_month,room_type,booking_channel,paid_nightly_rate,currency,verified,verification_method,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,'USD',0,'community_submission',?,?) ON CONFLICT(id) DO NOTHING\`)
    .bind(stayId,creatorId,hotel.id,submission.stay_month,submission.room_type,submission.booking_channel,submission.paid_nightly_rate,nowIso(),nowIso()).run();
  if(submission.would_pay_again!=null){
    await env.DB.prepare(\`INSERT INTO value_opinions (id,stay_id,creator_id,hotel_id,paid_nightly_rate,would_pay_again,currency,created_at)
      VALUES (?,?,?,?,?,?,'USD',?) ON CONFLICT(id) DO UPDATE SET would_pay_again=excluded.would_pay_again\`)
      .bind("value-"+submission.id,stayId,creatorId,hotel.id,submission.paid_nightly_rate,submission.would_pay_again,nowIso()).run();
  }
  await env.DB.prepare("UPDATE trip_submissions SET status='approved',reviewed_at=? WHERE id=?").bind(nowIso(),submission.id).run();
  await env.DB.prepare("INSERT INTO submission_moderation (id,submission_id,action,hotel_id,moderator_email,note,created_at) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(),submission.id,"approve",hotel.id,moderator,String(body.note||"").slice(0,1000),nowIso()).run();
  const valuation=await recomputeHotelValuation(env.DB,hotel.id);
  return json({ok:true,status:"approved",stay_id:stayId,valuation});
}

async function verificationUpload(request,env){
  const moderator=adminEmail(request,env);
  if(!moderator)return new Response("Not found",{status:404});
  if(String(env.VERIFICATION_UPLOADS_ENABLED||"false").toLowerCase()!=="true")return json({ok:false,error:"uploads_disabled"},503);
  if(bodyTooLarge(request,8*1024*1024))return json({ok:false,error:"payload_too_large"},413);
  const form=await request.formData();
  const stayId=String(form.get("stay_id")||"");
  const file=form.get("file");
  if(!stayId||!file||typeof file.arrayBuffer!=="function")return json({ok:false,error:"stay_and_file_required"},400);
  const stay=await env.DB.prepare("SELECT id FROM stays WHERE id=?").bind(stayId).first();
  if(!stay)return json({ok:false,error:"invalid_stay"},400);
  const allowed=new Set(["application/pdf","image/jpeg","image/png","image/webp"]);
  if(!allowed.has(file.type))return json({ok:false,error:"unsupported_type"},415);
  if(file.size>8*1024*1024)return json({ok:false,error:"payload_too_large"},413);
  const id=crypto.randomUUID(), key="verification/"+stayId+"/"+id;
  await env.MEDIA.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:file.type}});
  await env.DB.prepare(\`INSERT INTO stay_verification_artifacts (id,stay_id,r2_key,source_type,status,redaction_status,reviewer_note,created_at)
    VALUES (?,?,?,'receipt_or_folio','pending','pending',?,?)\`).bind(id,stayId,key,"Uploaded by "+moderator,nowIso()).run();
  return json({ok:true,id,status:"pending",redaction_status:"pending"});
}

async function recomputeValues(request,env){
  const moderator=adminEmail(request,env);
  if(!moderator)return new Response("Not found",{status:404});
  const url=new URL(request.url), hotelId=url.searchParams.get("hotel_id");
  if(hotelId)return json({ok:true,valuation:await recomputeHotelValuation(env.DB,hotelId)});
  const ids=(await env.DB.prepare("SELECT DISTINCT hotel_id FROM value_opinions").all()).results||[];
  const out=[]; for(const r of ids) out.push(await recomputeHotelValuation(env.DB,r.hotel_id));
  return json({ok:true,recomputed:out.length});
}

async function sitemap(env){
  const urls=[ORIGIN+"/",ORIGIN+"/destinations",ORIGIN+"/creators",ORIGIN+"/about",ORIGIN+"/value",ORIGIN+"/privacy",ORIGIN+"/terms",ORIGIN+"/disclosures"];
  try{
    const hotels=(await env.DB.prepare("SELECT slug FROM hotels WHERE is_published=1 AND description IS NOT NULL AND length(description)>=80").all()).results||[];
    const creators=(await env.DB.prepare("SELECT handle FROM creator_profiles WHERE is_public=1 AND COALESCE(is_demo,0)=0").all()).results||[];
    const lists=(await env.DB.prepare("SELECT cp.handle,l.slug FROM lists l JOIN creator_profiles cp ON cp.id=l.creator_id WHERE l.is_public=1 AND cp.is_public=1 AND COALESCE(cp.is_demo,0)=0").all()).results||[];
    const dests=(await env.DB.prepare("SELECT DISTINCT city,country FROM hotels WHERE is_published=1 AND city IS NOT NULL AND city<>'' AND country IS NOT NULL AND country<>''").all()).results||[];
    const countries=(await env.DB.prepare("SELECT DISTINCT country FROM hotels WHERE is_published=1 AND country IS NOT NULL AND country<>''").all()).results||[];
    urls.push(
      ...hotels.map(x=>ORIGIN+"/hotel/"+encodeURIComponent(x.slug)),
      ...creators.map(x=>ORIGIN+"/@"+encodeURIComponent(x.handle)),
      ...lists.map(x=>ORIGIN+"/@"+encodeURIComponent(x.handle)+"/lists/"+encodeURIComponent(x.slug)),
      ...dests.map(x=>ORIGIN+"/destinations/"+slugify(x.country)+"/"+slugify(x.city)),
      ...countries.map(x=>ORIGIN+"/value/country/"+slugify(x.country))
    );
  }catch(e){console.error("sitemap_failed",safeLogError(e))}
  return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+[...new Set(urls)].map(u=>'<url><loc>'+esc(u)+'</loc></url>').join("")+'</urlset>',{headers:{"content-type":"application/xml; charset=utf-8","cache-control":"public,max-age=900"}});
}

async function route(request,env){
  const url=new URL(request.url);
  if(url.hostname==="www.secretnests.com") return Response.redirect(ORIGIN+url.pathname+url.search,301);
  if(request.method==="GET" && url.pathname==="/")return home(env);
  if(request.method==="GET" && url.pathname==="/search")return searchPage(request,env);
  if(request.method==="GET" && url.pathname==="/destinations")return destinationsPage(env);
  const cleanDest=url.pathname.match(/^\/destinations\/([^/]+)\/([^/]+)$/); if(request.method==="GET"&&cleanDest)return destinationPage(decodeURIComponent(cleanDest[1]),decodeURIComponent(cleanDest[2]),env);
  if(request.method==="GET" && /^\/destination\//.test(url.pathname))return legacyDestinationRedirect(request,env);
  if(request.method==="GET" && url.pathname==="/creators")return creatorsPage(env);
  if(request.method==="GET" && url.pathname==="/add-your-trip")return addTripPage(env);
  if(request.method==="POST" && url.pathname==="/add-your-trip")return submitTrip(request,env);
  if(request.method==="GET" && url.pathname==="/about")return aboutPage(env);
  if(request.method==="GET" && url.pathname==="/privacy")return legalPage("privacy",env);
  if(request.method==="GET" && url.pathname==="/terms")return legalPage("terms",env);
  if(request.method==="GET" && url.pathname==="/disclosures")return legalPage("disclosures",env);
  if(request.method==="GET" && url.pathname==="/value")return valueHub(env);
  const valueCountry=url.pathname.match(/^\/value\/country\/([^/]+)$/); if(request.method==="GET"&&valueCountry)return countryValuePage(decodeURIComponent(valueCountry[1]),env);
  const value=url.pathname.match(/^\/value\/([^/]+)$/); if(request.method==="GET"&&value)return valueCollection(decodeURIComponent(value[1]),env);
  const compare=url.pathname.match(/^\/compare\/(.+)$/); if(request.method==="GET"&&compare)return comparisonPage(decodeURIComponent(compare[1]),env);
  if(request.method==="GET" && url.pathname==="/api/hotels")return apiHotels(request,env);
  if(request.method==="POST" && url.pathname==="/api/events")return recordEvent(request,env);
  if((request.method==="GET"||request.method==="POST") && url.pathname==="/api/admin/submissions")return adminSubmissions(request,env);
  if(request.method==="POST" && url.pathname==="/api/admin/verification-upload")return verificationUpload(request,env);
  if(request.method==="POST" && url.pathname==="/api/admin/recompute-values")return recomputeValues(request,env);
  if(request.method==="GET" && url.pathname==="/health")return json({ok:true,service:"secretnests",runtime:"cloudflare-worker"});
  if(request.method==="GET" && url.pathname==="/sitemap.xml")return sitemap(env);
  const media=url.pathname.match(/^\/media\/([^/]+)$/); if(request.method==="GET"&&media)return mediaAsset(decodeURIComponent(media[1]),env);
  const out=url.pathname.match(/^\/out\/([^/]+)$/); if(request.method==="GET"&&out)return outbound(decodeURIComponent(out[1]),request,env);
  const hotel=url.pathname.match(/^\/hotel\/([^/]+)$/); if(request.method==="GET"&&hotel)return hotelPage(decodeURIComponent(hotel[1]),env);
  const list=url.pathname.match(/^\/@([^/]+)\/lists\/([^/]+)$/); if(request.method==="GET"&&list)return listPage(decodeURIComponent(list[1]),decodeURIComponent(list[2]),env);
  const creator=url.pathname.match(/^\/@([^/]+)$/); if(request.method==="GET"&&creator)return creatorPage(decodeURIComponent(creator[1]),env);
  if(request.method==="GET" && url.pathname==="/robots.txt")return new Response("User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /out/\nSitemap: https://secretnests.com/sitemap.xml\n",{headers:{"content-type":"text/plain; charset=utf-8","cache-control":"public,max-age=3600"}});
  if(request.method==="GET" && url.pathname==="/llms.txt")return new Response("# SecretNests\n\nSecretNests is a traveler-led luxury hotel valuation and taste network. Core data includes actual paid prices, traveler willingness-to-pay, hotel value ranges, public creator lists and attributable booking outcomes.\n\nCanonical site: https://secretnests.com\nHotel pages: /hotel/{slug}\nDestinations: /destinations/{country}/{city}\nComparisons: /compare/{hotel-a}-vs-{hotel-b}\nValue discovery: /value\nCreators: /@{handle}\nLists: /@{handle}/lists/{slug}\n",{headers:{"content-type":"text/plain; charset=utf-8","cache-control":"public,max-age=3600"}});
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
      console.error(JSON.stringify({type:"error",request_id:requestId,path:new URL(request.url).pathname,message:safeLogError(e)}));
      const body=`<!doctype html><title>SecretNests</title><meta name="viewport" content="width=device-width"><body style="font-family:system-ui;padding:40px"><h1>Something went wrong.</h1><p>Please try again shortly.</p><p>Request ID: ${esc(requestId)}</p></body>`;
      return new Response(body,{status:500,headers:headers({"x-request-id":requestId})});
    }
  }
};
