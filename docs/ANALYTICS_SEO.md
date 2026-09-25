# Analytics and SEO Configuration

## Runtime variables

The Worker supports these public configuration values:

- `GA4_MEASUREMENT_ID`
- `CLARITY_PROJECT_ID`
- `GOOGLE_SITE_VERIFICATION`

Do not commit provider secrets. GA4 measurement IDs, Clarity project IDs, and Search Console verification strings are public identifiers.

## First-party events

The Worker stores bounded D1 events including:

- `page_view`
- `hotel_view`
- `creator_view`
- `list_view`
- `value_view`
- `search`
- `outbound_booking_click`
- `contribution_seen`
- `contribution_cta_click`
- `contribution_landing_view`
- `contribution_hotel_select`
- `contribution_started`
- `contribution_submitted`
- `contribution_share`
- `contribution_referral_share`

A per-tab pseudonymous session ID is generated in browser session storage. Contribution source/campaign parameters are persisted in session storage and copied into event metadata and trip submissions. No raw IP address is intentionally persisted by this event layer.

## Contribution acquisition

Public campaign landing page: `/contribute`.

Admin acquisition dashboard: `/admin/contributions`.

Seed campaigns:

- `founder-network` — target 75
- `luxury-travel-creators` — target 125
- `guest-referrals` — target 100

Tracked URLs use `src` and `campaign` query parameters. Hotel-specific recruiting URLs should use `/add-your-trip?hotel={slug}&src={source}&campaign={campaign}`.

## Search / AI discovery

Production publishes and internally links:

- canonical hotel pages targeting hotel review / price / worth-it intent
- city guides at `/destinations/{country}/{city}`
- brand guides at `/brands/{brand}`
- comparison pages at `/compare/{hotel-a}-vs-{hotel-b}`
- value collections
- Hotel + BreadcrumbList + FAQPage JSON-LD on hotel pages
- CollectionPage JSON-LD on city and brand guides
- `/sitemap.xml`, `/robots.txt`, and `/llms.txt`

The sitemap includes the top-250 hotel cohort even when the legacy editorial description is thin because those pages now contain structured price, facts, traveler-evidence and FAQ sections. Comparison URLs are generated from geographically coherent top-250 hotel clusters.

Provider metadata, external review evidence and first-party traveler value remain separate layers. SEO copy must not convert provider review data into a SecretNests first-party opinion.

## Launch verification

After each release:

1. verify `/health`, homepage, `/brands`, `/compare`, and `/contribute`;
2. inspect a top-250 hotel page for Hotel and FAQPage JSON-LD;
3. verify city/brand/comparison internal links;
4. verify Search Console sitemap acceptance;
5. verify GA4/Clarity;
6. verify contribution funnel events and campaign attribution;
7. verify outbound booking redirects create `affiliate_clicks`.
