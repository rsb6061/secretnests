# Analytics and SEO Configuration

## Runtime variables

The Worker already supports these public configuration values:

- `GA4_MEASUREMENT_ID`
- `CLARITY_PROJECT_ID`
- `GOOGLE_SITE_VERIFICATION`

Do not commit provider secrets. GA4 measurement IDs, Clarity project IDs, and Search Console verification strings are public identifiers and can be configured as Worker variables once the Cloudflare project exists.

## First-party events

The Worker stores bounded event rows in D1:

- `page_view`
- `hotel_view`
- `creator_view`
- `list_view`
- `value_view`
- `search`
- `outbound_booking_click`

A per-tab pseudonymous session ID is generated in browser session storage. No raw IP address is intentionally persisted by this event layer.

## Conversion path

Target measurement path:

visitor/session → search → hotel → creator/list → outbound provider → booking conversion → booking value → commission → creator earnings

The schema already contains:

- `affiliate_clicks`
- `booking_conversions`
- `creator_earnings`

Provider-specific conversion webhooks/postbacks should be added only after a booking partner is selected.

## Search / AI discovery

Production publishes:

- canonical tags
- Hotel JSON-LD
- `/sitemap.xml`
- `/robots.txt`
- `/llms.txt`

Hotel pages should remain indexable only when `is_published=1`.

## Launch verification

After DNS cutover:

1. open the homepage and a hotel page;
2. verify GA4 realtime activity;
3. verify a Clarity session;
4. verify Search Console ownership;
5. submit `https://secretnests.com/sitemap.xml`;
6. inspect Hotel JSON-LD;
7. verify `www` redirects to apex;
8. verify first-party `analytics_events` receives page views;
9. verify outbound booking redirects create `affiliate_clicks`.
