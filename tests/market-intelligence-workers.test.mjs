import test from "node:test";
import assert from "node:assert/strict";
import { rateWindows, matchBookingCandidate, extractBookerRate } from "../src/rate-worker.js";
import { citationUrls } from "../src/external-evidence-worker.js";
import { matchSerpHotelCandidate, extractSerpHotelRate, reviewGroups } from "../src/serpapi.js";
import { matchNuiteeCandidate, extractNuiteeRate, summarizeNuiteeSentiment } from "../src/nuitee.js";

test("rateWindows creates two valid two-night future windows",()=>{
  const windows=rateWindows(new Date("2026-09-25T12:00:00Z"));
  assert.equal(windows.length,2);
  for(const w of windows){
    assert.equal(w.nights,2);
    const a=new Date(w.checkin+"T00:00:00Z"),b=new Date(w.checkout+"T00:00:00Z");
    assert.equal((b-a)/86400000,2);
    assert.equal(a.getUTCDay(),5);
  }
});

test("matchBookingCandidate prefers exact nearby property",()=>{
  const hotel={name:"Aman Tokyo",lat:35.6852,lng:139.7634};
  const details=[
    {id:101,name:{"en-gb":"Aman Tokyo"},coordinates:{latitude:35.6851,longitude:139.7635}},
    {id:102,name:{"en-gb":"Tokyo Hotel"},coordinates:{latitude:35.6852,longitude:139.7634}}
  ];
  const match=matchBookingCandidate(hotel,details);
  assert.equal(match.id,"101");
  assert.equal(match.confidence,"high");
});

test("extractBookerRate normalizes total stay price into nightly price",()=>{
  const payload={data:[{
    currency:{booker:"USD"},
    url:{web:"https://www.booking.com/hotel/example.html?aid=123"},
    products:[{
      name:"Flexible",
      room:{name:"King"},
      price:{display:{booker_currency:1000},charges:[{included_in:{booker_currency:true}}]}
    }]
  }]};
  const rate=extractBookerRate(payload,2);
  assert.equal(rate.nightly_rate,500);
  assert.equal(rate.currency,"USD");
  assert.equal(rate.room_type,"King");
  assert.equal(rate.taxes_fees_included,true);
  assert.match(rate.booking_url,/booking\.com/);
});

test("citationUrls accepts only normalized URLs actually returned by web search",()=>{
  const response={output:[
    {type:"message",content:[{type:"output_text",text:"{}",annotations:[{url:"https://example.com/review?utm_source=test"}]}]},
    {type:"web_search_call",action:{sources:[{url:"https://travel.example/story#section"}]}}
  ]};
  const urls=citationUrls(response);
  assert.ok(urls.has("https://example.com/review"));
  assert.ok(urls.has("https://travel.example/story"));
  assert.equal(urls.size,2);
});

test("SerpApi hotel matching requires name and geography agreement",()=>{
  const hotel={name:"Aman Tokyo",lat:35.6852,lng:139.7634};
  const match=matchSerpHotelCandidate(hotel,[
    {name:"Aman Tokyo",property_token:"tok-good",gps_coordinates:{latitude:35.6851,longitude:139.7635}},
    {name:"Aman Kyoto",property_token:"tok-bad",gps_coordinates:{latitude:35.6852,longitude:139.7634}}
  ]);
  assert.equal(match.id,"tok-good");
  assert.equal(match.confidence,"high");
});

test("SerpApi rate extraction keeps inclusive and pre-tax price context",()=>{
  const rate=extractSerpHotelRate({
    rate_per_night:{extracted_lowest:525,extracted_before_taxes_fees:470},
    total_rate:{extracted_lowest:1050},
    prices:[{source:"Hotel site",rate_per_night:{extracted_lowest:525}}]
  },2,"USD");
  assert.equal(rate.nightly_rate,525);
  assert.equal(rate.raw_total,1050);
  assert.equal(rate.before_taxes_fees,470);
  assert.equal(rate.taxes_fees_included,true);
  assert.equal(rate.price_sources[0].source,"Hotel site");
});

test("reviewGroups keeps verifiable source URLs and does not persist reviewer identity",()=>{
  const groups=reviewGroups([
    {source:"Google",rating:5,date:"today",snippet:"Excellent service and a quiet room with a comfortable bed.",user:{name:"Person"}},
    {source:"Tripadvisor",link:"https://www.tripadvisor.com/ShowUserReviews-abc",rating:3,date:"today",snippet:"Great location but the room felt dated and noisy at night.",user:{name:"Other"}}
  ],{name:"Example Hotel",city:"Paris",country:"France"});
  assert.equal(groups.length,2);
  assert.match(groups[0].source_url,/google\.com\/travel\/hotels/);
  assert.equal("user" in groups[0].reviews[0],false);
});

test("Nuitee hotel matching prefers exact nearby property",()=>{
  const hotel={name:"Aman Tokyo",lat:35.6852,lng:139.7634};
  const match=matchNuiteeCandidate(hotel,[
    {id:"lp-good",name:"Aman Tokyo",latitude:35.6851,longitude:139.7635},
    {id:"lp-bad",name:"Aman Kyoto",latitude:35.6852,longitude:139.7634}
  ]);
  assert.equal(match.id,"lp-good");
  assert.equal(match.confidence,"high");
});

test("Nuitee rate extraction uses public suggested selling price per night",()=>{
  const rate=extractNuiteeRate({data:[{hotelId:"lp-good",roomTypes:[{
    offerId:"offer-1",
    suggestedSellingPrice:{amount:1100,currency:"USD",source:"providerDirect"},
    offerRetailRate:{amount:980,currency:"USD"},
    rates:[{name:"Deluxe King",boardType:"RO"}]
  }]}]},2,"USD");
  assert.equal(rate.nightly_rate,550);
  assert.equal(rate.public_total,1100);
  assert.equal(rate.bookable_total,980);
  assert.equal(rate.room_type,"Deluxe King");
});

test("Nuitee sentiment summary stores aggregate signals without raw reviewer text",()=>{
  const signal=summarizeNuiteeSentiment({sentimentAnalysis:{
    categories:[
      {name:"Location",rating:9.1,description:"raw description that should not be copied"},
      {name:"Service",rating:8.0},
      {name:"Room Quality",rating:5.1},
      {name:"Value for Money",rating:6.2},
      {name:"Cleanliness",rating:7.4}
    ],
    pros:["Great location","Friendly staff"],
    cons:["Dated rooms"]
  }},"lp-good");
  assert.equal(signal.sentiment,"positive");
  assert.match(signal.summary,/Location 9\.1\/10/);
  assert.doesNotMatch(signal.summary,/raw description/);
  assert.deepEqual(signal.best_for,["Great location","Friendly staff"]);
});
