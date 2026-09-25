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

echo "Deploying Worker..."
npx wrangler deploy

echo "SecretNests production deploy complete."
