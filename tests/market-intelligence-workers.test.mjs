import test from "node:test";
import assert from "node:assert/strict";
import { rateWindows, matchBookingCandidate, extractBookerRate } from "../src/rate-worker.js";
import { citationUrls } from "../src/external-evidence-worker.js";

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
