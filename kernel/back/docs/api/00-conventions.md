# Conventions

Base URL is this app's own subdomain for whichever environment — locally
`http://localhost:3000`, preprod `https://preprod-api.shop.example`, prod
`https://api.shop.example`. No `/api` prefix on any route — the subdomain
itself already says what this is (see `README.md`'s "Deploying" for why:
front and this app are separate subdomains, each with its own docroot, on
purpose).

## Response envelope

Every JSON response is `{"success": boolean, ...}`. Failures use a structured
error object (never a bare string):

```json
{ "success": false, "error": { "code": "invalid_request" } }
```

Optional extra fields may appear beside `code` (for example `message`,
`max`, `retryAfterSec`) when the endpoint documents them. Gallery and
operations routes follow the same envelope. `scripts/checkArchitecture.mjs`
rejects routers that still emit `success: false` with a string `error`.

## Email language

An email a request triggers (sign-in code, password reset, email
confirmation, email-change notice, account deletion, invoice) is written in
that request's `Accept-Language`, which the storefront sets to its own UI
language; English when it names none of the shop's languages. Mail the shop
sends later (order status, deletion reminder, gift and loyalty notices) uses
the account's saved `language` preference, or the order's checkout language
for a guest. An admin reply to an anonymous contact or a product request uses
the language the visitor wrote in (`unconnected_contacts.language`,
`product_requests.language`), French for threads from before that column.
Owner notifications stay French, and so does the invoice PDF itself.

## Request validation (zod)

New and migrated HTTP routers validate body/params/query with **zod** at the
router boundary (`src/modules/<feature>/http/`). Gift routers are the reference
pattern (`giftSchemas.ts`). Application/domain parsers may still apply
business rules after a successful schema parse. Do not invent a second
validation dialect for new routes.

## Endpoint groups


- **Gallery API** (`/gallery/...`) — public, read-only JSON, consumed by
  `kernel/front`.
- **Auth** (`/auth/...`) — register/login/OTP/refresh/logout/password-reset/
  email-confirmation. Public (no `Authorization` header) except where noted.
- **Account** (`/account/...`) — profile/addresses/cart/checkout/orders/
  account-deletion, gated by the access token from `/auth/login`|
  `/auth/register`|`/auth/verify-otp`|`/auth/refresh`.
- **Contact** (`/contact`) — public contact-form delivery for visitors.
  Authenticated customers use `/account/chat/*`: one continuous, account-owned
  conversation at a time plus read-only history. Owner replies arrive in the
  transcript and may trigger a deduplicated notification email.
- **Stripe webhooks** (`POST /webhooks/stripe`) — see below; not session- or
  OPS-gated (Stripe signature only).
- **Operations** (`/operation/...`) — loopback ops server for imports and
  infrastructure CLIs (schema migrations, library/courier/voucher import,
  account lock/unlock, scheduled account/card/shipment processing, …). Local
  `npm run … --dev` talks to a loopback `opsServer`; `--ssh` uses a
  short-lived SSH forward (`withOpsTunnel`); `--ftp` uses the PHP gateway at
  `OPS_GATEWAY_URL` (OPS_TOKEN, then proxy to that same loopback server).
  The public API never mounts these routes. Customer writes go through `/auth`
  and `/account`, not here.
- **Gift offers** (`/gift/...`, `/admin/gift/...`) — two-person gift
  promises. Public create/settings, capability-token giver and receiver
  routes, Boutique admin settings and active-offer list. See
  [08-gift.md](./08-gift.md).

Plus one standalone health check.

## Checkout privacy session

Sensitive checkout drafts are scoped to one browser tab and to a sliding
server-side inactivity window. `POST /checkout/session/start` creates a
session or resumes the opaque token supplied in `X-Checkout-Session`. It is
public, but accepts an optional normal `Authorization` header so the same tab
can move from guest to authenticated checkout without changing its vault key.
Response:

```json
{
  "success": true,
  "token": "<opaque 64-hex bearer>",
  "vaultKey": "<base64 32-byte AES key>",
  "expiresAt": "ISO datetime",
  "idleTimeoutMs": 1800000,
  "resumed": false,
  "expired": false
}
```

Only the token hash and a PII-wrapped key are stored server-side. The browser
keeps the raw token in `sessionStorage`, the raw key in RAM, and address/card
drafts only as AES-GCM ciphertext. A reload can re-fetch the key while the
session remains valid; a new/duplicated live tab starts a different session.

Real user interaction calls `POST /checkout/session/touch` with the same
headers. It returns the new `expiresAt`; the authoritative timeout is
`CHECKOUT_PRIVACY_SESSION_IDLE_TTL` (default `30m`). Calls are throttled by the
front, not sent for timers/animation. `401 checkout_session_expired` means the
client must discard its sensitive vault and start again;
`409 checkout_session_required` means the header is missing or invalid.

`POST /checkout/session/payment-methods` with
`{"paymentMethodId":"pm_…"}` registers only a Stripe-tokenized guest card
reference with the current session. It never accepts PAN, expiry or CVC.
Guest create-intent rejects a card id not registered to the same live session.
Registration is idempotent and capped at ten distinct card references per
session (`409 checkout_session_payment_method_limit` beyond that bound).
One-time account addresses/cards are likewise bound to the session that
created them; saved account data is session-independent. Payment
finalize/webhook reconciliation deliberately remains PaymentIntent-based and
does not require a live checkout session.

## Stripe webhooks

Endpoint: `POST /webhooks/stripe`. Verifies `Stripe-Signature` with
`STRIPE_WEBHOOK_SECRET` (returns `400 invalid_signature` on failure,
`501` if Stripe / the secret is not configured). Raw body — must stay
outside the JSON body parser.

In the Stripe Dashboard (or CLI), point the destination URL at this path
and **enable exactly these event types** (others are ignored):

| Event                                      | Why it must be active                                                                                                                                                                                                                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `payment_intent.amount_capturable_updated` | Manual-capture authorize (card + PayPal): when the PI reaches `requires_capture`, settle creates the order as `paymentCaptureStatus=authorized` (durable backstop if `/account/checkout/finalize` never runs).                                                                         |
| `payment_intent.succeeded`                 | After ops capture (or a rare already-succeeded PI): settle / promote `authorized` → `captured`.                                                                                                                                                                                        |
| `charge.expired`                           | Auth hold window ended before capture → mark matching order `paymentCaptureStatus=expired` (funds never taken; order lifecycle unchanged) **and** send a spy email (user email/id, amount, payment method, order number).                                                              |
| `payment_intent.canceled`                  | Same expiry path when Stripe sets `cancellation_reason=expired` (spy email only if the row actually flips `authorized` → `expired`, so it does not double-mail with `charge.expired`). Voluntary cancels (`paymentIntents.cancel` from customer/ops) are **not** flipped to `expired`. |
| `payment_intent.payment_failed`            | Spy notification only (no order mutation).                                                                                                                                                                                                                                             |

Local: `npm run dev` runs `stripe listen --all-snapshot --forward-to localhost:<port>/webhooks/stripe` when the Stripe CLI is available (see [command](../command/README.md) / [README](../../README.md)). `--all-snapshot` is the classic webhook payload this API verifies. Preprod/prod: configure the Dashboard webhook endpoint for that environment's API host and paste the signing secret into that target's `.private.env` as `STRIPE_WEBHOOK_SECRET`.

## Input limits and rate limits

Customer-writable strings and quantities are capped in the API (app-layer;
DB columns stay `text`). Defaults live in `.env/.public.env` as `FIELD_*`,
`PASSWORD_MAX_LENGTH`, and `RATE_*` — tweak there without a code change.
Over-length / invalid charset → `400 invalid_request` (or `weak_password`
with `tooLong` for passwords). Customer JSON bodies are limited to
`FIELD_JSON_BODY_LIMIT_KB` (default 64kb).

| Env / concept                                              |                        Default | Notes                                                                    |
| ---------------------------------------------------------- | -----------------------------: | ------------------------------------------------------------------------ |
| `FIELD_EMAIL_MAX`                                          |                            254 | Trim + lower                                                             |
| `PASSWORD_MAX_LENGTH`                                      |                            128 | Cap before hashing                                                       |
| `FIELD_FIRST_NAME_MAX` / `FIELD_LAST_NAME_MAX`             |                             80 | Unicode, no control chars                                                |
| `FIELD_PHONE_MAX`                                          |                             32 | Optional leading `+`, then digits / spaces / `()-.`; 8–15 digits (E.164) |
| `FIELD_CONTACT_IDENTITY_MAX`                               |                            160 |                                                                          |
| `FIELD_CONTACT_MESSAGE_MAX`                                |                           5000 |                                                                          |
| `FIELD_PRODUCT_REQUEST_COMMENT_MAX`                        |                            500 | Optional size-request note                                               |
| Address label / recipient / company / line / postal / city | 60 / 100 / 120 / 120 / 16 / 80 |                                                                          |
| `FIELD_CART_NAME_MAX`                                      |                             50 |                                                                          |
| `FIELD_VOUCHER_CODE_MAX`                                   |                             64 | Letters, digits, `_`-                                                    |
| `FIELD_CART_QUANTITY_MAX`                                  |                             99 |                                                                          |
| `FIELD_TOKEN_MAX`                                          |                            128 | Unlock / reset / Stripe ids                                              |

Additional rate limits (per IP, `RATE_*` in `.public.env`): voucher validate,
checkout create-intent/free/finalize, payment setup/attach, refresh, gallery,
and ops (`RATE_OPS_*` on `/operation/*`, failures only), gift PIN unlock
(`RATE_GIFT_PIN_*` on `POST /gift/:token/pin` and
`POST /gift/giver/:token/pin`), gift creation (`RATE_GIFT_CREATE_EMAIL_*` on
`POST /gift/offers`), and the giver's share-card modal — edit
(`RATE_GIFT_SHARE_CARD_UPDATE_*`), download (`RATE_GIFT_SHARE_CARD_DOWNLOAD_*`),
and email (`RATE_GIFT_SHARE_CARD_EMAIL_*`), each its own budget rather than
sharing `authRateLimiter`'s, and the "Ma Facture" modal's download
(`RATE_INVOICE_DOWNLOAD_*`) and email (`RATE_INVOICE_EMAIL_*`). Counters
are stored in Postgres
(`rate_limit_buckets`) so every API process shares the same windows.
`DISABLE_RATE_*=true` is honored only when
`APP_TARGET=dev`; preprod/prod ignore those flags.
On preprod, ops `PUT /operation/relax-rate-limits` with `{ "enabled": true }`
skips every HTTP limiter until it is turned off. Prod never honors that
preference.
Application send cooldowns (`AUTH_OTP_COOLDOWN`, confirmation resend, and
so on) are unchanged.

**A 5xx never counts against the caller.** A request the server failed to serve
is not abuse, and charging it turns one failure into two: when gift creation
started returning 500, a handful of honest retries spent the whole window and
the customer was told to come back later, which hid the real error behind a
misleading one. Every response below 500 still counts, deliberately, because
4xx in volume is exactly the abuse these limits exist to stop.

Limiter names say what is being protected, not which route raised them. The
ones that end in `_email` guard sending mail to an address the caller typed,
which is the inbox-spam and mail-cost risk: `rate_limit_contact_email`,
`rate_limit_gift_create_email`, `rate_limit_otp_email`,
`rate_limit_password_reset_email`, `rate_limit_email_confirmation`,
`rate_limit_email_change`, `rate_limit_invoice_email`. `POST /gift/offers` used
to share the contact bucket, so one form spent the other's budget; it has its
own now.
`POST /account/checkout/voucher/validate` collapses voucher probe failures to
`voucher_invalid`. Locked/deleted accounts are rejected on `requireAuth` and
`/auth/refresh`. Step-up `/account/unlock` failures count toward login lockout.
Auth OTP send cooldown (`AUTH_OTP_COOLDOWN`, default 1m, TTL
`AUTH_OTP_TOKEN_TTL` 10m) is per purpose (signup/login/unlock). Verify
and unlock-with-code also apply `AUTH_OTP_MAX_ATTEMPTS` (default 5, burns
the live code) and a response floor of `AUTH_OTP_VERIFY_DELAY` (default
`750ms`; `0ms` disables).
When a per-IP limiter, per-user send cap, or login lockout trips, the API can
send a owner spy email gated by the matching `spy.rate_limit_*` admin
preference (cooldown `RATE_LIMIT_SPY_COOLDOWN`, default 15m).

## PII encryption at rest

Emails, names, phones, address lines, delivery notes, order address
snapshots, confirmation-token emails, and cardholder names are stored as
AES-256-GCM ciphertext. Login uniqueness uses `users.email_lookup`
(HMAC of the lowercased email). Keys: `PII_ENCRYPTION_KEY` and
`PII_LOOKUP_PEPPER` in `.env/<mode>/.private.env` — generate with
`npm run operation -- generate-key db` (see [command](../command/README.md)). Ops `--search` is exact
email only. Invoice / Mondial PDFs on disk remain plaintext.

## Health check

### `GET /healthz`

No auth, no DB dependency at all — just confirms the process itself is up.

Response `200`: `{"ok":true}`.

## Crawlers

This app answers on its own subdomain, so a search engine treats it as a site
of its own and will crawl it. `src/middleware/crawlerPolicy.ts` gives it an
answer instead of a 404.

### `GET /robots.txt`

No auth. Static `text/plain`: `User-agent: *` with an empty `Disallow:`, so
every agent may crawl everything. This is load-bearing: Google renders the
shop's pages and applies this host's robots.txt to every `fetch()` they make.
A `Disallow: /` here failed every catalogue request for Googlebot, so its
render of a product page never left the skeleton and the front's `/healthz`
probe reported the backend down.

Keeping the API out of search is the job of the header instead: every
response outside `/media/` carries `X-Robots-Tag: noindex`. A crawler only
sees that header on a URL it may fetch, which is a second reason not to
disallow anything. This matters most for the link-preview shim at
`GET /gallery/set/:uid/preview`, which must never compete in search with the
real product page on the shop's own domain. Prod and preprod serve catalogue
photos from the front's docroot (`URL_PUBLIC_MEDIA`); the `/media/` exemption
only keeps the rule correct for the local-dev static mount.
