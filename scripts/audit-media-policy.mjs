import fs from "node:fs";
import path from "node:path";

const roots=["data/legacy"];
const forbiddenHosts=["places.googleapis.com","tripadvisor.com","reddit.com","redd.it","instagram.com"];
const forbiddenFields=["hero_image_url","gallery_images"];
let failed=false;
let scanned=0;

function walk(p){
  if(!fs.existsSync(p)) return;
  const st=fs.statSync(p);
  if(st.isDirectory()) return fs.readdirSync(p).forEach(n=>walk(path.join(p,n)));
  scanned++;
  const text=fs.readFileSync(p,"utf8");
  for(const field of forbiddenFields){
    if(text.includes(`"${field}"`)){
      console.error(`Forbidden legacy image field ${field} found in ${p}`);
      failed=true;
    }
  }
  for(const host of forbiddenHosts){
    if(text.includes(host)){
      console.error(`Unreviewed third-party media/source host ${host} found in ${p}`);
      failed=true;
    }
  }
}
roots.forEach(walk);
if(failed) process.exit(1);
console.log(`Media provenance audit passed across ${scanned} legacy data files.`);
