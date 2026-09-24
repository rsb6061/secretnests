# Image Rights Policy

SecretNests must know **why it has the right to display every canonical image**.

## Preferred sources

1. Traveler-uploaded images with an explicit non-exclusive display license.
2. Hotel / hotel-group press or partner media with documented permission or license.
3. Licensed hotel-content/distribution APIs where the contract permits display and any required caching/storage.
4. API-served imagery such as Google Places only in the manner permitted by that provider's current terms.
5. Properly licensed editorial/destination imagery with required attribution.

## Do not canonicalize by default

- Google Images search results
- copied hotel website images
- Tripadvisor images
- blog / magazine photography
- Reddit-hosted images
- social-media images

Public availability is not a commercial reuse license.

## Required provenance fields

Every media asset should record source type/URL/provider, photographer, license, attribution text, rights status, permission reference, original URL, R2 key where storage is permitted, creator user ID, and timestamps.

## Rights states

- `owned_user_upload`
- `hotel_authorized`
- `licensed_api`
- `licensed_public`
- `remote_display_only`
- `needs_review`
- `blocked`

Unknown legacy images should migrate as `needs_review`, not as trusted canonical media.
