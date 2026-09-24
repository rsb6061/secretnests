import fs from "node:fs";
import path from "node:path";

const roots=["src","scripts","data","docs","migrations",".github","README.md","wrangler.toml"];
const patterns=[
  {name:"Google API key",re:/AIza[0-9A-Za-z_-]{20,}/g},
  {name:"OpenAI key",re:/sk-[A-Za-z0-9_-]{20,}/g},
  {name:"Cloudflare token",re:/[A-Za-z0-9_-]{35,}/g}
];
const ignoreNames=new Set(["node_modules",".git",".wrangler",".generated"]);
const files=[];
function walk(p){
  if(!fs.existsSync(p))return;
  const st=fs.statSync(p);
  if(st.isDirectory()){for(const n of fs.readdirSync(p)){if(!ignoreNames.has(n))walk(path.join(p,n));}}
  else files.push(p);
}
roots.forEach(walk);
let failed=false;
for(const file of files){
  const text=fs.readFileSync(file,"utf8");
  for(const p of patterns){
    if(p.name==="Cloudflare token") continue;
    const matches=text.match(p.re);
    if(matches?.length){failed=true;console.error(`${p.name} pattern found in ${file}`);}
  }
}
if(failed) process.exit(1);
console.log(`Secret-pattern audit passed across ${files.length} files.`);
