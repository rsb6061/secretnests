const html = (body, title = "SecretNests") => new Response(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="description" content="What should this hotel cost? Real travelers share what they paid, what they'd pay again, and the hotels actually worth the splurge.">
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#111;background:#fff}
body{margin:0}a{color:inherit}.wrap{max-width:1120px;margin:auto;padding:28px}
header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #eee}
.brand{font-family:Georgia,serif;font-size:24px;font-weight:700;text-decoration:none}
.hero{padding:72px 0 48px}.hero h1{font-family:Georgia,serif;font-size:clamp(44px,7vw,78px);line-height:.98;max-width:850px;margin:0 0 22px}
.hero p{font-size:20px;line-height:1.5;max-width:760px;color:#444}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px}.card{border:1px solid #ddd;border-radius:14px;padding:22px}
.eyebrow{text-transform:uppercase;font-size:12px;letter-spacing:.12em;color:#666}.metric{font-size:28px;font-weight:700}
.quote{border-left:3px solid #111;padding-left:20px;margin:26px 0}.muted{color:#666}.pill{display:inline-block;padding:8px 12px;border:1px solid #ccc;border-radius:999px;margin:4px}
</style>
</head><body>${body}</body></html>`,{headers:{"content-type":"text/html; charset=utf-8"}});

const json = data => new Response(JSON.stringify(data),{headers:{"content-type":"application/json; charset=utf-8"}});

async function home(env){
  let hotelCount = 0;
  try {
    hotelCount = (await env.DB.prepare("SELECT COUNT(*) AS n FROM hotels WHERE is_published=1").first())?.n || 0;
  } catch {}
  return html(`<header class="wrap"><a class="brand" href="/">SecretNests</a><nav><a href="/about">How it works</a></nav></header>
<main class="wrap">
<section class="hero">
<div class="eyebrow">Luxury hotel value, according to people who actually stayed</div>
<h1>What should this hotel cost?</h1>
<p>Real travelers share what they paid, what they'd happily pay again, and the hotels they think are actually worth the splurge.</p>
</section>
<section class="grid">
<div class="card"><div class="eyebrow">Creator profiles</div><h2>Your hotel taste becomes an asset.</h2><p>@rebecca · 38 stays · 21 trip reports · 12 public lists · earnings from attributed bookings.</p></div>
<div class="card"><div class="eyebrow">Value range</div><h2>$450–575</h2><p>Traveler-assessed fair value, compared with the live cash price.</p></div>
<div class="card"><div class="eyebrow">Public lists</div><h2>Hotels I'd pay $500+ for again</h2><p>Follow people whose hotel taste matches yours—not anonymous average ratings.</p></div>
</section>
<section style="padding:64px 0">
<div class="quote"><strong>Paid:</strong> $725<br><strong>Would pay again:</strong> $475<br><strong>Traveler range:</strong> $450–575<br><strong>Current price:</strong> $710<br><strong>Value:</strong> materially above traveler-assessed fair value</div>
<p class="muted">${hotelCount ? hotelCount+" published hotels migrated / available." : "Cloudflare data migration in progress."}</p>
</section>
</main>`);
}

async function apiHotels(request, env){
  const url=new URL(request.url);
  const limit=Math.min(Number(url.searchParams.get("limit")||24),100);
  const rows=await env.DB.prepare("SELECT id,name,slug,city,country,price_estimate_min,price_estimate_max,google_rating,reddit_mention_count FROM hotels WHERE is_published=1 ORDER BY reddit_mention_count DESC, google_rating DESC LIMIT ?").bind(limit).all();
  return json(rows.results||[]);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if(url.pathname==="/") return home(env);
    if(url.pathname==="/api/hotels") return apiHotels(request,env);
    if(url.pathname==="/health") return json({ok:true,service:"secretnests"});
    if(url.pathname==="/robots.txt") return new Response("User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: https://secretnests.com/sitemap.xml\n",{headers:{"content-type":"text/plain"}});
    if(url.pathname==="/llms.txt") return new Response("# SecretNests\n\nSecretNests is a traveler-led luxury hotel valuation and taste network. Core data includes actual paid prices, traveler willingness-to-pay, hotel value ranges, public creator lists and attributable booking outcomes.\n",{headers:{"content-type":"text/plain"}});
    return new Response("Not found",{status:404});
  }
};
