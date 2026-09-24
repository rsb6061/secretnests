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
