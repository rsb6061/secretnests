import fs from "node:fs";
import path from "node:path";
const dir=path.resolve("data/legacy");
const rows=fs.readdirSync(dir).filter(n=>/^hotels-core-\d+\.json$/.test(n)).sort().flatMap(n=>JSON.parse(fs.readFileSync(path.join(dir,n),"utf8")));
const urls=[...new Set(rows.map(r=>r.booking_url).filter(Boolean))]; const out=[];
for(const url of urls){try{const res=await fetch(url,{method:"HEAD",redirect:"follow",signal:AbortSignal.timeout(10000)});out.push({url,status:res.status,ok:res.ok,final_url:res.url});}catch(e){out.push({url,status:null,ok:false,error:String(e.message||e)})}}
fs.mkdirSync(".generated",{recursive:true}); fs.writeFileSync(".generated/booking-link-check.json",JSON.stringify(out,null,2)); console.log("Checked "+urls.length+" booking URLs; "+out.filter(x=>!x.ok).length+" failed.");