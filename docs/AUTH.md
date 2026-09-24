# Authentication Plan

SecretNests intentionally does not carry Floot OAuth/session code into production.

## Current state

`AUTH_MODE=disabled`

Public discovery, hotel pages, destination pages, creator portfolios, lists, outbound attribution, and the staged Add Your Trip queue work without creator authentication.

## Production auth contract

When creator accounts are enabled, use an external OIDC/OAuth provider and map identities into the provider-neutral D1 schema:

1. external provider authenticates the user;
2. callback verifies state/nonce and provider response;
3. `auth_identities` stores provider + immutable provider subject;
4. SecretNests creates an opaque random session token;
5. only a hash of that token is stored in `sessions`;
6. browser receives the raw token in a Secure, HttpOnly, SameSite=Lax cookie;
7. session resolves to `creator_profiles`.

Do not use a Floot callback, Floot session token, or Floot-hosted auth endpoint.

## Required controls before enabling

- PKCE/state/nonce as required by the provider
- Secure + HttpOnly cookies
- CSRF protection for state-changing actions
- short bounded session expiry with revocation
- login/logout callback allowlists
- account export/deletion
- email-verification semantics
- rate limiting on auth endpoints
- no auth tokens in analytics or logs

## Suggested production URLs

- login start: `https://secretnests.com/login`
- callback: `https://secretnests.com/auth/callback`
- logout return: `https://secretnests.com/`

These are reserved architecture targets, not active endpoints yet.
