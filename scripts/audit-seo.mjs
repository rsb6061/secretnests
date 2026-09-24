import fs from "node:fs";
import path from "node:path";

const dir=path.resolve("data/legacy");
const core=fs.readdirSync(dir).filter(n=>/^hotels-core-\d+\.json$/.test(n)).sort().flatMap(n=>JSON.parse(fs.readFileSync(path.join(dir,n),"utf8")));
const contentRows=fs.readdirSync(dir).filter(n=>/^hotel-content-\d+\.sanitized\.json$/.test(n)).sort().flatMap(n=>JSON.parse(fs.readFileSync(path.join(dir,n),"utf8")));
const byId=new Map(contentRows.map(r=>[r.id,r]));

const trim=(value,max)=>{
  const s=String(value||"").replace(/\s+/g," ").trim();
  if(s.length<=max)return s;
  const cut=s.slice(0,max-1).replace(/\s+\S*$/,"");
  return (cut||s.slice(0,max-1))+"…";
};

const titles=core.map(r=>trim(r.name+" | SecretNests hotel value",66));
const descriptions=core.map(r=>String(byId.get(r.id)?.description||"").trim());
const metaDescriptions=descriptions.map(d=>trim(d,165));
const duplicateDescriptions=[...descriptions.reduce((m,d)=>{if(d)m.set(d,(m.get(d)||0)+1);return m},new Map())].filter(([,n])=>n>1);

const report={
  hotels:core.length,
  duplicate_titles:titles.length-new Set(titles).size,
  duplicate_descriptions:duplicateDescriptions.length,
  thin_descriptions:descriptions.filter(d=>d.length<80).length,
  overly_long_meta_titles:titles.filter(t=>t.length>66).length,
  overly_long_meta_descriptions:metaDescriptions.filter(d=>d.length>165).length,
  raw_descriptions_over_320:descriptions.filter(d=>d.length>320).length,
  missing_country:core.filter(r=>!r.country).length
};

fs.mkdirSync(".generated",{recursive:true});
fs.writeFileSync(".generated/seo-qa.json",JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));

if(report.hotels!==1066||report.duplicate_titles||report.duplicate_descriptions||report.thin_descriptions||report.overly_long_meta_titles||report.overly_long_meta_descriptions) process.exitCode=1;
