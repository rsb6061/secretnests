const num = (v) => Number.isFinite(Number(v)) ? Number(v) : null;

export function percentile(sorted, p) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function classifyValue(currentPrice, medianWouldPay) {
  const current = num(currentPrice), fair = num(medianWouldPay);
  if (current == null || fair == null || fair <= 0) return "insufficient data";
  const ratio = current / fair;
  if (ratio <= 0.85) return "materially below traveler-assessed fair value";
  if (ratio <= 1.10) return "within traveler-assessed fair value";
  if (ratio <= 1.30) return "above traveler-assessed fair value";
  return "materially above traveler-assessed fair value";
}

export function confidenceForSample(n) {
  if (n >= 20) return "high";
  if (n >= 8) return "medium";
  if (n >= 3) return "low";
  return "insufficient";
}

export function calculateValuation(values, currentPrice = null) {
  const clean = values.map(num).filter(v => v != null && v > 0 && v <= 100000).sort((a,b)=>a-b);
  const n = clean.length;
  if (!n) return {
    sample_size: 0, traveler_low: null, traveler_high: null, median_would_pay: null,
    p25_would_pay: null, p75_would_pay: null, current_price: num(currentPrice),
    confidence: "insufficient", value_classification: "insufficient data",
    methodology_version: "sn-value-v1"
  };
  // Trim one observation from each tail only once the sample is large enough
  // to reduce the influence of obvious outliers without hiding small-sample variance.
  const trimmed = n >= 10 ? clean.slice(1, -1) : clean;
  const p25 = percentile(trimmed, 0.25);
  const median = percentile(trimmed, 0.50);
  const p75 = percentile(trimmed, 0.75);
  return {
    sample_size: n,
    traveler_low: p25,
    traveler_high: p75,
    median_would_pay: median,
    p25_would_pay: p25,
    p75_would_pay: p75,
    current_price: num(currentPrice),
    confidence: confidenceForSample(n),
    value_classification: classifyValue(currentPrice, median),
    methodology_version: "sn-value-v1"
  };
}

export async function recomputeHotelValuation(db, hotelId, currentPrice = null) {
  const rows = (await db.prepare(
    "SELECT would_pay_again FROM value_opinions WHERE hotel_id=? AND would_pay_again IS NOT NULL AND would_pay_again>0 ORDER BY would_pay_again"
  ).bind(hotelId).all()).results || [];
  const latest = currentPrice == null
    ? await db.prepare("SELECT current_price FROM hotel_value_snapshots WHERE hotel_id=? AND current_price IS NOT NULL ORDER BY calculated_at DESC LIMIT 1").bind(hotelId).first()
    : null;
  const valuation = calculateValuation(rows.map(r=>r.would_pay_again), currentPrice ?? latest?.current_price ?? null);
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO hotel_value_snapshots
    (id,hotel_id,traveler_low,traveler_high,median_would_pay,sample_size,current_price,value_classification,currency,calculated_at,confidence,p25_would_pay,p75_would_pay,methodology_version)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,hotelId,valuation.traveler_low,valuation.traveler_high,valuation.median_would_pay,valuation.sample_size,
      valuation.current_price,valuation.value_classification,"USD",new Date().toISOString(),valuation.confidence,
      valuation.p25_would_pay,valuation.p75_would_pay,valuation.methodology_version).run();
  return { id, ...valuation };
}
