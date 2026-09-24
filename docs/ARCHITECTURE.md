# Architecture

## Runtime

A single Cloudflare Worker serves public HTML routes, JSON APIs, creator/list/hotel pages, sitemap/llms.txt/robots, attribution redirects, and media-upload authorization.

## Storage

### D1

Canonical relational/product data:

- hotels
- creator_profiles
- stays
- trip_reports
- value_opinions
- lists
- list_items
- affiliate_clicks
- booking_conversions
- creator_earnings
- media_assets
- reddit_evidence

### R2

Canonical user- or partner-supplied media only when SecretNests has rights to store it.

Do not blindly mirror arbitrary hotel-site, Google, Tripadvisor, blog, or Reddit images into R2.

## Authentication

Do not port Floot OAuth as a permanent dependency. Use an external auth provider or Cloudflare-compatible session layer.

## Analytics

Emit durable first-party events for hotel views, creator/list views, value views, outbound booking clicks, conversions, trip-report publishing, list creation and list-item additions.

Attribution IDs should survive outbound affiliate redirects through sub-ID fields whenever a partner supports them.
