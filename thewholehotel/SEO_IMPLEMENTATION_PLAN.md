# The Whole Hotel — SEO and product launch specification

Status: **prelaunch**. Work in this directory is not deployed, and `thewholehotel.com` ownership/DNS has not been confirmed by this repository.

## Positioning

The Whole Hotel — Find and book an entire boutique hotel for your private group.
Primary transactional search intent: **hotel buyouts** / **full hotel buyout** / **buy out a hotel**.
Secondary: **boutique hotel buyout**, **hotel buyouts for weddings**, **exclusive use hotels**, **private hotel buyout for corporate retreats**, **hotel buyout cost**.

The site is a dedicated consumer brand, not a duplicate of SecretNests hotel pages. Source-of-truth infrastructure can be shared in the future, but the new hostname has its own canonical URLs, sitemap and Search Console property.

## Design direction inspired by Onefinestay

Take the interaction architecture, not its copyrighted styling/assets:
- Desktop results left (60%) + synchronized location map right (40%), list/map switch on mobile.
- Search bar for destination, dates/flexible date range, overnight guests, hotel room count, budget.
- Filters: **complete exclusivity**, onsite sleepers, event guests, ceremony permission, noise curfew, child access, minimum nights, dining/F&B, outside vendors.
- Cards lead with licensed hotel images, location, room count, max overnight guests, accessible event capacity, published all-in buyout pricing if genuinely verified.
- Until pricing is directly verified, show **Request a tailored buyout quote**. Never invent nightly pins, event capacities, availability, rates or exclusivity.
- Inquiry includes group size, occasion, date window, budget, destination, and optional overflow hotel room block.

## Information architecture

| Page | Target search intent | Indexing rule |
| --- | --- | --- |
| `/` | hotel buyouts; rent an entire boutique hotel | Index after live inquiry flow and meaningful verified supply |
| `/destinations` | browse boutique hotel buyouts by destination | Index once destinations have qualifying inventory |
| `/destinations/{slug}` | hotel buyouts in Palm Springs, Tuscany, etc | Index only with distinctive verified supply, real local expertise and content |
| `/occasions/weddings` | hotel buyouts for weddings | Index only with occasion-specific contract/use-case info |
| `/occasions/birthdays` | hotel buyouts for milestone birthdays | Index only with differentiated real packages |
| `/occasions/retreats` | hotel buyouts for corporate retreats | Index only with verified meeting/group info |
| `/hotels/{slug}` | exact-property exclusive-use hotel inquiry | Index only when full-property buyout confirmed by supplier |
| `/guides/hotel-buyout-cost` | how much does a hotel buyout cost | Index after a genuinely useful cost breakdown with attributable inputs |
| `/guides/hotel-buyout-vs-room-block` | buyout vs room block | Index after a practical comparison with examples |

**Avoid keyword cannibalization:** Main head term belongs to `/`; do not make a duplicate `/hotel-buyouts` page with the same content. Optional `/hotel-buyouts` 301 redirect to `/`.

## Homepage SEO

- Title: `Hotel Buyouts: Rent an Entire Boutique Hotel | The Whole Hotel`
- H1: `An entire hotel. Just your people.`
- Meta description: `Explore boutique hotel buyouts for weddings, milestone birthdays, family gatherings and retreats. Compare exclusive-use options and request a tailored group quote.`
- Useful on-page text: what a full hotel buyout entails; who it serves; what is included; how minimum stays, room costs, venue fees, F&B, deposits and cancellation vary; how to inquire; buyer examples.
- Keep navigation plain HTML links and core listings server-rendered where possible. Avoid JS-only content for crawlable hotel and destination pages.

## Data model, verification, and provenance

Table `buyout_candidates`: canonical property identity, region/country, latitude/longitude, room_count, overnight_capacity, event_capacity, buyout_type, buyout_status, public_source_url, source_excerpt_date, source_confidence, operating_contact, verified_at, verified_by.
Table `buyout_terms`: currency, valid_from, valid_to, min_nights, buyout_base, room_revenue_min, venue_fee, fnb_min, tax_fees, exclusivity_scope, deposits, cancellation policy, date_policy, source_contract_reference, approved_for_publication.
Table `buyout_inquiries`: occasion, destination, arrival/departure flexibility, nights, overnight_guests, event_guests, rooms_needed, budget, consent, qualification_status.

**Publication gate:** candidates remain unpublished/unverified until supplier confirmation. Supplier images must be owned, expressly licensed, or sourced via permitted API and track attribution where required. Do not copy article text/images or user-submitted Reddit photos.
**Pricing gate:** no numeric `Offer` structured data without valid and currently offerable supplier-approved price. No fake ratings/reviews/availability or `FAQPage` rich-result manipulation.

## Structured data and technical SEO

- Unique title, description, canonical and OG tags per indexable route.
- `Organization`, `WebSite`, `BreadcrumbList` and appropriate `ItemList` for genuine catalog pages. Use `Hotel`/`LodgingBusiness` on factual property pages; do not assert owned inventory.
- `sitemap.xml` includes only indexable canonical pages with real content. `robots.txt` points to sitemap.
- Filters use query params and canonicalize to the main landing; avoid indexing every empty permutation.
- Responsive images with explicit width/height, lazy loading for nonhero assets, descriptive alt text, and rights provenance.
- Search Console domain property plus GA4 with event names `search_submitted`, `results_viewed`, `buyout_inquiry_started`, `buyout_inquiry_submitted`, `quote_issued`, `booking_completed`.
- Route performance: prioritize LCP on image-led mobile pages; lazy-load map, cluster markers, avoid client-side-only rendered main content.
- Launch only after domain verification, live working inquiry path, email/CRM routing, privacy terms, and supply quality checks.

## First 30-day experiment

1. Qualify 20 research properties (contracted or supplier-confirmed exclusivity).
2. Collect permission for at least two licensed images per listing and consistent minimum price or quote-only policy.
3. Publish a small set of strong destination pages (not dozens of doorway variants).
4. Use buyer-paid inquiries and partner distribution before relying on organic volume.
5. Monitor qualified inquiry cost, quote response rate, booking conversion, and revenue per acquired customer.

## Research sources

- Sebastian Luxe Travel (current article shortlist plus body-only Amanvari): https://www.sebastianluxetravel.com/blog/best-boutique-hotels-full-buyout
- Reddit discussion (historical self-reported lead discovery): https://www.reddit.com/r/BigBudgetBrides/comments/1mnfz5j/the_best_full_buyout_hotels_for_weddings/
- Onefinestay search UI for interaction reference only: https://www.onefinestay.com/search/amalfi-coast/1001

Both datasets are *research candidates*, not licensed property inventory. Full combined CSV/XLSX available from the conversation, pending import into this repo.
