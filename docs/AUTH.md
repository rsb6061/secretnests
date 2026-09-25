# Authentication

SecretNests uses provider-neutral creator identities in D1 and an Auth0 OIDC login adapter.

## Runtime flow

1. A traveler can browse, open **Add Your Trip**, write a stay, and upload photos/receipt evidence without logging in.
2. SecretNests saves that work as a short-lived `contribution_drafts` record.
3. Authentication is required only when the traveler chooses **Publish my stay**.
4. `/login` starts Auth0 Authorization Code + PKCE with state and nonce. Google is the default connection.
5. `/auth/callback` verifies state, exchanges the code, verifies the RS256 ID token against Auth0 JWKS, verifies issuer/audience/expiry/nonce, and reads `/userinfo`.
6. `auth_identities` maps the immutable Auth0 subject to a `creator_profiles` row.
7. SecretNests issues its own opaque random session token. Only the SHA-256 hash is stored in `sessions`; the raw token is kept in a Secure, HttpOnly, SameSite=Lax cookie.
8. After the popup closes, the saved contribution review reloads and the signed-in creator can publish without re-entering the stay.

No Auth0 access or ID token is stored in the browser session or SecretNests database.

## Production routes

- login start: `https://secretnests.com/login`
- callback: `https://secretnests.com/auth/callback`
- session check: `https://secretnests.com/api/auth/me`
- logout: `https://secretnests.com/logout`

## Required Auth0 configuration

The GitHub -> Cloudflare release pipeline accepts these GitHub Actions secrets and deploys them as Worker secrets:

- `AUTH0_LOGIN_DOMAIN` (preferred) or `AUTH0_DOMAIN`
- `AUTH0_CLIENT_ID`
- `AUTH0_CLIENT_SECRET`

The Auth0 application must allow:

- callback URL: `https://secretnests.com/auth/callback`
- logout URL: `https://secretnests.com/`
- web origin: `https://secretnests.com`

`AUTH0_CONNECTION` defaults to `google-oauth2`.

If the required secrets are missing, contribution drafts still work, but the review page intentionally disables publishing and shows that Google sign-in setup is required.

## Profile ownership

Authenticated contributions use the creator attached to the Auth0 identity. The moderation/promotion path no longer assigns signed-in contributors to the old `system-community-intake` identity.

Existing demo profiles are not automatically claimed by matching a name or email. A verified administrative linking/merge should be used to convert an existing demo profile into a real creator profile; automatic name-based claiming is deliberately avoided.
