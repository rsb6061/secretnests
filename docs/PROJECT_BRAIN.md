# SecretNests Project Brain

## Product thesis

SecretNests is a **valuation and taste network for high-end hotels**.

It should not compete with Booking, Google, Tripadvisor, or luxury magazines on generic inventory. Its defensible data is:

- what a traveler actually paid;
- what that traveler believes the stay was worth;
- what price they would happily pay again;
- the traveler's public taste profile and lists;
- aggregated traveler-assessed fair-value ranges;
- attributable booking outcomes and creator earnings.

## Core profile

A creator profile should read more like a travel portfolio than a review account:

- @handle
- stays
- published trip reports
- public lists
- booking revenue generated
- creator earnings
- taste profile

Example lists:

- Hotels I'd pay $500+ for again
- Luxury hotels that are actually worth $1,000
- Great hotels ruined by bad rooms
- Best Italy hotels I've personally stayed at
- Places I'd honeymoon again
- $700+ hotels I thought were a ripoff

## Hotel valuation

Every hotel can expose:

- traveler paid price
- traveler "would pay" price
- SecretNests traveler range
- current observed price
- value classification

The valuation should be price-sensitive. A good hotel can still be bad value at the current rate.

## Creator monetization

Creators are not paid merely for leaving a positive review.

Revenue share should be tied to attributable commercial outcomes such as confirmed bookings. Review sentiment must not affect eligibility or payout.

## Canonical engineering ownership

GitHub is the durable source of truth. Cloudflare is the production runtime. Floot is only a migration source and should have no production dependency after parity.
