# SecretNests

SecretNests is a traveler-led luxury hotel value platform built around two questions:

1. **What should this hotel cost?**
2. **Who thinks it is worth it?**

Creators log real stays, what they paid, what they would pay again, and build public hotel lists. SecretNests aggregates those judgments into traveler-assessed value ranges and attributes booking revenue back to creators.

## Canonical production stack

- Source of truth: GitHub
- Runtime: Cloudflare Workers
- Database: Cloudflare D1
- Approved media storage: Cloudflare R2
- Analytics: first-party events + GA4 + Clarity
- SEO/discovery: canonical HTML, Hotel JSON-LD, sitemap, robots.txt, llms.txt
- Floot: legacy migration source only

There are no Floot runtime dependencies in the GitHub codebase.

## Migrated corpus

CI enforces the migration inventory:

- 1,066 core hotels
- 1,066 sanitized hotel-content records
- 143 structured Reddit evidence records
- 0 legacy Google Places image URLs in sanitized hotel content

Run:

```bash
npm install
npm run check
```

## Start here

1. [Project brain](docs/PROJECT_BRAIN.md)
2. [Current project state](docs/PROJECT_STATE.md)
3. [Architecture](docs/ARCHITECTURE.md)
4. [Production cutover](docs/PRODUCTION_CUTOVER.md)
5. [Data model](docs/DATA_MODEL.md)
6. [Image rights](docs/IMAGE_RIGHTS.md)

## Public product routes

- `/` — value-led homepage
- `/search` — token-aware hotel search
- `/destinations`
- `/destination/{slug}`
- `/hotel/{slug}`
- `/creators`
- `/@{handle}`
- `/@{handle}/lists/{slug}`
- `/add-your-trip`
- `/sitemap.xml`
- `/robots.txt`
- `/llms.txt`
- `/health`

## Launch flags

- `SUBMISSIONS_ENABLED=false` until production D1 is migrated and moderation/privacy are ready.
- `AUTH_MODE=disabled` until an external creator-auth provider is configured.

Public hotel discovery is intentionally independent of creator authentication.
