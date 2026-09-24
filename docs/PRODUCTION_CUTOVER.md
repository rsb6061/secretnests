# Production Cutover Checklist

## Cloudflare

- [ ] Worker application `secretnests` exists
- [ ] GitHub repo `rsb6061/secretnests` is attached
- [ ] D1 database `secretnests` exists
- [ ] R2 bucket `secretnests-media` exists
- [ ] migrations 0001–0003 applied
- [ ] 1,066 hotel rows seeded
- [ ] 143 Reddit evidence rows seeded
- [ ] `npm run check` passes before deploy

## Domain

Canonical origin is `https://secretnests.com`.

- [ ] route `secretnests.com/*` → Worker
- [ ] route `www.secretnests.com/*` → Worker
- [ ] apex DNS proxied through Cloudflare
- [ ] www DNS proxied through Cloudflare
- [ ] Universal SSL active
- [ ] www redirects permanently to apex
- [ ] canonical tags use apex
- [ ] sitemap uses apex
- [ ] robots sitemap uses apex

Do not cut Floot off until the Cloudflare Worker passes the parity checks below.

## Analytics / SEO configuration

Public identifiers may be configured as Worker variables:

- `GA4_MEASUREMENT_ID`
- `CLARITY_PROJECT_ID`
- `GOOGLE_SITE_VERIFICATION`

After deployment:

- [ ] GA4 receives page/session traffic
- [ ] Clarity session appears
- [ ] Search Console ownership verifies
- [ ] submit `https://secretnests.com/sitemap.xml`
- [ ] verify hotel pages expose Hotel JSON-LD
- [ ] verify robots and llms files return 200
- [ ] outbound booking clicks insert attribution rows

## Authentication

Current production flag: `AUTH_MODE=disabled`.

Floot OAuth is intentionally not supported in the Cloudflare runtime. Before creator accounts are enabled:

- [ ] choose external provider
- [ ] configure production callback/logout URLs
- [ ] map provider subject → `auth_identities`
- [ ] create hashed opaque sessions in D1
- [ ] use Secure + HttpOnly + SameSite=Lax cookies
- [ ] add CSRF protection on state-changing creator actions
- [ ] add account deletion/export flows

## Add Your Trip

Current production flag: `SUBMISSIONS_ENABLED=false`.

The anonymous staged intake endpoint is already implemented and writes only to `trip_submissions`. Before enabling it:

- [ ] migration 0003 is live
- [ ] add Turnstile or equivalent abuse protection if traffic warrants it
- [ ] define review/moderation workflow
- [ ] publish privacy/terms language covering contact email and submitted stay data
- [ ] set `SUBMISSIONS_ENABLED=true`

## Media rights

Only render/store production media when `rights_status` is one of:

- `owned_user_upload`
- `hotel_authorized`
- `licensed_api`
- `licensed_public`

Do not copy legacy Google Places, Tripadvisor, Reddit, Instagram, blog, or hotel-site images into R2 without an applicable license/permission.

## Parity checks before Floot shutdown

- [ ] homepage
- [ ] hotel search
- [ ] destination page
- [ ] at least 25 representative hotel pages
- [ ] creator directory/profile/list routes
- [ ] Add Your Trip disabled/enabled state as intended
- [ ] outbound redirect
- [ ] analytics event write
- [ ] sitemap/robots/llms
- [ ] 404 and 500 behavior
- [ ] mobile layout
- [ ] canonical redirect
- [ ] no request to a Floot hostname or Floot API
- [ ] Cloudflare logs show production traffic
- [ ] Floot receives no production traffic

Then preserve a final legacy backup/checkpoint and remove Floot hosting/DNS dependencies.
