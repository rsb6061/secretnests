const esc=(v="")=>String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const num=v=>Number(v||0).toLocaleString();

export async function nuiteeAdminBody(db){
  const summary=await db.prepare(`SELECT
    COUNT(*) priority_total,
    SUM(CASE WHEN a.mapping_status IN ('mapped','review') THEN 1 ELSE 0 END) mapped,
    SUM(CASE WHEN a.mapping_confidence='high' THEN 1 ELSE 0 END) high_confidence,
    SUM(CASE WHEN a.mapping_status='review' THEN 1 ELSE 0 END) needs_review,
    SUM(CASE WHEN a.mapping_status='failed' THEN 1 ELSE 0 END) mapping_failed,
    SUM(CASE WHEN a.metadata_status='complete' THEN 1 ELSE 0 END) metadata_complete,
    SUM(CASE WHEN a.review_status='complete' THEN 1 ELSE 0 END) reviews_available,
    SUM(CASE WHEN a.review_status='unavailable' THEN 1 ELSE 0 END) reviews_unavailable,
    SUM(CASE WHEN a.rate_audited_at IS NOT NULL THEN 1 ELSE 0 END) rate_audited,
    ROUND(AVG(CASE WHEN a.rate_audited_at IS NOT NULL THEN a.rate_coverage_pct END),1) avg_rate_coverage
    FROM hotel_enrichment_profiles p
    JOIN hotels h ON h.id=p.hotel_id
    LEFT JOIN hotel_nuitee_audit a ON a.hotel_id=h.id
    WHERE p.cohort='priority_250'`).first();

  const rows=(await db.prepare(`SELECT h.id,h.name,h.slug,h.city,h.country,p.priority_rank,
    a.provider_hotel_id,a.environment,a.mapping_status,a.mapping_confidence,a.name_similarity,a.distance_km,
    a.metadata_status,a.metadata_fields,a.review_status,a.rate_windows_tested,a.rate_windows_with_inventory,
    a.rate_coverage_pct,a.last_error,a.mapping_error,a.metadata_error,a.review_error,a.candidate_provider_hotel_id,
    a.candidate_name,a.candidate_similarity,a.candidate_distance_km,a.mapping_stage,a.updated_at
    FROM hotel_enrichment_profiles p
    JOIN hotels h ON h.id=p.hotel_id
    LEFT JOIN hotel_nuitee_audit a ON a.hotel_id=h.id
    WHERE p.cohort='priority_250'
    ORDER BY p.priority_rank LIMIT 250`).all()).results||[];

  const recent=(await db.prepare(`SELECT run_type,environment,status,hotels_claimed,hotels_mapped,metadata_written,reviews_written,
    rate_windows_tested,rate_observations_written,failures,started_at,finished_at
    FROM hotel_nuitee_batch_runs ORDER BY started_at DESC LIMIT 12`).all()).results||[];

  const status=(v)=>{
    const x=String(v||"pending");
    return '<span class="pill">'+esc(x.replaceAll("_"," "))+'</span>';
  };

  return `<section class="hero" style="padding-bottom:20px"><div class="eyebrow">Provider QA</div><h1>Nuitee top-250 audit</h1>
    <p>Hotel identity, metadata, review coverage and sandbox rate availability. Sandbox rates are QA-only and never count as SecretNests current prices or fair-value inputs.</p></section>
    <div class="proof">
      <div><strong>${num(summary?.mapped)}</strong><span class="muted">mapped / 250</span></div>
      <div><strong>${num(summary?.high_confidence)}</strong><span class="muted">high confidence</span></div>
      <div><strong>${num(summary?.needs_review)}</strong><span class="muted">needs review</span></div>
      <div><strong>${num(summary?.metadata_complete)}</strong><span class="muted">metadata captured</span></div>
      <div><strong>${num(summary?.reviews_available)}</strong><span class="muted">review signal</span></div>
      <div><strong>${num(summary?.rate_audited)}</strong><span class="muted">rate audited</span></div>
      <div><strong>${Number(summary?.avg_rate_coverage||0).toFixed(0)}%</strong><span class="muted">avg availability</span></div>
    </div>
    <section class="section"><div class="filters">
      <form method="post"><button class="btn" name="action" value="run">Run audit batch</button></form>
      <a class="btn secondary" href="/admin/enrichment">Core enrichment</a>
    </div><p class="muted">Automatic batches also run from the bounded enrichment cron until all top-250 hotels have been audited.</p></section>
    <section class="section"><div class="section-head"><div><div class="eyebrow">Quality table</div><h2>Top 250</h2></div>
      <span class="muted">Medium-confidence or failed mappings remain explicitly reviewable.</span></div>
      <div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr>
        <th style="text-align:left;padding:9px;border-bottom:1px solid #ddd">#</th>
        <th style="text-align:left;padding:9px;border-bottom:1px solid #ddd">Hotel</th>
        <th style="text-align:left;padding:9px;border-bottom:1px solid #ddd">Mapping</th>
        <th style="text-align:left;padding:9px;border-bottom:1px solid #ddd">Metadata</th>
        <th style="text-align:left;padding:9px;border-bottom:1px solid #ddd">Reviews</th>
        <th style="text-align:right;padding:9px;border-bottom:1px solid #ddd">Rate coverage</th>
        <th style="text-align:left;padding:9px;border-bottom:1px solid #ddd">Error</th>
      </tr></thead><tbody>
      ${rows.map(r=>`<tr>
        <td style="padding:9px;border-bottom:1px solid #eee">${r.priority_rank}</td>
        <td style="padding:9px;border-bottom:1px solid #eee"><a href="/hotel/${encodeURIComponent(r.slug)}"><strong>${esc(r.name)}</strong></a><br><span class="kicker">${esc([r.city,r.country].filter(Boolean).join(", "))}</span></td>
        <td style="padding:9px;border-bottom:1px solid #eee">${status(r.mapping_status)} ${r.mapping_confidence?esc(r.mapping_confidence):""}${r.distance_km!=null?" · "+Number(r.distance_km).toFixed(2)+" km":""}<br><span class="kicker">${esc(r.provider_hotel_id||"—")}${r.mapping_stage?" · "+esc(r.mapping_stage):""}</span>${r.candidate_name?`<br><span class="kicker">best rejected: ${esc(r.candidate_name)} · ${Number(r.candidate_similarity||0).toFixed(2)}${r.candidate_distance_km!=null?" · "+Number(r.candidate_distance_km).toFixed(2)+" km":""}</span>`:""}${["review","failed"].includes(r.mapping_status)?`<form method="post" style="margin-top:5px"><input type="hidden" name="hotel_id" value="${esc(r.id)}"><button class="btn secondary" name="action" value="reset">Retry</button></form>`:""}</td>
        <td style="padding:9px;border-bottom:1px solid #eee">${status(r.metadata_status)}<br><span class="kicker">${Number(r.metadata_fields||0)} fields</span></td>
        <td style="padding:9px;border-bottom:1px solid #eee">${status(r.review_status)}</td>
        <td style="text-align:right;padding:9px;border-bottom:1px solid #eee">${r.rate_coverage_pct==null?"—":Number(r.rate_coverage_pct).toFixed(0)+"%"}<br><span class="kicker">${Number(r.rate_windows_with_inventory||0)}/${Number(r.rate_windows_tested||0)} windows</span></td>
        <td style="padding:9px;border-bottom:1px solid #eee">${[
          r.mapping_error?"map: "+r.mapping_error:"",
          r.metadata_error?"metadata: "+r.metadata_error:"",
          r.review_error?"review: "+r.review_error:""
        ].filter(Boolean).map(x=>'<div class="error">'+esc(x)+'</div>').join("")||"—"}</td>
      </tr>`).join("")}
      </tbody></table></div>
    </section>
    <section class="section"><div class="section-head"><div><div class="eyebrow">Runs</div><h2>Recent batches</h2></div></div>
      <div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr>
        <th style="text-align:left;padding:8px">Started</th><th>Environment</th><th>Claimed</th><th>Mapped</th><th>Metadata</th><th>Reviews</th><th>Rate obs.</th><th>Failures</th>
      </tr></thead><tbody>${recent.map(r=>`<tr><td style="padding:8px;border-top:1px solid #eee">${esc(r.started_at||"")}</td><td style="text-align:center;border-top:1px solid #eee">${esc(r.environment)}</td><td style="text-align:center;border-top:1px solid #eee">${r.hotels_claimed}</td><td style="text-align:center;border-top:1px solid #eee">${r.hotels_mapped}</td><td style="text-align:center;border-top:1px solid #eee">${r.metadata_written}</td><td style="text-align:center;border-top:1px solid #eee">${r.reviews_written}</td><td style="text-align:center;border-top:1px solid #eee">${r.rate_observations_written}</td><td style="text-align:center;border-top:1px solid #eee">${r.failures}</td></tr>`).join("")||'<tr><td colspan="8" style="padding:12px">No audit runs yet.</td></tr>'}</tbody></table></div>
    </section>`;
}
