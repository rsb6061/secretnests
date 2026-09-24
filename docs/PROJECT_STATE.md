# Project State — 2026-09-24

## Canonical ownership

- Source of truth: GitHub `rsb6061/secretnests`
- Production runtime target: Cloudflare Workers
- Relational data: Cloudflare D1
- Approved media storage: Cloudflare R2
- Legacy Floot project: migration source only; no production dependency should remain after cutover

## Migrated legacy corpus

Migration inventory is now enforced by `npm run audit:migration`:

- core hotels: **1,066**
- sanitized hotel content records: **1,066**
- structured Reddit hotel evidence records: **143**
- legacy image URLs copied into sanitized content: **0**
- first-party legacy hotel reviews: 0
- legacy hotel media uploads: 0
- legacy users: 1

The sanitized hotel-content export intentionally excludes legacy Google Places image URLs and embedded API credentials.

## Public product implemented in the Worker

- homepage/value proposition
- token-aware hotel search
- destination index and destination pages
- hotel detail pages
- traveler value snapshots
- structured Reddit evidence links
- comparable hotels
- creator directory and creator profiles
- creator lists
- staged Add Your Trip submission flow
- outbound booking attribution
- first-party analytics event endpoint
- GA4 and Clarity injection when configured
- Search Console verification meta support
- `/sitemap.xml`
- `/robots.txt`
- `/llms.txt`
- Hotel schema.org JSON-LD
- canonical URLs and `www` → apex redirect logic
- request IDs, structured request logging, and bounded 500 responses

## Authentication

Floot OAuth is not part of the Cloudflare codebase.

D1 already includes provider-neutral `auth_identities` and `sessions` tables. Creator account creation stays disabled until the external auth provider is selected and production callback URLs are available. Public discovery and staged trip intake do not depend on Floot auth.

## Media policy

SecretNests does not render copied legacy Google/Reddit/Tripadvisor imagery as canonical media.

R2 is reserved for media with an explicit rights state. Production-eligible rights states are:

- `owned_user_upload`
- `hotel_authorized`
- `licensed_api`
- `licensed_public`

Anything else remains non-displayable until reviewed.

## Remaining external cutover blockers

1. Repair/create the Cloudflare application connection for `rsb6061/secretnests`.
2. Create/attach D1 `secretnests` and R2 `secretnests-media` through the existing bootstrap workflow.
3. Configure GA4, Clarity and Search Console identifiers.
4. Attach `secretnests.com` and `www.secretnests.com` to the Worker and verify DNS/TLS.
5. Choose/configure external auth before enabling creator accounts.
6. Enable `SUBMISSIONS_ENABLED=true` only after D1 migration `0003_launch_readiness.sql` is live.
7. Rotate/restrict the legacy Google Places key that appeared in old private Git history.
8. Run production parity checks, then remove Floot from DNS/hosting.
