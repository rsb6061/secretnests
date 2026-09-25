#!/usr/bin/env bash
set -euo pipefail

echo "== SecretNests production deploy =="

npm run check

echo "Applying D1 migrations..."
npx wrangler d1 migrations apply DB --remote

echo "Building production seed files..."
node scripts/build-legacy-hotel-seed.mjs
node scripts/build-reddit-evidence-seed.mjs
node scripts/build-demo-seed.mjs

echo "Seeding hotel corpus..."
npx wrangler d1 execute DB --remote --file=.generated/legacy-hotels.sql --yes

echo "Seeding Reddit evidence..."
npx wrangler d1 execute DB --remote --file=.generated/reddit-evidence.sql --yes

echo "Seeding demo creator..."
npx wrangler d1 execute DB --remote --file=.generated/demo.sql --yes

echo "Verifying production D1 counts..."
HOTELS_JSON="$(npx wrangler d1 execute DB --remote --command='SELECT COUNT(*) AS n FROM hotels;' --json)"
REDDIT_JSON="$(npx wrangler d1 execute DB --remote --command='SELECT COUNT(*) AS n FROM reddit_evidence;' --json)"
CREATORS_JSON="$(npx wrangler d1 execute DB --remote --command='SELECT COUNT(*) AS n FROM creator_profiles;' --json)"
HOTELS="$(printf '%s' "$HOTELS_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s); console.log(j[0].results[0].n)})')"
REDDIT="$(printf '%s' "$REDDIT_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s); console.log(j[0].results[0].n)})')"
CREATORS="$(printf '%s' "$CREATORS_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s); console.log(j[0].results[0].n)})')"

echo "D1 counts: hotels=$HOTELS reddit_evidence=$REDDIT creators=$CREATORS"
test "$HOTELS" = "1066"
test "$REDDIT" = "143"
test "$CREATORS" -ge "1"

echo "Deploying Worker..."
npx wrangler deploy

echo "Smoke-testing live workers.dev deployment..."
BASE="https://secretnests.platesurf-dev-2026.workers.dev"

curl --fail --silent --show-error "$BASE/health" | grep -q '"ok":true'
curl --fail --silent --show-error "$BASE/" >/dev/null
curl --fail --silent --show-error "$BASE/search?q=hotel" >/dev/null
curl --fail --silent --show-error "$BASE/destinations" >/dev/null
curl --fail --silent --show-error "$BASE/hotel/fairmont-banff-springs" >/dev/null
curl --fail --silent --show-error "$BASE/@rebecca" >/dev/null
curl --fail --silent --show-error "$BASE/value" >/dev/null
curl --fail --silent --show-error "$BASE/compare/fairmont-banff-springs-vs-bawah-reserve" >/dev/null
curl --fail --silent --show-error "$BASE/sitemap.xml" >/dev/null
curl --fail --silent --show-error "$BASE/robots.txt" >/dev/null

echo "SecretNests production deploy verified: D1 counts correct and live Worker routes healthy."
