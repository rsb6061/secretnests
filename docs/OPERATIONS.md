# Operations

## GitHub / Cloudflare

Repository: `rsb6061/secretnests`

Canonical runtime target:
- Worker: `secretnests`
- D1: `secretnests`
- R2: `secretnests-media`

The manual GitHub Actions workflow is `.github/workflows/deploy.yml`.

Required repository Actions secrets:
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Use the same Cloudflare account as the domain.

## First production bootstrap

1. Create D1 database `secretnests`.
2. Replace `REPLACE_WITH_D1_DATABASE_ID` in `wrangler.toml`.
3. Create R2 bucket `secretnests-media`.
4. Add the two GitHub Actions secrets.
5. Run workflow action `migrate-db`.
6. Run workflow action `seed-legacy-hotels`.
7. Run workflow action `deploy`.
8. Smoke-test `/health`, homepage, and `/api/hotels`.
9. Attach `secretnests.com` only after parity checks.
10. Keep Floot intact until the complete content/image/auth parity audit is finished.

## Legacy corpus

The repository currently contains the 1,066-hotel core corpus exported from Floot in deterministic JSON chunks under `data/legacy/`.

This first export intentionally excludes long descriptions/highlights and uncertain image URLs. Those remain in Floot until the content-rights and full-content migration pass is complete.
