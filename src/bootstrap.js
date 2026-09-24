import { SCHEMA_SQL } from "./bootstrap-schema.js";
import { seedHotelPart } from "./bootstrap-hotels.js";
import { seedRedditPart } from "./bootstrap-reddit-logic.js";

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});

export async function handleBootstrap(request,env){
  const url=new URL(request.url);
  if(url.hostname!=="bootstrap.secretnests.com" || !url.pathname.startsWith("/__bootstrap/")) return null;
  const stage=url.pathname.slice("/__bootstrap/".length);
  try{
    if(stage==="schema"){
      const exists=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='hotels'").first();
      if(!exists) await env.DB.exec(SCHEMA_SQL);
      return json({ok:true,stage:"schema",already:Boolean(exists)});
    }
    const hm=stage.match(/^hotels-(\d+)$/);
    if(hm) return json(await seedHotelPart(env,Number(hm[1])));
    const rm=stage.match(/^reddit-(\d+)$/);
    if(rm) return json(await seedRedditPart(env,Number(rm[1])));
    if(stage==="verify"){
      const hotels=(await env.DB.prepare("SELECT COUNT(*) n FROM hotels").first())?.n||0;
      const reddit=(await env.DB.prepare("SELECT COUNT(*) n FROM reddit_evidence").first())?.n||0;
      const tables=(await env.DB.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").first())?.n||0;
      return json({ok:hotels===1066&&reddit===143,hotels,reddit_evidence:reddit,tables});
    }
    return json({ok:false,error:"unknown_stage"},404);
  }catch(e){
    return json({ok:false,stage,error:String(e?.message||e).slice(0,800)},500);
  }
}
