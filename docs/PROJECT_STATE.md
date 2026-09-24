# Project State — 2026-09-24

## Legacy Floot source

Audited legacy project: `SecretNests`.

Database counts at migration start:

- hotels: 1,066
- Reddit posts stored: 1,409
- extracted Reddit hotel mentions: 143
- first-party hotel reviews: 0
- hotel media uploads: 0
- users: 1

Connected legacy services include OpenAI, Reddit API credentials, Google Maps/Places, Travelpayouts, Floot Postgres and Floot auth.

## Migration policy

We will migrate the useful hotel corpus and structured Reddit-derived evidence.

We will **not** treat copied Reddit post bodies as first-party publishable content. Source URLs / identifiers and derived structured evidence can be retained for internal provenance, subject to source terms and future review.

Legacy image URLs must be classified by provenance before becoming canonical production media.

## Current phase

1. Build maintainable Cloudflare-native source.
2. Add D1 schema for creators, stays, valuations, lists, attribution, and media provenance.
3. Export/migrate legacy hotel corpus and structured Reddit evidence.
4. Create D1 and R2 resources in Cloudflare.
5. Attach GitHub build/deploy.
6. Run parity audit.
7. Cut DNS/runtime to Cloudflare.
8. Remove remaining Floot dependencies.
