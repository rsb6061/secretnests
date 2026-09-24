import fs from "node:fs";
import path from "node:path";

const dir=path.resolve("data/legacy");
const read=(re)=>fs.readdirSync(dir).filter(n=>re.test(n)).sort().flatMap(n=>JSON.parse(fs.readFileSync(path.join(dir,n),"utf8")));
const core=read(/^hotels-core-\d+\.json$/);
const content=read(/^hotel-content-\d+\.sanitized\.json$/);
const reddit=read(/^reddit-evidence-\d+\.json$/);

const unique=(rows,key)=>new Set(rows.map(r=>r[key])).size;
const coreIds=new Set(core.map(r=>r.id));
const contentIds=new Set(content.map(r=>r.id));
const redditIds=new Set(reddit.map(r=>r.id));
const missingContent=[...coreIds].filter(id=>!contentIds.has(id));
const orphanContent=[...contentIds].filter(id=>!coreIds.has(id));
const forbidden=content.filter(r=>JSON.stringify(r).includes("places.googleapis.com")||JSON.stringify(r).match(/AIza[0-9A-Za-z_-]{20,}/));

const checks=[
  ["core hotel count",core.length===1066,core.length],
  ["unique core hotel ids",unique(core,"id")===1066,unique(core,"id")],
  ["sanitized hotel content count",content.length===1066,content.length],
  ["unique content hotel ids",unique(content,"id")===1066,unique(content,"id")],
  ["reddit evidence count",reddit.length===143,reddit.length],
  ["unique reddit evidence ids",unique(reddit,"id")===143,unique(reddit,"id")],
  ["all core hotels have content",missingContent.length===0,missingContent.length],
  ["no orphan content",orphanContent.length===0,orphanContent.length],
  ["no Google Places image URLs/API keys in sanitized content",forbidden.length===0,forbidden.length]
];

let failed=false;
for(const [name,ok,value] of checks){
  console.log(`${ok?"PASS":"FAIL"} ${name}: ${value}`);
  if(!ok) failed=true;
}
if(failed) process.exit(1);
