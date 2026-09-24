import test from "node:test";
import assert from "node:assert/strict";
import { calculateValuation, classifyValue, confidenceForSample } from "../src/value-engine.js";

test("valuation median and quartiles", () => {
  const v=calculateValuation([400,500,600,700,800],650);
  assert.equal(v.sample_size,5);
  assert.equal(v.median_would_pay,600);
  assert.equal(v.traveler_low,500);
  assert.equal(v.traveler_high,700);
  assert.equal(v.confidence,"low");
  assert.equal(v.value_classification,"within traveler-assessed fair value");
});

test("large samples trim one outlier from each tail", () => {
  const v=calculateValuation([1,400,450,500,550,600,650,700,750,800,99999],600);
  assert.equal(v.sample_size,11);
  assert.equal(v.median_would_pay,600);
  assert.equal(v.confidence,"medium");
});

test("classification boundaries", () => {
  assert.equal(classifyValue(80,100),"materially below traveler-assessed fair value");
  assert.equal(classifyValue(100,100),"within traveler-assessed fair value");
  assert.equal(classifyValue(120,100),"above traveler-assessed fair value");
  assert.equal(classifyValue(150,100),"materially above traveler-assessed fair value");
  assert.equal(classifyValue(null,100),"insufficient data");
});

test("confidence thresholds", () => {
  assert.equal(confidenceForSample(2),"insufficient");
  assert.equal(confidenceForSample(3),"low");
  assert.equal(confidenceForSample(8),"medium");
  assert.equal(confidenceForSample(20),"high");
});
