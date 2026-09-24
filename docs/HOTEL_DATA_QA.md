# Hotel Data QA — 1,066-property legacy corpus

Audited 2026-09-24 against the Floot source database and the sanitized GitHub export.

| Check | Result |
|---|---:|
| Hotels | 1,066 |
| Duplicate hotel-name groups | 0 |
| Duplicate Google Place ID groups | 0 |
| Missing country | 0 |
| Missing city | 148 |
| Malformed Google Place IDs | 0 |
| Thin descriptions (<80 chars) | 0 |
| Empty highlights | 0 |
| Empty best-for | 26 |
| Empty not-ideal-for | 26 |
| Reversed price ranges | 0 |
| Booking URLs present | 1 |
| Booking URLs missing | 1,065 |
| Legacy 0–300 price-band records | 60 |

The 60 records with price_estimate_min=0 are legacy price-band values, not claims that a room costs $0. They are preserved as the under-$300 band.
The 148 missing-city rows are not auto-filled because many are remote resorts and guessing a municipality would reduce data quality.

## Safe automatic fixes

The D1 seed now trims string fields, generates clean lowercase canonical slugs from hotel names, preserves each legacy slug in hotel_slug_aliases, redirects old hotel URLs, and preserves price bands rather than inventing precise rates.

Only one legacy hotel currently has a booking URL. Its Royal Mansour Marrakech URL was checked on 2026-09-24 and still resolves to the hotel's official Marrakech site. The repo includes npm run check:booking-links for network validation. Future booking inventory belongs in the hotel_booking_links provider layer.

npm run qa:hotels continuously checks corpus count, duplicate names, duplicate Place IDs, malformed Place IDs, reversed price ranges, content completeness, and canonical slug changes.

SEO audit also found 534 legacy-style long title candidates and 760 long raw descriptions. Production now uses bounded metadata helpers with a 66-character title target and 165-character meta-description target while preserving fuller editorial body copy.
