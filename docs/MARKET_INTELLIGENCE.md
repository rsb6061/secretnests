# Market intelligence workers

SecretNests keeps market data and first-party traveler valuation separate.

## Current-rate worker

The rate worker consumes `current_rate` tasks from the top-250 enrichment queue and writes observations to `hotel_rate_observations`.

Primary adapter: Booking.com Demand API v3.2.

Required secrets/variables:
- `BOOKING_DEMAND_API_TOKEN`
- `BOOKING_DEMAND_AFFILIATE_ID`
- optional `BOOKING_DEMAND_BASE_URL` (defaults to `https://demandapi.booking.com/3.2`)
- optional `RATE_BOOKER_COUNTRY` (defaults to `us`)
- optional `RATE_CURRENCY` (defaults to `USD`)

The worker maintains a durable mapping between a SecretNests hotel and provider property ID in `hotel_provider_mappings`. If a mapping is missing, it performs a bounded coordinate search and accepts only a sufficiently similar nearby name match.

Each refresh requests two standardized shopping windows: two adults, one room, two nights, approximately 14 and 45 days forward. The observation stores the exact stay dates and rate basis. Complete rate tasks become eligible again after 24 hours, so a completed task is not a permanent terminal state.

A current market rate may update `hotel_value_snapshots.current_price`. It never becomes a `value_opinion`, a stay, or a traveler willingness-to-pay observation.

## External-evidence worker

The evidence worker consumes `external_evidence` tasks and writes only to:
- `hotel_external_evidence`
- `hotel_field_provenance`

It uses OpenAI Responses web search when `OPENAI_API_KEY` is configured. `EXTERNAL_EVIDENCE_MODEL` can override the default model.

The worker blocks the official hotel domain and Reddit, asks for independent traveler-experience evidence, requires structured output, and discards any returned source URL that is not present in the web-search citations/sources for that response. Stored summaries are paraphrases, not copied review text.

External evidence cannot write to `stays`, `value_opinions`, or first-party traveler fair-value fields.

## Operations

Admin drains:
- `POST /api/admin/enrichment/drain-rates`
- `POST /api/admin/enrichment/drain-evidence`

Cron behavior:
- current-rate refresh runs with the hourly market/affiliate automation;
- external evidence drains one hotel at a time with the bounded enrichment cron;
- the daily priority rebuild recomputes completeness and top-250 ranking.

Run logs live in `hotel_rate_sync_runs` and `hotel_evidence_sync_runs`.
