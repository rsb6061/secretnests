# Project State — 2026-09-24

## Canonical stack

GitHub `rsb6061/secretnests` is the source of truth. Cloudflare Workers + D1 + R2 are the production target. Floot is migration source only.

## Data migrated

- 1,066 hotels
- 1,066 sanitized hotel content records
- 143 structured Reddit evidence records
- 0 copied legacy Google Places image URLs in sanitized content

Current QA: 0 duplicate hotel names, 0 duplicate Place IDs, 0 malformed Place IDs, 0 missing countries, 148 missing cities, 26 empty best-for arrays, 26 empty not-ideal-for arrays, 0 reversed price ranges, and 1 legacy booking URL. Missing cities/classifications remain review queues rather than guessed data.

## Product implemented

- token-aware hotel search
- clean destination URLs and redirects
- canonical hotel slugs plus legacy aliases
- traveler valuation engine with quartiles, median, confidence, current-price classification, and methodology version
- hotel comparison pages
- value-discovery and country-value pages
- creator profiles/lists plus a clearly labeled, noindex demo @rebecca profile
- Add Your Trip intake and admin moderation
- receipt/folio verification architecture
- affiliate-provider and booking-link abstraction
- media-ingest and rights-review workflow
- first-party analytics and zero-result search logging
- GA4, Clarity, and Search Console hooks
- privacy, terms, and review/affiliate disclosures
- sitemap, robots.txt, llms.txt, Hotel JSON-LD
- request logging and security controls

## Conservative launch flags

- `SUBMISSIONS_ENABLED=false`
- `AUTH_MODE=disabled`
- `VERIFICATION_UPLOADS_ENABLED=false`

Production also needs `RATE_LIMIT_SALT`, `ADMIN_EMAILS`, and optional analytics/Search Console identifiers.

## Authentication and media

Floot auth is intentionally not migrated. Provider-neutral identities and hashed D1 sessions are ready for an external auth provider later.

Public hotel media is limited to `owned_user_upload`, `hotel_authorized`, `licensed_api`, or `licensed_public`. Unknown/copied legacy media is not production media.

## Validation

Current main passed the full local Cloudflare-native CI suite in GitHub Actions run `36047840699`: audits, unit tests, D1 migrations/seeds, Worker startup, and representative public/admin route checks.

## Remaining external cutover work

1. Repair/create the Cloudflare application connection.
2. Run bootstrap for D1, R2, migrations, seeds, and Worker.
3. Attach apex + www domains and verify DNS/TLS.
4. Configure analytics/Search Console identifiers and admin/rate-limit secrets.
5. Choose external auth before enabling creator accounts.
6. Populate real booking providers/links beyond the single legacy booking URL.
7. Rotate/restrict the legacy Google Places key that appeared in old private Git history.
8. Run production parity checks, then remove Floot hosting/DNS dependencies.
