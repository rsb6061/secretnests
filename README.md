# SecretNests

SecretNests is a traveler-led luxury hotel value platform.

The core product is not another star-rating directory. It answers two questions:

1. **What should this hotel cost?**
2. **Who thinks it is worth it?**

Creators log real stays, what they paid, what they would pay again, and build public hotel lists. SecretNests aggregates those judgments into traveler-assessed value ranges and attributes booking revenue back to creators.

## Production architecture

- Source of truth: GitHub
- Runtime: Cloudflare Workers
- Primary database: Cloudflare D1
- Media: Cloudflare R2
- Analytics: GA4 / Clarity-ready event layer
- AI/search discovery: structured HTML + JSON-LD + llms.txt + sitemap
- Floot: migration source only; retire after parity

## Start here

Read:

1. [docs/PROJECT_BRAIN.md](docs/PROJECT_BRAIN.md)
2. [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md)
3. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
4. [docs/DATA_MODEL.md](docs/DATA_MODEL.md)
5. [docs/IMAGE_RIGHTS.md](docs/IMAGE_RIGHTS.md)

## Product primitives

- creator profiles and taste profiles
- verified stays
- trip reports
- paid price vs. "would pay again"
- traveler fair-value ranges
- public hotel lists
- booking attribution and creator earnings
- image provenance and rights tracking

The legacy Floot database currently contains the initial hotel corpus and Reddit-derived evidence. Raw Reddit body text is intentionally not treated as publishable first-party content.
