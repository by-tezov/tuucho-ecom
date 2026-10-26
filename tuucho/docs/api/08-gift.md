# Gift offers

Public, giver, receiver, and admin HTTP for two-person gift promises. An
order exists only after Marc’s checkout settles. Julie’s confirm is not an
order. Root [`API.md`](../../API.md) links here. Related:
[schema](../schema/08-gift.md) · [cron](../cron/README.md) ·
[conventions](./00-conventions.md).

New offers are always accepted. `enabled` on `GET /gift/settings` is always
`true` so an older shop build still shows Offrir. Tokens keep working until
they expire, cancel, complete, or pass `receiver_visible_until`
(`410 gift_gone`).

Public `GET /gift/settings` returns `{ success, enabled, maxSetsCeiling,
minBudget, maxBudgetCeiling, maxAccessoryBudgetCeiling, receiverTokenTtlDays,
stockHoldTtlDays, giverPayTtlDays, setPriceRange }` so `/gift` can
show the two caps, print offer expiry on the share-card preview,
and state the stock-hold window after confirm, without posting.
`maxSetsCeiling` is `max(shipping_packet_measurements.quantity)` after courier `data-packet.json` import (packed-nail ceiling, unused for create).
`maxBudgetCeiling` and `maxAccessoryBudgetCeiling` are independent caps, and
`minBudget` is the floor under the sets budget.

Errors of note: `404 not_found`, `410 gift_gone`,
`409 gift_inactive` (receiver mutating outside `selecting`), `409 gift_frozen`
(Julie mutating after confirm: `awaiting_payment`, `paying`, or `ordered`),
`409 gift_stock_unavailable`, `409 gift_budget_exceeded`,
`409 gift_accessory_budget_exceeded`, `409 gift_accessories_forbidden`,
`409 gift_sets_exceeded` (leftover offers that still have `maxSets`),
`400 gift_budget_ceiling` (`maxBudget` above `maxBudgetCeiling`, or
`maxAccessoryBudget` above `maxAccessoryBudgetCeiling`; `error.max` is the matching
ceiling and `error.field` is `maxBudget` or `maxAccessoryBudget`),
`400 gift_budget_floor` (`maxBudget` below `minBudget`; `error.min` is that
floor and `error.field` is `maxBudget`),
`409 gift_already_ordered`, `409 gift_not_payable`,
`409 gift_not_editable` (share-card edit/download/email, or extend, outside
`selecting`), `409 gift_extend_limit` (extend would push `offer_expires_at`
past the ceiling; `error.maxExpiresAt` is that ceiling),
`401 gift_pin_required` (missing or expired pin grant on a PIN-gated token route
when the caller is not the signed-in giver), `401 gift_pin_invalid` (wrong PIN),
`429 gift_pin_throttled` (`Retry-After` plus `error.retryAfterSec` / `error.retryAt`).

Rate limits: create/confirm/open-pay/pin unlock reuse contact/auth
limiters; the giver pays through the account checkout and its limiters.

## Create and giver

### `GET /gift/settings`

Public. `{ "success": true, "enabled": true, "maxSetsCeiling": number,
"minBudget": number, "maxBudgetCeiling": number, "maxAccessoryBudgetCeiling": number,
"receiverTokenTtlDays": number, "stockHoldTtlDays": number, "giverPayTtlDays": number,
"setPriceRange": { "min": number, "max": number } | null }`.
`setPriceRange` is the cheapest and dearest public nail set currently in
stock (same range as the gallery price filter, in-stock only, floored and
ceiled to whole euros; `null` when nothing is buyable). `/gift` divides the
budget by `min` to print "up to this many sets" under the budget input, so the
giver sets a number that means something. `max` is published for the range the
gallery filter already shows; the estimate deliberately quotes one bound, since
"up to 2" and "1 to 2" are the same sentence.
`maxSetsCeiling` is packed-nail `shipping_packet_measurements.quantity` (0 if none imported).
`maxBudgetCeiling` (`GIFT_MAX_BUDGET_CEILING`, 150 €) and `maxAccessoryBudgetCeiling`
(`GIFT_MAX_ACCESSORY_BUDGET_CEILING`, 10 €) are independent. `minBudget`
(`GIFT_MIN_BUDGET`, 12 €) is the smallest sets
budget `POST /gift/offers` accepts and the floor the create form snaps to;
startup refuses a floor above the ceiling. Token/hold/pay windows:
`receiverTokenTtlDays` 30, `stockHoldTtlDays` 7, `giverPayTtlDays` 15.

### `POST /gift/offers`

Optional session. Contact rate-limited.

Body: `giverEmail`, `giverDisplayName` and `receiverName` (required, trimmed,
≤ 80 characters, no control characters, otherwise `400`), required
`giverComment` (≤ 500 characters including spaces, tabs, and line
breaks, at most 6 lines, PII; stored and printed as typed, not trimmed), required `shareCardStyle`
(`tuucho` | `anniversaire` | `mariage` | `fete` | `noel` | `valentin` |
`meres` | `merci` | `diplome` | `amitie` | `minimal` | `coquin` | `manga` |
`halloween` | `nouvelan` | `artdeco` | `botanique` | `neon` |
`celeste` | `fantastique`;
legacy `qr` | `birthday` | `gift` | `party` | `felicitations` | `koi` | `zodiaque` | `vache` | `naissance` | `marbre` | `tigre` | `leopard` | `zebre` | `girafe` | `paon` | `dalmatien` still accepted
and mapped),
required `accessPin`
(exactly 4 digits), required `maxBudget` (> 0 TTC), optional
`hideReceiverPrices` (default `true`), optional `allowAccessories` (default
`false`). When `allowAccessories` is true, `maxAccessoryBudget` (≥ 0 TTC)
is required; it is an **extra** accessory envelope on top of leftover unused
nail `maxBudget`, and is capped by Boutique `maxAccessoryBudgetCeiling`
(not `maxBudgetCeiling`). Leftover
unused nail budget may always be spent on accessories, even when
`allowAccessories` is false. `language`, and
`gdprConsent.accepted` when the giver is not signed in.
`maxSets` is ignored if sent; new offers always store `max_sets` null.

Omit `Authorization` for the guest path. A Bearer that cannot be resolved
(expired, locked, malformed) is `401 unauthorized`, not a silent guest
create — the shop refreshes and retries. Signed-in session email must equal
`giverEmail` (`400 invalid_request` otherwise). Both paths start in
`selecting` with a live receiver token. Signed-in create returns
`receiverUrl` and `cartId` (the attached gift cart; it is not the
active shop cart until the giver activates it). Guest create returns
`checkEmail: true` and **no** `receiverUrl` (`cartId` is null) — the
share card (a landscape A4 PDF attachment with
**one** cut-out 5×3 inch card in the chosen `shareCardStyle`, plus a JPEG of
that card alone at 5×3 inches / 300 dpi; the QR caption
is a localized “use before” line plus the offer expiry date; PIN never on
the sheet, the JPEG, or in mail; the receiver URL lives on the card QR, not in the
mail body) and giver portal CTA are **enqueued** on `mail_jobs` and sent by
the in-process mail worker (not on the create request path). They go
**only** to the giver mailbox. That is the mailbox proof; there is no
confirm-your-address click and no account email verification. The server
never mails the receiver. Create does not collect a receiver email.
A owner spy copy (`spy.gift_created`, default on unless `DISABLE_SPY_EMAIL`)
is still fire-and-forget in parallel. It never includes the PIN or live tokens.

Too many creates from one IP → `429 rate_limited`.
Missing or empty `giverComment` (no non-whitespace character), or more than
6 lines → `400 invalid_request`.
Missing or unknown `shareCardStyle` → `400 invalid_request`.
Missing or non-4-digit `accessPin` → `400 invalid_request`. The PIN is
stored hashed only (peppered argon2id) and is **never** put in mail or API responses.
Missing, non-numeric, or non-positive `maxBudget` → `400 invalid_request`.
`maxBudget` above Boutique `maxBudgetCeiling` → `400 gift_budget_ceiling`
with `error.max` and `error.field: "maxBudget"` (currently 150 €).
`maxAccessoryBudget` above `maxAccessoryBudgetCeiling` → the same code with
`error.field: "maxAccessoryBudget"` (currently 10 €).

### `POST /gift/giver/:token/pin`

Gift-PIN rate-limited (`RATE_GIFT_PIN`). Body `{ "pin": "1234" }`. On
success `{ success, pinToken, expiresAt }` and any soft-brake attempt row
for this offer/role is cleared. Wrong PIN → `401 gift_pin_invalid` with
**no** attempt counters in the body. The first failures up to
`GIFT_PIN_FAILURES`'s free-failures half (default `5:8`) have no
wait. From that failure onward → `429 gift_pin_throttled` with
`Retry-After`, `error.retryAfterSec`, and `error.retryAt` (backoff 2s,
4s, 8s, … cap 300s). After `GIFT_PIN_FAILURES`'s max-failures half
→ `403 gift_pin_locked`. Subsequent giver token routes
require header
`X-Gift-Pin-Token: <pinToken>` (CORS-allowed with the other shop headers),
**unless** the request has a Bearer session for this offer’s giver:
`giver_user_id` matches, or the session email matches the giver email
(same account, including after a guest create). Offers with a null
`pin_hash` skip this gate.

### `GET /gift/giver/:token`

Capability token plus pin grant (see pin unlock), or a Bearer session for
the attached giver (no PIN). Confirm / share card for the claim splash (not a product
recap page). Includes `receiverUrl` when the receiver token is live. Marc
sees item prices. The payload also includes
`maxAccessoryBudget` (null when there is no dedicated accessory envelope)
and `canExtend` (whether `POST .../extend` below would be accepted right
now). The shop clears a leftover receiver
origin lock in this browser when this URL is opened.

### `POST /gift/giver/:token/open-pay`

Auth rate-limited. Manage-guest-order semantics: create or attach a
passwordless verified user for the giver email, revoke any other refresh
cookie on the request, and ensure that offer’s `kind=gift` cart. Allowed
in `selecting`, `awaiting_payment`, and `paying`. Does **not** freeze
Julie or set `paying` — that happens when Marc starts checkout. When the
gift cart is new or the offer is still `selecting`, copies Julie’s lines
and destination onto that cart (one-time account address). Re-entry after
confirm does not overwrite an unlocked / edited cart.
`201` when a user was created, `200` when attached. Response includes
`accessToken`, `cartId`, `offerId`, and `user`. Issues a **session**
refresh cookie (`rememberMe: false`): a tab refresh keeps the giver
signed in; closing the browser ends the session, same as login without
remember. The giver link **replaces** any other restored account (including
remember-me): the shop signs that session out via `POST /auth/logout`
before this call. This route does not receive the refresh cookie
(`Path=/auth`), so it cannot revoke a remembered login by itself; a
session `Set-Cookie` also does not reliably replace a persistent one.
The gift cart is left **active** even when it has no lines yet
(receiver never opened / still `selecting`). The shop lands on `/cart`.

PIN vs session:

- Signed-in as this giver (remember-me, matching `giver_user_id` or
  giver email): PIN is **not** required. The shop opens the gift cart.
- Anyone else, including a visitor whose giver email has **no** account
  yet, must send `X-Gift-Pin-Token` (after `POST /gift/giver/:token/pin`).
  The mailed "espace cadeau" link alone must not create or sign in that
  account. The shop asks for the PIN before `open-pay`.
- After a valid PIN, `open-pay` may still create a passwordless verified
  account and issue a session. That is the no-signup pay path. Mitigations
  are PIN entropy/lockout, gift-PIN / auth rate limits, non-persistent
  refresh cookies, and treating the PIN as a secret separate from the
  mailed link.

### `POST /gift/giver/:token/unlock-cart`

Bearer must be the attached giver. Allowed in `awaiting_payment` and
`paying`. Sets `cart_items.locked = false` for `origin=user` lines so
Marc can edit qty, address, and courier in the shop cart. `selecting`
→ `409 gift_frozen` (Julie still owns the choice). After unlock, shop-cart
line add/patch/delete on that gift cart reallocates the gift hold (and
`gift_items`) to the remaining user lines, so a removed set returns to the
gallery. A checkout PaymentIntent hold is not rewritten. Removing the last
user line (nail set or accessory, not a rule kit) in the shop opens the
cancel-offer confirm instead of leaving an empty `awaiting_payment` cart.

### `POST /gift/giver/:token/cancel`

`cancelled` if no order yet. Releases the hold and drops the gift cart.
If that cart was active, another cart is activated (prefer `default`).

### `POST /gift/giver/:token/extend`

No body. Shares the `RATE_GIFT_SHARE_CARD_UPDATE` budget with the PATCH
below (same status-block actions on the same giver token, no extra env
var). Allowed only in `selecting` (`409 gift_not_editable` otherwise: after
the receiver confirms, the live clocks are `hold_expires_at` and
`pay_by_at`, which this route never touches). Adds 14 days to
`offer_expires_at`, counted from the current expiry when it is still in the
future, otherwise from now. Refused with `409 gift_extend_limit` when the
result would land beyond `GIFT_EXTEND_CEILING_DAYS` from now (60 days, about
two months), so repeated clicks cannot park a live promise and its PII
arbitrarily far out; that ceiling rolls with the clock, so the giver can
extend again later. `GET /gift/giver/:token` publishes the same rule as
`canExtend`, which is what hides the button once the ceiling is reached; the
route re-checks it under the row lock. Response `{ success, offerExpiresAt, canExtend }` (`canExtend` false once
this extension used up the ceiling). Backs the
"Prolonger de 2 semaines" button on the gift cart's status block, next to
the share-card download.

### `PATCH /gift/giver/:token/share-card`

Rate-limited by `RATE_GIFT_SHARE_CARD_UPDATE` (`<window>:<count>`, default
`15m:5`, own budget, `DISABLE_RATE_GIFT_SHARE_CARD_UPDATE` dev-only bypass
— not shared with the download/email routes below or with
`authRateLimiter`). Body `{ receiverName, giverComment, shareCardStyle }`
(all required; same bounds as `POST /gift/offers`). Allowed only in
`selecting` (`409 gift_not_editable` otherwise — Julie already claimed the
card, the giver's own copy is frozen with it). Persists the edit onto the
offer, so it also changes what the confirm/receiver-facing views show and
what later downloads/emails render. Response
`{ success, receiverName, giverComment, shareCardStyle }`. Backs the "Ma
carte cadeau" download modal on the gift cart's status block.

### `GET /gift/giver/:token/share-card/download`

Rate-limited by `RATE_GIFT_SHARE_CARD_DOWNLOAD` (`<window>:<count>`,
default `15m:5`, own budget, `DISABLE_RATE_GIFT_SHARE_CARD_DOWNLOAD`
dev-only bypass). Query `?format=pdf|jpg` (default `pdf`). Same
`selecting`-only gate as the PATCH above. Same two files as the create-time
email: `pdf` is the printable landscape A4 sheet with crop marks (not a
bare 5"x3" card), `jpg` is the 5"x3" print-size JPEG. Streamed as
`application/pdf` or `image/jpeg` with `Content-Disposition: attachment`.
Regenerated from the offer's current fields on every call; nothing is
stored.

### `POST /gift/giver/:token/share-card/email`

Rate-limited by `RATE_GIFT_SHARE_CARD_EMAIL` (`<window>:<count>`, default
`15m:5`, own budget, `DISABLE_RATE_GIFT_SHARE_CARD_EMAIL` dev-only bypass).
Same `selecting`-only gate. Re-sends the same share-card
mail as offer creation (PDF + JPEG attached) to the giver's own account
email — never a free-text recipient. Response `{ success: true }`.

### `GET /gift/mine`

Bearer required. Open promises for `giver_user_id` (giver token included so
the shop can claim `/gift/giver/:token` and land on `/cart`). Each row
includes `cartId` when the gift cart exists. Open gift carts are listed on
`GET /account/carts` with `kind: "gift"` and a `gift` object
(`offerId`, `status`, `receiverName`, `giverToken`, budgets). Activate is
allowed. Rename / merge / delete remain `400 invalid_request`. Terminal
offers drop off the cart list. The giver-token mail CTA (“Ton espace
cadeau”, localized from the offer language) opens that gift cart. The
share-card mail states the offer stays active until `offer_expires_at`.
The promise mail keeps the offer active until `pay_by_at`, and states stock is reserved until `hold_expires_at`, then released.

### `GET` / `PUT /gift/giver/:token/cart`

Bearer must be the attached giver. Items are Julie’s locked lines. PUT
patches checkout selection on **that** cart (address, courier, voucher,
loyalty, express) — never the active shop cart.

### Giver checkout

The giver pays with the account checkout (`/account/checkout/*`, see
[account checkout](./14-account-checkout.md)) once the gift cart is the
active cart (`POST /account/carts/:cartId/activate`; the shop activates it after
`open-pay`). Requires the checkout privacy session. Pricing and voucher preview treat the
offer’s current gift (or checkout) hold as available stock for that cart, so
Julie confirming does not make Marc’s lines look sold out. After reserve, the
offer’s `stock_reservation_id` is the checkout hold (the gift hold is released in
the same reservation). After `confirmOrder` / `settlePaymentIntent`, the
offer becomes `ordered` and `orders.gift_snapshot` is written.
Account `GET /account/orders` decrypts that snapshot to `order.gift`
(`receiverName`, `giverDisplayName`, ceilings). See
[account orders](./03-account.md).

## Receiver

Raw token in the path. No JWT. Catalogue `price` is omitted when
`hideReceiverPrices` is true. Courier fees are never returned.
Receiver token routes require a pin grant after
`POST /gift/:token/pin`, except that unlock route itself.

### `POST /gift/:token/pin`

Gift-PIN rate-limited. Same body, response, soft brake, hard lock, and
errors as the giver pin unlock. Wrong PIN → `401 gift_pin_invalid`.
Waiting → `429 gift_pin_throttled`. Locked → `403 gift_pin_locked`.
Missing grant on other receiver routes → `401 gift_pin_required` with no
names or prices.

### `GET /gift/:token`

Summary: names, optional giver comment, remaining nail budget (and leftover
`remainingSlots` when a row still has `maxSets`) and remaining accessory
budget (dedicated envelope plus leftover unused nail budget), items (nails
and accessories with `packKey`), destination, clocks, `orderId`. After
Marc’s checkout, also `orderNumber`, `orderStatus`, and
`orderConfirmedAt` (null until then). `410 gift_gone` after the visibility window.

### `POST /gift/:token/session`

Mints a 2-hour lock session (`lockToken`, `expiresAt`, `idleTimeoutMs`).
The front stores lock tokens in this tab (`sessionStorage`) and only the
expiry origin-wide (`localStorage`, no token). A new tab does not resume
the gift. A restarted browser that restores `sessionStorage` is treated
as a new tab (invite while the origin block is live, otherwise the
normal shop). Opening `/gift/giver/:token` in this browser clears that
origin block and the tab gift session so Marc can use the priced shop
again (he may have opened Julie’s URL by mistake). A tab opened from the
gifts panel does not publish that block and is not held by one, so the
giver tab opened afterwards is not locked out of the shop, and closing
the receiver tab does not leave a lasting origin lock. That tab still
acts as the participant (receiver shop lock in session). A signed-in
administrator is not held by an origin block either. Other shop tabs
drop their gift session when the origin key is removed. The address bar
in the gift tab is overwritten to
`/gift/:token` (display only; Back/Forward still follow the shop pages).
After Julie confirms, opening that token lands on the follow order
(`/cart`), not the gallery. This route does not set a cookie.

### `GET /gift/lock/:token/status`

Takes the **lock token** minted above, not the receiver token, and returns
only `{ success, status }`. Deliberately scoped down: a locked-out tab
re-sends this from every other page to decide whether the lock still makes
sense, so no page outside the gift page has to hold the receiver token,
which can read items, addresses and pricing. Mounted before
`requireGiftPin` — the lock token was already issued behind the PIN.

An expired or unknown lock token returns
`200 { "success": true, "status": null }`, not an error: a lapsed lock is
the answer the tab is asking for.

### `GET /gift/:token/gallery/feed`

Nail sets only. Same filter query params as `/gallery/feed` (`occasion`,
`shape`, `length`, `size`, `minPrice` / `maxPrice` when prices are
visible, `cursor`, `limit`). Browsing is `stock=in` with remaining nail budget as inclusive
`maxPrice` and `minPrice` 0, so only sets still affordable with the
current basket appear. Refetch after every basket write. `ids` (cap 200)
hydrates cart lines **without** stock or budget filters so a sold-out
basket line still resolves. `price` omitted when hidden.

### `GET /gift/:token/gallery/filters`

Filter options; `priceRange` is null when prices are hidden, otherwise
clamped to remaining budget. Includes Boutique `outOfStockEnabled`
and `outOfStockSizeRequestEnabled` (same meaning as
`GET /gallery/filter-options`).

### `GET /gift/:token/gallery/set/:uid`

One public nail set; `price` omitted when hidden. Sold-out sets return
`404 not_found` when Boutique `outOfStockEnabled` is `false`.

### `GET` / `PUT` / `DELETE /gift/:token/items`

Basket CRUD while `selecting`. After confirm, writes return
`409 gift_frozen` and do not refresh the hold. Nail `maxBudget` applies
only to nail lines (leftover `maxSets` still caps quantity; dedicated
accessory money cannot buy sets). Accessory merchandise is checked against
leftover unused nail `maxBudget` plus dedicated `maxAccessoryBudget` (0 when
the offer has no dedicated envelope) (`409 gift_accessory_budget_exceeded`).
Leftover unused nail budget may always be spent on accessories.
`gift_accessories_forbidden` is not returned for a missing dedicated
envelope. `packKey` is required for `byQuantity` accessories, same as the
shop cart.
The receiver cart carousel still loads public `GET /gallery/cart-accessories`,
then only offers accessories whose cheapest in-stock pack or unit still fits
`remaining.remainingAccessoryBudget` (dedicated + leftover unused nail budget,
minus accessory merchandise already in the basket — same idea as gallery
`maxPrice` for nail sets). Nail `remainingBudget` also subtracts leftover
already spent on accessories so that leftover cannot be spent twice. Pack
chips and quantity on an existing accessory line use that same remaining cap.
Writes remain `409 gift_accessory_budget_exceeded` if they would exceed it.
Shop `gift_per_nail_set` cart-rule lines are **not** in this payload; the
receiver UI previews them from public `GET /gallery/cart-rules` the same
way a guest cart does. They are applied on Marc’s checkout and do not
consume the accessory budget.

Custom-set gift cart lines are not a kernel route. A bundled extra-set
plugin owns them when it is enabled.

### `GET /gift/:token/couriers`

Enabled couriers for the destination country, packet prices stripped.

### `GET` / `PUT /gift/:token/destination`

Address + courier. PII encrypted at rest. Writes after confirm return
`409 gift_frozen`. `GET /gift/:token/address-countries` and
`GET /gift/:token/phone-countries` are unauthenticated copies of the
account country lists.

### `POST /gift/:token/confirm`

Body `{ "email": "julie@example.com" }` (required, valid address). Stores
the encrypted `receiver_email` on the offer, then creates the gift stock
hold and moves to `awaiting_payment` (no `orders` row yet). Idempotent:
a second confirm while already `awaiting_payment` returns the current
summary without rewriting the email. Missing or invalid email is
`400 invalid_request`. Receiver mutations after this return
`409 gift_frozen`. The receiver UI switches `/cart` to a read-only
orders-card follow view (nails, paid accessories, and cart-rule free
gifts — the same groups as an order card). The gift hold is allocated
in that confirm; Marc’s `kind=gift` cart treats those reserved units as
available for that cart (public remaining still excludes the hold).

### `GET /gift/:token/status`

Lifecycle + order status/tracking boolean after `ordered`. No amounts.

## Admin

### Gift settings

Env TTLs and ceilings, read-only and with no admin route: budget ceilings,
`maxOpenPromisesPerGiver`, PIN failures (`GIFT_PIN_FAILURES`, currently
`5:8`), purge delay (`GIFT_PURGE_AFTER_DAYS`, currently 396). Gifting is
always on; there is no Boutique switch. Public packed-nail `maxSetsCeiling`
is `max(shipping_packet_measurements.quantity)`, not a stored field.

### `GET /admin/gift/offers`

Admin session. Paginated **active** offers (`selecting`,
`awaiting_payment`, `paying`). Query `page` (default 1) and
`pageSize` (default 20, max 100). Newest `created_at` first.

Each row is decrypted PII (giver email/name, receiver name, and
`receiverEmail` once the recipient has confirmed) plus status, budgets,
clocks (`offerExpiresAt`, `holdExpiresAt`, `payByAt`), and `createdAt` /
`updatedAt`. Capability tokens are **not** returned on this list.

```json
{
  "success": true,
  "offers": [
    {
      "id": "uuid",
      "status": "selecting",
      "giverEmail": "marc@example.com",
      "giverDisplayName": "Marc",
      "receiverName": "Julie",
      "receiverEmail": null,
      "maxSets": null,
      "maxBudget": 200,
      "allowAccessories": false,
      "maxAccessoryBudget": null,
      "clocks": {
        "offerExpiresAt": "2026-10-07T12:00:00.000Z",
        "holdExpiresAt": null,
        "payByAt": null
      },
      "createdAt": "2026-09-07T12:00:00.000Z",
      "updatedAt": "2026-09-07T12:00:00.000Z"
    }
  ],
  "pagination": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
}
```

### `POST /admin/gift/offers/:id/enter`

Admin session with both `gift` and `impersonate`. Body
`{ "role": "giver" | "receiver" }`. From the gifts panel, this signs the
administrator in as that participant, with the same actions, without the
4-digit PIN and without revealing the PIN.

The route mints a normal pin grant (`gift_pin_sessions`, same TTL as a
correct PIN, `GIFT_LOCK_SESSION_TTL_HOURS`) and returns it once, with the
capability token for that role:

```json
{
  "success": true,
  "role": "giver",
  "language": "fr",
  "capabilityToken": "<opaque>",
  "pinToken": "<opaque>",
  "expiresAt": "2026-10-13T09:00:00.000Z",
  "cartId": "<uuid or null>"
}
```

`capabilityToken` and `pinToken` are secrets. They are not on
`GET /admin/gift/offers`. API logs redact both field names.

The capability token is the offer's existing gift URL. Clicking mints a pin
grant for this opening only (`GIFT_LOCK_SESSION_TTL_HOURS`). It does not
create another permanent URL.

`giver`: `cartId` is the gift cart (open-pay runs first, including a
passwordless customer when the giver has none yet). The shop opens another
tab signed in as that giver, on the cart. This administrator tab stays.
A giver email that belongs to a staff account is `400 invalid_request` and
does not open the offer. A status other than `selecting`,
`awaiting_payment`, or `paying` is `409 gift_not_payable`.

`receiver`: `cartId` is null. The shop opens another tab as the recipient.
That tab does not take the administrator session. This tab stays.

Unknown id, or a missing capability token, is `404 not_found`. A bad id or
role is `400 invalid_request`. The action is written to the administration
journal as `gift.enter` (offer id and role; no tokens).
