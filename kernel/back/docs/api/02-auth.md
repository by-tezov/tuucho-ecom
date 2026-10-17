# Auth

Genuinely cross-origin (see Gallery API's CORS note), credentials-enabled
CORS. Every response is `{"success": boolean, ...}` — errors are
`{"success":false,"error":{"code":"string", ...}}`.

Session model: a short-lived signed access token (`JWT_ACCESS_TOKEN_TTL`,
returned in the JSON body, sent back as `Authorization: Bearer <token>`) plus
a separate long-lived refresh token (opaque, httpOnly cookie, `Path=/auth`,
`SameSite=Lax`, `Secure` outside development, rotated on every use) — never
one long-lived JWT, so logout/password-reset/
account-deletion can actually kill a session server-side instead of waiting
out an expiry. The access JWT is explicitly HS256 and pins its API issuer,
audience, and `access` token type. `rememberMe: true` at login gives the refresh token
`JWT_REFRESH_TOKEN_TTL_REMEMBER` (30d) and a persistent cookie with the same
expiry. Otherwise the cookie has no `Expires`/`Max-Age` and ends with the
browser session; its server-side safety ceiling remains
`JWT_REFRESH_TOKEN_TTL_SESSION` (1d). Rotation preserves the original cookie
persistence mode. A refresh token reused after it's already been rotated once
is treated as a theft signal — its entire rotation family is revoked.

### `POST /auth/register`

Rate-limited (30/min/IP, counts every request). Body:

```json
{ "email": "string", "password": "string", "gdprConsent": { "accepted": true }, "language": "en" }
```

`password` must satisfy `PASSWORD_MIN_LENGTH`..`PASSWORD_MAX_LENGTH` plus
upper/lower/digit/special character (traditional-complexity policy —
`400 weak_password` with a `violations` array otherwise, including `tooLong`).
`409 email_already_used` if the (case-insensitive) email is already registered
(deliberate UX; mitigated by auth rate limits — login/reset stay
non-enumerating). On success: `201`, sets the
refresh-token cookie, sends a confirmation email, response
`{"success":true,"user":{...},"accessToken":"string","accessTokenExpiresAt":"ISO"}`.
Account is fully usable immediately — email verification isn't a gate.

Customer string/quantity ceilings and JSON body size are configured via
`FIELD_*` / `PASSWORD_MAX_LENGTH` / `RATE_*` in `.env/.public.env` (see
[Input limits and rate limits](#input-limits-and-rate-limits)).

### `POST /auth/register-otp-skip`

Rate-limited (`authRateLimiter`). Body:
`{ "email": "string", "gdprConsent": { "accepted": true }, "language": "en" }`.
The signup-OTP screen's "confirm my email later" escape hatch — creates the
account immediately instead of making the customer wait for/enter the code,
mirroring `/auth/register`'s behavior exactly (unverified, a real
confirmation-link email still goes out, account is fully usable right away).
`409 email_already_used` if the (case-insensitive) email is already
registered — no session issued; an existing account can never be entered
this way, only via a correct password or a validated OTP. On success: `201`,
sets the refresh-token cookie, response
`{"success":true,"created":true,"user":{...},"accessToken":"string","accessTokenExpiresAt":"ISO"}`.

### `POST /auth/login`

Rate-limited (per-IP, `LOGIN_LOCKOUT`, `<duration>:<count>`)
**and** per-account throttled after the same threshold of failed attempts
against that specific account. Body: `{ "email", "password", "rememberMe": boolean }`.
`401 invalid_credentials` for either a wrong password or an unknown email
(never reveals which). While the per-account window is active, every password
attempt, the right one included, gets that same `401 invalid_credentials` (no
`423`, which would reveal that the address has an account). The owner is not
locked out: an OTP or social sign-in is still accepted during the window and
clears it.

**Cancelled password.** The first time an email+password account is entered
through a path that proves inbox control from the sign-in screen, its password
is cancelled and every existing session revoked (account pre-hijacking guard:
anyone can register an address they do not own):

- first Google, Facebook or Apple sign-in onto that account (including
  `POST /auth/social/create` and `POST /auth/social/link/verify`), reason
  `social_link`;
- an OTP sign-in (`POST /auth/verify-otp`) or `POST /auth/manage-guest-order`
  while the email was never verified, reason `email_verification`.

Linking a provider from the signed-in profile keeps the password. A later
password login that types the cancelled password gets
`401 {"success":false,"error":{"code":"password_cancelled","reason":"social_link"|"email_verification"}}`
so the front can tell the customer to sign in with a code and set a new
password in their profile; any other password gets `invalid_credentials`.
Setting a new password clears the state. If the account
was `pending_deletion`, a successful login
reactivates it automatically — response includes `"reactivated": true` so
the front can show a "welcome back" notice. Response otherwise same shape as
register's. Passwordless accounts (OTP signup, `hasPassword: false`) cannot
log in here — they get the same `401 invalid_credentials` as a wrong
password; use `POST /auth/request-otp` purpose `login` instead.

### `POST /auth/request-otp`

Rate-limited (`authRateLimiter`). Body:
`{ "email": "string", "purpose": "signup" | "login", "gdprConsent": { "accepted": true }, "language": "en" }`.
`gdprConsent` and `language` are required only for `signup` of a **new** address.

- `signup`: `gdprConsent` is required only when the address is **not** already registered (same split as `POST /auth/login-or-register`). A free address without consent → `400 invalid_request`. Does **not** create a user yet — stores a pending signup with the OTP when the address is free. If the address is **already registered**, sends a **login** OTP instead (consent not required) and still returns `{"success":true}` (no `email_already_used`). Permanently security-locked, deleted, or send-capped existing accounts are a silent skip with the same success body; a temporary failed-login throttle does not suppress delivery because the valid OTP must remain an owner recovery path. `429 resend_limit_exceeded` only when a *new* address hits the `AUTH_OTP_COOLDOWN` gap since its last send. On success (new or existing) the customer receives a 6-digit code (`AUTH_OTP_TOKEN_TTL`, default 10m) when a send actually happened.
- `login`: always `{"success":true}` whether or not the address exists, is locked, or hit its send cap (silent skip — no enumeration).

### `POST /auth/verify-otp`

Rate-limited (`authRateLimiter` plus the login failure limiter). Body:
`{ "email": "string", "code": "string", "purpose": "signup" | "login", "rememberMe": boolean }`.
`rememberMe` applies only to `login` (and to signup-form connects that fall through to a login OTP).
Wrong guesses increment `failed_attempts` on the live code and burn it at
`AUTH_OTP_MAX_ATTEMPTS`. Every verify response is held to at least
`AUTH_OTP_VERIFY_DELAY` (success and failure).

- `signup`: if a pending **signup** OTP matches, creates the user with no password, `emailVerified: true`, stamps GDPR from the pending OTP, sets the refresh-token cookie, **no** confirmation-link email (`201` session envelope with `"created": true`). If the address became taken between request and verify, **connects** that account instead (same session envelope as login — never `409 email_already_used`). If no signup OTP matches, verifies a **login** OTP for that email (existing shopper who used the signup form) and returns the login session envelope. Wrong/expired code → `400 invalid_or_expired_token` (same for new and existing — no enumeration).
- `login`: same session envelope as password login (including `reactivated`). `401 invalid_credentials` for a wrong/expired code. Failed codes count toward the per-account login lockout; a wrong code during the lockout window gets the same answer as for an unknown address (no `423`). On an account whose email was never verified, a successful OTP sign-in cancels its password (see `POST /auth/login`, reason `email_verification`).

### `GET /auth/sign-in-methods`

Public (rate-limited `authRateLimiter`). Shop-wide third-party sign-in flags —
each value is the admin/OPS preference **and** provider credentials configured
on the server (`GOOGLE_CLIENT_ID` / Facebook app id+secret / `APPLE_CLIENT_ID`).
Email + password / OTP are never gated here.

```json
{ "success": true, "signInMethods": { "google": true, "facebook": true, "apple": true, "facebookMobileDirectOAuthEnabled": true, "googleVerbose": false, "facebookVerbose": false, "appleVerbose": false } }
```

`*Verbose` mirrors shop preferences `sign_in_*_verbose_enabled` (default
off, per provider). When on for that provider, unknown social identities
return `needsAccountChoice` instead of silent create (see `/auth/social/*`).
`facebookMobileDirectOAuthEnabled` selects the Facebook flow on mobile only:
`true` uses the direct web OAuth URL, while `false` uses the Facebook
JavaScript SDK's `FB.login()` flow. Desktop always uses `FB.login()`.

### `POST /auth/google`

Rate-limited (`authRateLimiter`, `loginRateLimiter`). Requires `GOOGLE_CLIENT_ID` on the server — otherwise `503 google_sign_in_disabled`. Also requires the shop preference `sign_in_google_enabled` — otherwise `403 sign_in_method_forbidden`. Body:

```json
{ "idToken": "string", "gdprConsent": { "accepted": true }, "language": "fr", "rememberMe": false }
```

The front obtains `idToken` from [Google Identity Services](https://developers.google.com/identity/gsi/web). The API verifies signature, audience, issuer, expiry, and `email_verified`.

- **Existing user** (matched by `google_sub`, else by email): same session envelope as login (`200`, optional `"reactivated": true`). Backfills `users.google_sub` when missing.
- **New identity + `sign_in_google_verbose_enabled`**: `200`
  `{ "success": true, "needsAccountChoice": true, "socialPendingToken": "string", "provider": "google", "socialEmail": "…" }` — no user row yet; continue with `/auth/social/create` or `/auth/social/link/*`.
- **New identity + `gdprConsent.accepted`** (verbose off): creates a passwordless user (`email_verified_at` set, no confirmation email), `201` with `"created": true`.
- **New identity without consent** (verbose off): `200` `{ "success": true, "needsConsent": true, "googleSignupToken": "string" }` — no user row yet.

Errors: `400 invalid_request`, `400 invalid_google_token`, `403 account_security_locked`, `403 sign_in_method_forbidden`, `423 account_locked`, `503 google_sign_in_disabled`.

### `POST /auth/google/complete`

Completes signup after `needsConsent`. Same Google credential / shop-gate rules as `POST /auth/google`. Body:

```json
{ "googleSignupToken": "string", "gdprConsent": { "accepted": true }, "rememberMe": false }
```

Consumes the pending token, creates the user (or connects if the address appeared meanwhile), issues the session (`201`, `"created": true`). Invalid/expired token → `400 invalid_or_expired_token`.

### `POST /auth/facebook`

Rate-limited (`authRateLimiter`, `loginRateLimiter`). Requires `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` — otherwise `503 facebook_sign_in_disabled`. Also requires shop preference `sign_in_facebook_enabled` — otherwise `403 sign_in_method_forbidden`. Body:

```json
{ "accessToken": "string", "gdprConsent": { "accepted": true }, "language": "fr", "rememberMe": false }
```

The front obtains a short-lived user `accessToken` from the Facebook JS SDK (`FB.login` with `public_profile,email`). The API verifies via Graph `debug_token` (app id + validity) then `/me?fields=id,email`. Email is required — missing/denied → `400 facebook_email_required`.

- **Existing user** (matched by `facebook_user_id`, else by email): same session envelope as login (`200`, optional `"reactivated": true`). Backfills `users.facebook_user_id` when missing.
- **New identity + `sign_in_facebook_verbose_enabled`**: `needsAccountChoice` (same shape as Google; `provider: "facebook"`).
- **New identity + `gdprConsent.accepted`** (verbose off): creates a passwordless user (`email_verified_at` set, no confirmation email), `201` with `"created": true`.
- **New identity without consent** (verbose off): `200` `{ "success": true, "needsConsent": true, "facebookSignupToken": "string" }` — no user row yet.

Errors: `400 invalid_request`, `400 invalid_facebook_token`, `400 facebook_email_required`, `403 account_security_locked`, `403 sign_in_method_forbidden`, `423 account_locked`, `503 facebook_sign_in_disabled`.

### `POST /auth/facebook/complete`

Completes signup after `needsConsent`. Body:

```json
{ "facebookSignupToken": "string", "gdprConsent": { "accepted": true }, "rememberMe": false }
```

Same semantics as `/auth/google/complete` for Facebook pending tokens.

### `POST /auth/apple`

Rate-limited (`authRateLimiter`, `loginRateLimiter`). Requires `APPLE_CLIENT_ID`
(Services ID) — otherwise `503 apple_sign_in_disabled`. Also requires shop
preference `sign_in_apple_enabled` — otherwise `403 sign_in_method_forbidden`.
Body:

```json
{ "idToken": "string", "nonce": "string", "gdprConsent": { "accepted": true }, "language": "fr", "rememberMe": false }
```

The front obtains an Apple identity token (JWT) and a one-time `nonce`. It
passes `sha256(nonce)` (hex) to Apple JS and the raw `nonce` to this API. The
API verifies signature (Apple JWKS), audience, issuer, expiry, and that the
token's `nonce` claim equals `sha256(raw nonce)`. Email may be omitted on later
authorizations.

- **Existing user** (matched by `apple_sub`, else by email when present): same
  session envelope as login. Backfills `users.apple_sub` when missing (email
  optional on that backfill).
- **New identity + `sign_in_apple_verbose_enabled`**: `needsAccountChoice`
  (`provider: "apple"`; `socialEmail` may be null — create then needs an email).
- **New identity without email** (verbose off): `400 apple_email_required`.
- **New identity + `gdprConsent.accepted`** (verbose off): creates a passwordless user,
  `201` with `"created": true`.
- **New identity without consent** (verbose off): `200`
  `{ "success": true, "needsConsent": true, "appleSignupToken": "string" }`.

Errors: `400 invalid_request`, `400 invalid_apple_token`, `400 apple_email_required`,
`403 account_security_locked`, `403 sign_in_method_forbidden`, `423 account_locked`,
`503 apple_sign_in_disabled`.

### `POST /auth/apple/complete`

Completes signup after `needsConsent`. Body:

```json
{ "appleSignupToken": "string", "gdprConsent": { "accepted": true }, "rememberMe": false }
```

Same semantics as `/auth/google/complete` for Apple pending tokens.

### `POST /auth/social/create`

After `needsAccountChoice`. Rate-limited. Body:

```json
{ "socialPendingToken": "string", "gdprConsent": { "accepted": true }, "rememberMe": false }
```

Consumes the pending social token and creates (or connects) the user — same
session envelope as provider `/complete`. Missing provider email (Apple) →
`400 apple_email_required`. Invalid/expired token → `400 invalid_or_expired_token`.

### `POST /auth/social/link/request-otp`

Body: `{ "socialPendingToken": "string", "email": "string" }`.

Sends a `social_link` OTP to an **existing** Shop account. Missing account →
`404 account_not_found`. Provider subject already on another user, **or** the
target account already has a different subject for that provider →
`409 *_already_linked`. Provider email owned by another user →
`409 email_already_used`. Send cap → `429 resend_limit_exceeded`.

### `POST /auth/social/link/verify`

Body: `{ "socialPendingToken": "string", "email": "string", "code": "string", "rememberMe": false }`.

Verifies the OTP, attaches the pending provider subject (+ provider email) to
that user, issues a login session (`200`, not `created`). Same `409 *_already_linked`
when the target account already has another Google/Apple/Facebook linked (does
not silently keep the old link and log in). Conflict checks run before the OTP
and pending token are consumed.

### `POST /auth/facebook/data-deletion`

Meta **Data Deletion Request Callback**. Rate-limited (`authRateLimiter`).
Body is `application/x-www-form-urlencoded` with `signed_request` (not JSON).
Requires `FACEBOOK_APP_ID` + `FACEBOOK_APP_SECRET`. Verifies HMAC-SHA256,
finds `users.facebook_user_id`, clears Facebook fields, invalidates pending
Facebook signup/link tokens, and when the account is `active` schedules the
same soft-deletion as `POST /account/request-deletion` (grace period + email).

Success response is Meta's required shape (**no** `success` envelope):

```json
{ "url": "https://…/auth/facebook-data-deletion?code=…", "confirmation_code": "…" }
```

`url` is built from `URL_FRONTEND_BASE`. Errors: `400 invalid_request`,
`400 invalid_facebook_token`, `503 facebook_sign_in_disabled`.

### `GET /auth/facebook/data-deletion/:code`

Public status for the confirmation URL. Response
`{"success":true,"confirmationCode":"…","status":"account_deletion_scheduled"|"facebook_unlinked"|"no_matching_account","deletionScheduledFor":"ISO"|null,"createdAt":"ISO"}`.
`404 not_found` when the code is unknown.

### `POST /auth/apple/notifications`

Sign in with Apple **server-to-server notifications**. Rate-limited
(`authRateLimiter`). JSON body `{ "payload": "<JWS>" }` (Apple-signed JWT).
Requires `APPLE_CLIENT_ID`. Verifies the JWS with Apple's JWKS (`iss`
`https://appleid.apple.com`, `aud` = `APPLE_CLIENT_ID` and/or optional
`APPLE_S2S_AUDIENCE` when the primary App ID differs from the Services ID).

| `events.type` | Action |
| --- | --- |
| `consent-revoked` | Clear `apple_sub` / `apple_email` (same as account unlink); burn unused Apple signup/link / social-pending tokens for that `sub` |
| `account-deleted` / `account-delete` | Same unlink |
| `email-enabled` / `email-disabled` | Ack only |
| Other / unknown | Ack + log |

Does **not** soft-delete the Shop account or revoke sessions. Duplicate
`jti` values are ignored (idempotent). Valid JWT → `200 {"success":true}`.
Errors: `400 invalid_request`, `400 invalid_apple_token`,
`503 apple_sign_in_disabled`.

Register the absolute URL on the **primary App ID** in Apple Developer
(Sign in with Apple → Configure → Server-to-Server Notification Endpoint):

- preprod: `https://preprod-api.shop.example/auth/apple/notifications`
- prod: `https://api.shop.example/auth/apple/notifications`

### `POST /auth/refresh`

Rate-limited (`RATE_AUTH_REFRESH`, `<window>:<count>`). No body — reads the refresh-token cookie,
rotates it. Rejects locked/deleted users. `401 no_session` (no
cookie), `401 invalid_session` (expired/unknown/locked), or `401 session_reused`
(replay of an already-rotated token — the whole family was just revoked).
Response
`{"success":true,"user":{...},"accessToken":"string","accessTokenExpiresAt":"ISO"}`
(same `user` shape as login/register — includes `hasPassword`, `hasGoogle`, `hasFacebook`), sets the rotated cookie. The front uses
`user` to finish silent session restore without a follow-up
`GET /account/profile`.

For a `super-admin`, a refresh of a session idle for at least
`SUPER_ADMIN_SIGNIN_ALERT_IDLE` (`1h` in `.env/.public.env`; measured from when the
presented token was issued) counts as an automatic sign-in and sends the
super-admin sign-in alert (see below). An open tab refreshing on schedule,
once per access-token lifetime, does not.

### Super-admin sign-in alert

Every session a `super-admin` starts is e-mailed to that account, in its
stored language: every sign-in (password, one-time code, Google, Facebook,
Apple: every path that issues a session) and every automatic resume of an
idle session (`POST /auth/refresh` above). The e-mail lists the time
(Europe/Paris), the approximate location from the IP when it resolves, the
IP address and the device summarized from the user agent, and carries a
single-use lock link (`account_lock_tokens`, valid
`ACCOUNT_SECURITY_LOCK_TOKEN_TTL`) leading to `POST /auth/lock-account`.
Sending is detached: a mail failure is logged and never affects the sign-in.
Other roles get no such e-mail. A locked super-admin is unlocked by another
super-admin (`POST /admin/users/:id/unlock`) or by
`npm run user -- unlock` / `POST /operation/accounts/:idOrEmail/unlock`.

### `POST /auth/logout`

Requires `Authorization`. Revokes the refresh token in the cookie and clears
it. Response `{"success":true}`.

### `POST /admin/impersonate`

Requires a normal signed-in account whose role holds the `impersonate`
permission (every `super-admin` does; see [Administration](./01-admin.md)). Body:
`{"email":"customer@example.com"}`. It returns the normal
`{success,user,accessToken,accessTokenExpiresAt}` session shape for the target
customer, but does **not** issue a refresh cookie or create a
`refresh_tokens` row. It therefore does not affect that customer's connection
count or recent-logins display. The shop opens that session in another tab.
The administrator tab stays. Only customer accounts (`role = user`) can be impersonated:
locked, deleted, administrator and other staff accounts are refused with
`409 impersonation_not_allowed`.

### `POST /auth/request-password-reset`

Rate-limited: `authRateLimiter` (30 req/min/IP) plus a per-user day/month
cap (`PASSWORD_RESET_LIMIT`, `<day>:<month>`, default `5:15` — a
log-table-plus-rolling-window shape, see `passwordReset.service.ts`'s
`checkPasswordResetLimit`). Body:
`{ "email": "string" }`. Always responds `{"success":true}` whether or not
the address exists, **and** whether or not it just hit its own limit — no
account-enumeration oracle on this endpoint, so unlike every other
resend-limited route here, a limit hit never surfaces as a `429`; the send
is just silently skipped. The response is sent before the account lookup and
the SMTP send run, so its timing does not reveal whether the address exists
either.

### `POST /auth/confirm-password-reset`

Rate-limited. Body: `{ "token": "string", "newPassword": "string" }`. Same
complexity check as register. `400 invalid_or_expired_token` if the token
doesn't resolve. On success, revokes every refresh token for that user
(forces re-login everywhere).

### `POST /auth/confirm-email`

Rate-limited. Body: `{ "token": "string" }` from the confirmation-email
link. `400 invalid_request` if the token is missing;
`400 invalid_or_expired_token` when the credential does not resolve.
Response
`{"success":true,"emailChanged":boolean,"alreadyVerified":boolean}` —
`emailChanged:true` when this completed a `pending_email` change rather
than the original registration confirmation; `alreadyVerified:true` when
the same already-used token is submitted again after a successful
confirmation. The confirmation email also includes a copyable URL under
the CTA button for clients that strip links.

The legacy `{ "email": "string", "code": "6 digits" }` OTP form is also
accepted when the link cannot be used. The OTP is stored as a peppered,
domain-separated HMAC and is burned after `EMAIL_CONFIRMATION_MAX_ATTEMPTS`
consecutive failed submissions (default `5`); expiry remains a hard limit.

### `POST /auth/manage-guest-order`

Rate-limited (same limiter as confirm-email). Body: `{ "token": "string" }`
from a still-unlinked guest order's “Manage my order” email link
(`/account/manage-order?token=…`). The page consumes the token on load and
signs the customer in, then sends them to `/orders`. If another account is
already signed in in that browser, it is signed out first so the token can
switch to the matching user. TTL is
`EMAIL_CONFIRMATION_TOKEN_TTL` (same 24h window as verify-email). A
re-click (or prefetch + real click) of an already-used token still signs
them in while that window is open.

On a valid token: if no account exists for that current email, creates
a passwordless verified user (OTP login afterwards, GDPR version stamped from
the token); if an active/pending-deletion account exists, attaches to it.
Attaches this order and any other currently unlinked guest orders for that
email (except ones this account dismissed, other than the token's own order).
Also copies any unclaimed remembered guest addresses/cards for that email
onto the account (pending Stripe customer assigned or the PaymentMethod
moved onto the account customer). Independent `/auth/register` / OTP signup never scans leftover guest
orders or pending saved checkout. Guest confirm never auto-attaches the
order or remembered address/card; both wait for this token. Revokes any
refresh cookie already on the request (another account left signed in) and
replaces it with this user's session cookie so the token always wins.
`201` when a user was created, `200` when an
existing account received the order:
`{"success":true,"created":boolean,"alreadyManaged":false,"user":{...},"accessToken":"string","accessTokenExpiresAt":"ISO"}`.

`400 invalid_or_expired_token` when the token is missing, unknown, or expired.
`403 account_security_locked` when the matching account is operator-
locked. Independent `/auth/register` / OTP signup never scans leftover guest
orders.

### `POST /auth/resend-email-confirmation`

Requires `Authorization`. Rate-limited by `EMAIL_CONFIRMATION_RESEND_COOLDOWN`
(minimum gap since the last send, `DISABLE_EMAIL_CONFIRMATION_RESEND_COOLDOWN`
dev-only bypass) — `429 resend_limit_exceeded` once hit.

---

### `POST /auth/login-or-register`

Single-call sign-in used by the in-cart auth step: logs the customer in if the
address already has an account, and creates one if it does not — so the client
does not have to probe for existence first (which would leak whether an address
is registered).

Body: `{"email":"string","password":"string","gdprConsent":{"accepted":true},
"rememberMe":boolean,"language":"fr"|…}`. `gdprConsent.accepted` is required
only on the **create** branch (new email); returning users may omit it.
`language` falls back to the `Accept-Language` header. On the register branch
the password must pass complexity — `400 weak_password` carries `violations`.
Rate-limited by both `authRateLimiter` and `loginRateLimiter`.

Response and cookies match `POST /auth/login`, including the lockout-window
answer and `password_cancelled`.

### `POST /auth/lock-account`

Consumes an `account_lock_tokens` link: the "this wasn't me" button sent to
the **old** address whenever an email change is requested, and the lock
button of the super-admin sign-in alert. Body:
`{"token":"string"}`. Sets `users.status = 'locked'`, stamps `locked_at`,
stores a fixed customer-alert `lock_reason` with `lock_source = customer`, and
revokes every refresh token for the account. Journaled as
`accounts.lock_link` (origin `system`). There is no self-service unlock:
`POST /operation/accounts/:idOrEmail/unlock` reverses it, or, for a
super-admin, another super-admin from the administration Users page.

`400 invalid_or_expired_token` when the token is unknown, used or expired;
`200 {"success":true}` otherwise. See
[schema: accounts](../schema/02-accounts.md)'s `account_lock_tokens`.
