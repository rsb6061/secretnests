# Architecture

## Ownership

GitHub is canonical source. Cloudflare is the intended production runtime. Floot is a read-only migration source during cutover and is not referenced by production Worker code.

## Runtime

A single Cloudflare Worker serves:

- public HTML routes
- search and destination discovery
- hotel, creator, and list pages
- staged trip intake
- JSON APIs
- first-party analytics collection
- outbound booking attribution redirects
- sitemap, robots.txt, and llms.txt
- canonical redirects
- request logging and bounded error responses

## Storage

### D1

Canonical relational/product data:

- hotels
- creator_profiles
- stays
- trip_reports
- value_opinions
- hotel_value_snapshots
- lists
- list_items
- affiliate_clicks
- booking_conversions
- creator_earnings
- media_assets
- reddit_evidence
- analytics_events
- auth_identities
- sessions
- stay_verification_artifacts
- trip_submissions

### R2

R2 is only for user-, hotel-, or provider-supplied media SecretNests has a documented right to store.

Production-display rights states:

- owned_user_upload
- hotel_authorized
- licensed_api
- licensed_public

Do not mirror Google Places, Tripadvisor, Reddit, Instagram, blogs, or hotel-site imagery into R2 merely because it is publicly viewable.

## Authentication

Floot OAuth is not supported by the Cloudflare runtime.

Creator authentication is provider-neutral:

external identity provider → auth identity → hashed opaque D1 session → creator profile

The schema is ready, but account creation remains disabled until a production provider, callback URLs, session-cookie policy, CSRF controls, and account lifecycle flows are configured.

## Search

Search is token-aware rather than exact-phrase dependent. Each normalized query token may match hotel name, city, country, description, highlights, or best-for metadata. All tokens must match somewhere in the hotel document.

## Analytics

Three layers are supported:

1. first-party D1 events with a per-tab session identifier;
2. GA4 when `GA4_MEASUREMENT_ID` is configured;
3. Microsoft Clarity when `CLARITY_PROJECT_ID` is configured.

Search Console verification can be injected with `GOOGLE_SITE_VERIFICATION`.

Attribution IDs should survive outbound affiliate redirects through partner sub-ID fields whenever supported.

## Domain

Canonical origin is `https://secretnests.com`.

The Worker permanently redirects `www.secretnests.com` to the apex host. Cloudflare custom-domain routes and DNS/TLS remain an external cutover step because the Cloudflare project connection is not yet healthy.
