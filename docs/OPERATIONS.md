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

1. Add repository Actions secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.
2. Open **Actions → SecretNests Cloudflare → Run workflow**.
3. Choose action **bootstrap**.
4. The workflow will:
   - find or create D1 database `secretnests`;
   - find or create R2 bucket `secretnests-media`;
   - apply the D1 migrations;
   - seed the 1,066-hotel legacy corpus;
   - seed the structured Reddit evidence;
   - dry-run and deploy the `secretnests` Worker.
5. Smoke-test `/health`, homepage, and `/api/hotels`.
6. Attach `secretnests.com` only after parity checks.
7. Keep Floot intact until the complete content/image/auth parity audit is finished.

The repository intentionally keeps `REPLACE_WITH_D1_DATABASE_ID` in `wrangler.toml`. GitHub Actions resolves the actual D1 UUID from Cloudflare and patches the checked-out config for each run, so an account-specific UUID does not need to be committed.

## Legacy corpus

The repository currently contains the 1,066-hotel core corpus exported from Floot in deterministic JSON chunks under `data/legacy/`.

This first export intentionally excludes long descriptions/highlights and uncertain image URLs. Those remain in Floot until the content-rights and full-content migration pass is complete.
