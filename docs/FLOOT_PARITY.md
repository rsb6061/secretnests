# Floot → GitHub/Cloudflare Parity Inventory

Legacy project: 64d44683-b9dc-4df5-844b-616285538754

Status meanings: migrated = equivalent/improved Cloudflare implementation; intentionally dropped = not part of the new runtime; still needed = operational capability remains before final shutdown.

## Public product

| Legacy capability | Status | Cloudflare replacement |
|---|---|---|
| homepage | migrated | value-led homepage |
| hotel search | migrated | token-aware search |
| cities/discovery | migrated | destinations + clean destination URLs |
| hotel detail | migrated | hotel/{slug} |
| boutique city landing pages | migrated | destinations/{country}/{city} |
| SEO/sitemap | migrated | canonical meta, JSON-LD, sitemap, robots, llms |
| legacy image proxy | intentionally dropped | rights-gated R2/approved remote media |
| review form | migrated/reframed | Add Your Trip |
| review list | migrated/reframed | creator stays, trip reports, value opinions |
| guest media upload | still needed operationally | R2 upload architecture built; creator auth disabled |

## Auth

| Floot login/password/OAuth | intentionally dropped | external provider-neutral auth |
| sessions | migrated schema | hashed opaque D1 sessions |

## Admin/data operations

| hotel cleanup/merge | partially migrated | QA automation + canonical aliases; merge UI only if needed |
| descriptions/highlights enrichment | migrated | 1,066 sanitized content records |
| batch price estimates | migrated data | legacy bands imported; live-rate source TBD |
| Google image fixer | intentionally dropped | copied legacy media prohibited |
| Reddit scrape/extract | intentionally dropped from launch runtime | 143 structured evidence records retained |
| leads admin | intentionally dropped | zero legacy leads and no longer core product |

## Final shutdown gate

Remove Floot from production only after the Cloudflare production checklist passes and no production request reaches a Floot hostname.