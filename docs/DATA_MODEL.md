# Data Model

## Creator profile

The profile is a first-class product surface rather than an account-settings page.

Derived profile stats include:

- stay count
- published trip report count
- public list count
- attributable bookings
- gross booking value
- creator earnings

Taste tags are structured and user-editable. Examples: boutique, design-heavy, quiet, food matters, beach, historic, service-first, dislikes paying for mediocre rooms.

## Value model

The atomic observation is a traveler's value opinion tied to a real stay:

- actual paid nightly rate
- would-pay-again amount
- worth-it-below threshold
- hard-to-justify-above threshold
- currency
- stay date/season
- room type
- verification status

Hotel-level value ranges should use robust statistics and expose sample size. They should never imply false precision when evidence is sparse.

## Lists

Lists are public creator-curated collections with optional ranked hotel items and creator notes. Lists are shareable/SEO-addressable and carry creator attribution through outbound booking clicks.

## Attribution

Every outbound booking click should be assigned a SecretNests click ID and partner sub-ID when supported. Confirmed conversions attach back to creator/list/hotel so creator earnings can be computed from actual commercial outcomes.

## Free-form contribution pipeline

The first-party contribution source of truth is intentionally split into stages:

1. `contribution_drafts` stores the traveler’s original free-form note plus a parser-produced candidate structure.
2. `contribution_draft_assets` stores uploaded R2 objects with an explicit role: public hotel photo or private receipt/folio.
3. The traveler reviews the extraction and confirms/corrects the structured values before publishing.
4. `trip_submissions` preserves `raw_text`, `parsed_json`, parser version, creator attribution, and the confirmation timestamp for moderation provenance.
5. Approval promotes the submission into canonical `stays`, `trip_reports`, and `value_opinions`.
6. `hotel_value_snapshots` is recomputed from non-demo canonical `value_opinions`.
7. Approved owned traveler photos are promoted to `media_assets`; private verification artifacts remain outside public hotel media.

Hotel pages keep three evidence layers separate: SecretNests first-party traveler stays, aggregate traveler value, and external/reddit evidence. External evidence never becomes a first-party value observation.

Demo stays remain available on explicitly labeled demo creator profiles, but demo observations are excluded from aggregate hotel valuation.
