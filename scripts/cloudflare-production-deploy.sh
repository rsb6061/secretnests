#!/usr/bin/env bash
set -euo pipefail

echo "== SecretNests production deploy =="

npm run check

echo "Deploying Worker..."
npx wrangler deploy

echo "Worker deployed. Production D1 bootstrap now runs through the bound Worker on the temporary scheduled trigger."
