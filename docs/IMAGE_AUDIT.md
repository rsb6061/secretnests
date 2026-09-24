# Legacy Image Audit — 2026-09-24

The Floot corpus was audited before media migration.

## Findings

- 1,065 of 1,066 hotels have a legacy hero image.
- 1,065 of 1,066 hotels have non-empty legacy gallery arrays.
- Every audited hero image is served from the Google Places media endpoint.
- The stored Google Places media URLs include an API key query parameter.

## Migration decision

These URLs are **not** copied into R2 and are not treated as owned/canonical SecretNests media.

For the Cloudflare build:
- retain `google_place_id`;
- fetch/display Google Places imagery only through a compliant integration;
- replace high-value hotels over time with traveler-owned or hotel-authorized images;
- keep permanent R2 storage limited to media where storage rights are documented.

## Security / hygiene

Do not copy the legacy Places URLs into public GitHub data because the query strings contain a Google API key.

The Google key should be restricted in Google Cloud to the intended APIs and allowed origins/server usage. Rotate it if those restrictions are not already in place.

## Canonical media priority

1. verified traveler uploads;
2. hotel-authorized press/partner media;
3. licensed hotel-content API media;
4. compliant remote-only Google Places display;
5. licensed destination/editorial imagery.

Unknown or scraped imagery remains `needs_review` or `blocked`.
