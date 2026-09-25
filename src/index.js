import { drainOfficialHotelQueue } from "./enrichment-worker.js";
import { drainCurrentRateQueue } from "./rate-worker.js";
import { drainExternalEvidenceQueue } from "./external-evidence-worker.js";
import { refreshHotelEnrichment } from "./enrichment.js";
import { runNuiteeTop250Enrichment, resetNuiteeAuditHotel, approveNuiteeAuditHotel } from "./nuitee-top250-worker.js";
import { nuiteeAdminBody } from "./nuitee-admin.js";
import { recomputeHotelValuation } from "./value-engine.js";
import { sameOrigin, bodyTooLarge, enforceRateLimit, adminEmail, safeLogError } from "./security.js";
import { buildComparisonPairs, hotelSeoCopy, brandSlug } from "./seo-discovery.js";

const ORIGIN = "https://secretnests.com";

const esc = (v = "") => String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const attr = (v = "") => esc(v).replace(/\n/g," ");
const money = (v) => v == null || v === "" ? "—" : "$" + Number(v).toLocaleString(undefined,{maximumFractionDigits:0});
const safeJson = (v, fallback=[]) => { try { return JSON.parse(v ?? "") } catch { return fallback } };
const nowIso = () => new Date().toISOString();
const metaText = (v="", max=160) => { const s=String(v||"").replace(/\s+/g," ").trim(); return s.length<=max?s:s.slice(0,max-1).replace(/\s+\S*$/,"")+"…"; };
const hotelTitle = (name) => metaText(String(name)+" | SecretNests hotel value", 66);
const slugify = (v="") => String(v).normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/&/g," and ").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").replace(/-{2,}/g,"-");

function headers(extra={}) {
  return {
    "content-type":"text/html; charset=utf-8",
    "x-content-type-options":"nosniff",
    "referrer-policy":"strict-origin-when-cross-origin",
    "permissions-policy":"camera=(), microphone=(), geolocation=()",
    "strict-transport-security":"max-age=31536000; includeSubDomains",
    "x-frame-options":"DENY",
    "cross-origin-opener-policy":"same-origin",
    "cross-origin-resource-policy":"same-origin",
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
:root{
  --ink:#1b153c;
  --muted:#6e6882;
  --line:#d9d3ef;
  --blue:#4255ff;
  --bg:#f7f0e6;
  --soft:#f0ecff;
  --cream:#f7f0e6;
  --paper:#fffdf9;
  --green:#2f8c56;
  --orange:#ff6b3d;
  --pink:#e574c6;
  --lavender:#d8d2ff;
  --display:"Iowan Old Style","Palatino Linotype","Book Antiqua",Palatino,Georgia,serif;
}
*{box-sizing:border-box}
html{background:var(--cream)}
body{
  margin:0;
  font-family:"Avenir Next","Helvetica Neue",Helvetica,Arial,ui-sans-serif,system-ui,sans-serif;
  color:var(--ink);
  background:var(--cream);
  letter-spacing:-.01em;
  -webkit-font-smoothing:antialiased;
}
a{color:inherit}
.wrap{max-width:1180px;margin:0 auto;padding-left:24px;padding-right:24px}
.site-header{
  position:sticky;
  top:0;
  z-index:30;
  padding:16px 0;
  background:rgba(247,240,230,.92);
  backdrop-filter:blur(12px);
}
.header-inner{
  min-height:58px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:28px;
  padding:8px 10px 8px 18px;
  background:rgba(255,255,255,.72);
  border:1px solid var(--lavender);
  border-radius:999px;
  box-shadow:0 8px 24px rgba(41,32,89,.06);
  backdrop-filter:blur(10px);
}
.brand{
  font-size:20px;
  font-weight:550;
  letter-spacing:-.03em;
  text-decoration:none;
  white-space:nowrap;
}
.site-nav{display:flex;align-items:center;gap:4px;font-size:14px}
.site-nav a{
  padding:9px 12px;
  border-radius:999px;
  color:#514b65;
  text-decoration:none;
  white-space:nowrap;
}
.site-nav a:hover,.site-nav a:focus{background:#efeaff;color:var(--ink)}
.site-nav a.cta-nav{background:#e8e3ff;color:var(--ink);font-weight:600}
.site-main{min-height:calc(100vh - 190px);padding-top:12px;padding-bottom:84px}
.hero{padding:56px 0 34px}
.hero h1,h1,h2,h3,.display{
  font-family:var(--display);
  color:var(--ink);
}
.hero h1{
  font-size:clamp(44px,6vw,56px);
  line-height:.96;
  font-weight:400;
  letter-spacing:-.04em;
  max-width:930px;
  margin:0 0 14px;
}
.hero p{
  max-width:800px;
  margin:0;
  font-size:17px;
  line-height:1.55;
  color:#615b74;
}
h1{font-weight:400;letter-spacing:-.04em}
h2{
  font-size:34px;
  line-height:1.02;
  font-weight:400;
  letter-spacing:-.03em;
}
h3{
  font-size:23px;
  line-height:1.1;
  font-weight:400;
  letter-spacing:-.025em;
}
p{line-height:1.55}
.muted{color:var(--muted)}
.kicker{font-size:13px;line-height:1.45;color:var(--muted)}
.eyebrow{
  text-transform:uppercase;
  letter-spacing:.08em;
  font-size:12px;
  font-weight:750;
  color:var(--blue);
  margin-bottom:8px;
}
.section{padding:44px 0}
.section-head{
  display:flex;
  justify-content:space-between;
  align-items:flex-end;
  gap:24px;
  margin-bottom:18px;
}
.section-head h2{margin:0}
.section-head>a,.text-link{color:var(--blue);text-decoration:underline;text-underline-offset:3px}
.grid{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(min(290px,100%),1fr));
  gap:18px;
}
.card{
  position:relative;
  overflow:hidden;
  display:block;
  border:1px solid var(--lavender);
  border-radius:26px;
  padding:24px;
  background:rgba(255,255,255,.82);
  color:var(--ink);
  text-decoration:none;
  box-shadow:0 10px 28px rgba(41,32,89,.055);
  transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease;
}
.grid>.card:nth-child(4n+1){background:linear-gradient(145deg,#f8fbff 0%,#edf4ff 100%);border-color:#d9e0ff}
.grid>.card:nth-child(4n+2){background:linear-gradient(145deg,#f8fdf9 0%,#e9f8ef 100%);border-color:#d0eadb}
.grid>.card:nth-child(4n+3){background:linear-gradient(145deg,#fdfbff 0%,#eeeaff 100%);border-color:#ddd6ff}
.grid>.card:nth-child(4n+4){background:linear-gradient(145deg,#fffaf6 0%,#ffefe4 100%);border-color:#f1d8c8}
.card:hover,.card:focus{
  transform:translateY(-3px);
  border-color:#aa98ef;
  box-shadow:0 16px 36px rgba(41,32,89,.095);
}
.card h2,.card h3{margin:8px 0 10px}
.card p{color:#625c75}
.btn,.search button,button.btn{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-height:46px;
  padding:11px 20px;
  border:1px solid var(--blue);
  border-radius:999px;
  background:var(--blue);
  color:#fff;
  font:inherit;
  font-size:14px;
  font-weight:600;
  text-decoration:none;
  cursor:pointer;
  box-shadow:0 5px 14px rgba(66,85,255,.16);
  transition:transform .14s ease,box-shadow .14s ease,background .14s ease;
}
.btn:hover,.search button:hover,button.btn:hover{
  transform:translateY(-1px);
  box-shadow:0 8px 20px rgba(66,85,255,.23);
}
.btn.secondary{
  background:rgba(255,255,255,.78);
  color:var(--ink);
  border-color:var(--lavender);
  box-shadow:none;
}
.hero-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:24px}
.search{
  display:flex;
  gap:8px;
  max-width:800px;
  margin-top:24px;
  padding:7px;
  border:1px solid var(--lavender);
  border-radius:999px;
  background:rgba(255,255,255,.76);
  box-shadow:0 8px 24px rgba(41,32,89,.045);
}
.search input,.search select,.search textarea,
input[type="text"],input[type="email"],input[type="number"],input[type="month"],input[type="tel"],input[type="date"],input[type="search"],select,textarea{
  width:100%;
  border:1px solid var(--lavender)!important;
  border-radius:16px!important;
  padding:12px 14px!important;
  background:rgba(255,255,255,.88)!important;
  color:var(--ink);
  font:inherit;
  outline:none;
}
.search input,.search select{
  min-height:48px;
  border:0!important;
  border-radius:999px!important;
  background:transparent!important;
  padding-left:16px!important;
}
input:focus,select:focus,textarea:focus{
  border-color:#aa98ef!important;
  box-shadow:0 0 0 3px rgba(66,85,255,.09);
}
.proof,.stats{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(165px,1fr));
  gap:14px;
  margin:24px 0 28px;
  padding:0;
  border:0;
}
.proof>div,.stat{
  background:rgba(255,255,255,.82);
  border:1px solid var(--lavender);
  border-radius:24px;
  padding:22px;
  box-shadow:0 8px 24px rgba(41,32,89,.04);
}
.proof strong,.stat strong{
  display:block;
  font-family:var(--display);
  font-size:38px;
  line-height:1;
  font-weight:400;
  letter-spacing:-.03em;
  margin-bottom:6px;
}
.value-badge,.pill{
  display:inline-flex;
  align-items:center;
  gap:5px;
  border:1px solid #ddd6ff;
  border-radius:999px;
  padding:6px 10px;
  background:rgba(255,255,255,.72);
  color:#514b65;
  font-size:12px;
  line-height:1.2;
  text-decoration:none;
  margin:3px 4px 3px 0;
}
.value-badge{font-weight:650}
.value-badge.good{background:#e9f7ee;color:#267348;border-color:#cfe7d8}
.value-badge.high{background:#fff4e9;color:#915328;border-color:#f1d8c8}
.filters,.seo-links{display:flex;gap:7px;flex-wrap:wrap;margin:16px 0}
.price-line{
  display:flex;
  align-items:flex-end;
  justify-content:space-between;
  gap:16px;
  margin-top:18px;
}
.price-line strong{
  font-family:var(--display);
  font-size:28px;
  font-weight:400;
  letter-spacing:-.025em;
}
.value{
  display:grid;
  grid-template-columns:repeat(4,minmax(0,1fr));
  gap:14px;
  margin:18px 0;
}
.value>div{
  border:1px solid var(--lavender);
  border-radius:22px;
  padding:18px;
  background:rgba(255,255,255,.78);
}
.value>div:nth-child(1){background:#f7fbff}
.value>div:nth-child(2){background:#f7fcf8}
.value>div:nth-child(3){background:#fbf9ff}
.value>div:nth-child(4){background:#fff8f2}
.value strong{
  display:block;
  font-family:var(--display);
  font-size:30px;
  font-weight:400;
  letter-spacing:-.03em;
  margin-top:4px;
}
.notice,.empty{
  border:1px solid var(--lavender);
  border-radius:20px;
  padding:18px 20px;
  background:rgba(255,255,255,.78);
  color:var(--muted);
}
.notice strong,.empty strong{color:var(--ink)}
.error{border-color:#efc9c9;background:#fff2f1;color:#8d2424}
.list{padding:0;margin:0;list-style:none}
.list li{
  padding:16px 0;
  border-bottom:1px solid #e7e1f5;
  line-height:1.5;
}
.list li:last-child{border-bottom:0}
.mini-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.compare-form{
  display:grid;
  grid-template-columns:1fr auto 1fr auto;
  gap:10px;
  align-items:center;
}
.compare-form input{min-height:48px}
.hotel-row{display:grid;grid-template-columns:1fr auto;gap:20px;align-items:start}
.hero-media{
  width:100%;
  max-height:620px;
  object-fit:cover;
  border-radius:28px;
  margin:24px 0 10px;
  border:1px solid var(--lavender);
  background:#efeaff;
  box-shadow:0 12px 34px rgba(41,32,89,.07);
}
.two{
  display:grid;
  grid-template-columns:minmax(0,3fr) minmax(280px,1fr);
  gap:28px;
  align-items:start;
}
.hotel-shell{
  display:grid;
  grid-template-columns:minmax(0,3fr) minmax(280px,1fr);
  gap:28px;
  align-items:start;
}
.hotel-main{min-width:0}
.hotel-rail{min-width:0}
.hotel-rail-inner{position:sticky;top:106px;display:grid;gap:16px}
.hotel-highlights .pill{
  max-width:min(360px,100%);
  white-space:normal;
  line-height:1.35;
}
.fit-list{
  margin:6px 0 0;
  padding-left:18px;
  color:#514b65;
}
.fit-list li{
  margin:10px 0;
  line-height:1.4;
}
.contribution-card{
  border:1px solid var(--lavender);
  border-radius:28px;
  padding:24px;
  background:linear-gradient(145deg,#fffdf9 0%,#efebff 100%);
  box-shadow:0 10px 28px rgba(41,32,89,.055);
}
.contribution-card h3{font-size:30px;margin:7px 0 10px}
.contribution-card p{color:#625c75;line-height:1.5}
.contribution-card .btn{width:100%;margin-top:8px}
.contribution-inline-mobile{display:none}
.contribution-bottom{
  margin-top:22px;
  padding:30px;
  border:1px solid var(--lavender);
  border-radius:28px;
  background:linear-gradient(145deg,#fffdf9 0%,#efebff 100%);
  box-shadow:0 10px 28px rgba(41,32,89,.045);
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:28px;
}
.contribution-bottom h2{margin:6px 0 8px}
.amenity-list{display:flex;gap:7px;flex-wrap:wrap}
.take-card{
  max-width:820px;
  border:1px solid var(--lavender);
  border-radius:28px;
  padding:30px;
  background:rgba(255,255,255,.82);
  box-shadow:0 10px 28px rgba(41,32,89,.055);
}
.take-grid{
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:14px;
  margin:20px 0;
}
.take-grid>div{
  border:1px solid var(--lavender);
  border-radius:22px;
  padding:18px;
  background:#fff;
}
.take-grid strong{
  display:block;
  font-family:var(--display);
  font-size:30px;
  font-weight:400;
  margin-top:4px;
}
.fact-table{
  width:100%;
  overflow:hidden;
  border-collapse:separate;
  border-spacing:0;
  border:1px solid var(--lavender);
  border-radius:22px;
  background:rgba(255,255,255,.8);
  box-shadow:0 8px 24px rgba(41,32,89,.035);
}
.fact-table th,.fact-table td{
  padding:15px 18px;
  border-bottom:1px solid #e7e1f5;
  text-align:left;
  vertical-align:top;
}
.fact-table tr:last-child th,.fact-table tr:last-child td{border-bottom:0}
.fact-table th{width:34%;color:var(--muted);font-weight:550}
.faq details{
  margin:10px 0;
  padding:16px 18px;
  border:1px solid var(--lavender);
  border-radius:18px;
  background:rgba(255,255,255,.76);
}
.faq summary{
  font-family:var(--display);
  font-size:21px;
  cursor:pointer;
  color:var(--ink);
}
.faq p{color:var(--muted)}
.acquisition-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
.metric{font-family:var(--display);font-size:32px;font-weight:400}
.quote{border-left:3px solid var(--blue);padding-left:20px;margin:26px 0}
fieldset{border:0}
label{color:#514b65}
table{color:var(--ink)}
table th{color:#514b65}
table th,table td{border-color:#e7e1f5!important}
form.card{background:rgba(255,255,255,.82)}
.footer{
  margin-top:0;
  padding:30px 0;
  background:var(--ink);
  color:#eae7f4;
  font-size:14px;
}
.footer a{color:#fff}
.footer .kicker{color:#c9c4d8}
@media(max-width:820px){
  .site-header{padding:12px 0}
  .header-inner{
    border-radius:24px;
    padding:10px 12px;
    align-items:flex-start;
    flex-direction:column;
    gap:8px;
  }
  .site-nav{width:100%;overflow-x:auto;gap:0;padding-bottom:2px}
  .site-nav a{padding:8px 9px}
  .site-main{padding-top:0}
  .hero{padding-top:40px}
  .hero h1{font-size:44px}
  .section-head{align-items:flex-start;flex-direction:column}
  .value{grid-template-columns:1fr 1fr}
  .two,.hotel-shell{grid-template-columns:1fr}
  .hotel-rail .contribution-card{display:none}
  .hotel-rail-inner{position:static}
  .contribution-inline-mobile{display:block;margin:22px 0}
  .contribution-bottom{display:block}
  .contribution-bottom .btn{margin-top:12px;width:100%}
  .take-grid{grid-template-columns:1fr}
  .compare-form{grid-template-columns:1fr}
}
@media(max-width:620px){
  .wrap{padding-left:18px;padding-right:18px}
  .grid{grid-template-columns:1fr}
  .mini-grid{grid-template-columns:1fr}
  .search{flex-direction:column;border-radius:24px;padding:8px}
  .search input,.search select{border:1px solid var(--lavender)!important;background:#fff!important}
  .search button{width:100%}
  .proof,.stats{grid-template-columns:1fr 1fr}
  .hotel-row{grid-template-columns:1fr}
  .price-line{align-items:flex-start;flex-direction:column}
  .hero-actions .btn{width:100%}
}
@media(max-width:420px){
  .proof,.stats{grid-template-columns:1fr}
}
</style></head><body>${body}<footer class="footer"><div class="wrap"><strong>SecretNests</strong> · Luxury hotel value, according to people who actually stayed.<br><span class="kicker"><a href="/about">How it works</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/disclosures">Disclosures</a></span></div></footer>
<script>(function(){var k='sn_session_id',sid=sessionStorage.getItem(k);if(!sid){sid=crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+Math.random().toString(36).slice(2);sessionStorage.setItem(k,sid)}var q=new URLSearchParams(location.search),src=q.get('src'),campaign=q.get('campaign');if(src)sessionStorage.setItem('sn_contribution_source',src);if(campaign)sessionStorage.setItem('sn_contribution_campaign',campaign);src=src||sessionStorage.getItem('sn_contribution_source')||null;campaign=campaign||sessionStorage.getItem('sn_contribution_campaign')||null;function send(p){p.session_id=sid;p.path=location.pathname;p.source=src;p.campaign=campaign;fetch('/api/events',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(p),keepalive:true}).catch(function(){})}function payload(a,name){return{name:name,hotel_id:a.dataset.hotelId||null,creator_id:a.dataset.creatorId||null,list_id:a.dataset.listId||null}}send({name:'page_view'});var fired=new Set();function auto(a){var name=a.dataset.autoevent,key=name+'|'+(a.dataset.hotelId||'');if(fired.has(key))return;fired.add(key);send(payload(a,name))}document.querySelectorAll('[data-autoevent]').forEach(function(a){if(a.dataset.autoevent==='contribution_seen'&&'IntersectionObserver'in window){var io=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.isIntersecting){auto(a);io.disconnect()}})},{threshold:.3});io.observe(a)}else auto(a)});document.querySelectorAll('input[data-acquisition=source]').forEach(function(x){x.value=src||''});document.querySelectorAll('input[data-acquisition=campaign]').forEach(function(x){x.value=campaign||''});document.addEventListener('click',function(e){var a=e.target.closest('[data-event]');if(!a)return;send(payload(a,a.dataset.event))})})();</script>
</body></html>`,{headers:headers()});
}

const json = (data,status=200) => new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});

const shell = (content) => `<header class="site-header"><div class="wrap header-inner"><a class="brand" href="/">SecretNests</a><nav class="site-nav"><a href="/value">Value</a><a href="/destinations">Destinations</a><a href="/brands">Brands</a><a href="/compare">Compare</a><a href="/creators">Travelers</a><a class="cta-nav" href="/contribute">Contribute</a></nav></div></header><main class="wrap site-main">${content}</main>`;
const valueTone = (classification="") => String(classification).includes("below") ? "good" : String(classification).includes("above") ? "high" : "";
const hotelCard = (h) => `<a class="card" href="/hotel/${encodeURIComponent(h.slug)}">
  <div class="eyebrow">${esc([h.city,h.country].filter(Boolean).join(", "))}</div>
  <h3>${esc(h.name)}</h3>
  ${h.sample_size ? (!String(h.value_classification||"").toLowerCase().startsWith("insufficient") ? `<span class="value-badge ${valueTone(h.value_classification)}">${esc(h.value_classification||"traveler value available")}</span>` : "") : '<span class="value-badge">price context available</span>'}
  <p>${esc((h.description||"").slice(0,170))}</p>
  <div class="price-line"><div><div class="kicker">Estimated rate</div><strong>${money(h.price_estimate_min)}–${money(h.price_estimate_max)}</strong></div>
  <div style="text-align:right"><div class="kicker">Traveler value</div><strong>${h.sample_size?money(h.median_would_pay):"—"}</strong></div></div>
  <p class="muted">${h.sample_size?`${h.sample_size} observation${Number(h.sample_size)===1?"":"s"}${h.confidence&&!String(h.confidence).toLowerCase().startsWith("insufficient")?` · ${esc(h.confidence)} confidence`:""}`:"Fair-value sample building."}</p>
</a>`;


async function home(env){
  const hotelCount=Number((await env.DB.prepare("SELECT COUNT(*) AS n FROM hotels WHERE is_published=1").first())?.n||0);
  const evidenceCount=Number((await env.DB.prepare("SELECT COUNT(*) AS n FROM reddit_evidence").first())?.n||0);
  const destinations=Number((await env.DB.prepare("SELECT COUNT(*) AS n FROM (SELECT city,country FROM hotels WHERE is_published=1 AND city IS NOT NULL AND city<>'' GROUP BY city,country)").first())?.n||0);
  const top=(await env.DB.prepare(`SELECT h.name,h.slug,h.city,h.country,h.price_estimate_min,h.price_estimate_max,
    v.traveler_low,v.traveler_high,v.median_would_pay,v.sample_size,v.value_classification,v.confidence
    FROM hotels h
    LEFT JOIN hotel_value_snapshots v ON v.id=(SELECT id FROM hotel_value_snapshots WHERE hotel_id=h.id ORDER BY calculated_at DESC LIMIT 1)
    WHERE h.is_published=1
    ORDER BY CASE WHEN COALESCE(v.sample_size,0)>0 THEN 0 ELSE 1 END, COALESCE(v.sample_size,0) DESC,h.reddit_mention_count DESC,h.google_rating DESC
    LIMIT 6`).all()).results||[];
  const popular=(await env.DB.prepare(`SELECT city,country,COUNT(*) n FROM hotels
    WHERE is_published=1 AND city IS NOT NULL AND city<>'' GROUP BY city,country ORDER BY n DESC LIMIT 8`).all()).results||[];
  const valueLabel=(h)=>h.sample_size?(
    h.value_classification||"traveler value available"
  ):"price context available";
  const valueClass=(h)=>String(h.value_classification||"").includes("below")?"good":String(h.value_classification||"").includes("above")?"high":"";
  return page(shell(`
<section class="hero">
  <div class="eyebrow">Luxury hotel value intelligence</div>
  <h1>Know what a luxury hotel is actually worth.</h1>
  <p>Search a hotel or destination. SecretNests separates <em>good hotel</em> from <em>good value</em> using what travelers paid, what they would pay again, and the alternatives available at the same budget.</p>
  <form class="search" action="/search" method="get"><input name="q" placeholder="Try “Aman Tokyo”, “Mallorca”, or “quiet design hotel”" aria-label="Search hotels"><button data-event="search">Search hotels</button></form>
  <div class="hero-actions"><a class="btn secondary" href="/value">Browse by value</a><a class="btn secondary" href="/compare">Compare two hotels</a></div>
</section>

<section class="proof">
  <div><strong>${hotelCount.toLocaleString()}</strong><span class="muted">luxury hotels</span></div>
  <div><strong>${destinations.toLocaleString()}</strong><span class="muted">destinations</span></div>
  <div><strong>${evidenceCount.toLocaleString()}</strong><span class="muted">structured traveler signals</span></div>
  <div><strong>Paid vs. worth</strong><span class="muted">the metric that matters</span></div>
</section>

<section class="section">
  <div class="section-head"><div><div class="eyebrow">Start here</div><h2>Hotels with the strongest signals</h2></div><a href="/value">See value collections →</a></div>
  <div class="grid">${top.map(h=>`<a class="card" href="/hotel/${encodeURIComponent(h.slug)}">
    <div class="eyebrow">${esc([h.city,h.country].filter(Boolean).join(", "))}</div>
    <h3>${esc(h.name)}</h3>
    ${!h.sample_size || !String(h.value_classification||"").toLowerCase().startsWith("insufficient") ? `<span class="value-badge ${valueClass(h)}">${esc(valueLabel(h))}</span>` : ""}
    <div class="price-line"><div><div class="kicker">Estimated rate</div><strong>${money(h.price_estimate_min)}–${money(h.price_estimate_max)}</strong></div>
    <div style="text-align:right"><div class="kicker">Traveler value</div><strong>${h.sample_size?money(h.median_would_pay):"—"}</strong></div></div>
    <p class="muted">${h.sample_size?`${h.sample_size} value observation${Number(h.sample_size)===1?"":"s"}${h.confidence&&!String(h.confidence).toLowerCase().startsWith("insufficient")?` · ${esc(h.confidence)} confidence`:""}`:"First-party fair-value sample building now."}</p>
  </a>`).join("")}</div>
</section>

<section class="section">
  <div class="section-head"><div><div class="eyebrow">Browse</div><h2>Popular destinations</h2></div><a href="/destinations">All destinations →</a></div>
  <div class="grid">${popular.map(x=>`<a class="card" href="/destinations/${slugify(x.country)}/${slugify(x.city)}"><h3>${esc(x.city)}</h3><div class="muted">${esc(x.country||"")} · ${x.n} hotels</div></a>`).join("")}</div>
</section>

<section class="section">
  <div class="section-head"><div><div class="eyebrow">The SecretNests loop</div><h2>Stay → value it → help the next traveler.</h2></div></div>
  <div class="grid">
    <div class="card"><div class="eyebrow">1 · Stay</div><h3>Log what you actually paid</h3><p>Include the room, date, booking channel, and meaningful inclusions so the number has context.</p></div>
    <div class="card"><div class="eyebrow">2 · Value it</div><h3>Say what you'd happily pay again</h3><p>A hotel can be excellent and still be overpriced. SecretNests makes that distinction explicit.</p></div>
    <div class="card"><div class="eyebrow">3 · Publish taste</div><h3>Build lists people can trust</h3><p>Your stays become a travel portfolio: where you splurge, where you don't, and what you would book again.</p></div>
  </div>
</section>
<section class="section"><div class="contribution-bottom"><div><div class="eyebrow">First 300 stays</div><h2>Already stayed at a great—or wildly overpriced—hotel?</h2><p class="muted">Add the price you paid and what you'd pay again. It takes about two minutes and directly improves the hotel value pages.</p></div><a class="btn" href="/contribute?src=homepage&campaign=guest-referrals">Contribute a stay →</a></div></section>`),env,{title:"SecretNests | What is this luxury hotel actually worth?",description:"Compare luxury hotel prices with traveler-assessed value: what guests paid, what they would pay again, and which alternatives offer better value.",canonical:"/"});
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
      rows=(await env.DB.prepare(`SELECT h.name,h.slug,h.city,h.country,h.description,h.price_estimate_min,h.price_estimate_max,h.google_rating,h.reddit_mention_count,
        v.median_would_pay,v.traveler_low,v.traveler_high,v.sample_size,v.confidence,v.value_classification
        FROM hotels h
        LEFT JOIN hotel_value_snapshots v ON v.id=(SELECT id FROM hotel_value_snapshots WHERE hotel_id=h.id ORDER BY calculated_at DESC LIMIT 1)
        WHERE h.is_published=1 AND ${tokenClause.replaceAll("name","h.name").replaceAll("city","h.city").replaceAll("country","h.country").replaceAll("description","h.description").replaceAll("highlights_json","h.highlights_json").replaceAll("best_for_json","h.best_for_json")}
        ORDER BY CASE WHEN lower(h.name)=lower(?) THEN 0 WHEN lower(h.name) LIKE lower(?) THEN 1 ELSE 2 END,
        CASE WHEN COALESCE(v.sample_size,0)>0 THEN 0 ELSE 1 END,COALESCE(v.sample_size,0) DESC,h.reddit_mention_count DESC,h.google_rating DESC LIMIT 60`)
        .bind(...params,q,"%"+q+"%").all()).results||[];
    }
  }
  if(q && rows.length===0){ try{ await env.DB.prepare("INSERT INTO zero_result_searches (id,query,path,created_at) VALUES (?,?,?,?)").bind(crypto.randomUUID(),q,"/search",nowIso()).run(); }catch{} }
  return page(shell(`<section class="hero" style="padding-bottom:24px"><div class="eyebrow">Hotel search</div><h1>${q?esc(q):"Find a hotel worth the rate"}</h1><form class="search" action="/search"><input name="q" value="${attr(q)}" placeholder="Hotel, city, country, or style"><button data-event="search">Search</button></form></section>
<section><p class="muted">${q ? rows.length+" matches" : "Search by hotel, city, country, or phrases such as quiet design hotel or Maldives food."}</p><div class="grid">${rows.map(h=>hotelCard(h)).join("")|| (q?'<div class="notice">No matching hotels yet. Try a broader destination, hotel brand, or style.</div>':"")}</div></section>`),env,{title:q?`${q} hotel search | SecretNests`:"Hotel search | SecretNests",canonical:"/search"+(q?"?q="+encodeURIComponent(q):""),robots:"noindex,follow"});
}

async function destinationsPage(env){
  const rows=(await env.DB.prepare("SELECT city,country,COUNT(*) n FROM hotels WHERE is_published=1 AND city IS NOT NULL AND city<>'' GROUP BY city,country ORDER BY n DESC,city LIMIT 250").all()).results||[];
  return page(shell(`<section class="hero" style="padding-bottom:24px"><div class="eyebrow">Destinations</div><h1>Where should your hotel budget go?</h1><p>Browse destinations in the current SecretNests hotel corpus.</p></section><div class="grid">${rows.map(x=>`<a class="card" href="/destinations/${encodeURIComponent(slugify(x.country))}/${encodeURIComponent(slugify(x.city))}"><strong>${esc(x.city)}</strong><br><span class="muted">${esc(x.country||"")} · ${x.n} hotels</span></a>`).join("")}</div>`),env,{title:"Luxury hotel destinations | SecretNests",canonical:"/destinations"});
}

async function destinationPage(countrySlug,citySlug,env){
  const places=(await env.DB.prepare("SELECT DISTINCT city,country FROM hotels WHERE is_published=1 AND city IS NOT NULL AND city<>''").all()).results||[];
  const place=places.find(x=>slugify(x.country)===countrySlug&&slugify(x.city)===citySlug);
  if(!place)return new Response("Destination not found",{status:404});
  const rows=(await env.DB.prepare(`SELECT h.name,h.slug,h.city,h.country,h.brand_name,h.description,h.price_estimate_min,h.price_estimate_max,h.google_rating,h.reddit_mention_count,
    v.median_would_pay,v.traveler_low,v.traveler_high,v.sample_size,v.confidence,v.value_classification
    FROM hotels h LEFT JOIN hotel_value_snapshots v ON v.id=(SELECT id FROM hotel_value_snapshots WHERE hotel_id=h.id ORDER BY calculated_at DESC LIMIT 1)
    WHERE h.is_published=1 AND lower(h.city)=lower(?) AND lower(h.country)=lower(?)
    ORDER BY CASE WHEN COALESCE(v.sample_size,0)>0 THEN 0 ELSE 1 END,COALESCE(v.sample_size,0) DESC,h.reddit_mention_count DESC,h.google_rating DESC,h.name`).bind(place.city,place.country).all()).results||[];
  const canonical="/destinations/"+slugify(place.country)+"/"+slugify(place.city);
  const priced=rows.filter(x=>x.price_estimate_min!=null||x.price_estimate_max!=null);
  const lows=priced.map(x=>Number(x.price_estimate_min??x.price_estimate_max)).filter(Number.isFinite);
  const highs=priced.map(x=>Number(x.price_estimate_max??x.price_estimate_min)).filter(Number.isFinite);
  const typicalLow=lows.length?Math.round(lows.reduce((a,b)=>a+b,0)/lows.length):null;
  const typicalHigh=highs.length?Math.round(highs.reduce((a,b)=>a+b,0)/highs.length):null;
  const firstParty=rows.filter(x=>Number(x.sample_size||0)>0).length;
  const allBrandCounts=[...rows.reduce((m,x)=>{if(x.brand_name)m.set(x.brand_name,(m.get(x.brand_name)||0)+1);return m},new Map())].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  const brandCounts=allBrandCounts.slice(0,10);
  const pairs=buildComparisonPairs(rows,{maxPairs:8,perGroup:5});
  const jsonLd={"@context":"https://schema.org","@type":"CollectionPage","name":"Luxury hotels in "+place.city,"url":ORIGIN+canonical,"about":{"@type":"City","name":place.city},"mainEntity":{"@type":"ItemList","itemListElement":rows.slice(0,20).map((x,i)=>({"@type":"ListItem","position":i+1,"url":ORIGIN+"/hotel/"+x.slug,"name":x.name}))}};
  return page(shell(`<section class="hero" style="padding-bottom:24px"><div class="eyebrow">${esc(place.country)}</div><h1>Best luxury hotels in ${esc(place.city)}: prices & value</h1><p>Compare ${rows.length} SecretNests hotels in ${esc(place.city)} by estimated nightly price, traveler-assessed value where first-party stays exist, and direct hotel-to-hotel comparisons.</p><div class="hero-actions"><a class="btn secondary" href="/compare">Compare hotels</a><a class="btn secondary" href="/contribute">Add a stay</a></div></section>
  <section class="proof"><div><strong>${rows.length}</strong><span class="muted">hotels</span></div><div><strong>${typicalLow!=null&&typicalHigh!=null?money(typicalLow)+"–"+money(typicalHigh):"—"}</strong><span class="muted">average estimated range</span></div><div><strong>${firstParty}</strong><span class="muted">with first-party value data</span></div><div><strong>${allBrandCounts.length}</strong><span class="muted">represented brands</span></div></section>
  ${brandCounts.length?`<section class="section"><div class="section-head"><div><div class="eyebrow">Brands in ${esc(place.city)}</div><h2>Browse hotel brands</h2></div></div><div class="seo-links">${brandCounts.map(([name,count])=>`<a class="pill" href="/brands/${brandSlug(name)}">${esc(name)} · ${count}</a>`).join("")}</div></section>`:""}
  <section class="section"><div class="section-head"><div><div class="eyebrow">Hotel guide</div><h2>Luxury hotels in ${esc(place.city)}</h2></div><span class="muted">First-party fair value is shown only where submitted stay data exists.</span></div><div class="grid">${rows.map(h=>hotelCard(h)).join("")}</div></section>
  ${pairs.length?`<section class="section"><div class="section-head"><div><div class="eyebrow">Direct comparisons</div><h2>Popular ${esc(place.city)} hotel matchups</h2></div></div><div class="grid">${pairs.map(p=>`<a class="card" href="${attr(p.path)}"><strong>${esc(p.a.name)} vs. ${esc(p.b.name)}</strong><p class="muted">Compare price context, traveler value and hotel facts side by side.</p></a>`).join("")}</div></section>`:""}`),env,{title:`Best luxury hotels in ${place.city}: prices & value | SecretNests`,description:`Compare ${rows.length} luxury hotels in ${place.city}, ${place.country} by estimated rates, traveler value data and hotel-to-hotel comparisons.`,canonical,jsonLd});
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
  return page(shell(`<section class="hero" data-autoevent="creator_view" data-creator-id="${attr(creator.id)}" style="padding-bottom:20px"><div class="eyebrow">@${esc(creator.handle)}${creator.is_demo?" · Demo profile":""}</div><h1>${esc(creator.display_name)}</h1><p>${esc(creator.bio||"")}</p>${creator.is_demo?'<div class="notice"><strong>Illustrative demo data.</strong> This profile demonstrates the product and does not claim these are real stays.</div>':""}</section><div class="stats"><div class="stat"><strong>${creator.stay_count||0}</strong><span>stays</span></div><div class="stat"><strong>${creator.report_count||0}</strong><span>trip reports</span></div><div class="stat"><strong>${creator.list_count||0}</strong><span>public lists</span></div><div class="stat"><strong>${creator.booking_count||0}</strong><span>bookings generated</span></div><div class="stat"><strong>${money(creator.earnings||0)}</strong><span>earned</span></div></div><h2>Taste profile</h2><div>${tastes.map(t=>`<span class="pill">${esc(t)}</span>`).join("")||'<span class="muted">Taste profile not added yet.</span>'}</div><section class="section"><h2>Recent stays</h2><ul class="list">${stays.map(s=>`<li><a href="/hotel/${encodeURIComponent(s.slug)}"><strong>${esc(s.name)}</strong></a> · ${esc([s.city,s.country].filter(Boolean).join(", "))}<br><span class="muted">Stayed ${esc(s.stay_month||"—")} · paid ${money(s.paid_nightly_rate)} · would pay again ${money(s.would_pay_again)} · would return ${s.would_return==null?"—":s.would_return?"Yes":"No"}</span></li>`).join("")||'<li class="muted">No public stays yet.</li>'}</ul></section><section><h2>Lists</h2><ul class="list">${lists.map(l=>`<li><a href="/@${encodeURIComponent(creator.handle)}/lists/${encodeURIComponent(l.slug)}"><strong>${esc(l.title)}</strong></a><br><span class="muted">${esc(l.description||"")}</span></li>`).join("")||'<li class="muted">No public lists yet.</li>'}</ul></section>`),env,{title:`${creator.display_name} (@${creator.handle}) | SecretNests`,canonical:"/@"+encodeURIComponent(creator.handle),robots:creator.is_demo?"noindex,follow":"index,follow"});
}

async function hotelPage(slug, env){
  let h=await env.DB.prepare("SELECT * FROM hotels WHERE slug=? AND is_published=1").bind(slug).first();
  if(!h){
    h=await env.DB.prepare("SELECT h.* FROM hotel_slug_aliases a JOIN hotels h ON h.id=a.hotel_id WHERE a.alias_slug=? AND h.is_published=1").bind(slug).first();
    if(h) return Response.redirect(ORIGIN+"/hotel/"+encodeURIComponent(h.slug),301);
    return new Response("Hotel not found",{status:404});
  }
  const v=await env.DB.prepare("SELECT * FROM hotel_value_snapshots WHERE hotel_id=? ORDER BY calculated_at DESC LIMIT 1").bind(h.id).first();
  const latestRate=await env.DB.prepare(`SELECT ro.nightly_rate,ro.currency,ro.provider_id,ro.booking_url,ro.checkin_date,ro.checkout_date,ro.room_type,ro.rate_name,ro.taxes_fees_included,ro.observed_at,p.name provider_name
    FROM hotel_rate_observations ro LEFT JOIN affiliate_providers p ON p.id=ro.provider_id
    WHERE ro.hotel_id=? AND ro.provider_id<>'nuitee_sandbox' ORDER BY ro.observed_at DESC LIMIT 1`).bind(h.id).first();
  const media=await env.DB.prepare(`SELECT id,r2_key,source_url,attribution_text,rights_status FROM media_assets
    WHERE hotel_id=? AND rights_status IN ('owned_user_upload','hotel_authorized','licensed_api','licensed_public')
    ORDER BY CASE rights_status WHEN 'owned_user_upload' THEN 0 WHEN 'hotel_authorized' THEN 1 ELSE 2 END,created_at
    LIMIT 1`).bind(h.id).first();
  const mediaUrl=media ? (media.r2_key ? "/media/"+encodeURIComponent(media.id) : media.source_url) : null;
  const legacyEvidence=(await env.DB.prepare("SELECT 'reddit' provider,sentiment,price_mentioned,trip_context,confidence,source_url,NULL summary,created_at observed_at FROM reddit_evidence WHERE hotel_id=? ORDER BY created_at DESC LIMIT 8").bind(h.id).all()).results||[];
  const structuredEvidence=(await env.DB.prepare("SELECT provider,sentiment,price_mentioned,trip_context,confidence,source_url,summary,observed_at FROM hotel_external_evidence WHERE hotel_id=? AND provider NOT LIKE '%_sandbox' ORDER BY observed_at DESC LIMIT 8").bind(h.id).all()).results||[];
  const evidence=[...structuredEvidence,...legacyEvidence].sort((a,b)=>String(b.observed_at||"").localeCompare(String(a.observed_at||""))).slice(0,8);
  const comps=(await env.DB.prepare(`SELECT name,slug,city,country,brand_name,price_estimate_min,price_estimate_max FROM hotels WHERE is_published=1 AND id<>? AND ((city IS NOT NULL AND city=?) OR (country IS NOT NULL AND country=?)) ORDER BY CASE WHEN city=? THEN 0 ELSE 1 END,ABS(COALESCE(price_estimate_min,0)-COALESCE(?,0)),reddit_mention_count DESC LIMIT 4`).bind(h.id,h.city||"",h.country||"",h.city||"",h.price_estimate_min||0).all()).results||[];
  const highlights=safeJson(h.highlights_json,[]), bestFor=safeJson(h.best_for_json,[]), amenities=safeJson(h.amenities_json,[]);
  const location=[h.city,h.country].filter(Boolean).join(", ");
  const seo=hotelSeoCopy(h,{travelerMedian:v?.median_would_pay,sampleSize:v?.sample_size||0,currentRate:latestRate?.nightly_rate??v?.current_price});
  const cityUrl=h.city&&h.country?"/destinations/"+slugify(h.country)+"/"+slugify(h.city):null;
  const brandUrl=h.brand_name?"/brands/"+brandSlug(h.brand_name):null;
  const compareLinks=comps.map(c=>({name:c.name,url:"/compare/"+encodeURIComponent(h.slug)+"-vs-"+encodeURIComponent(c.slug)}));
  const faq=[
    {q:"How much does "+h.name+" cost?",a:seo.priceAnswer},
    {q:"Is "+h.name+" worth it?",a:seo.worthAnswer},
    {q:"What do guest reviews say about "+h.name+"?",a:h.external_review_summary&&!String(h.external_review_source||"").includes("sandbox")?String(h.external_review_summary):evidence.length?"SecretNests has "+evidence.length+" structured traveler-evidence item"+(evidence.length===1?"":"s")+" on this page. They are shown separately from first-party price opinions.":"SecretNests does not yet have enough structured guest-review evidence to summarize this hotel."}
  ];
  const factRows=[
    ["Location",location||"—"],
    ["Brand",h.brand_name||"Independent / not classified"],
    ["Category",h.hotel_category||"—"],
    ["Estimated nightly range",h.price_estimate_min!=null||h.price_estimate_max!=null?money(h.price_estimate_min)+"–"+money(h.price_estimate_max):"—"],
    ["Latest observed rate",latestRate?.nightly_rate!=null?money(latestRate.nightly_rate):"—"],
    ["Traveler median would-pay",v?.sample_size?money(v.median_would_pay):"Sample building"],
    ["External review signal",h.external_review_summary&&!String(h.external_review_source||"").includes("sandbox")?(h.external_review_sentiment||"Available"):"—"]
  ];
  const contributionUrl="/add-your-trip?hotel="+encodeURIComponent(h.slug)+"#add-your-stay";
  const contributionCard=(variant="rail")=>`<div class="contribution-card ${variant}" data-autoevent="contribution_seen" data-hotel-id="${attr(h.id)}"><div class="eyebrow">Stayed here?</div><h3>What did you pay — and what was it worth?</h3><p>Help the next traveler with the two numbers that matter: your actual nightly rate and what you’d happily pay to stay again.</p><a class="btn" data-event="contribution_cta_click" data-hotel-id="${attr(h.id)}" href="${attr(contributionUrl)}">Add your stay →</a><p class="kicker">About 2 minutes · not a star rating</p></div>`;
  const publicExternalReview=h.external_review_summary&&!String(h.external_review_source||"").includes("sandbox")
    ?`<section><h2>External guest-review signal</h2><div class="notice"><strong>${esc(h.external_review_sentiment||"External signal")}</strong><p>${esc(h.external_review_summary)}</p><div class="kicker">External aggregated review data · ${esc(h.external_review_source||"provider")} · does not affect SecretNests traveler value.</div></div></section>`
    :"";
  const valueClassification=v?.value_classification&&!String(v.value_classification).toLowerCase().startsWith("insufficient")?String(v.value_classification):"";
  const valueConfidence=v?.confidence&&!String(v.confidence).toLowerCase().startsWith("insufficient")?String(v.confidence):"";
  const valueMeta=[valueClassification,valueConfidence?`${valueConfidence} confidence`:""].filter(Boolean);
  const valueBlock=v?`<section><h2>What travelers think it's worth</h2><div class="value"><div><div class="eyebrow">Traveler range</div><strong>${money(v.traveler_low)}–${money(v.traveler_high)}</strong></div><div><div class="eyebrow">Median would pay</div><strong>${money(v.median_would_pay)}</strong></div><div><div class="eyebrow">Current observed rate</div><strong>${money(latestRate?.nightly_rate??v.current_price)}</strong></div><div><div class="eyebrow">Sample</div><strong>${esc(v.sample_size)}</strong> stays</div></div>${valueMeta.length?`<p><strong>Value:</strong> ${valueMeta.map(esc).join(" · ")}</p>`:""}</section>`:`<section><h2>What travelers think it's worth</h2><p class="muted">Not enough first-party stay data yet. Add your stay to help establish the fair-value range.</p></section>`;
  const jsonLd={"@context":"https://schema.org","@graph":[
    {"@type":"Hotel","name":h.name,"description":h.description||undefined,"url":ORIGIN+"/hotel/"+h.slug,"image":mediaUrl?(mediaUrl.startsWith("http")?mediaUrl:ORIGIN+mediaUrl):undefined,"address":h.formatted_address||h.address||undefined,"telephone":h.phone||undefined,"brand":h.brand_name?{"@type":"Brand","name":h.brand_name}:undefined,"sameAs":h.website?[h.website]:undefined,"aggregateRating":h.google_rating?{"@type":"AggregateRating","ratingValue":h.google_rating,"reviewCount":h.google_review_count||undefined}:undefined},
    {"@type":"BreadcrumbList","itemListElement":[
      {"@type":"ListItem","position":1,"name":"Destinations","item":ORIGIN+"/destinations"},
      ...(cityUrl?[{"@type":"ListItem","position":2,"name":location,"item":ORIGIN+cityUrl}]:[]),
      {"@type":"ListItem","position":cityUrl?3:2,"name":h.name,"item":ORIGIN+"/hotel/"+h.slug}
    ]},
    {"@type":"FAQPage","mainEntity":faq.map(x=>({"@type":"Question","name":x.q,"acceptedAnswer":{"@type":"Answer","text":x.a}}))}
  ]};
  return page(shell(`<div class="hotel-shell"><div class="hotel-main"><section class="hero" data-autoevent="hotel_view" data-hotel-id="${attr(h.id)}" style="padding-bottom:28px"><div class="eyebrow">${esc(location)}</div><h1>${esc(h.name)}: prices, traveler reviews & what it’s worth</h1>${mediaUrl?`<img class="hero-media" src="${attr(mediaUrl)}" alt="${attr(h.name)}">${media.attribution_text?`<div class="kicker">${esc(media.attribution_text)}</div>`:""}`:""}<p>${esc(h.description||"")}</p><div class="seo-links">${cityUrl?`<a class="pill" href="${attr(cityUrl)}">Luxury hotels in ${esc(h.city)}</a>`:""}${brandUrl?`<a class="pill" href="${attr(brandUrl)}">${esc(h.brand_name)} hotels</a>`:""}</div><div class="filters hotel-highlights">${highlights.slice(0,4).map(x=>`<span class="pill">${esc(x)}</span>`).join("")}</div></section>
${valueBlock}<div class="contribution-inline-mobile">${contributionCard("mobile")}</div>
<section class="section"><h2>Is ${esc(h.name)} worth it?</h2><p>${esc(seo.worthAnswer)}</p></section>
<section><h2>${esc(h.name)} at a glance</h2><table class="fact-table"><tbody>${factRows.map(([k,val])=>`<tr><th>${esc(k)}</th><td>${esc(val)}</td></tr>`).join("")}</tbody></table></section>
<section class="section"><h2>How much does ${esc(h.name)} cost?</h2><p>${esc(seo.priceAnswer)}</p><p>Estimated historical range: <strong>${money(h.price_estimate_min)}–${money(h.price_estimate_max)}</strong> per night.</p>
${latestRate?`<div class="notice"><div class="eyebrow">Latest observed bookable rate</div><div class="price-line"><strong>${money(latestRate.nightly_rate)}</strong><span class="muted">${esc(latestRate.provider_name||latestRate.provider_id||"provider")} · observed ${esc(String(latestRate.observed_at||"").slice(0,10))}</span></div>${latestRate.checkin_date?`<p class="kicker">${esc(latestRate.checkin_date)} → ${esc(latestRate.checkout_date||"")} ${latestRate.room_type?"· "+esc(latestRate.room_type):""} ${latestRate.taxes_fees_included==null?"":latestRate.taxes_fees_included?"· taxes/fees included":"· before taxes/fees"}</p>`:""}</div>`:""}
${(latestRate?.booking_url||h.booking_url)?`<p><a class="btn" data-event="outbound_booking_click" data-hotel-id="${attr(h.id)}" href="/out/${encodeURIComponent(h.slug)}" rel="nofollow sponsored">Check booking options</a></p>`:""}</section>${amenities.length?`<section><h2>Amenities</h2><div class="amenity-list">${amenities.slice(0,18).map(x=>`<span class="pill">${esc(x)}</span>`).join("")}</div></section>`:""}<section><h2>Traveler evidence</h2><ul class="list">${evidence.map(e=>`<li>${e.price_mentioned?`<strong>${money(e.price_mentioned)}</strong> · `:""}${esc(e.summary||e.trip_context||e.sentiment||"Traveler mention")} ${e.source_url?`<a href="${attr(e.source_url)}" rel="nofollow noopener">source</a>`:""}</li>`).join("")||'<li class="muted">No structured traveler evidence yet.</li>'}</ul></section>${publicExternalReview}</div>
<aside class="hotel-rail"><div class="hotel-rail-inner">${contributionCard("rail")}${bestFor.length?`<div class="card"><div class="eyebrow">Good fit for</div><h3>Best for</h3><ul class="fit-list">${bestFor.slice(0,3).map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>`:""}</div></aside></div>
<section class="section"><h2>Nearby / comparable alternatives</h2><div class="grid">${comps.map(c=>`<a class="card" href="/hotel/${encodeURIComponent(c.slug)}"><strong>${esc(c.name)}</strong><br><span class="muted">${esc([c.city,c.country].filter(Boolean).join(", "))} · ${money(c.price_estimate_min)}–${money(c.price_estimate_max)}</span></a>`).join("")}</div>${compareLinks.length?`<div class="seo-links" style="margin-top:14px">${compareLinks.map(x=>`<a class="pill" href="${attr(x.url)}">Compare with ${esc(x.name)}</a>`).join("")}</div>`:""}
<section class="section faq"><h2>${esc(h.name)} FAQ</h2>${faq.map(x=>`<details><summary>${esc(x.q)}</summary><p>${esc(x.a)}</p></details>`).join("")}</section>
<div class="contribution-bottom" data-autoevent="contribution_seen" data-hotel-id="${attr(h.id)}"><div><div class="eyebrow">Add one useful data point</div><h2>Stayed at ${esc(h.name)}?</h2><p class="muted">Share what you paid, what you’d pay again, and whether you’d return. That is how the fair-value range gets better.</p></div><a class="btn" data-event="contribution_cta_click" data-hotel-id="${attr(h.id)}" href="${attr(contributionUrl)}">Add your stay →</a></div></section>`),env,{title:seo.title,description:seo.description,canonical:"/hotel/"+encodeURIComponent(h.slug),jsonLd});
}

async function listPage(handle, slug, env){
  const l=await env.DB.prepare(`SELECT l.*,cp.handle,cp.display_name FROM lists l JOIN creator_profiles cp ON cp.id=l.creator_id WHERE lower(cp.handle)=lower(?) AND l.slug=? AND l.is_public=1 AND cp.is_public=1`).bind(handle,slug).first();
  if(!l)return new Response("List not found",{status:404});
  const items=(await env.DB.prepare(`SELECT h.name,h.slug,h.city,h.country,li.note,li.rank FROM list_items li JOIN hotels h ON h.id=li.hotel_id WHERE li.list_id=? ORDER BY COALESCE(li.rank,999999),li.created_at`).bind(l.id).all()).results||[];
  return page(shell(`<section class="hero" style="padding-bottom:20px"><div class="eyebrow">A list by <a href="/@${encodeURIComponent(l.handle)}">@${esc(l.handle)}</a></div><h1>${esc(l.title)}</h1><p>${esc(l.description||"")}</p></section><ul class="list">${items.map((x,i)=>`<li><a href="/hotel/${encodeURIComponent(x.slug)}"><strong>${x.rank||i+1}. ${esc(x.name)}</strong></a> · ${esc([x.city,x.country].filter(Boolean).join(", "))}<br><span class="muted">${esc(x.note||"")}</span></li>`).join("")||'<li class="muted">No hotels added yet.</li>'}</ul>`),env,{title:`${l.title} by @${l.handle} | SecretNests`,canonical:`/@${encodeURIComponent(l.handle)}/lists/${encodeURIComponent(l.slug)}`});
}

async function contributePage(request,env){
  const url=new URL(request.url);
  const source=(url.searchParams.get("src")||"").trim().slice(0,80);
  const campaign=(url.searchParams.get("campaign")||"").trim().slice(0,120);
  const target=300;
  const submitted=Number((await env.DB.prepare("SELECT COUNT(*) n FROM trip_submissions WHERE status<>'rejected'").first())?.n||0);
  const published=Number((await env.DB.prepare("SELECT COUNT(*) n FROM stays WHERE COALESCE(verification_method,'')<>'demo'").first())?.n||0);
  const targets=(await env.DB.prepare(`SELECT h.id,h.name,h.slug,h.city,h.country,p.priority_rank,
      (SELECT COUNT(*) FROM trip_submissions ts WHERE ts.hotel_id=h.id AND ts.status<>'rejected') submission_count
    FROM hotel_enrichment_profiles p JOIN hotels h ON h.id=p.hotel_id
    WHERE p.cohort='priority_250' AND p.first_party_score=0
    ORDER BY p.priority_rank LIMIT 12`).all()).results||[];
  const qs=[source?"src="+encodeURIComponent(source):"",campaign?"campaign="+encodeURIComponent(campaign):""].filter(Boolean).join("&");
  const suffix=qs?"&"+qs:"";
  const progress=Math.min(100,Math.round(submitted/target*100));
  return page(shell(`<section class="hero" data-autoevent="contribution_landing_view"><div class="eyebrow">Build the traveler value map</div><h1>Tell us what your hotel stay was actually worth.</h1><p>SecretNests is building its first 300 real stay observations. Share the nightly price you paid, what you'd happily pay again, and whether you'd return. Positive and negative takes are equally useful.</p><div class="hero-actions"><a class="btn" href="/add-your-trip${qs?"?"+qs:""}">Add any stay</a><a class="btn secondary" href="#priority-hotels">See hotels that need data</a></div></section>
  <section class="proof"><div><strong>${submitted}</strong><span class="muted">submitted stays</span></div><div><strong>${published}</strong><span class="muted">published first-party stays</span></div><div><strong>${target}</strong><span class="muted">first milestone</span></div><div><strong>${progress}%</strong><span class="muted">submission progress</span></div></section>
  <section class="section"><div class="section-head"><div><div class="eyebrow">Why contribute</div><h2>Two numbers are more useful than another star rating.</h2></div></div><div class="acquisition-grid"><div class="card"><h3>What you paid</h3><p>The real nightly rate, with room and booking context.</p></div><div class="card"><h3>What you'd pay again</h3><p>Your own price threshold for repeating the stay.</p></div><div class="card"><h3>Would you return?</h3><p>A clean repeat-intent signal, independent of affiliate economics.</p></div></div></section>
  <section class="section" id="priority-hotels"><div class="section-head"><div><div class="eyebrow">Priority data gaps</div><h2>Stayed at one of these?</h2></div><span class="muted">These are high-priority SecretNests hotels without a published first-party value sample yet.</span></div><div class="grid">${targets.map(h=>`<a class="card" data-event="contribution_hotel_select" data-hotel-id="${attr(h.id)}" href="/add-your-trip?hotel=${encodeURIComponent(h.slug)}${suffix}"><div class="eyebrow">Priority #${h.priority_rank}</div><h3>${esc(h.name)}</h3><p class="muted">${esc([h.city,h.country].filter(Boolean).join(", "))} · ${Number(h.submission_count||0)} pending/submitted</p><strong>Add your stay →</strong></a>`).join("")||'<div class="notice">The current priority cohort already has first-party coverage.</div>'}</div></section>
  <section class="section"><div class="notice"><strong>No pay-for-positive-review system.</strong><p>Contributions can be favorable, mixed, or negative. Affiliate revenue and creator economics are kept separate from review sentiment and value opinions.</p></div></section>`),env,{title:"Contribute a hotel stay | SecretNests",description:"Share what you paid for a hotel, what you would pay again, and whether you would return. Help build SecretNests traveler-assessed hotel value data.",canonical:"/contribute"});
}

async function adminContributionsPage(request,env){
  const moderator=adminEmail(request,env);
  if(!moderator)return new Response("Not found",{status:404});
  const campaigns=(await env.DB.prepare(`SELECT c.code,c.name,c.channel,c.target_count,c.status,
      (SELECT COUNT(*) FROM trip_submissions ts WHERE ts.contribution_campaign=c.code AND ts.status<>'rejected') submissions,
      (SELECT COUNT(DISTINCT ae.session_id) FROM analytics_events ae WHERE json_extract(ae.metadata_json,'$.campaign')=c.code AND ae.event_name='contribution_landing_view') landing_sessions,
      (SELECT COUNT(DISTINCT ae.session_id) FROM analytics_events ae WHERE json_extract(ae.metadata_json,'$.campaign')=c.code AND ae.event_name='contribution_started') started_sessions
    FROM contribution_campaigns c ORDER BY c.created_at`).all()).results||[];
  const totals=await env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM trip_submissions WHERE status<>'rejected') submissions,
      (SELECT COUNT(*) FROM stays WHERE COALESCE(verification_method,'')<>'demo') published_stays,
      (SELECT COUNT(DISTINCT hotel_id) FROM trip_submissions WHERE status<>'rejected' AND hotel_id IS NOT NULL) hotels_touched,
      (SELECT COUNT(DISTINCT session_id) FROM analytics_events WHERE event_name='contribution_landing_view') landing_sessions,
      (SELECT COUNT(DISTINCT session_id) FROM analytics_events WHERE event_name='contribution_started') started_sessions,
      (SELECT COUNT(DISTINCT session_id) FROM analytics_events WHERE event_name='contribution_submitted') submitted_sessions`).first();
  const targets=(await env.DB.prepare(`SELECT h.name,h.slug,h.city,h.country,p.priority_rank,
      (SELECT COUNT(*) FROM trip_submissions ts WHERE ts.hotel_id=h.id AND ts.status<>'rejected') submissions
    FROM hotel_enrichment_profiles p JOIN hotels h ON h.id=p.hotel_id
    WHERE p.cohort='priority_250' AND p.first_party_score=0
    ORDER BY p.priority_rank LIMIT 40`).all()).results||[];
  const recent=(await env.DB.prepare(`SELECT ts.created_at,ts.hotel_name,ts.city,ts.contribution_source,ts.contribution_campaign,ts.status
    FROM trip_submissions ts ORDER BY ts.created_at DESC LIMIT 30`).all()).results||[];
  const base=ORIGIN+"/contribute";
  return page(shell(`<section class="hero" style="padding-bottom:20px"><div class="eyebrow">Contribution acquisition</div><h1>First 300 stay campaign</h1><p>Track outreach by source and campaign, then concentrate recruiting on the highest-priority hotels still missing first-party value data.</p></section>
  <div class="proof"><div><strong>${Number(totals?.submissions||0)}</strong><span class="muted">submissions</span></div><div><strong>${Number(totals?.published_stays||0)}</strong><span class="muted">published stays</span></div><div><strong>${Number(totals?.hotels_touched||0)}</strong><span class="muted">hotels touched</span></div><div><strong>${Number(totals?.landing_sessions||0)}</strong><span class="muted">landing sessions</span></div><div><strong>${Number(totals?.started_sessions||0)}</strong><span class="muted">starts</span></div><div><strong>${Number(totals?.submitted_sessions||0)}</strong><span class="muted">tracked submits</span></div></div>
  <section class="section"><div class="section-head"><div><div class="eyebrow">Campaign links</div><h2>Recruiting cohorts</h2></div></div><div class="grid">${campaigns.map(c=>{const link=base+"?src="+encodeURIComponent(c.channel)+"&campaign="+encodeURIComponent(c.code);return `<div class="card"><div class="eyebrow">${esc(c.channel)} · ${esc(c.status)}</div><h3>${esc(c.name)}</h3><p><strong>${Number(c.submissions||0)} / ${Number(c.target_count||0)}</strong> submissions</p><p class="muted">${Number(c.landing_sessions||0)} landing sessions · ${Number(c.started_sessions||0)} starts</p><input readonly value="${attr(link)}" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px"></div>`}).join("")}</div></section>
  <section class="section"><div class="section-head"><div><div class="eyebrow">Target list</div><h2>Highest-priority hotels still needing a stay</h2></div><span class="muted">Use hotel-specific links when the recruit is known to have stayed there.</span></div><div style="overflow:auto"><table class="fact-table"><thead><tr><th>#</th><th>Hotel</th><th>Submissions</th><th>Tracked link</th></tr></thead><tbody>${targets.map(h=>{const link=ORIGIN+"/add-your-trip?hotel="+encodeURIComponent(h.slug)+"&src=direct&campaign=founder-network";return `<tr><td>${h.priority_rank}</td><td><a href="/hotel/${encodeURIComponent(h.slug)}"><strong>${esc(h.name)}</strong></a><br><span class="kicker">${esc([h.city,h.country].filter(Boolean).join(", "))}</span></td><td>${Number(h.submissions||0)}</td><td><input readonly value="${attr(link)}" style="width:100%;min-width:340px;padding:8px;border:1px solid #ddd;border-radius:7px"></td></tr>`}).join("")}</tbody></table></div></section>
  <section class="section"><div class="section-head"><div><div class="eyebrow">Recent activity</div><h2>Attributed submissions</h2></div></div><ul class="list">${recent.map(x=>`<li><strong>${esc(x.hotel_name)}</strong> · ${esc(x.city||"")}<br><span class="muted">${esc(x.created_at)} · source ${esc(x.contribution_source||"organic")} · campaign ${esc(x.contribution_campaign||"none")} · ${esc(x.status)}</span></li>`).join("")||'<li class="muted">No submissions yet.</li>'}</ul></section>`),env,{title:"Contribution acquisition | SecretNests",canonical:"/admin/contributions",robots:"noindex,nofollow"});
}

async function addTripPage(request,env){
  const url=new URL(request.url),hotelSlug=(url.searchParams.get("hotel")||"").trim();
  const acquisitionSource=(url.searchParams.get("src")||"").trim().slice(0,80),acquisitionCampaign=(url.searchParams.get("campaign")||"").trim().slice(0,120);
  const prefilled=hotelSlug?await env.DB.prepare("SELECT id,name,slug,city,country FROM hotels WHERE slug=? AND is_published=1").bind(hotelSlug).first():null;
  const enabled=String(env.SUBMISSIONS_ENABLED||"false").toLowerCase()==="true";
  const body=enabled
    ? `<section class="hero" id="add-your-stay" style="padding-bottom:22px"><div class="eyebrow">Add Your Trip</div><h1>${prefilled?`Value your stay at ${esc(prefilled.name)}`:"What did the hotel cost — and what was it worth?"}</h1><p>The useful signal is not a 1–5 star score. It is the price you actually paid, the price you’d happily pay again, and the context around that stay.</p></section>
<form class="card" data-autoevent="contribution_started" data-hotel-id="${attr(prefilled?.id||"")}" method="post" action="/add-your-trip" enctype="multipart/form-data" style="max-width:820px">
  <div style="display:none"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>
  <input type="hidden" name="hotel_id" id="hotel_id" value="${attr(prefilled?.id||"")}">
  <input type="hidden" name="contribution_source" data-acquisition="source" value="${attr(acquisitionSource)}">
  <input type="hidden" name="contribution_campaign" data-acquisition="campaign" value="${attr(acquisitionCampaign)}">
  <div style="position:relative"><label><strong>Hotel</strong><br><input id="hotel_name" name="hotel_name" required maxlength="160" autocomplete="off" value="${attr(prefilled?.name||"")}" ${prefilled?"readonly":""} placeholder="Start typing a hotel name" style="width:100%;padding:13px;margin-top:6px"></label><div id="hotel_suggestions" class="card" style="display:none;position:absolute;z-index:20;width:100%;padding:6px;max-height:260px;overflow:auto"></div></div>
  <p><label>City / destination<br><input id="city" name="city" maxlength="120" value="${attr(prefilled?.city||"")}" ${prefilled?"readonly":""} style="width:100%;padding:12px"></label></p>
  <div class="mini-grid">
    <p><label>Stay month<br><input name="stay_month" type="month" style="width:100%;padding:12px"></label></p>
    <p><label>Nights<br><input name="nights" type="number" min="1" max="90" step="1" style="width:100%;padding:12px"></label></p>
  </div>
  <div class="mini-grid">
    <p><label><strong>What you paid per night</strong><br><input name="paid_nightly_rate" type="number" min="0" max="100000" step="0.01" required style="width:100%;padding:12px"></label></p>
    <p><label><strong>What you'd happily pay again</strong><br><input name="would_pay_again" type="number" min="0" max="100000" step="0.01" required style="width:100%;padding:12px"></label></p>
  </div>
  <p class="muted">Use the same basis for both numbers. If your paid rate included taxes/fees, compare it with an all-in would-pay-again number.</p>
  <p><label>Rate basis<br><select name="rate_basis" style="width:100%;padding:12px"><option value="room_rate">Room rate before taxes/fees</option><option value="all_in">All-in nightly cost including taxes/fees</option></select></label></p>
  <div class="mini-grid">
    <p><label>Room type<br><input name="room_type" maxlength="160" placeholder="Deluxe King, Ocean View Suite…" style="width:100%;padding:12px"></label></p>
    <p><label>Booking channel<br><input name="booking_channel" maxlength="120" placeholder="Direct, Amex FHR, Chase, advisor…" style="width:100%;padding:12px"></label></p>
  </div>
  <p><label>Party type<br><select name="party_type" style="width:100%;padding:12px"><option value="">Choose one</option><option>Solo</option><option>Couple</option><option>Family</option><option>Friends</option><option>Business</option></select></label></p>
  <fieldset style="border:0;padding:0;margin:20px 0"><legend><strong>Would you return at the right price?</strong></legend><label style="margin-right:18px"><input type="radio" name="would_return" value="1" required> Yes</label><label><input type="radio" name="would_return" value="0"> No</label></fieldset>
  <fieldset style="border:0;padding:0;margin:20px 0"><legend><strong>Included / perks</strong></legend>
    <label class="pill"><input type="checkbox" name="inclusions" value="Breakfast"> Breakfast</label>
    <label class="pill"><input type="checkbox" name="inclusions" value="Property credit"> Property credit</label>
    <label class="pill"><input type="checkbox" name="inclusions" value="Upgrade"> Upgrade</label>
    <label class="pill"><input type="checkbox" name="inclusions" value="Airport transfer"> Airport transfer</label>
    <label class="pill"><input type="checkbox" name="inclusions" value="Parking"> Parking</label>
    <label class="pill"><input type="checkbox" name="inclusions" value="Half board / meals"> Half board / meals</label>
    <label class="pill"><input type="checkbox" name="inclusions" value="All-inclusive"> All-inclusive</label>
  </fieldset>
  <p><label>Other perks or inclusions<br><input name="other_perks" maxlength="500" placeholder="e.g. $200 spa credit, guaranteed 4pm checkout" style="width:100%;padding:12px"></label></p>
  <p><label>What should another traveler know?<br><textarea name="notes" maxlength="3000" rows="6" placeholder="What made it worth—or not worth—the rate?" style="width:100%;padding:12px"></textarea></label></p>
  <div class="notice"><strong>Optional stay verification</strong><p class="muted">Upload a receipt or folio to help us verify the paid rate. PDF/JPG/PNG/WebP, max 8 MB. Verification files are private and are never shown on hotel pages.</p><input name="verification_file" type="file" accept=".pdf,image/jpeg,image/png,image/webp"></div>
  <p><label>Email for moderation/follow-up<br><input name="contact_email" type="email" maxlength="254" style="width:100%;padding:12px"></label></p>
  <p><button class="btn" type="submit">Submit stay</button></p>
</form>
<script>(function(){
  var input=document.getElementById('hotel_name'),box=document.getElementById('hotel_suggestions'),hid=document.getElementById('hotel_id'),city=document.getElementById('city'),timer;if(input.readOnly)return;
  function hide(){box.style.display='none';box.innerHTML=''}
  input.addEventListener('input',function(){hid.value='';clearTimeout(timer);var q=input.value.trim();if(q.length<2){hide();return}timer=setTimeout(function(){fetch('/api/hotel-suggest?q='+encodeURIComponent(q)).then(r=>r.json()).then(d=>{var rows=d.hotels||[];if(!rows.length){hide();return}box.innerHTML=rows.map(h=>'<button type="button" data-id="'+h.id+'" data-name="'+h.name.replace(/"/g,'&quot;')+'" data-city="'+(h.city||'').replace(/"/g,'&quot;')+'" style="display:block;width:100%;text-align:left;border:0;background:#fff;padding:10px;cursor:pointer"><strong>'+h.name+'</strong><br><span class="kicker">'+[h.city,h.country].filter(Boolean).join(', ')+'</span></button>').join('');box.style.display='block';box.querySelectorAll('button').forEach(b=>b.onclick=function(){input.value=this.dataset.name;hid.value=this.dataset.id;if(!city.value)city.value=this.dataset.city;hide()})}).catch(hide)},180)});
  document.addEventListener('click',e=>{if(!box.contains(e.target)&&e.target!==input)hide()});
})();</script>`
    : `<section class="hero"><div class="eyebrow">Add Your Trip</div><h1>Turn a hotel stay into useful price intelligence.</h1><p>Creator submissions are temporarily closed.</p></section>`;
  return page(shell(body),env,{title:"Add Your Trip | SecretNests",canonical:"/add-your-trip"});
}

async function submitTrip(request,env){
  if(String(env.SUBMISSIONS_ENABLED||"false").toLowerCase()!=="true") return json({ok:false,error:"submissions_disabled"},503);
  if(!sameOrigin(request,ORIGIN)) return json({ok:false,error:"origin_rejected"},403);
  if(bodyTooLarge(request,9*1024*1024)) return json({ok:false,error:"payload_too_large"},413);
  const rl=await enforceRateLimit(request,env,"trip_submission",10,3600); if(!rl.ok)return json({ok:false,error:"rate_limited"},429);
  const form=await request.formData();
  if(form.get("website")) return Response.redirect(ORIGIN+"/add-your-trip?submitted=1",303);
  const clean=(name,max=3000)=>String(form.get(name)||"").trim().slice(0,max);
  const hotelName=clean("hotel_name",160);
  if(!hotelName) return json({ok:false,error:"hotel_name_required"},400);
  const num=(name)=>{const raw=clean(name,32);if(!raw)return null;const v=Number(raw);return Number.isFinite(v)&&v>=0&&v<=100000?v:null};
  const int=(name,min,max)=>{const raw=clean(name,16);if(!raw)return null;const v=Number(raw);return Number.isInteger(v)&&v>=min&&v<=max?v:null};
  const paid=num("paid_nightly_rate"), wouldPay=num("would_pay_again");
  if(paid==null||wouldPay==null)return json({ok:false,error:"paid_and_would_pay_required"},400);
  const email=clean("contact_email",254);
  if(email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ok:false,error:"invalid_email"},400);
  let hotelId=clean("hotel_id",100)||null;
  if(hotelId){
    const found=await env.DB.prepare("SELECT id FROM hotels WHERE id=? AND is_published=1").bind(hotelId).first();
    if(!found)hotelId=null;
  }
  if(!hotelId){
    const exact=await env.DB.prepare("SELECT id FROM hotels WHERE is_published=1 AND lower(name)=lower(?) ORDER BY CASE WHEN lower(COALESCE(city,''))=lower(?) THEN 0 ELSE 1 END LIMIT 1").bind(hotelName,clean("city",120)).first();
    hotelId=exact?.id||null;
  }
  const inclusions=form.getAll("inclusions").map(x=>String(x).trim()).filter(Boolean).slice(0,20);
  const other=clean("other_perks",500); if(other)inclusions.push(other);
  const wouldReturn=clean("would_return",2)==="1"?1:0;
  const id=crypto.randomUUID();
  const file=form.get("verification_file");
  let verificationStatus="unverified";
  if(file&&typeof file.arrayBuffer==="function"&&file.size>0){
    const allowed=new Set(["application/pdf","image/jpeg","image/png","image/webp"]);
    if(!allowed.has(file.type))return json({ok:false,error:"unsupported_verification_file"},415);
    if(file.size>8*1024*1024)return json({ok:false,error:"verification_file_too_large"},413);
    verificationStatus="pending";
  }
  const contributionSource=clean("contribution_source",80)||null;
  const contributionCampaign=clean("contribution_campaign",120)||null;
  const contributionReferrer=String(request.headers.get("referer")||"").slice(0,500)||null;
  await env.DB.prepare(`INSERT INTO trip_submissions
    (id,contact_email,hotel_name,city,stay_month,paid_nightly_rate,would_pay_again,room_type,booking_channel,notes,status,created_at,hotel_id,nights,party_type,would_return,perks_json,inclusions_json,rate_basis,verification_status,contribution_source,contribution_campaign,contribution_referrer)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,email||null,hotelName,clean("city",120)||null,clean("stay_month",20)||null,paid,wouldPay,clean("room_type",160)||null,clean("booking_channel",120)||null,clean("notes",3000)||null,"pending",nowIso(),hotelId,int("nights",1,90),clean("party_type",40)||null,wouldReturn,"[]",JSON.stringify(inclusions),clean("rate_basis",40)||"room_rate",verificationStatus,contributionSource,contributionCampaign,contributionReferrer).run();
  if(verificationStatus==="pending"){
    const artifactId=crypto.randomUUID(),key="submission-verification/"+id+"/"+artifactId;
    await env.MEDIA.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:file.type}});
    await env.DB.prepare("INSERT INTO submission_verification_artifacts (id,submission_id,r2_key,mime_type,file_size,status,redaction_status,created_at) VALUES (?,?,?,?,?,'pending','pending',?)")
      .bind(artifactId,id,key,file.type,file.size,nowIso()).run();
  }
  const matchedHotel=hotelId?await env.DB.prepare("SELECT id,name,slug FROM hotels WHERE id=?").bind(hotelId).first():null;
  const snapshot=hotelId?await env.DB.prepare("SELECT median_would_pay,sample_size FROM hotel_value_snapshots WHERE hotel_id=? ORDER BY calculated_at DESC LIMIT 1").bind(hotelId).first():null;
  const delta=wouldPay-paid,pct=paid>0?Math.round(delta/paid*100):null;
  const comparison=pct==null?"":pct===0?"the same as you paid":pct>0?`${pct}% more than you paid`:`${Math.abs(pct)}% less than you paid`;
  const hotelUrl=matchedHotel?"/hotel/"+encodeURIComponent(matchedHotel.slug):"/";
  const shareText=matchedHotel?`I paid ${money(paid)}/night at ${matchedHotel.name} and I’d happily pay ${money(wouldPay)} to stay again. See the hotel on SecretNests.`:"I just valued a hotel stay on SecretNests.";
  return page(shell(`<section class="hero" data-autoevent="contribution_submitted" data-hotel-id="${attr(hotelId||"")}"><div class="eyebrow">Trip received</div><h1>Your take is captured.</h1><p>Your submission is in moderation before it affects the public traveler-value range.${verificationStatus==="pending"?" Your verification file is stored privately for review.":""}</p></section>
  <div class="take-card"><div class="eyebrow">${matchedHotel?esc(matchedHotel.name):"Your stay"}</div><h2>Paid vs. worth</h2><div class="take-grid"><div><div class="kicker">You paid</div><strong>${money(paid)}</strong><span>per night</span></div><div><div class="kicker">You’d pay again</div><strong>${money(wouldPay)}</strong><span>${esc(comparison)}</span></div><div><div class="kicker">Current traveler median</div><strong>${snapshot?.sample_size?money(snapshot.median_would_pay):"Building"}</strong><span>${snapshot?.sample_size?`${snapshot.sample_size} published observation(s)`:"You are helping establish it"}</span></div></div>
  <div class="hero-actions"><a class="btn" href="${attr(hotelUrl)}">${matchedHotel?"Back to "+esc(matchedHotel.name):"Back to SecretNests"}</a><button class="btn secondary" id="share-take" type="button" data-event="contribution_share" data-hotel-id="${attr(hotelId||"")}">Share your take</button><button class="btn secondary" id="invite-stay" type="button" data-event="contribution_referral_share" data-hotel-id="${attr(hotelId||"")}">Invite someone who stayed</button></div></div>
  <script>(function(){var b=document.getElementById("share-take"),i=document.getElementById("invite-stay");if(b)b.addEventListener("click",async function(){var text=${JSON.stringify(shareText)},url=${JSON.stringify(ORIGIN)}+${JSON.stringify(matchedHotel?"/hotel/"+matchedHotel.slug:"/")};try{if(navigator.share){await navigator.share({title:"My SecretNests hotel take",text:text,url:url});return}await navigator.clipboard.writeText(text+" "+url);b.textContent="Copied";}catch{}});if(i)i.addEventListener("click",async function(){var url=${JSON.stringify(ORIGIN)}+${JSON.stringify(matchedHotel?"/add-your-trip?hotel="+encodeURIComponent(matchedHotel.slug)+"&src=referral&campaign=guest-referrals":"/contribute?src=referral&campaign=guest-referrals")},text="Have you stayed here? SecretNests is collecting what travelers actually paid and what they would pay again.";try{if(navigator.share){await navigator.share({title:"Add your hotel stay to SecretNests",text:text,url:url});return}await navigator.clipboard.writeText(text+" "+url);i.textContent="Invite copied";}catch{}})})();</script>`),env,{title:"Trip received | SecretNests",canonical:"/add-your-trip",robots:"noindex,follow"});
}

async function aboutPage(env){
  return page(shell(`<section class="hero"><div class="eyebrow">How it works</div><h1>A hotel can be excellent and still not be worth the rate.</h1><p>SecretNests separates quality from value. Travelers record actual paid prices and the price they would happily pay again; those observations can be aggregated into a traveler-assessed fair-value range.</p></section><div class="grid"><div class="card"><h3>1. Stay</h3><p>Log the hotel, date, room context, booking channel and what you paid.</p></div><div class="card"><h3>2. Value it</h3><p>Say what you would pay again and when the hotel becomes hard to justify.</p></div><div class="card"><h3>3. Publish taste</h3><p>Build lists and a public travel portfolio other travelers can follow.</p></div></div>`),env,{title:"How SecretNests works",canonical:"/about"});
}

async function hotelSuggest(request,env){
  const url=new URL(request.url),q=(url.searchParams.get("q")||"").trim().slice(0,120);
  if(q.length<2)return json({ok:true,hotels:[]});
  const rows=(await env.DB.prepare(`SELECT id,name,slug,city,country FROM hotels WHERE is_published=1
    AND (lower(name) LIKE lower(?) OR lower(COALESCE(city,'')) LIKE lower(?))
    ORDER BY CASE WHEN lower(name)=lower(?) THEN 0 WHEN lower(name) LIKE lower(?) THEN 1 ELSE 2 END,reddit_mention_count DESC,google_rating DESC LIMIT 10`)
    .bind("%"+q+"%","%"+q+"%",q,q+"%").all()).results||[];
  return json({ok:true,hotels:rows});
}

async function adminSubmissionsPage(request,env){
  const moderator=adminEmail(request,env);
  if(!moderator)return new Response("Not found",{status:404});
  if(request.method==="POST"){
    const form=await request.formData(),id=String(form.get("id")||""),action=String(form.get("action")||"");
    const payload={id,action,hotel_id:String(form.get("hotel_id")||""),note:String(form.get("note")||"").slice(0,1000),verify_receipt:form.get("verify_receipt")==="1"};
    const fake=new Request(request.url,{method:"POST",headers:{"content-type":"application/json","cf-access-authenticated-user-email":moderator},body:JSON.stringify(payload)});
    await adminSubmissions(fake,env);
    return Response.redirect(ORIGIN+"/admin/submissions",303);
  }
  const rows=(await env.DB.prepare(`SELECT ts.*,h.name matched_name,h.slug matched_slug,
    (SELECT COUNT(*) FROM submission_verification_artifacts sva WHERE sva.submission_id=ts.id AND sva.status='pending') verification_files,
    (SELECT id FROM submission_verification_artifacts sva WHERE sva.submission_id=ts.id AND sva.status='pending' ORDER BY created_at LIMIT 1) verification_artifact_id
    FROM trip_submissions ts LEFT JOIN hotels h ON h.id=ts.hotel_id
    WHERE ts.status IN ('pending','matched') ORDER BY ts.created_at LIMIT 100`).all()).results||[];
  const cards=[];
  for(const s of rows){
    let candidates=[];
    if(!s.hotel_id){
      candidates=(await env.DB.prepare(`SELECT id,name,city,country FROM hotels WHERE is_published=1 AND
        (lower(name) LIKE lower(?) OR (lower(COALESCE(city,''))=lower(?) AND lower(name) LIKE lower(?)))
        ORDER BY CASE WHEN lower(name)=lower(?) THEN 0 ELSE 1 END,reddit_mention_count DESC LIMIT 6`)
        .bind("%"+s.hotel_name+"%",s.city||"",String(s.hotel_name||"").split(" ").slice(0,2).join(" ")+"%",s.hotel_name).all()).results||[];
    }
    const inclusions=safeJson(s.inclusions_json,[]);
    const options=(s.hotel_id?[{id:s.hotel_id,name:s.matched_name,city:s.city,country:""}]:candidates).map(h=>`<option value="${attr(h.id)}">${esc(h.name)}${h.city?" — "+esc(h.city):""}</option>`).join("");
    cards.push(`<div class="card"><div class="eyebrow">${esc(s.created_at)} · ${esc(s.verification_status||"unverified")}</div><h2>${esc(s.hotel_name)}</h2><p class="muted">${esc(s.city||"")} · stayed ${esc(s.stay_month||"—")} · ${s.nights||"—"} nights</p>
      <div class="value"><div><div class="eyebrow">Paid</div><strong>${money(s.paid_nightly_rate)}</strong></div><div><div class="eyebrow">Would pay again</div><strong>${money(s.would_pay_again)}</strong></div><div><div class="eyebrow">Would return</div><strong>${s.would_return==null?"—":s.would_return?"Yes":"No"}</strong></div><div><div class="eyebrow">Verification</div><strong>${s.verification_files||0}</strong> file(s)</div></div>
      <p><strong>Room:</strong> ${esc(s.room_type||"—")} · <strong>Booked:</strong> ${esc(s.booking_channel||"—")} · <strong>Basis:</strong> ${esc(s.rate_basis||"—")}</p>
      ${s.verification_artifact_id?`<p><a class="btn secondary" target="_blank" rel="noopener" href="/admin/submission-verification/${encodeURIComponent(s.verification_artifact_id)}">View private receipt / folio</a> <label class="pill"><input type="checkbox" name="verify_receipt" value="1" form="mod-${attr(s.id)}"> Mark rate verified</label></p>`:""}
      <p><strong>Included:</strong> ${inclusions.length?inclusions.map(x=>`<span class="pill">${esc(x)}</span>`).join(""):"—"}</p>
      <p>${esc(s.notes||"")}</p>
      <form id="mod-${attr(s.id)}" method="post" action="/admin/submissions"><input type="hidden" name="id" value="${attr(s.id)}"><label>Match hotel<br><select name="hotel_id" required style="width:100%;padding:10px;margin:6px 0 10px"><option value="">Choose match</option>${options}</select></label><label>Moderator note<br><input name="note" style="width:100%;padding:10px"></label><div class="hero-actions"><button class="btn" name="action" value="approve">Approve + publish value observation</button><button class="btn secondary" name="action" value="reject">Reject</button></div></form>
    </div>`);
  }
  return page(shell(`<section class="hero" style="padding-bottom:24px"><div class="eyebrow">Moderation</div><h1>Trip submission queue</h1><p>Review hotel matching, rate context, return intent, perks, and verification state before publishing.</p></section><div class="grid">${cards.join("")||'<div class="notice">No pending submissions.</div>'}</div>`),env,{title:"Trip moderation | SecretNests",canonical:"/admin/submissions",robots:"noindex,nofollow"});
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
  const allowed=new Set(["page_view","hotel_view","creator_view","list_view","value_view","outbound_booking_click","search","contribution_seen","contribution_cta_click","contribution_started","contribution_submitted","contribution_share","contribution_landing_view","contribution_hotel_select","contribution_referral_share"]);
  if(!allowed.has(body.name))return json({ok:false,error:"invalid_event"},400);
  try{
    const id=crypto.randomUUID();
    const metadata=JSON.stringify({
      source:String(body.source||"").slice(0,80)||null,
      campaign:String(body.campaign||"").slice(0,120)||null
    });
    await env.DB.prepare("INSERT INTO analytics_events (id,event_name,hotel_id,creator_id,list_id,path,session_id,referrer,user_agent,created_at,metadata_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id,body.name,body.hotel_id||null,body.creator_id||null,body.list_id||null,body.path||null,body.session_id||null,request.headers.get("referer"),request.headers.get("user-agent"),nowIso(),metadata).run();
  }catch(e){console.error("analytics_event_failed",e?.message||e)}
  return json({ok:true});
}

const travelpayoutsConfig = (env) => ({
  token: String(env.TRAVELPAYOUTS_API_TOKEN||"").trim(),
  partnerId: String(env.TRAVELPAYOUTS_PARTNER_ID||env.TRAVELPAYOUTS_MARKER||"").trim(),
  projectId: String(env.TRAVELPAYOUTS_PROJECT_ID||"").trim()
});

const tpSubId = (clickId) => "sn_"+String(clickId||"").replace(/[^A-Za-z0-9_]/g,"_");

async function travelpayoutsPartnerUrl(targetUrl,subId,env){
  const cfg=travelpayoutsConfig(env);
  if(!cfg.token||!cfg.partnerId||!cfg.projectId)return {ok:false,error:"travelpayouts_not_configured"};
  const response=await fetch("https://api.travelpayouts.com/links/v1/create",{
    method:"POST",
    headers:{"content-type":"application/json","x-access-token":cfg.token},
    body:JSON.stringify({trs:Number(cfg.projectId),marker:Number(cfg.partnerId),shorten:false,links:[{url:targetUrl,sub_id:subId}]})
  });
  let data={}; try{data=await response.json()}catch{}
  const item=data?.result?.links?.[0];
  if(!response.ok||item?.code!=="success"||!item?.partner_url)return {ok:false,error:item?.message||data?.error||("http_"+response.status)};
  return {ok:true,url:item.partner_url};
}

async function travelpayoutsFields(env,campaignId){
  const cfg=travelpayoutsConfig(env);
  if(!cfg.token)return {ok:false,error:"travelpayouts_not_configured"};
  const u=new URL("https://api.travelpayouts.com/statistics/v1/get_fields_list");
  if(campaignId)u.searchParams.set("campaign_id",campaignId);
  const r=await fetch(u,{headers:{"x-access-token":cfg.token}});
  let data={};try{data=await r.json()}catch{}
  if(!r.ok)return {ok:false,error:"http_"+r.status,data};
  return {ok:true,fields:Array.isArray(data.fields)?data.fields:[]};
}

async function syncTravelpayoutsStats(env,campaignId,fromDate){
  const cfg=travelpayoutsConfig(env);
  if(!cfg.token)return {ok:false,error:"travelpayouts_not_configured"};
  const runId=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO affiliate_sync_runs (id,provider,sync_type,campaign_id,status,started_at) VALUES (?,'travelpayouts','bookings',?,'running',?)")
    .bind(runId,String(campaignId||""),nowIso()).run();
  try{
    const fieldsMeta=await travelpayoutsFields(env,campaignId);
    if(!fieldsMeta.ok)throw new Error(fieldsMeta.error);
    const available=new Set(fieldsMeta.fields.map(f=>f.name));
    const desired=["action_id","external_click_id","sub_id","price_usd","paid_profit_usd","state","date","updated_at","created_at","campaign_id"];
    const fields=desired.filter(x=>available.has(x));
    for(const required of ["action_id","sub_id","state","date"]) if(!fields.includes(required))throw new Error("missing_required_field_"+required);
    const filters=[
      {field:"type",op:"eq",value:"action"},
      {field:"campaign_id",op:"eq",value:Number(campaignId)},
      {field:"date",op:"ge",value:fromDate}
    ];
    const r=await fetch("https://api.travelpayouts.com/statistics/v1/execute_query",{
      method:"POST",
      headers:{"content-type":"application/json","x-access-token":cfg.token},
      body:JSON.stringify({fields,filters,sort:[{field:"date",order:"asc"}],offset:0,limit:10000})
    });
    let data={};try{data=await r.json()}catch{}
    if(!r.ok)throw new Error(data?.error||("http_"+r.status));
    const rows=Array.isArray(data.results)?data.results:[];
    let written=0;
    for(const row of rows){
      const sub=String(row.sub_id||"");
      const click= sub ? await env.DB.prepare("SELECT id,hotel_id,creator_id FROM affiliate_clicks WHERE provider='travelpayouts' AND partner_sub_id=? ORDER BY created_at DESC LIMIT 1").bind(sub).first() : null;
      const actionId=String(row.action_id||""); if(!actionId)continue;
      const state=String(row.state||"");
      const status=state==="paid"?"completed":state==="canceled"?"canceled":"confirmed";
      const bookingValue=row.price_usd==null?null:Number(row.price_usd);
      const commission=row.paid_profit_usd==null?null:Number(row.paid_profit_usd);
      await env.DB.prepare(`INSERT INTO booking_conversions
        (id,click_id,provider,partner_booking_id,hotel_id,creator_id,booking_value,commission_value,currency,status,booked_at,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(provider,partner_booking_id) DO UPDATE SET
          click_id=excluded.click_id,hotel_id=excluded.hotel_id,creator_id=excluded.creator_id,
          booking_value=excluded.booking_value,commission_value=excluded.commission_value,
          status=excluded.status,booked_at=excluded.booked_at`)
        .bind("tp-"+actionId,click?.id||null,"travelpayouts",actionId,click?.hotel_id||null,click?.creator_id||null,
          Number.isFinite(bookingValue)?bookingValue:null,Number.isFinite(commission)?commission:null,"USD",status,row.created_at||row.date||null,nowIso()).run();
      written++;
    }
    await env.DB.prepare("UPDATE affiliate_sync_runs SET status='success',rows_seen=?,rows_written=?,finished_at=? WHERE id=?")
      .bind(rows.length,written,nowIso(),runId).run();
    return {ok:true,rows_seen:rows.length,rows_written:written};
  }catch(e){
    await env.DB.prepare("UPDATE affiliate_sync_runs SET status='failed',note=?,finished_at=? WHERE id=?")
      .bind(safeLogError(e),nowIso(),runId).run();
    return {ok:false,error:safeLogError(e)};
  }
}

async function seedTravelpayoutsLinks(env,limit=200){
  const cfg=travelpayoutsConfig(env);
  if(!cfg.token||!cfg.partnerId||!cfg.projectId)return {ok:false,error:"travelpayouts_not_configured"};
  await env.DB.prepare("UPDATE affiliate_providers SET enabled=1,updated_at=? WHERE id='travelpayouts'").bind(nowIso()).run();
  const rows=(await env.DB.prepare(`SELECT h.id,h.name,h.city,h.country FROM hotels h
    WHERE h.is_published=1 AND NOT EXISTS (
      SELECT 1 FROM hotel_booking_links bl WHERE bl.hotel_id=h.id AND bl.provider_id='travelpayouts' AND bl.enabled=1
    ) ORDER BY h.reddit_mention_count DESC,h.google_rating DESC LIMIT ?`).bind(Math.min(Math.max(Number(limit)||200,1),500)).all()).results||[];
  let inserted=0;
  for(const h of rows){
    const ss=[h.name,h.city,h.country].filter(Boolean).join(" ");
    const raw="https://www.booking.com/searchresults.html?ss="+encodeURIComponent(ss);
    await env.DB.prepare("INSERT INTO hotel_booking_links (id,hotel_id,provider_id,destination_url,priority,enabled,metadata_json,created_at,updated_at) VALUES (?,?,?,?,20,1,?,?,?)")
      .bind(crypto.randomUUID(),h.id,"travelpayouts",raw,JSON.stringify({brand:"booking.com",generated_search:true}),nowIso(),nowIso()).run();
    inserted++;
  }
  const remaining=Number((await env.DB.prepare(`SELECT COUNT(*) n FROM hotels h WHERE h.is_published=1 AND NOT EXISTS (
    SELECT 1 FROM hotel_booking_links bl WHERE bl.hotel_id=h.id AND bl.provider_id='travelpayouts' AND bl.enabled=1)`).first())?.n||0);
  return {ok:true,inserted,remaining};
}

async function outbound(slug,request,env){
  const h=await env.DB.prepare("SELECT id,booking_url FROM hotels WHERE slug=? AND is_published=1").bind(slug).first();
  if(!h)return new Response("Hotel not found",{status:404});
  let link=await env.DB.prepare(`SELECT bl.destination_url,bl.provider_id,p.provider_type,p.config_json
    FROM hotel_booking_links bl JOIN affiliate_providers p ON p.id=bl.provider_id
    WHERE bl.hotel_id=? AND bl.enabled=1 AND p.enabled=1
    ORDER BY CASE WHEN bl.provider_id='travelpayouts' THEN 0 ELSE 1 END,bl.priority,bl.created_at LIMIT 1`).bind(h.id).first();
  if(!link && h.booking_url) link={destination_url:h.booking_url,provider_id:"direct",provider_type:"direct",config_json:"{}"};
  if(!link?.destination_url)return new Response("Booking link unavailable",{status:404});
  const clickId=crypto.randomUUID();
  let destination=String(link.destination_url).replaceAll("{subid}",encodeURIComponent(clickId));
  let partnerSubId=clickId;
  if(link.provider_id==="travelpayouts"){
    partnerSubId=tpSubId(clickId);
    const affiliate=await travelpayoutsPartnerUrl(destination,partnerSubId,env);
    if(affiliate.ok) destination=affiliate.url;
    else console.error(JSON.stringify({type:"travelpayouts_link_failed",hotel_id:h.id,error:affiliate.error}));
  }
  try{
    await env.DB.prepare("INSERT INTO affiliate_clicks (id,hotel_id,provider,destination_url,partner_sub_id,session_id,referrer,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(clickId,h.id,link.provider_id,destination,partnerSubId,null,request.headers.get("referer"),nowIso()).run();
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

async function brandsPage(env){
  const rows=(await env.DB.prepare(`SELECT brand_name,COUNT(*) hotel_count,COUNT(DISTINCT city) city_count,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM hotel_value_snapshots v WHERE v.hotel_id=h.id AND v.sample_size>0) THEN 1 ELSE 0 END) first_party_count
    FROM hotels h WHERE is_published=1 AND brand_name IS NOT NULL AND trim(brand_name)<>''
    GROUP BY brand_name HAVING COUNT(*)>=2 ORDER BY hotel_count DESC,brand_name LIMIT 200`).all()).results||[];
  return page(shell(`<section class="hero" style="padding-bottom:24px"><div class="eyebrow">Hotel brands</div><h1>Luxury hotel brands, compared by price and traveler value.</h1><p>Browse multi-property brands represented in SecretNests. Brand membership comes from trusted provider metadata; traveler fair-value data remains first-party and separate.</p></section>
  <div class="grid">${rows.map(x=>`<a class="card" href="/brands/${brandSlug(x.brand_name)}"><h3>${esc(x.brand_name)}</h3><p class="muted">${Number(x.hotel_count)} hotels · ${Number(x.city_count)} destinations · ${Number(x.first_party_count||0)} with first-party value data</p></a>`).join("")||'<div class="notice">Brand pages will appear as trusted hotel metadata expands.</div>'}</div>`),env,{title:"Luxury hotel brands: prices & value | SecretNests",description:"Browse luxury hotel brands and compare their SecretNests hotel coverage, price context and traveler value data.",canonical:"/brands"});
}

async function brandPage(slug,env){
  const brands=(await env.DB.prepare("SELECT DISTINCT brand_name FROM hotels WHERE is_published=1 AND brand_name IS NOT NULL AND trim(brand_name)<>''").all()).results||[];
  const match=brands.find(x=>brandSlug(x.brand_name)===slug);
  if(!match)return new Response("Brand not found",{status:404});
  const rows=(await env.DB.prepare(`SELECT h.name,h.slug,h.city,h.country,h.brand_name,h.description,h.price_estimate_min,h.price_estimate_max,h.google_rating,h.reddit_mention_count,
      v.median_would_pay,v.traveler_low,v.traveler_high,v.sample_size,v.confidence,v.value_classification
    FROM hotels h LEFT JOIN hotel_value_snapshots v ON v.id=(SELECT id FROM hotel_value_snapshots WHERE hotel_id=h.id ORDER BY calculated_at DESC LIMIT 1)
    WHERE h.is_published=1 AND h.brand_name=? ORDER BY CASE WHEN COALESCE(v.sample_size,0)>0 THEN 0 ELSE 1 END,COALESCE(v.sample_size,0) DESC,h.reddit_mention_count DESC,h.google_rating DESC,h.name`).bind(match.brand_name).all()).results||[];
  const destinationRefs=[...rows.reduce((m,x)=>{if(x.city&&x.country){const k=x.city+"|"+x.country;if(!m.has(k))m.set(k,{city:x.city,country:x.country})}return m},new Map()).values()];
  const cities=destinationRefs.map(x=>x.city+", "+x.country);
  const priced=rows.filter(x=>x.price_estimate_min!=null||x.price_estimate_max!=null);
  const avg=priced.length?Math.round(priced.reduce((n,x)=>n+Number(x.price_estimate_min??x.price_estimate_max??0),0)/priced.length):null;
  const firstParty=rows.filter(x=>Number(x.sample_size||0)>0).length;
  const top=rows.slice(0,5),pairs=[];
  for(let i=0;i<top.length&&pairs.length<8;i++)for(let j=i+1;j<top.length&&pairs.length<8;j++)pairs.push({a:top[i],b:top[j],path:"/compare/"+encodeURIComponent(top[i].slug)+"-vs-"+encodeURIComponent(top[j].slug)});
  const canonical="/brands/"+slug;
  const jsonLd={"@context":"https://schema.org","@type":"CollectionPage","name":match.brand_name+" hotels","url":ORIGIN+canonical,"mainEntity":{"@type":"ItemList","itemListElement":rows.map((x,i)=>({"@type":"ListItem","position":i+1,"url":ORIGIN+"/hotel/"+x.slug,"name":x.name}))}};
  return page(shell(`<section class="hero" style="padding-bottom:24px"><div class="eyebrow">Hotel brand guide</div><h1>${esc(match.brand_name)} hotels: prices, reviews & value</h1><p>Compare ${rows.length} ${esc(match.brand_name)} properties in SecretNests across ${cities.length} destinations. Provider-sourced brand metadata and external review signals are kept separate from first-party traveler value opinions.</p></section>
  <section class="proof"><div><strong>${rows.length}</strong><span class="muted">hotels</span></div><div><strong>${cities.length}</strong><span class="muted">destinations</span></div><div><strong>${firstParty}</strong><span class="muted">with first-party value data</span></div><div><strong>${avg!=null?money(avg):"—"}</strong><span class="muted">avg. estimated lower rate</span></div></section>
  <section class="section"><div class="section-head"><div><div class="eyebrow">Destinations</div><h2>Where ${esc(match.brand_name)} appears</h2></div></div><div class="seo-links">${destinationRefs.slice(0,20).map(x=>`<a class="pill" href="/destinations/${slugify(x.country)}/${slugify(x.city)}">${esc(x.city)}, ${esc(x.country)}</a>`).join("")}</div></section>
  <section class="section"><div class="section-head"><div><div class="eyebrow">Properties</div><h2>${esc(match.brand_name)} hotel pages</h2></div></div><div class="grid">${rows.map(h=>hotelCard(h)).join("")}</div></section>
  ${pairs.length?`<section class="section"><div class="section-head"><div><div class="eyebrow">Compare within the brand</div><h2>${esc(match.brand_name)} vs. ${esc(match.brand_name)}</h2></div></div><div class="grid">${pairs.map(p=>`<a class="card" href="${attr(p.path)}"><strong>${esc(p.a.name)} vs. ${esc(p.b.name)}</strong><p class="muted">${esc([p.a.city,p.a.country].filter(Boolean).join(", "))} vs. ${esc([p.b.city,p.b.country].filter(Boolean).join(", "))}</p></a>`).join("")}</div></section>`:""}`),env,{title:metaText(match.brand_name+" hotels: prices & value | SecretNests",66),description:metaText("Compare "+rows.length+" "+match.brand_name+" hotels by estimated prices, traveler value where available, and direct hotel matchups.",165),canonical,jsonLd});
}

async function compareLanding(env){
  const hotels=(await env.DB.prepare(`SELECT h.name,h.slug,h.city,h.country,p.priority_rank FROM hotel_enrichment_profiles p JOIN hotels h ON h.id=p.hotel_id WHERE h.is_published=1 AND p.cohort=\'priority_250\' ORDER BY p.priority_rank LIMIT 250`).all()).results||[];
  const pairs=buildComparisonPairs(hotels,{maxPairs:36,perGroup:4});
  const options=hotels.map(h=>`<option value="${attr(h.slug)}">${esc(h.name)}${h.city?" — "+esc(h.city):""}</option>`).join("");
  return page(shell(`<section class="hero"><div class="eyebrow">Compare hotels</div><h1>Two expensive hotels. Which rate makes more sense?</h1><p>Pick two hotels and compare estimated price context with traveler-assessed fair value where first-party observations exist.</p></section>
<form class="compare-form" id="compare-form"><select id="hotel-a" required><option value="">First hotel</option>${options}</select><span>vs.</span><select id="hotel-b" required><option value="">Second hotel</option>${options}</select><button class="btn" type="submit">Compare</button></form>
${pairs.length?`<section class="section"><div class="section-head"><div><div class="eyebrow">Popular matchups</div><h2>Hotel comparisons by destination</h2></div></div><div class="grid">${pairs.map(p=>`<a class="card" href="${attr(p.path)}"><div class="eyebrow">${esc([p.a.city,p.a.country].filter(Boolean).join(", "))}</div><h3>${esc(p.a.name)} vs. ${esc(p.b.name)}</h3><p>Compare estimated price, latest observed rates and traveler-assessed value where first-party stays exist.</p></a>`).join("")}</div></section>`:""}
<script>document.getElementById('compare-form').addEventListener('submit',function(e){e.preventDefault();var a=document.getElementById('hotel-a').value,b=document.getElementById('hotel-b').value;if(a&&b&&a!==b)location.href='/compare/'+encodeURIComponent(a)+'-vs-'+encodeURIComponent(b)});</script>`),env,{title:"Compare luxury hotels: prices & value | SecretNests",description:"Compare luxury hotels side by side by estimated prices, latest observed rates and traveler-assessed value where first-party stays exist.",canonical:"/compare"});
}

async function comparisonPage(pair,env){
  const positions=[]; let at=pair.indexOf("-vs-");
  while(at>=0){positions.push(at);at=pair.indexOf("-vs-",at+4)}
  let a=null,b=null;
  for(const pos of positions){
    const as=pair.slice(0,pos), bs=pair.slice(pos+4);
    const rows=(await env.DB.prepare(`SELECT h.*,v.median_would_pay,v.traveler_low,v.traveler_high,v.sample_size,v.confidence,
      (SELECT nightly_rate FROM hotel_rate_observations ro WHERE ro.hotel_id=h.id AND ro.provider_id<>'nuitee_sandbox' ORDER BY observed_at DESC LIMIT 1) current_observed_rate,
      (SELECT observed_at FROM hotel_rate_observations ro WHERE ro.hotel_id=h.id AND ro.provider_id<>'nuitee_sandbox' ORDER BY observed_at DESC LIMIT 1) rate_observed_at
      FROM hotels h LEFT JOIN hotel_value_snapshots v ON v.id=(SELECT id FROM hotel_value_snapshots WHERE hotel_id=h.id ORDER BY calculated_at DESC LIMIT 1)
      WHERE h.is_published=1 AND h.slug IN (?,?)`).bind(as,bs).all()).results||[];
    a=rows.find(x=>x.slug===as); b=rows.find(x=>x.slug===bs);
    if(a&&b)break;
  }
  if(!a||!b)return new Response("Comparison not found",{status:404});
  const card=x=>`<div class="card"><div class="eyebrow">${esc([x.city,x.country].filter(Boolean).join(", "))}</div><h2><a href="/hotel/${encodeURIComponent(x.slug)}">${esc(x.name)}</a></h2><table class="fact-table"><tbody>
    <tr><th>Brand</th><td>${x.brand_name?`<a href="/brands/${brandSlug(x.brand_name)}">${esc(x.brand_name)}</a>`:"Independent / not classified"}</td></tr>
    <tr><th>Estimated range</th><td><strong>${money(x.price_estimate_min)}–${money(x.price_estimate_max)}</strong></td></tr>
    <tr><th>Latest observed</th><td>${x.current_observed_rate?money(x.current_observed_rate)+" · "+esc(String(x.rate_observed_at||"").slice(0,10)):"—"}</td></tr>
    <tr><th>Traveler value</th><td>${x.median_would_pay?money(x.traveler_low)+"–"+money(x.traveler_high):"First-party sample pending"}</td></tr>
    <tr><th>Median would-pay</th><td>${x.median_would_pay?money(x.median_would_pay):"—"}</td></tr>
    <tr><th>First-party sample</th><td>${Number(x.sample_size||0)} stay${Number(x.sample_size||0)===1?"":"s"}</td></tr>
    <tr><th>External review signal</th><td>${x.external_review_summary&&!String(x.external_review_source||"").includes("sandbox")?esc(x.external_review_sentiment||"Available"):"—"}</td></tr>
    </tbody></table></div>`;
  const aRate=Number(a.current_observed_rate??a.price_estimate_min),bRate=Number(b.current_observed_rate??b.price_estimate_min);
  const rateContext=Number.isFinite(aRate)&&Number.isFinite(bRate)?(aRate===bRate?"Their latest/estimated nightly prices are currently similar.":aRate<bRate?`${a.name} is currently the lower-priced option in the observed/estimated data by about ${money(Math.abs(bRate-aRate))} per night.`:`${b.name} is currently the lower-priced option in the observed/estimated data by about ${money(Math.abs(aRate-bRate))} per night.`):"Current comparable price data is incomplete.";
  const cityLinks=[a,b].filter(x=>x.city&&x.country).map(x=>({label:"More luxury hotels in "+x.city,url:"/destinations/"+slugify(x.country)+"/"+slugify(x.city)}));
  const jsonLd={"@context":"https://schema.org","@type":"WebPage","name":a.name+" vs. "+b.name,"url":ORIGIN+"/compare/"+pair,"about":[{"@type":"Hotel","name":a.name,"url":ORIGIN+"/hotel/"+a.slug},{"@type":"Hotel","name":b.name,"url":ORIGIN+"/hotel/"+b.slug}]};
  return page(shell(`<section class="hero"><div class="eyebrow">Hotel comparison</div><h1>${esc(a.name)} vs. ${esc(b.name)}: price, reviews & value</h1><p>Side-by-side hotel data without declaring a universal winner. Use the price, first-party value sample, location and review evidence to decide which tradeoff fits your trip.</p></section>
  <div class="grid">${card(a)}${card(b)}</div>
  <section class="section"><h2>Price difference</h2><div class="notice"><p>${esc(rateContext)}</p><p class="kicker">Observed rates can refer to different future stay dates or room types. Check the date and room context before treating them as like-for-like.</p></div></section>
  <section class="section"><h2>Which one is worth more to travelers?</h2><p>${a.sample_size&&b.sample_size?`The current first-party medians are ${money(a.median_would_pay)} for ${esc(a.name)} and ${money(b.median_would_pay)} for ${esc(b.name)}. Sample sizes are ${a.sample_size} and ${b.sample_size}, respectively; these are traveler price opinions, not an overall winner.`:"At least one hotel does not yet have enough first-party stay data for a direct traveler-value comparison. SecretNests keeps that gap explicit rather than substituting provider reviews for first-party willingness-to-pay."}</p></section>
  <section class="section"><h2>Keep exploring</h2><div class="seo-links">${cityLinks.map(x=>`<a class="pill" href="${attr(x.url)}">${esc(x.label)}</a>`).join("")}<a class="pill" href="/hotel/${encodeURIComponent(a.slug)}">${esc(a.name)} review & prices</a><a class="pill" href="/hotel/${encodeURIComponent(b.slug)}">${esc(b.name)} review & prices</a></div></section>`),env,{title:metaText(`${a.name} vs. ${b.name}: price & value | SecretNests`,66),description:metaText(`Compare ${a.name} and ${b.name} by estimated price, observed rates, review signals and first-party traveler value where available.`,165),canonical:"/compare/"+pair,jsonLd});
}
async function valueHub(env){
  return page(shell(`<section class="hero"><div class="eyebrow">Value discovery</div><h1>Where is luxury actually worth the rate?</h1><p>Browse price-sensitive collections built from traveler value opinions where available, with clearly labeled estimated-price fallbacks.</p></section><div class="grid">
  <a class="card" href="/value/under-500"><h2>Worth up to $500</h2><p>Hotels with traveler-assessed willingness-to-pay at or below $500.</p></a>
  <a class="card" href="/value/around-1000"><h2>Around $1,000</h2><p>High-end stays travelers assess near the four-figure mark.</p></a>
  <a class="card" href="/value/regrets-over-800"><h2>Regrets over $800</h2><p>First-party stays where the traveler paid $800+ and would not return.</p></a>
  <a class="card" href="/value/where-500-buys-most"><h2>Where $500 buys the most</h2><p>Destinations with the deepest estimated luxury-hotel inventory near this budget.</p></a>
</div>`),env,{title:"Luxury hotel value discovery | SecretNests",canonical:"/value"});
}

async function valueCollection(kind,env){
  let title="",description="",rows=[];
  if(kind==="under-500"){
    title="Luxury hotels travelers value at $500 or less";
    description="Traveler-assessed willingness-to-pay, not rack-rate marketing.";
    rows=(await env.DB.prepare(`SELECT h.name,h.slug,h.city,h.country,v.median_would_pay,v.traveler_low,v.traveler_high,v.sample_size,v.confidence
      FROM hotels h JOIN hotel_value_snapshots v ON v.id=(SELECT id FROM hotel_value_snapshots WHERE hotel_id=h.id ORDER BY calculated_at DESC LIMIT 1)
      WHERE h.is_published=1 AND v.sample_size>0 AND v.median_would_pay<=500 ORDER BY v.sample_size DESC,v.median_would_pay DESC LIMIT 100`).all()).results||[];
  }else if(kind==="around-1000"){
    title="Luxury hotels travelers value around $1,000";
    description="Hotels with traveler-assessed median willingness-to-pay between $800 and $1,200.";
    rows=(await env.DB.prepare(`SELECT h.name,h.slug,h.city,h.country,v.median_would_pay,v.traveler_low,v.traveler_high,v.sample_size,v.confidence
      FROM hotels h JOIN hotel_value_snapshots v ON v.id=(SELECT id FROM hotel_value_snapshots WHERE hotel_id=h.id ORDER BY calculated_at DESC LIMIT 1)
      WHERE h.is_published=1 AND v.sample_size>0 AND v.median_would_pay BETWEEN 800 AND 1200 ORDER BY v.sample_size DESC,v.median_would_pay DESC LIMIT 100`).all()).results||[];
  }else if(kind==="regrets-over-800"){
    title="$800+ hotel stays travelers would not repeat";
    description="First-party stay observations where paid nightly rate was at least $800 and would-return was No.";
    rows=(await env.DB.prepare(`SELECT h.name,h.slug,h.city,h.country,s.paid_nightly_rate,vo.would_pay_again,COUNT(*) sample_size
      FROM stays s JOIN hotels h ON h.id=s.hotel_id JOIN trip_reports tr ON tr.stay_id=s.id LEFT JOIN value_opinions vo ON vo.stay_id=s.id
      WHERE h.is_published=1 AND s.paid_nightly_rate>=800 AND tr.would_return=0 AND COALESCE(s.verification_method,'')<>'demo'
      GROUP BY h.id ORDER BY s.paid_nightly_rate DESC LIMIT 100`).all()).results||[];
  }else if(kind==="where-500-buys-most"){
    title="Where roughly $500 buys the most luxury-hotel choice";
    description="Destination inventory based on SecretNests estimated price bands; this page is not a traveler fair-value claim.";
    const places=(await env.DB.prepare(`SELECT city,country,COUNT(*) sample_size,AVG(COALESCE(price_estimate_max,price_estimate_min)) median_would_pay
      FROM hotels WHERE is_published=1 AND city IS NOT NULL AND COALESCE(price_estimate_max,999999)<=600 GROUP BY city,country HAVING COUNT(*)>=2 ORDER BY sample_size DESC LIMIT 100`).all()).results||[];
    return page(shell(`<section class="hero"><div class="eyebrow">Value discovery</div><h1>${esc(title)}</h1><p>${esc(description)}</p></section><ul class="list">${places.map(x=>`<li><a href="/destinations/${slugify(x.country)}/${slugify(x.city)}"><strong>${esc(x.city)}, ${esc(x.country)}</strong></a> · ${x.sample_size} hotels in the estimated ≤$600 band</li>`).join("")||'<li class="muted">No qualifying destinations yet.</li>'}</ul>`),env,{title:title+" | SecretNests",canonical:"/value/"+kind});
  }else return new Response("Value collection not found",{status:404});
  return page(shell(`<section class="hero"><div class="eyebrow">Value discovery</div><h1>${esc(title)}</h1><p>${esc(description)}</p></section><ul class="list">${rows.map(x=>`<li><a href="/hotel/${encodeURIComponent(x.slug)}"><strong>${esc(x.name)}</strong></a> · ${esc([x.city,x.country].filter(Boolean).join(", "))}<br><span class="muted">${x.median_would_pay?("traveler median "+money(x.median_would_pay)+" · "):""}${x.paid_nightly_rate?("paid "+money(x.paid_nightly_rate)+" · "):""}${x.sample_size||0} observation(s)</span></li>`).join("")||'<li class="muted">Not enough first-party value data yet.</li>'}</ul>`),env,{title:title+" | SecretNests",canonical:"/value/"+kind});
}

async function countryValuePage(countrySlug,env){
  const countries=(await env.DB.prepare("SELECT DISTINCT country FROM hotels WHERE is_published=1 AND country IS NOT NULL").all()).results||[];
  const match=countries.find(x=>slugify(x.country)===countrySlug);
  if(!match)return new Response("Country not found",{status:404});
  const rows=(await env.DB.prepare(`SELECT h.name,h.slug,h.city,h.country,v.median_would_pay,v.sample_size,v.value_classification
    FROM hotels h LEFT JOIN hotel_value_snapshots v ON v.id=(SELECT id FROM hotel_value_snapshots WHERE hotel_id=h.id ORDER BY calculated_at DESC LIMIT 1)
    WHERE h.is_published=1 AND lower(h.country)=lower(?) ORDER BY COALESCE(v.sample_size,0) DESC,h.reddit_mention_count DESC,h.google_rating DESC LIMIT 150`).bind(match.country).all()).results||[];
  return page(shell(`<section class="hero"><div class="eyebrow">Country value guide</div><h1>Luxury hotel value in ${esc(match.country)}</h1><p>Traveler-assessed value where first-party data exists, with hotel discovery coverage beneath it.</p></section><ul class="list">${rows.map(x=>`<li><a href="/hotel/${encodeURIComponent(x.slug)}"><strong>${esc(x.name)}</strong></a> · ${esc(x.city||"")}<br><span class="muted">${x.median_would_pay?"traveler median "+money(x.median_would_pay)+" · "+esc(x.value_classification||""):"fair-value sample pending"}</span></li>`).join("")}</ul>`),env,{title:`Best-value luxury hotels in ${match.country} | SecretNests`,canonical:"/value/country/"+countrySlug});
}

async function legalPage(kind,env){
  const pages={
    privacy:{title:"Privacy",body:`<h1>Privacy</h1><p>SecretNests collects the information you submit, limited technical request data needed to operate the service, and pseudonymous product analytics. Contact email on a trip submission is used for follow-up and moderation and is not published with a stay.</p><p>Receipt or folio verification artifacts, when enabled, are stored separately with explicit redaction and review states. SecretNests does not intentionally store raw payment-card data.</p><p>Third-party analytics may include Google Analytics and Microsoft Clarity when configured. Booking links may send you to a third-party provider whose privacy practices apply after you leave SecretNests.</p>`},
    terms:{title:"Terms",body:`<h1>Terms</h1><p>Submit only hotel experiences, text, and media you have the right to share. You grant SecretNests a non-exclusive license to host, format, display, and analyze submitted material for operating and improving the service. You retain ownership of your original material.</p><p>Do not submit false stays, manipulated receipts, unlawful material, or content that infringes another person's rights. SecretNests may label, moderate, reject, or remove submissions to preserve data integrity.</p>`},
    disclosures:{title:"Disclosures",body:`<h1>Affiliate & review disclosures</h1><p>SecretNests may earn a commission when a traveler books through certain links. A creator may also receive a share of attributable booking revenue. Compensation is tied to attributable commercial outcomes, never to whether a hotel review is positive, negative, or favorable to a particular property.</p><p>When a review or recommendation has a material connection, incentive, free stay, discount, creator revenue share, or other relevant relationship, SecretNests policy requires a clear disclosure. Incentives must never be conditioned, expressly or implicitly, on a particular review sentiment.</p><p>Demo profiles and illustrative seed content are explicitly labeled and are not represented as genuine stays.</p>`}
  };
  const p=pages[kind]; if(!p)return new Response("Not found",{status:404});
  return page(shell(`<section class="hero"><div class="eyebrow">SecretNests policy</div>${p.body}</section>`),env,{title:p.title+" | SecretNests",canonical:"/"+kind});
}

async function adminSubmissions(request,env){
  const moderator=adminEmail(request,env);
  if(!moderator)return new Response("Not found",{status:404});
  if(request.method==="GET"){
    const rows=(await env.DB.prepare("SELECT id,contact_email,hotel_name,city,stay_month,paid_nightly_rate,would_pay_again,room_type,booking_channel,notes,status,created_at,hotel_id,nights,party_type,would_return,perks_json,inclusions_json,rate_basis,verification_status FROM trip_submissions WHERE status IN ('pending','matched') ORDER BY created_at LIMIT 200").all()).results||[];
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
  await env.DB.prepare(`INSERT INTO stays (id,creator_id,hotel_id,stay_month,nights,party_type,room_type,booking_channel,paid_nightly_rate,currency,verified,verification_method,created_at,updated_at,perks_json,inclusions_json,rate_basis)
    VALUES (?,?,?,?,?,?,?,?,?,'USD',0,'community_submission',?,?,?,?,?) ON CONFLICT(id) DO NOTHING`)
    .bind(stayId,creatorId,hotel.id,submission.stay_month,submission.nights,submission.party_type,submission.room_type,submission.booking_channel,submission.paid_nightly_rate,nowIso(),nowIso(),submission.perks_json||"[]",submission.inclusions_json||"[]",submission.rate_basis||null).run();
  if(submission.would_pay_again!=null){
    await env.DB.prepare(`INSERT INTO value_opinions (id,stay_id,creator_id,hotel_id,paid_nightly_rate,would_pay_again,currency,created_at)
      VALUES (?,?,?,?,?,?,'USD',?) ON CONFLICT(id) DO UPDATE SET would_pay_again=excluded.would_pay_again`)
      .bind("value-"+submission.id,stayId,creatorId,hotel.id,submission.paid_nightly_rate,submission.would_pay_again,nowIso()).run();
  }
  await env.DB.prepare("INSERT INTO trip_reports (id,stay_id,creator_id,hotel_id,title,review_text,verdict,would_return,standout_json,disappointments_json,status,published_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'[]','[]','published',?,?,?) ON CONFLICT(stay_id) DO NOTHING")
    .bind("report-"+submission.id,stayId,creatorId,hotel.id,submission.hotel_name,submission.notes||null,"community_submission",submission.would_return,nowIso(),nowIso(),nowIso()).run();
  if(body.verify_receipt){
    await env.DB.prepare("UPDATE submission_verification_artifacts SET status='verified',redaction_status='not_required',reviewer_note=?,reviewed_at=? WHERE submission_id=? AND status='pending'")
      .bind("Rate verified by "+moderator,nowIso(),submission.id).run();
    await env.DB.prepare("UPDATE trip_submissions SET verification_status='verified' WHERE id=?").bind(submission.id).run();
  }
  const verifiedArtifact=await env.DB.prepare("SELECT id FROM submission_verification_artifacts WHERE submission_id=? AND status='verified' LIMIT 1").bind(submission.id).first();
  if(verifiedArtifact)await env.DB.prepare("UPDATE stays SET verified=1,verification_method='receipt_or_folio',updated_at=? WHERE id=?").bind(nowIso(),stayId).run();
  await env.DB.prepare("UPDATE trip_submissions SET status='approved',hotel_id=?,reviewed_at=? WHERE id=?").bind(hotel.id,nowIso(),submission.id).run();
  await env.DB.prepare("INSERT INTO submission_moderation (id,submission_id,action,hotel_id,moderator_email,note,created_at) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(),submission.id,"approve",hotel.id,moderator,String(body.note||"").slice(0,1000),nowIso()).run();
  const valuation=await recomputeHotelValuation(env.DB,hotel.id);
  return json({ok:true,status:"approved",stay_id:stayId,valuation});
}

async function submissionVerificationFile(id,request,env){
  const moderator=adminEmail(request,env);
  if(!moderator)return new Response("Not found",{status:404});
  const row=await env.DB.prepare("SELECT id,r2_key,mime_type FROM submission_verification_artifacts WHERE id=?").bind(id).first();
  if(!row)return new Response("Not found",{status:404});
  const obj=await env.MEDIA.get(row.r2_key);
  if(!obj)return new Response("Not found",{status:404});
  const h=new Headers({"content-type":row.mime_type||obj.httpMetadata?.contentType||"application/octet-stream","cache-control":"private,no-store","content-disposition":"inline","x-content-type-options":"nosniff"});
  return new Response(obj.body,{headers:h});
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
  await env.DB.prepare(`INSERT INTO stay_verification_artifacts (id,stay_id,r2_key,source_type,status,redaction_status,reviewer_note,created_at)
    VALUES (?,?,?,'receipt_or_folio','pending','pending',?,?)`).bind(id,stayId,key,"Uploaded by "+moderator,nowIso()).run();
  return json({ok:true,id,status:"pending",redaction_status:"pending"});
}


async function verificationReview(request,env){
  const moderator=adminEmail(request,env);
  if(!moderator)return new Response("Not found",{status:404});
  if(bodyTooLarge(request,16384))return json({ok:false,error:"payload_too_large"},413);
  let body={};try{body=await request.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  const allowedStatus=new Set(["pending","verified","rejected"]);
  const allowedRedaction=new Set(["pending","redacted","not_required","rejected"]);
  if(!body.id||!allowedStatus.has(body.status)||!allowedRedaction.has(body.redaction_status))return json({ok:false,error:"invalid_state"},400);
  const row=await env.DB.prepare("SELECT id,stay_id FROM stay_verification_artifacts WHERE id=?").bind(body.id).first();
  if(!row)return json({ok:false,error:"not_found"},404);
  await env.DB.prepare("UPDATE stay_verification_artifacts SET status=?,redaction_status=?,reviewer_note=?,reviewed_at=? WHERE id=?")
    .bind(body.status,body.redaction_status,String(body.note||"").slice(0,1000),nowIso(),body.id).run();
  if(body.status==="verified"&&body.redaction_status!=="pending"&&body.redaction_status!=="rejected"){
    await env.DB.prepare("UPDATE stays SET verified=1,verification_method='receipt_or_folio',updated_at=? WHERE id=?").bind(nowIso(),row.stay_id).run();
  }
  return json({ok:true});
}

async function adminMedia(request,env){
  const moderator=adminEmail(request,env);
  if(!moderator)return new Response("Not found",{status:404});
  if(request.method==="GET"){
    const rows=(await env.DB.prepare("SELECT * FROM media_ingest_requests WHERE status='pending' ORDER BY created_at LIMIT 200").all()).results||[];
    return json({ok:true,requests:rows});
  }
  if(bodyTooLarge(request,32768))return json({ok:false,error:"payload_too_large"},413);
  let body={};try{body=await request.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  const req=await env.DB.prepare("SELECT * FROM media_ingest_requests WHERE id=?").bind(body.id).first();
  if(!req)return json({ok:false,error:"not_found"},404);
  if(body.action==="reject"){
    await env.DB.prepare("UPDATE media_ingest_requests SET status='rejected',reviewed_at=? WHERE id=?").bind(nowIso(),req.id).run();
    return json({ok:true,status:"rejected"});
  }
  const allowed=new Set(["owned_user_upload","hotel_authorized","licensed_api","licensed_public","remote_display_only","blocked"]);
  if(body.action!=="approve"||!allowed.has(body.rights_status))return json({ok:false,error:"invalid_action"},400);
  const assetId=crypto.randomUUID();
  if(body.rights_status!=="blocked"){
    await env.DB.prepare(`INSERT INTO media_assets
      (id,hotel_id,creator_id,source_type,source_url,source_provider,license_code,license_url,attribution_text,rights_status,permission_reference,original_url,r2_key,width,height,mime_type,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(assetId,req.hotel_id,req.creator_id,req.source_type,req.source_url,req.source_provider,
        body.license_code||null,body.license_url||null,body.attribution_text||req.attribution_text||null,
        body.rights_status,body.permission_reference||req.permission_reference||null,req.source_url||null,
        body.r2_key||null,body.width||null,body.height||null,body.mime_type||null,nowIso()).run();
    await env.DB.prepare("INSERT INTO media_rights_reviews (id,media_asset_id,previous_status,new_status,reviewer_email,note,created_at) VALUES (?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(),assetId,"needs_review",body.rights_status,moderator,String(body.note||"").slice(0,1000),nowIso()).run();
  }
  await env.DB.prepare("UPDATE media_ingest_requests SET status='approved',reviewed_at=? WHERE id=?").bind(nowIso(),req.id).run();
  return json({ok:true,status:"approved",media_asset_id:body.rights_status==="blocked"?null:assetId});
}

async function createMediaIngest(request,env){
  const moderator=adminEmail(request,env);
  if(!moderator)return new Response("Not found",{status:404});
  if(bodyTooLarge(request,32768))return json({ok:false,error:"payload_too_large"},413);
  let body={};try{body=await request.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  if(!body.source_type||(!body.source_url&&!body.hotel_id))return json({ok:false,error:"source_required"},400);
  const id=crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO media_ingest_requests
    (id,hotel_id,creator_id,source_type,source_url,source_provider,proposed_rights_status,permission_reference,attribution_text,status,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,'pending',?)`)
    .bind(id,body.hotel_id||null,body.creator_id||null,String(body.source_type).slice(0,80),body.source_url||null,
      body.source_provider||null,body.proposed_rights_status||"needs_review",body.permission_reference||null,
      body.attribution_text||null,nowIso()).run();
  return json({ok:true,id,status:"pending"});
}

async function adminTravelpayoutsPage(request,env){
  const moderator=adminEmail(request,env);
  if(!moderator)return new Response("Not found",{status:404});
  const cfg=travelpayoutsConfig(env);
  let message="";
  if(request.method==="POST"){
    const form=await request.formData(),action=String(form.get("action")||"");
    if(action==="seed_links"){
      const out=await seedTravelpayoutsLinks(env,Number(form.get("limit")||200));
      message=out.ok?`Created ${out.inserted} hotel booking links; ${out.remaining} remain.`:`Travelpayouts setup error: ${out.error}`;
    }else if(action==="test_link"){
      const out=await travelpayoutsPartnerUrl("https://www.booking.com/searchresults.html?ss=Paris",tpSubId(crypto.randomUUID()),env);
      message=out.ok?"Travelpayouts partner-link API is working.":"Partner-link test failed: "+out.error;
    }else if(action==="sync_stats"){
      const campaign=String(form.get("campaign_id")||"").trim();
      const days=Math.min(Math.max(Number(form.get("days")||30),1),365);
      const from=new Date(Date.now()-days*86400000).toISOString().slice(0,10);
      const out=campaign?await syncTravelpayoutsStats(env,campaign,from):{ok:false,error:"campaign_id_required"};
      message=out.ok?`Synced ${out.rows_written} of ${out.rows_seen} booking rows.`:`Statistics sync failed: ${out.error}`;
    }
  }
  const linked=Number((await env.DB.prepare("SELECT COUNT(DISTINCT hotel_id) n FROM hotel_booking_links WHERE provider_id='travelpayouts' AND enabled=1").first())?.n||0);
  const clicks=Number((await env.DB.prepare("SELECT COUNT(*) n FROM affiliate_clicks WHERE provider='travelpayouts'").first())?.n||0);
  const conversions=Number((await env.DB.prepare("SELECT COUNT(*) n FROM booking_conversions WHERE provider='travelpayouts'").first())?.n||0);
  const revenue=Number((await env.DB.prepare("SELECT COALESCE(SUM(commission_value),0) n FROM booking_conversions WHERE provider='travelpayouts' AND status='completed'").first())?.n||0);
  const runs=(await env.DB.prepare("SELECT campaign_id,status,rows_seen,rows_written,note,started_at,finished_at FROM affiliate_sync_runs WHERE provider='travelpayouts' ORDER BY started_at DESC LIMIT 20").all()).results||[];
  const configured={token:Boolean(cfg.token),partner_id:Boolean(cfg.partnerId),project_id:Boolean(cfg.projectId)};
  return page(shell(`<section class="hero" style="padding-bottom:22px"><div class="eyebrow">Monetization</div><h1>Travelpayouts</h1><p>Server-side partner links, click-level SubID attribution, and booking/revenue reconciliation into SecretNests.</p></section>
  ${message?`<div class="notice"><strong>${esc(message)}</strong></div>`:""}
  <div class="proof"><div><strong>${linked}</strong><span class="muted">hotels with TP links</span></div><div><strong>${clicks}</strong><span class="muted">tracked clicks</span></div><div><strong>${conversions}</strong><span class="muted">booking actions</span></div><div><strong>${money(revenue)}</strong><span class="muted">completed commission</span></div></div>
  <section class="section"><div class="grid">
    <div class="card"><h2>Configuration</h2><ul class="list"><li>API token: <strong>${configured.token?"configured":"missing"}</strong></li><li>Partner ID: <strong>${configured.partner_id?"configured":"missing"}</strong></li><li>Project ID: <strong>${configured.project_id?"configured":"missing"}</strong></li></ul><form method="post"><button class="btn" name="action" value="test_link">Test partner-link API</button></form></div>
    <form class="card" method="post"><h2>Seed hotel booking links</h2><p>Creates Booking.com hotel-search destinations for hotels that do not yet have a Travelpayouts link. The affiliate link itself is generated only when the traveler clicks.</p><label>Batch size<br><input name="limit" type="number" min="1" max="500" value="200" style="width:100%;padding:10px"></label><p><button class="btn" name="action" value="seed_links">Create next batch</button></p></form>
    <form class="card" method="post"><h2>Sync booking statistics</h2><p>Enter the numeric Travelpayouts campaign/program ID from the program URL.</p><label>Campaign ID<br><input name="campaign_id" required style="width:100%;padding:10px"></label><label>Lookback days<br><input name="days" type="number" min="1" max="365" value="30" style="width:100%;padding:10px"></label><p><button class="btn" name="action" value="sync_stats">Sync bookings</button></p></form>
  </div></section>
  <section><h2>Recent sync runs</h2><ul class="list">${runs.map(r=>`<li><strong>${esc(r.status)}</strong> · campaign ${esc(r.campaign_id||"—")} · ${r.rows_written}/${r.rows_seen} written · ${esc(r.started_at||"")}${r.note?" · "+esc(r.note):""}</li>`).join("")||'<li class="muted">No statistics syncs yet.</li>'}</ul></section>`),env,{title:"Travelpayouts | SecretNests",canonical:"/admin/travelpayouts",robots:"noindex,nofollow"});
}

async function adminRatesPage(request,env){
  const moderator=adminEmail(request,env);
  if(!moderator)return new Response("Not found",{status:404});
  let message="";
  if(request.method==="POST"){
    const form=await request.formData();
    const raw=String(form.get("payload")||"").trim();
    try{
      const parsed=JSON.parse(raw);
      const fake=new Request(request.url,{method:"POST",headers:{"content-type":"application/json","cf-access-authenticated-user-email":moderator},body:JSON.stringify(Array.isArray(parsed)?{rates:parsed}:parsed)});
      const result=await ingestRates(fake,env); const data=await result.json();
      message=data.ok?`Imported ${data.inserted} rate observation(s).`:`Import failed: ${data.error||"unknown"}`;
    }catch(e){message="Import failed: invalid JSON."}
  }
  const recent=(await env.DB.prepare(`SELECT ro.*,h.name hotel_name,p.name provider_name FROM hotel_rate_observations ro
    JOIN hotels h ON h.id=ro.hotel_id LEFT JOIN affiliate_providers p ON p.id=ro.provider_id
    ORDER BY ro.observed_at DESC LIMIT 100`).all()).results||[];
  const providers=(await env.DB.prepare("SELECT id,name,enabled FROM affiliate_providers ORDER BY name").all()).results||[];
  const example=JSON.stringify([{hotel_id:"HOTEL_ID",provider_id:"direct",nightly_rate:725,currency:"USD",checkin_date:"2026-10-15",checkout_date:"2026-10-17",room_type:"King",taxes_fees_included:false,booking_url:"https://hotel.example/booking"}],null,2);
  return page(shell(`<section class="hero" style="padding-bottom:20px"><div class="eyebrow">Revenue / rates</div><h1>Current-rate ingestion</h1><p>Import observed bookable rates and booking URLs. The latest observation flows onto hotel and comparison pages while preserving the historical estimated range.</p></section>
  ${message?`<div class="notice"><strong>${esc(message)}</strong></div>`:""}
  <div class="two"><form class="card" method="post" action="/admin/rates"><h2>Import JSON</h2><p class="muted">Use hotel IDs from D1/API. Provider IDs currently available: ${providers.map(p=>esc(p.id)).join(", ")}.</p><textarea name="payload" rows="16" style="width:100%;padding:12px;font-family:monospace">${esc(example)}</textarea><p><button class="btn">Import rates</button></p></form>
  <div class="card"><h2>Provider layer</h2><ul class="list">${providers.map(p=>`<li><strong>${esc(p.name)}</strong> · ${esc(p.id)} · ${p.enabled?"enabled":"disabled"}</li>`).join("")}</ul><p class="muted">This endpoint is also ready for automated provider jobs at <code>POST /api/admin/rates</code>.</p></div></div>
  <section class="section"><h2>Recent observations</h2><ul class="list">${recent.map(r=>`<li><strong>${esc(r.hotel_name)}</strong> · ${money(r.nightly_rate)} · ${esc(r.provider_name||r.provider_id||"provider")} · ${esc(String(r.observed_at||"").slice(0,16))}</li>`).join("")||'<li class="muted">No current-rate observations yet.</li>'}</ul></section>`),env,{title:"Current rates | SecretNests",canonical:"/admin/rates",robots:"noindex,nofollow"});
}

async function ingestRates(request,env){
  const moderator=adminEmail(request,env);
  if(!moderator)return new Response("Not found",{status:404});
  if(bodyTooLarge(request,512*1024))return json({ok:false,error:"payload_too_large"},413);
  let body={};try{body=await request.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  const rows=Array.isArray(body.rates)?body.rates:[body];
  let inserted=0;
  for(const r of rows.slice(0,500)){
    const rate=Number(r.nightly_rate); if(!r.hotel_id||!Number.isFinite(rate)||rate<=0)continue;
    const hotel=await env.DB.prepare("SELECT id FROM hotels WHERE id=?").bind(r.hotel_id).first();if(!hotel)continue;
    await env.DB.prepare(`INSERT INTO hotel_rate_observations (id,hotel_id,provider_id,nightly_rate,currency,checkin_date,checkout_date,room_type,rate_name,taxes_fees_included,booking_url,metadata_json,observed_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),r.hotel_id,r.provider_id||null,rate,r.currency||"USD",r.checkin_date||null,r.checkout_date||null,r.room_type||null,r.rate_name||null,r.taxes_fees_included==null?null:r.taxes_fees_included?1:0,r.booking_url||null,JSON.stringify(r.metadata||{}),r.observed_at||nowIso()).run();
    if(r.booking_url&&r.provider_id){
      await env.DB.prepare("INSERT INTO hotel_booking_links (id,hotel_id,provider_id,destination_url,priority,enabled,metadata_json,created_at,updated_at) VALUES (?,?,?,?,50,1,'{}',?,?) ON CONFLICT(hotel_id,provider_id,destination_url) DO UPDATE SET enabled=1,updated_at=excluded.updated_at")
        .bind(crypto.randomUUID(),r.hotel_id,r.provider_id,r.booking_url,nowIso(),nowIso()).run();
    }
    const snapshot=await env.DB.prepare("SELECT id FROM hotel_value_snapshots WHERE hotel_id=? ORDER BY calculated_at DESC LIMIT 1").bind(r.hotel_id).first();
    if(snapshot)await env.DB.prepare("UPDATE hotel_value_snapshots SET current_price=?,calculated_at=? WHERE id=?").bind(rate,nowIso(),snapshot.id).run();
    inserted++;
  }
  return json({ok:true,inserted});
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

async function adminEnrichmentNext(request,env){
  const moderator=adminEmail(request,env);
  if(!moderator)return new Response("Not found",{status:404});
  const url=new URL(request.url);
  const task=(url.searchParams.get("task")||"").trim();
  const limit=Math.min(Math.max(Number(url.searchParams.get("limit")||20),1),100);
  let rows;
  if(task){
    rows=(await env.DB.prepare(`SELECT q.id queue_id,q.task_type,q.priority,q.source_hint,q.attempts,h.*
      FROM hotel_enrichment_queue q JOIN hotels h ON h.id=q.hotel_id
      WHERE q.status='queued' AND q.task_type=? ORDER BY q.priority,q.updated_at LIMIT ?`).bind(task,limit).all()).results||[];
  }else{
    rows=(await env.DB.prepare(`SELECT q.id queue_id,q.task_type,q.priority,q.source_hint,q.attempts,h.*
      FROM hotel_enrichment_queue q JOIN hotels h ON h.id=q.hotel_id
      WHERE q.status='queued' ORDER BY q.priority,q.updated_at LIMIT ?`).bind(limit).all()).results||[];
  }
  return json({ok:true,tasks:rows});
}

async function adminEnrichmentApply(request,env){
  const moderator=adminEmail(request,env);
  if(!moderator)return new Response("Not found",{status:404});
  if(bodyTooLarge(request,256*1024))return json({ok:false,error:"payload_too_large"},413);
  let body={};try{body=await request.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  const q=await env.DB.prepare("SELECT * FROM hotel_enrichment_queue WHERE id=?").bind(body.queue_id||"").first();
  if(!q)return json({ok:false,error:"queue_item_not_found"},404);
  if(body.status==="failed"){
    await env.DB.prepare("UPDATE hotel_enrichment_queue SET status='failed',attempts=attempts+1,last_error=?,updated_at=? WHERE id=?")
      .bind(String(body.error||"unknown").slice(0,1000),nowIso(),q.id).run();
    return json({ok:true,status:"failed"});
  }
  const fields=body.fields&&typeof body.fields==="object"?body.fields:{};
  const allowed=new Set(["city","region","country","lat","lng","address","formatted_address","website","phone","hotel_category","description","highlights_json","best_for_json","not_ideal_for_json","price_estimate_min","price_estimate_max","booking_url"]);
  const updates=[],values=[];
  for(const [key,value] of Object.entries(fields)){
    if(!allowed.has(key))continue;
    updates.push(key+"=?");
    values.push(["highlights_json","best_for_json","not_ideal_for_json"].includes(key)&&Array.isArray(value)?JSON.stringify(value):value);
  }
  if(updates.length){
    values.push(nowIso(),q.hotel_id);
    await env.DB.prepare("UPDATE hotels SET "+updates.join(",")+",updated_at=? WHERE id=?").bind(...values).run();
  }
  const source=body.source&&typeof body.source==="object"?body.source:{};
  for(const key of Object.keys(fields)){
    if(!allowed.has(key))continue;
    await env.DB.prepare(`INSERT INTO hotel_field_provenance
      (id,hotel_id,field_name,source_type,source_url,source_label,confidence,observed_at,verified_at,metadata_json,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(hotel_id,field_name,source_type,source_url) DO UPDATE SET
        source_label=excluded.source_label,confidence=excluded.confidence,observed_at=excluded.observed_at,
        verified_at=excluded.verified_at,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at`)
      .bind(crypto.randomUUID(),q.hotel_id,key,String(source.type||"unknown").slice(0,80),source.url||null,source.label||null,
        source.confidence||null,source.observed_at||nowIso(),body.verified?nowIso():null,JSON.stringify(source.metadata||{}),nowIso(),nowIso()).run();
  }
  await env.DB.prepare("UPDATE hotel_enrichment_queue SET status='complete',attempts=attempts+1,last_error=NULL,locked_at=NULL,updated_at=? WHERE id=?").bind(nowIso(),q.id).run();
  return json({ok:true,status:"complete",hotel_id:q.hotel_id,fields_updated:updates.length});
}

async function adminDrainEnrichment(request,env){
  const moderator=adminEmail(request,env);
  if(!moderator)return new Response("Not found",{status:404});
  const out=await drainOfficialHotelQueue(env,{limit:Math.min(Math.max(Number(new URL(request.url).searchParams.get("limit")||8),1),20)});
  return json(out);
}

async function adminDrainRates(request,env){
  const moderator=adminEmail(request,env);
  if(!moderator)return new Response("Not found",{status:404});
  const out=await drainCurrentRateQueue(env,{limit:Math.min(Math.max(Number(new URL(request.url).searchParams.get("limit")||6),1),20)});
  return json(out);
}

async function adminDrainEvidence(request,env){
  const moderator=adminEmail(request,env);
  if(!moderator)return new Response("Not found",{status:404});
  const out=await drainExternalEvidenceQueue(env,{limit:Math.min(Math.max(Number(new URL(request.url).searchParams.get("limit")||2),1),5)});
  return json(out);
}

async function adminDrainNuitee(request,env){
  const moderator=adminEmail(request,env);
  if(!moderator)return new Response("Not found",{status:404});
  const u=new URL(request.url);
  const out=await runNuiteeTop250Enrichment(env,{
    mapLimit:Math.min(Math.max(Number(u.searchParams.get("map")||12),1),40),
    reviewLimit:Math.min(Math.max(Number(u.searchParams.get("reviews")||6),1),20),
    rateLimit:Math.min(Math.max(Number(u.searchParams.get("rates")||100),1),200)
  });
  return json(out);
}

async function adminNuiteePage(request,env){
  const moderator=adminEmail(request,env);
  if(!moderator)return new Response("Not found",{status:404});
  let message="";
  if(request.method==="POST"){
    const form=await request.formData(),action=String(form.get("action")||"");
    if(action==="run"){
      const out=await runNuiteeTop250Enrichment(env,{mapLimit:12,reviewLimit:6,rateLimit:100});
      message="Nuitee batch: "+Number(out.mapping?.mapped||0)+" mapped, "+Number(out.mapping?.metadata||0)+" metadata, "+Number(out.reviews?.written||0)+" reviews, "+Number(out.rates?.observations||0)+" sandbox rate observations.";
    }else if(action==="approve"){
      const hotelId=String(form.get("hotel_id")||"");
      const out=hotelId?await approveNuiteeAuditHotel(env.DB,hotelId):{ok:false};
      message=out.ok?"Nuitee mapping approved.":"Mapping could not be approved.";
    }else if(action==="reset"){
      const hotelId=String(form.get("hotel_id")||"");
      if(hotelId)await resetNuiteeAuditHotel(env.DB,hotelId);
      message="Nuitee audit reset.";
    }
  }
  const body=await nuiteeAdminBody(env.DB);
  return page(shell((message?'<div class="notice"><strong>'+esc(message)+'</strong></div>':"")+body),env,{title:"Nuitee audit | SecretNests",canonical:"/admin/nuitee",robots:"noindex,nofollow"});
}

async function adminEnrichmentPage(request,env){
  const moderator=adminEmail(request,env);
  if(!moderator)return new Response("Not found",{status:404});
  let message="";
  if(request.method==="POST"){
    const form=await request.formData(),action=String(form.get("action")||"");
    if(action==="refresh"){
      const out=await refreshHotelEnrichment(env.DB);
      message=`Rebuilt priority ranking for ${out.hotels_scored} hotels. Top 250 average completeness: ${out.avg_completeness}%. ${out.queue_items} open enrichment tasks.`;
    }else if(action==="reset_task"){
      const id=String(form.get("id")||"");
      if(id)await env.DB.prepare("UPDATE hotel_enrichment_queue SET status='queued',attempts=0,last_error=NULL,locked_at=NULL,updated_at=? WHERE id=?").bind(nowIso(),id).run();
      message="Task returned to queue.";
    }
  }

  const summary=await env.DB.prepare(`SELECT
    COUNT(*) total,
    SUM(CASE WHEN cohort='priority_250' THEN 1 ELSE 0 END) priority_count,
    ROUND(AVG(CASE WHEN cohort='priority_250' THEN completeness_score END),1) avg_completeness,
    SUM(CASE WHEN cohort='priority_250' AND booking_score=0 THEN 1 ELSE 0 END) missing_booking,
    SUM(CASE WHEN cohort='priority_250' AND rate_score=0 THEN 1 ELSE 0 END) missing_rate,
    SUM(CASE WHEN cohort='priority_250' AND media_score=0 THEN 1 ELSE 0 END) missing_media,
    SUM(CASE WHEN cohort='priority_250' AND evidence_score=0 THEN 1 ELSE 0 END) missing_evidence,
    SUM(CASE WHEN cohort='priority_250' AND first_party_score=0 THEN 1 ELSE 0 END) missing_first_party
    FROM hotel_enrichment_profiles`).first();

  const top=(await env.DB.prepare(`SELECT h.id,h.name,h.slug,h.city,h.country,hep.priority_rank,hep.priority_score,hep.completeness_score,
    hep.facts_score,hep.booking_score,hep.rate_score,hep.media_score,hep.evidence_score,hep.first_party_score,hep.missing_json
    FROM hotel_enrichment_profiles hep JOIN hotels h ON h.id=hep.hotel_id
    WHERE hep.cohort='priority_250' ORDER BY hep.priority_rank LIMIT 250`).all()).results||[];

  const q=(await env.DB.prepare(`SELECT heq.id,heq.task_type,heq.status,heq.priority,heq.source_hint,heq.attempts,heq.last_error,h.name,h.slug
    FROM hotel_enrichment_queue heq JOIN hotels h ON h.id=heq.hotel_id
    WHERE heq.status IN ('queued','working','failed')
    ORDER BY heq.priority,heq.updated_at LIMIT 100`).all()).results||[];

  const gap=(n)=>Number(n||0).toLocaleString();
  return page(shell(`<section class="hero" style="padding-bottom:20px"><div class="eyebrow">Hotel data operations</div><h1>Enrichment command center</h1><p>SecretNests ranks the full hotel corpus, promotes the highest-value 250 into the working cohort, measures completeness, and maintains a durable queue for every missing layer.</p></section>
  ${message?`<div class="notice"><strong>${esc(message)}</strong></div>`:""}
  <div class="proof">
    <div><strong>${gap(summary?.priority_count)}</strong><span class="muted">priority hotels</span></div>
    <div><strong>${Number(summary?.avg_completeness||0).toFixed(0)}%</strong><span class="muted">avg completeness</span></div>
    <div><strong>${gap(summary?.missing_rate)}</strong><span class="muted">need current rates</span></div>
    <div><strong>${gap(summary?.missing_media)}</strong><span class="muted">need licensed hero</span></div>
    <div><strong>${gap(summary?.missing_first_party)}</strong><span class="muted">need first-party stays</span></div>
  </div>
  <section class="section"><div class="hero-actions"><form method="post"><button class="btn" name="action" value="refresh">Rebuild top 250 + enrichment queue</button></form><a class="btn secondary" href="/admin/contributions">Contribution acquisition</a><a class="btn secondary" href="/admin/nuitee">Nuitee audit</a></div>
  <p class="muted">Automated workers: official-site facts, Booking.com Demand live-rate observations when configured, and provenance-backed independent web evidence when OpenAI search is configured.</p></section>
  <section class="section"><div class="section-head"><div><div class="eyebrow">Priority cohort</div><h2>Top 250 hotels</h2></div><span class="muted">Ranked from existing demand/value signals; completeness is a separate measure.</span></div>
    <div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr><th style="text-align:left;padding:10px;border-bottom:1px solid #ddd">#</th><th style="text-align:left;padding:10px;border-bottom:1px solid #ddd">Hotel</th><th style="text-align:right;padding:10px;border-bottom:1px solid #ddd">Priority</th><th style="text-align:right;padding:10px;border-bottom:1px solid #ddd">Complete</th><th style="text-align:left;padding:10px;border-bottom:1px solid #ddd">Missing</th></tr></thead><tbody>
    ${top.map(h=>`<tr><td style="padding:10px;border-bottom:1px solid #eee">${h.priority_rank}</td><td style="padding:10px;border-bottom:1px solid #eee"><a href="/hotel/${encodeURIComponent(h.slug)}"><strong>${esc(h.name)}</strong></a><br><span class="kicker">${esc([h.city,h.country].filter(Boolean).join(", "))}</span></td><td style="text-align:right;padding:10px;border-bottom:1px solid #eee">${Number(h.priority_score||0).toFixed(0)}</td><td style="text-align:right;padding:10px;border-bottom:1px solid #eee"><strong>${Number(h.completeness_score||0).toFixed(0)}%</strong></td><td style="padding:10px;border-bottom:1px solid #eee">${safeJson(h.missing_json,[]).map(x=>`<span class="pill">${esc(x.replaceAll("_"," "))}</span>`).join("")||'<span class="value-badge good">complete</span>'}</td></tr>`).join("")||'<tr><td colspan="5" style="padding:20px">Run the ranking to initialize the cohort.</td></tr>'}
    </tbody></table></div>
  </section>
  <section class="section"><div class="section-head"><div><div class="eyebrow">Work queue</div><h2>Next enrichment jobs</h2></div><span class="muted">Stable tasks; retries and future providers plug into this queue.</span></div>
    <div class="grid">${q.map(x=>`<div class="card"><div class="eyebrow">${esc(x.task_type.replaceAll("_"," "))} · priority ${x.priority}</div><h3><a href="/hotel/${encodeURIComponent(x.slug)}">${esc(x.name)}</a></h3><p class="muted">Source hint: ${esc(x.source_hint||"—")} · attempts ${x.attempts||0}</p>${x.last_error?`<p class="error notice">${esc(x.last_error)}</p>`:""}<form method="post"><input type="hidden" name="id" value="${attr(x.id)}"><button class="btn secondary" name="action" value="reset_task">Reset task</button></form></div>`).join("")||'<div class="notice">No open enrichment tasks.</div>'}</div>
  </section>`),env,{title:"Hotel enrichment | SecretNests",canonical:"/admin/enrichment",robots:"noindex,nofollow"});
}

async function runEnrichmentAutomation(env){
  const ranking=await refreshHotelEnrichment(env.DB);
  const official=await drainOfficialHotelQueue(env,{limit:8});
  return {ok:true,ranking,official};
}

async function runMarketIntelligenceAutomation(env){
  const rates=await drainCurrentRateQueue(env,{limit:6});
  return {ok:true,rates};
}

async function runExternalEvidenceAutomation(env){
  const evidence=await drainExternalEvidenceQueue(env,{limit:1});
  return {ok:true,evidence};
}

async function runTravelpayoutsAutomation(env){
  const cfg=travelpayoutsConfig(env);
  if(!cfg.token||!cfg.partnerId||!cfg.projectId)return {ok:false,skipped:true,reason:"travelpayouts_not_configured"};
  const links=await seedTravelpayoutsLinks(env,200);
  let stats={ok:true,skipped:true,reason:"campaign_id_not_configured"};
  const campaignId=String(env.TRAVELPAYOUTS_CAMPAIGN_ID||"").trim();
  if(campaignId){
    const from=new Date(Date.now()-35*86400000).toISOString().slice(0,10);
    stats=await syncTravelpayoutsStats(env,campaignId,from);
  }
  return {ok:Boolean(links.ok&&stats.ok),links,stats};
}

async function internalMarketPilot(request,env){
  const expected=String(env.PRODUCTION_ACTIVATION_TOKEN||"");
  const auth=String(request.headers.get("authorization")||"");
  if(!expected||auth!=="Bearer "+expected)return new Response("Not found",{status:404});
  if(String(env.NUITEE_API_KEY||"").trim()){
    const nuitee=await runNuiteeTop250Enrichment(env,{mapLimit:32,reviewLimit:16,rateLimit:150});
    return json({ok:true,mode:String(env.MARKET_INTELLIGENCE_MODE||"pilot"),nuitee});
  }
  const rates=await drainCurrentRateQueue(env,{limit:5,allowSandbox:true});
  const evidence=await drainExternalEvidenceQueue(env,{limit:2,allowSandbox:true});
  return json({ok:true,mode:String(env.MARKET_INTELLIGENCE_MODE||"pilot"),rates,evidence});
}
async function sitemap(env){
  const urls=[ORIGIN+"/",ORIGIN+"/destinations",ORIGIN+"/brands",ORIGIN+"/creators",ORIGIN+"/about",ORIGIN+"/value",ORIGIN+"/compare",ORIGIN+"/contribute",ORIGIN+"/add-your-trip",ORIGIN+"/privacy",ORIGIN+"/terms",ORIGIN+"/disclosures"];
  try{
    const hotels=(await env.DB.prepare(`SELECT h.slug FROM hotels h LEFT JOIN hotel_enrichment_profiles p ON p.hotel_id=h.id
      WHERE h.is_published=1 AND ((h.description IS NOT NULL AND length(h.description)>=80) OR p.cohort='priority_250')`).all()).results||[];
    const creators=(await env.DB.prepare("SELECT handle FROM creator_profiles WHERE is_public=1 AND COALESCE(is_demo,0)=0").all()).results||[];
    const lists=(await env.DB.prepare("SELECT cp.handle,l.slug FROM lists l JOIN creator_profiles cp ON cp.id=l.creator_id WHERE l.is_public=1 AND cp.is_public=1 AND COALESCE(cp.is_demo,0)=0").all()).results||[];
    const dests=(await env.DB.prepare("SELECT DISTINCT city,country FROM hotels WHERE is_published=1 AND city IS NOT NULL AND city<>'' AND country IS NOT NULL AND country<>''").all()).results||[];
    const countries=(await env.DB.prepare("SELECT DISTINCT country FROM hotels WHERE is_published=1 AND country IS NOT NULL AND country<>''").all()).results||[];
    const brands=(await env.DB.prepare("SELECT brand_name,COUNT(*) n FROM hotels WHERE is_published=1 AND brand_name IS NOT NULL AND trim(brand_name)<>'' GROUP BY brand_name HAVING COUNT(*)>=2").all()).results||[];
    const top=(await env.DB.prepare(`SELECT h.name,h.slug,h.city,h.country,p.priority_rank FROM hotel_enrichment_profiles p JOIN hotels h ON h.id=p.hotel_id
      WHERE p.cohort='priority_250' AND h.is_published=1 ORDER BY p.priority_rank LIMIT 250`).all()).results||[];
    const pairs=buildComparisonPairs(top,{maxPairs:120,perGroup:4});
    urls.push(
      ...hotels.map(x=>ORIGIN+"/hotel/"+encodeURIComponent(x.slug)),
      ...creators.map(x=>ORIGIN+"/@"+encodeURIComponent(x.handle)),
      ...lists.map(x=>ORIGIN+"/@"+encodeURIComponent(x.handle)+"/lists/"+encodeURIComponent(x.slug)),
      ...dests.map(x=>ORIGIN+"/destinations/"+slugify(x.country)+"/"+slugify(x.city)),
      ...countries.map(x=>ORIGIN+"/value/country/"+slugify(x.country)),
      ...brands.map(x=>ORIGIN+"/brands/"+brandSlug(x.brand_name)),
      ...pairs.map(x=>ORIGIN+x.path)
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
  if(request.method==="GET" && url.pathname==="/brands")return brandsPage(env);
  const brand=url.pathname.match(/^\/brands\/([^/]+)$/); if(request.method==="GET"&&brand)return brandPage(decodeURIComponent(brand[1]),env);
  const cleanDest=url.pathname.match(/^\/destinations\/([^/]+)\/([^/]+)$/); if(request.method==="GET"&&cleanDest)return destinationPage(decodeURIComponent(cleanDest[1]),decodeURIComponent(cleanDest[2]),env);
  if(request.method==="GET" && /^\/destination\//.test(url.pathname))return legacyDestinationRedirect(request,env);
  if(request.method==="GET" && url.pathname==="/creators")return creatorsPage(env);
  if(request.method==="GET" && url.pathname==="/contribute")return contributePage(request,env);
  if(request.method==="GET" && url.pathname==="/add-your-trip")return addTripPage(request,env);
  if(request.method==="POST" && url.pathname==="/add-your-trip")return submitTrip(request,env);
  if(request.method==="GET" && url.pathname==="/about")return aboutPage(env);
  if(request.method==="GET" && url.pathname==="/privacy")return legalPage("privacy",env);
  if(request.method==="GET" && url.pathname==="/terms")return legalPage("terms",env);
  if(request.method==="GET" && url.pathname==="/disclosures")return legalPage("disclosures",env);
  if(request.method==="GET" && url.pathname==="/value")return valueHub(env);
  const valueCountry=url.pathname.match(/^\/value\/country\/([^/]+)$/); if(request.method==="GET"&&valueCountry)return countryValuePage(decodeURIComponent(valueCountry[1]),env);
  const value=url.pathname.match(/^\/value\/([^/]+)$/); if(request.method==="GET"&&value)return valueCollection(decodeURIComponent(value[1]),env);
  if(request.method==="GET" && url.pathname==="/compare")return compareLanding(env);
  const compare=url.pathname.match(/^\/compare\/(.+)$/); if(request.method==="GET"&&compare)return comparisonPage(decodeURIComponent(compare[1]),env);
  if(request.method==="GET" && url.pathname==="/api/hotel-suggest")return hotelSuggest(request,env);
  if(request.method==="GET" && url.pathname==="/api/hotels")return apiHotels(request,env);
  if(request.method==="POST" && url.pathname==="/api/events")return recordEvent(request,env);
  if(request.method==="POST" && url.pathname==="/api/internal/market-intelligence/pilot")return internalMarketPilot(request,env);
  if((request.method==="GET"||request.method==="POST") && url.pathname==="/admin/submissions")return adminSubmissionsPage(request,env);
  const verificationFile=url.pathname.match(/^\/admin\/submission-verification\/([^/]+)$/); if(request.method==="GET"&&verificationFile)return submissionVerificationFile(decodeURIComponent(verificationFile[1]),request,env);
  if((request.method==="GET"||request.method==="POST") && url.pathname==="/api/admin/submissions")return adminSubmissions(request,env);
  if(request.method==="POST" && url.pathname==="/api/admin/verification-upload")return verificationUpload(request,env);
  if(request.method==="POST" && url.pathname==="/api/admin/verification-review")return verificationReview(request,env);
  if((request.method==="GET"||request.method==="POST") && url.pathname==="/api/admin/media")return adminMedia(request,env);
  if(request.method==="POST" && url.pathname==="/api/admin/media-ingest")return createMediaIngest(request,env);
  if(request.method==="POST" && url.pathname==="/api/admin/enrichment/drain")return adminDrainEnrichment(request,env);
  if(request.method==="POST" && url.pathname==="/api/admin/enrichment/drain-rates")return adminDrainRates(request,env);
  if(request.method==="POST" && url.pathname==="/api/admin/enrichment/drain-evidence")return adminDrainEvidence(request,env);
  if(request.method==="POST" && url.pathname==="/api/admin/enrichment/drain-nuitee")return adminDrainNuitee(request,env);
  if(request.method==="GET" && url.pathname==="/api/admin/enrichment/next")return adminEnrichmentNext(request,env);
  if(request.method==="POST" && url.pathname==="/api/admin/enrichment/apply")return adminEnrichmentApply(request,env);
  if((request.method==="GET"||request.method==="POST") && url.pathname==="/admin/enrichment")return adminEnrichmentPage(request,env);
  if(request.method==="GET" && url.pathname==="/admin/contributions")return adminContributionsPage(request,env);
  if((request.method==="GET"||request.method==="POST") && url.pathname==="/admin/nuitee")return adminNuiteePage(request,env);
  if((request.method==="GET"||request.method==="POST") && url.pathname==="/admin/travelpayouts")return adminTravelpayoutsPage(request,env);
  if((request.method==="GET"||request.method==="POST") && url.pathname==="/admin/rates")return adminRatesPage(request,env);
  if(request.method==="POST" && url.pathname==="/api/admin/rates")return ingestRates(request,env);
  if(request.method==="POST" && url.pathname==="/api/admin/recompute-values")return recomputeValues(request,env);
  if(request.method==="GET" && url.pathname==="/health")return json({ok:true,service:"secretnests",runtime:"cloudflare-worker"});
  if(request.method==="GET" && url.pathname==="/sitemap.xml")return sitemap(env);
  const media=url.pathname.match(/^\/media\/([^/]+)$/); if(request.method==="GET"&&media)return mediaAsset(decodeURIComponent(media[1]),env);
  const out=url.pathname.match(/^\/out\/([^/]+)$/); if(request.method==="GET"&&out)return outbound(decodeURIComponent(out[1]),request,env);
  const hotel=url.pathname.match(/^\/hotel\/([^/]+)$/); if(request.method==="GET"&&hotel)return hotelPage(decodeURIComponent(hotel[1]),env);
  const list=url.pathname.match(/^\/@([^/]+)\/lists\/([^/]+)$/); if(request.method==="GET"&&list)return listPage(decodeURIComponent(list[1]),decodeURIComponent(list[2]),env);
  const creator=url.pathname.match(/^\/@([^/]+)$/); if(request.method==="GET"&&creator)return creatorPage(decodeURIComponent(creator[1]),env);
  if(request.method==="GET" && url.pathname==="/robots.txt")return new Response("User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /out/\nSitemap: https://secretnests.com/sitemap.xml\n",{headers:{"content-type":"text/plain; charset=utf-8","cache-control":"public,max-age=3600"}});
  if(request.method==="GET" && url.pathname==="/llms.txt")return new Response("# SecretNests\n\nSecretNests is a traveler-led luxury hotel valuation and taste network. Core data includes actual paid prices, traveler willingness-to-pay, hotel value ranges, public creator lists and attributable booking outcomes.\n\nCanonical site: https://secretnests.com\nHotel pages: /hotel/{slug}\nDestinations: /destinations/{country}/{city}\nBrands: /brands/{brand}\nComparisons: /compare/{hotel-a}-vs-{hotel-b}\nContribute: /contribute\nValue discovery: /value\nCreators: /@{handle}\nLists: /@{handle}/lists/{slug}\n",{headers:{"content-type":"text/plain; charset=utf-8","cache-control":"public,max-age=3600"}});
  return new Response("Not found",{status:404,headers:{"content-type":"text/plain; charset=utf-8"}});
}

export default {
  async scheduled(controller,env,ctx){
    if(controller.cron==="23 5 * * *"){
      ctx.waitUntil(runEnrichmentAutomation(env).then(result=>console.log(JSON.stringify({type:"enrichment_automation",...result}))).catch(e=>console.error(JSON.stringify({type:"enrichment_automation_error",message:safeLogError(e)}))));
      return;
    }
    if(controller.cron==="7,22,37,52 * * * *"){
      const jobs=[
        drainOfficialHotelQueue(env,{limit:8}),
        runExternalEvidenceAutomation(env)
      ];
      if(String(env.NUITEE_TOP250_AUDIT_ENABLED||"false").toLowerCase()==="true"&&String(env.NUITEE_API_KEY||"").trim()){
        jobs.push(runNuiteeTop250Enrichment(env,{mapLimit:24,reviewLimit:12,rateLimit:100}));
      }
      ctx.waitUntil(Promise.allSettled(jobs).then(results=>console.log(JSON.stringify({type:"enrichment_drain",results:results.map(x=>x.status==="fulfilled"?x.value:{ok:false,error:safeLogError(x.reason)})}))).catch(e=>console.error(JSON.stringify({type:"enrichment_drain_error",message:safeLogError(e)}))));
      return;
    }
    ctx.waitUntil((async()=>{
      try{
        const count=Number((await env.DB.prepare("SELECT COUNT(*) n FROM hotel_enrichment_profiles").first())?.n||0);
        if(count===0){
          const enrichment=await runEnrichmentAutomation(env);
          console.log(JSON.stringify({type:"enrichment_bootstrap",...enrichment}));
        }
      }catch(e){console.error(JSON.stringify({type:"enrichment_bootstrap_error",message:safeLogError(e)}))}
      try{
        const result=await runTravelpayoutsAutomation(env);
        console.log(JSON.stringify({type:"travelpayouts_automation",...result}));
      }catch(e){console.error(JSON.stringify({type:"travelpayouts_automation_error",message:safeLogError(e)}))}
      try{
        const result=await runMarketIntelligenceAutomation(env);
        console.log(JSON.stringify({type:"rate_automation",...result}));
      }catch(e){console.error(JSON.stringify({type:"rate_automation_error",message:safeLogError(e)}))}
    })());
  },
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
