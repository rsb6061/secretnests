import fs from "node:fs";
import path from "node:path";

const dir=path.resolve("data/legacy");
const hotels=fs.readdirSync(dir).filter(n=>/^hotels-core-\d+\.json$/.test(n)).sort().flatMap(n=>JSON.parse(fs.readFileSync(path.join(dir,n),"utf8")));
const find=(name)=>{const h=hotels.find(x=>x.name===name);if(!h)throw new Error("Missing demo hotel: "+name);return h;};
const q=(v)=>v==null?"NULL":"'"+String(v).replaceAll("'","''")+"'";
const creatorId="demo-rebecca";
const creator={
  handle:"rebecca",
  display_name:"Rebecca",
  bio:"Demo profile — illustrative sample data showing how a SecretNests traveler portfolio will work. These are not claimed as real stays.",
  taste:["Boutique","design-heavy","quiet","food matters","value-conscious"]
};
const demo=[
  ["Fairmont Banff Springs","2026-05",725,475,0],
  ["Bawah Reserve","2026-04",510,575,1],
  ["COMO Alpina Dolomites","2026-03",1150,1250,1],
  ["Canaves Epitome","2025-09",980,1050,1],
  ["Park Hyatt Sydney","2025-07",890,825,1],
  ["JW Marriott Marco Island Beach Resort","2025-05",640,700,1]
].map(([name,month,paid,wouldPay,wouldReturn],i)=>({hotel:find(name),month,paid,wouldPay,wouldReturn,i}));

const lists=[
  {id:"demo-list-worth-500",slug:"hotels-id-pay-500-for-again",title:"Hotels I'd pay $500+ for again",description:"Illustrative demo list showing price-sensitive hotel taste.",items:[1,2,3,4,5]},
  {id:"demo-list-worth-1000",slug:"luxury-hotels-actually-worth-1000",title:"Luxury hotels that are actually worth $1,000",description:"Illustrative demo list for SecretNests value intelligence.",items:[2,3]},
  {id:"demo-list-ripoff",slug:"700-hotels-i-thought-were-a-ripoff",title:"$700+ hotels I thought were a ripoff",description:"Illustrative demo list; not a claim about an actual traveler experience.",items:[0]}
];

const sql=[];
sql.push(
  "INSERT INTO creator_profiles (id,user_id,handle,display_name,bio,taste_profile_json,is_public,is_demo,created_at,updated_at) VALUES ("+
  [q(creatorId),"NULL",q(creator.handle),q(creator.display_name),q(creator.bio),q(JSON.stringify(creator.taste)),"1","1","CURRENT_TIMESTAMP","CURRENT_TIMESTAMP"].join(",")+
  ") ON CONFLICT(id) DO UPDATE SET handle=excluded.handle,display_name=excluded.display_name,bio=excluded.bio,taste_profile_json=excluded.taste_profile_json,is_public=1,is_demo=1,updated_at=CURRENT_TIMESTAMP;"
);

for(const d of demo){
  const stayId="demo-stay-"+d.i;
  const valueId="demo-value-"+d.i;
  const reportId="demo-report-"+d.i;
  sql.push(
    "INSERT INTO stays (id,creator_id,hotel_id,stay_month,nights,party_type,room_type,booking_channel,paid_nightly_rate,total_paid,currency,verified,verification_method,created_at,updated_at) VALUES ("+
    [q(stayId),q(creatorId),q(d.hotel.id),q(d.month),"2",q("couple"),q("Illustrative room"),q("demo"),d.paid,d.paid*2,q("USD"),"0",q("demo"),"CURRENT_TIMESTAMP","CURRENT_TIMESTAMP"].join(",")+
    ") ON CONFLICT(id) DO UPDATE SET paid_nightly_rate=excluded.paid_nightly_rate,total_paid=excluded.total_paid,updated_at=CURRENT_TIMESTAMP;"
  );
  sql.push(
    "INSERT INTO value_opinions (id,stay_id,creator_id,hotel_id,paid_nightly_rate,would_pay_again,worth_it_below,hard_to_justify_above,currency,created_at) VALUES ("+
    [q(valueId),q(stayId),q(creatorId),q(d.hotel.id),d.paid,d.wouldPay,Math.round(d.wouldPay*.9),Math.round(d.wouldPay*1.15),q("USD"),"CURRENT_TIMESTAMP"].join(",")+
    ") ON CONFLICT(id) DO UPDATE SET would_pay_again=excluded.would_pay_again;"
  );
  sql.push(
    "INSERT INTO hotel_value_snapshots (id,hotel_id,traveler_low,traveler_high,median_would_pay,sample_size,current_price,value_classification,currency,calculated_at,confidence,p25_would_pay,p75_would_pay,methodology_version) VALUES ("+
    [q("demo-snapshot-"+d.i),q(d.hotel.id),d.wouldPay,d.wouldPay,d.wouldPay,"1","NULL",q("insufficient data"),q("USD"),"CURRENT_TIMESTAMP",q("insufficient"),d.wouldPay,d.wouldPay,q("sn-value-v1")].join(",")+
    ") ON CONFLICT(id) DO UPDATE SET median_would_pay=excluded.median_would_pay,traveler_low=excluded.traveler_low,traveler_high=excluded.traveler_high,sample_size=1,calculated_at=CURRENT_TIMESTAMP;"
  );
  sql.push(
    "INSERT INTO trip_reports (id,stay_id,creator_id,hotel_id,title,review_text,verdict,would_return,standout_json,disappointments_json,status,published_at,created_at,updated_at) VALUES ("+
    [q(reportId),q(stayId),q(creatorId),q(d.hotel.id),q("Demo: "+d.hotel.name),q("Illustrative demo report used to show the SecretNests creator experience. Not a claimed real stay."),q("demo"),d.wouldReturn,q("[]"),q("[]"),q("published"),"CURRENT_TIMESTAMP","CURRENT_TIMESTAMP","CURRENT_TIMESTAMP"].join(",")+
    ") ON CONFLICT(id) DO NOTHING;"
  );
}

for(const l of lists){
  sql.push(
    "INSERT INTO lists (id,creator_id,slug,title,description,is_public,created_at,updated_at) VALUES ("+
    [q(l.id),q(creatorId),q(l.slug),q(l.title),q(l.description),"1","CURRENT_TIMESTAMP","CURRENT_TIMESTAMP"].join(",")+
    ") ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,is_public=1;"
  );
  l.items.forEach((idx,rank)=>{
    const d=demo[idx];
    sql.push(
      "INSERT INTO list_items (id,list_id,hotel_id,note,rank,created_at) VALUES ("+
      [q(l.id+"-"+idx),q(l.id),q(d.hotel.id),q("Illustrative demo placement."),rank+1,"CURRENT_TIMESTAMP"].join(",")+
      ") ON CONFLICT(id) DO NOTHING;"
    );
  });
}

sql.push();
fs.mkdirSync(".generated",{recursive:true});
fs.writeFileSync(".generated/demo.sql",sql.join("\n"));
console.log("Built clearly labeled demo creator seed with "+demo.length+" illustrative stays and "+lists.length+" lists.");
