# Account

Every route requires `Authorization: Bearer <accessToken>` except
`GET /account/address-countries`. Same `{"success":...}` envelope as Auth.

Related: [Account API](./03-account.md) · [Addresses and favorites API](./10-addresses.md) · [Delivery options API](./11-delivery.md) · [Payment methods API](./12-payment-methods.md) · [Cart API](./13-cart.md) · [Account checkout and orders API](./14-account-checkout.md) · [Loyalty API](./15-loyalty.md).

### `POST /account/request-unlock-otp`

Requires `Authorization`. Rate-limited. Body:
`{ "action": "profile" | "email" | "password" | "deletion" | "google" | "facebook" | "apple" | "social" }`.
Only valid when the account has no password (`hasPassword: false`);
`400 invalid_request` otherwise. Sends a 6-digit OTP to the account email
(`AUTH_OTP_TOKEN_TTL`). `429 resend_limit_exceeded` when the unlock OTP
budget is hit.

### `POST /account/unlock`

Step-up re-authentication for the sensitive actions below. Body is one of:

- `{ "action": "profile" | "email" | "password" | "deletion" | "google" | "facebook" | "apple" | "social", "currentPassword": "string" }` when `hasPassword` is true
- `{ "action": "...", "code": "string" }` when `hasPassword` is false (OTP from `POST /account/request-unlock-otp`)

`401 invalid_credentials` if the password/code is wrong. Mixing the two
credentials, or using the wrong kind for the account, is `400 invalid_request`.
OTP unlock uses the same attempt burn and `AUTH_OTP_VERIFY_DELAY` floor as
`POST /auth/verify-otp`. On success returns
`{"success":true,"unlockToken":"string","action":"...","expiresAt":"ISO date"}`
— a short-lived (`ACCOUNT_UNLOCK_TOKEN_TTL`, default 5m), single-use token
scoped to that one `action`; it cannot be used against a different action or
a different user, and is consumed (can't be replayed) by the first
successful call it's used with.

### `GET /account/profile` / `PATCH /account/profile`

`PATCH` body: any of `{ "firstName", "lastName", "phone" }` (only present
fields are updated), plus `"unlockToken"` — **required** unless the account's
stored `firstName`/`lastName`/`phone` are _all_ currently empty (true for
every account until the first time this is filled in, since registration
never sets them), in which case no token is needed. `firstName` and
`lastName`, when present, must be non-empty strings; `phone` is optional and
may be an empty string or `null` to clear it. When set, it must be a valid
phone number (optional leading `+`, then digits / spaces / `()-.`, 8–15
digits). `401 unlock_invalid` if a
token was required but missing/invalid/expired/already used. Response:
`{"success":true,"user":{...}}`
where `user` is `{id,email,emailVerified,pendingEmail,firstName,lastName,phone,status,role,hasPassword,hasGoogle,googleEmail,hasFacebook,facebookEmail,hasApple,appleEmail}`.

### `POST /account/link-google`

Auth required. Rate-limited (`authRateLimiter`). Requires plugin
`tuucho-signin-google` enabled with a client id — otherwise `503 google_sign_in_disabled`. Also requires shop
preference `sign_in_google_enabled` — otherwise `403 sign_in_method_forbidden`. Body:
`{ "idToken": "string", "unlockToken": "string" }` — GIS credential plus
unlock token from `POST /account/unlock` with `action: "google"`.

- Pending email-change → `409 email_change_pending`.
- Google email already on another account → `409 email_already_used`.
- `google_sub` already on another account → `409 google_already_linked`.
- **Emails match:** consumes unlock, sets `google_sub` + `google_email`, returns
  `{"success":true,"user":{...}}`.
- **Emails differ:** does **not** consume unlock; issues a short-lived
  `google_link_tokens` row and returns
  `{"success":true,"needsEmailChoice":true,"googleLinkToken":"...","currentEmail":"...","googleEmail":"..."}`.

### `POST /account/link-google/complete`

Auth required. Body:
`{ "googleLinkToken": "string", "choice": "keep" | "switch", "unlockToken": "string" }`.

Consumes unlock + pending token.

- `keep` — main `email` unchanged; set `google_sub` + `google_email`.
- `switch` — main `email` becomes Google address (previous main discarded);
  set `google_sub` + `google_email` (same); `email_verified_at` set; security
  notice emailed to the **old** address.

Response: `{"success":true,"user":{...}}` with `hasGoogle: true`.

### `POST /account/unlink-google`

Auth required. Rate-limited (`authRateLimiter`). Body:
`{ "unlockToken": "string" }` from `POST /account/unlock` with
`action: "google"`.

Clears `users.google_sub` and `google_email` — **main email and password are
unchanged**. Idempotent when already unlinked. Allowed even when shop Google
sign-in is disabled. `401 unlock_invalid` if the
token is missing/invalid. Response: `{"success":true,"user":{...}}` with
`hasGoogle: false`.

### `POST /account/link-apple`

Auth required. Rate-limited (`authRateLimiter`). Requires plugin
`tuucho-signin-apple` enabled with a Services ID —
otherwise `503 apple_sign_in_disabled`. Also requires shop preference
`sign_in_apple_enabled` — otherwise `403 sign_in_method_forbidden`. Body:
`{ "idToken": "string", "nonce": "string", "unlockToken": "string" }` with unlock
`action: "apple"` (or `"social"`). Same Apple nonce binding as
`POST /auth/apple` (raw `nonce` here; `sha256(nonce)` hex was sent to Apple).

- Missing email claim → `400 apple_email_required`.
- Pending email-change → `409 email_change_pending`.
- Apple email already on another account → `409 email_already_used`.
- `apple_sub` already on another account → `409 apple_already_linked`.
- **Emails match:** consumes unlock, sets `apple_sub` + `apple_email`, returns
  `user`.
- **Emails differ:** does **not** consume unlock; returns
  `{"success":true,"needsEmailChoice":true,"appleLinkToken":"...","currentEmail":"...","appleEmail":"..."}`.

### `POST /account/link-apple/complete`

Body: `{ "appleLinkToken": "string", "choice": "keep" | "switch", "unlockToken": "string" }`.
Same keep/switch semantics as Google link complete.

### `POST /account/unlink-apple`

Body: `{ "unlockToken": "string" }` with `action: "apple"` (or `"social"`).
Clears `apple_sub` + `apple_email`; main email unchanged. Allowed even when
shop Apple sign-in is disabled.

### `POST /account/link-facebook`

Auth required. Rate-limited. Requires Facebook configured — otherwise
`503 facebook_sign_in_disabled`. Also requires shop preference
`sign_in_facebook_enabled` — otherwise `403 sign_in_method_forbidden`. Body:
`{ "accessToken": "string", "unlockToken": "string" }` with unlock
`action: "facebook"`.

- Pending email-change → `409 email_change_pending`.
- Facebook email already on another account → `409 email_already_used`.
- `facebook_user_id` already on another account → `409 facebook_already_linked`.
- Missing email permission → `400 facebook_email_required`.
- **Emails match:** consumes unlock, sets `facebook_user_id` + `facebook_email`, returns `user`.
- **Mismatch:** unlock not consumed; returns
  `{"success":true,"needsEmailChoice":true,"facebookLinkToken":"...","currentEmail":"...","facebookEmail":"..."}`.

### `POST /account/link-facebook/complete`

Body: `{ "facebookLinkToken": "string", "choice": "keep" | "switch", "unlockToken": "string" }`.
Same keep/switch semantics as Google link complete (switch discards previous
main email; security notice to old address). Response `user` with
`hasFacebook: true`.

### `POST /account/unlink-facebook`

Body: `{ "unlockToken": "string" }` with `action: "facebook"`. Clears
`facebook_user_id` + `facebook_email`; main email unchanged. Allowed even
when shop Facebook sign-in is disabled.

### `POST /account/change-email`

Rate-limited by `authRateLimiter` (30 req/min/IP) plus a per-user
cooldown (`EMAIL_CHANGE_COOLDOWN`, default 5m, `DISABLE_EMAIL_CHANGE_COOLDOWN`
dev-only bypass — see `emailChangeSends.service.ts`'s `checkEmailChangeLimit`,
deliberately independent from `/auth/resend-email-confirmation`'s own
cooldown even though this route also records a send into
`email_confirmation_sends`, so the two can't bleed into each other) — it
sends two emails per call (see below), so unlike most `/account/*` routes
it isn't left unlimited. This route is authenticated (no enumeration
concern), so exceeding the cooldown returns
`429 {"error":{"code":"resend_limit_exceeded"}}`, same shape as the invoice
routes below — unlike `/auth/request-password-reset`, which can't do this.
Body: `{ "newEmail": "string", "unlockToken": "string" }`
(token from `POST /account/unlock` with `action: "email"`). `401 unlock_invalid`
if the token's missing/invalid/expired/already used, `409
email_already_used` if another account already has that email. Sets
`pending_email` and sends a confirmation to the **new** address, valid for
`EMAIL_CHANGE_CONFIRMATION_TOKEN_TTL` (default 10m — deliberately much
shorter than the 24h registration confirmation, since this always follows
a fresh step-up unlock) — the current email stays the account's email (and
keeps its verified state) until that confirmation is used. Also sends a
"this wasn't me" security notice to the **current** address every call.

### `POST /account/change-password`

Body: `{ "unlockToken": "string", "newPassword" }` (token from
`POST /account/unlock` with `action: "password"`). Same complexity check as
register/reset. `401 unlock_invalid` if the token's missing/invalid/expired/
already used. Revokes every other refresh token for this user on success
(current session's access token keeps working until it naturally expires).
That short access-JWT window (`JWT_ACCESS_TOKEN_TTL`, default 15m) after a
password change is intentional: access tokens are not DB-checked, so a
~15m blast radius is the accepted cost of not hitting the DB on every
request. Refresh tokens are revoked immediately.

### `PUT /account/preferences/language`

Auth required. Body: `{ "language": "fr" | "en" | "th" | "es" | "it" | "nl" | "pt" }`.
Upserts the account's `language` preference. The underlying preference store
is generic key/value storage for future account choices.

### `GET /account/preferences/theme` / `PUT /account/preferences/theme`

Auth required. Appearance preference (`light` | `dark` | `system`), stored as
`user_preference` key `theme`. Guests keep a browser-local cache only; once
signed in, the account value is the source of truth across devices.

`GET` response: `{ "success": true, "theme": "light"|"dark"|"system"|null }`
(`null` when the account has never saved one).

`PUT` body: `{ "theme": "light"|"dark"|"system" }`. Response:
`{ "success": true, "theme": "…" }`. `400 invalid_request` for anything else.

### `GET /account/preferences/contrast` / `PUT /account/preferences/contrast`

Auth required. Accessibility contrast preference (`system` | `standard` |
`more`), stored as `user_preference` key `contrast`. It is independent from
the light/dark theme so enhanced contrast can be applied to either palette.
Guests keep a browser-local preference only; once signed in, the account value
is the cross-device source of truth and the browser value is its first-paint
cache.

`GET` response:
`{ "success": true, "contrast": "system"|"standard"|"more"|null }`
(`null` when the account has never saved one).

`PUT` body: `{ "contrast": "system"|"standard"|"more" }`. Response:
`{ "success": true, "contrast": "…" }`. `400 invalid_request` for anything
else.

### `GET /account/preferences/onboarding` / `PUT /account/preferences/onboarding`

Auth required. One-shot shop onboarding completion flag, stored as
`user_preference` key `onboarding.v1` with value `true`. Missing key means
the account has not completed onboarding. Guests keep a browser-local cache
only (`psn-onboarding-v1`); once signed in, the account value is the
cross-device source of truth. A guest dismissal on the same browser is synced
onto the account so other devices stay quiet.

`GET` response: `{ "success": true, "completed": true|false }` (`false` when
the account has never saved one).

`PUT` body: `{ "completed": true }` only (idempotent). Response:
`{ "success": true, "completed": true }`. `400 invalid_request` for anything
else — clearing the flag is not supported (replay is client-only).

### `GET /account/notification-preferences` / `PUT /account/notification-preferences`

Auth required. Email notification master switch + per-channel toggles
(stored as `notify.*` keys in `user_preference`; missing key = enabled).

`GET` response:

```json
{
  "success": true,
  "emailsEnabled": true,
  "primary": { "email": "camille@example.com", "verified": true },
  "transactional": {
    "order_confirmation": true,
    "order_shipped": true,
    "invoice": true,
    "security": true,
    "chat_reply": true,
    "loyalty_expiry": true
  },
  "marketing": {
    "nouveautes": true,
    "cart_reminder": true,
    "favorite_sold": true,
    "favorite_restock": true,
    "promo": true
  }
}
```

`PUT` body: `{ "channel": "emails_enabled" | "<transactional|marketing key>", "enabled": boolean }`.
Response is the same shape as `GET` after the update. `400 invalid_request`
for an unknown channel or non-boolean `enabled`.

Forced mails (password reset, email confirm/change, security lock, deletion)
always go to the primary address and ignore these prefs. Marketing channels
also require `primary.verified` (see `shouldSendNotification`).

### `GET /account/recent-logins`

Account page's "recent logins" block.

```json
{
  "success": true,
  "logins": [
    {
      "createdAt": "2026-08-01T10:00:00.000Z",
      "ip": "203.0.113.42",
      "location": "Paris, France",
      "device": "Chrome · macOS"
    }
  ]
}
```

One entry per actual sign-in (register/login), never a routine
`/auth/refresh` rotation — see `token.service.ts`'s `listRecentLogins`.
Limited to `RECENT_LOGINS_DISPLAY_COUNT` (common kernel `config/`, default
3); `0` returns an empty list rather than an error, and the frontend hides
the block entirely on an empty list. `location`/`device` may be `null`
(geo-IP lookup failed/timed out, or an unrecognized user agent — see
`geoLocation.service.ts`/`utils/userAgent.ts`).

### `POST /account/request-deletion`

Body: `{ "unlockToken": "string" }` (token from `POST /account/unlock` with
`action: "deletion"`). `401 unlock_invalid` if the token's missing/invalid/
expired/already used. Flips the account to `pending_deletion`
(`ACCOUNT_DELETION_GRACE_PERIOD_DAYS` out), revokes every refresh token, and
emails a deletion-scheduled notice. Does **not** block future logins — the
next successful login reactivates the account automatically (see
`/auth/login`'s `reactivated` flag). Response:
`{"success":true,"deletionScheduledFor":"ISO"}`.

### `POST /account/cancel-deletion`

No body. For a still-logged-in session that wants to back out without
logging out/in again (the more common path — a login during the grace
window reactivates automatically, see `/auth/login`). Response:
`{"success":true,"reactivated":boolean}`.
