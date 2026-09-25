import test from "node:test";
import assert from "node:assert/strict";
import { buildComparisonPairs, hotelSeoCopy, brandSlug } from "../src/seo-discovery.js";

test("comparison pairs stay local and unique",()=>{
  const rows=[
    {slug:"a",city:"Paris",country:"France"},
    {slug:"b",city:"Paris",country:"France"},
    {slug:"c",city:"Paris",country:"France"},
    {slug:"d",city:"Rome",country:"Italy"}
  ];
  const pairs=buildComparisonPairs(rows,{maxPairs:10,perGroup:4});
  assert.deepEqual(pairs.map(x=>x.path),[
    "/compare/a-vs-b","/compare/a-vs-c","/compare/b-vs-c"
  ]);
});

test("hotel SEO copy separates price context from first-party value",()=>{
  const copy=hotelSeoCopy(
    {name:"Example Hotel",city:"Paris",country:"France",price_estimate_min:700,price_estimate_max:1100},
    {currentRate:950,travelerMedian:null,sampleSize:0}
  );
  assert.match(copy.title,/review, prices & value/);
  assert.match(copy.priceAnswer,/\$950/);
  assert.match(copy.worthAnswer,/does not yet have enough first-party stays/);
  assert.ok(copy.description.length<=165);
});

test("hotel SEO copy states observed traveler value without universal verdict",()=>{
  const copy=hotelSeoCopy(
    {name:"Example Hotel",city:"Paris",country:"France"},
    {travelerMedian:825,sampleSize:3}
  );
  assert.match(copy.worthAnswer,/\$825/);
  assert.match(copy.worthAnswer,/not a universal verdict/);
});

test("brand slugs are stable",()=>{
  assert.equal(brandSlug("Four Seasons Hotels & Resorts"),"four-seasons-hotels-and-resorts");
});
