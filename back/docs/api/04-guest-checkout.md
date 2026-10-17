# Guest checkout

## Guest checkout (`/checkout/guest/*`)

Unauthenticated — no `Authorization` header, mounted outside `/account` on
purpose. Lets a customer order with just an email + delivery/billing address

- CGU/privacy consent, no account. Stock is reserved under the checkout
  attempt's own reservation id (an unguessable UUID, same TTL/hold mechanism
  as the authenticated flow) instead of a `user_id`. `orders.user_id` is
  `null` and `orders.guest_email` is the sole contact point — enforced by
  `orders_owner_chk`, exactly one of the two is ever set. Guest confirm
  **never** auto-attaches to an existing account for that email: the order
  includes a visible delivery address, so ownership waits for the 24h
  “Manage my order” link (`POST /auth/manage-guest-order`) or, after expiry,
  the integrity code on `POST /account/guest-orders/:id/claim`.
  `placed_as_guest` stays true after that claim. Remembered address/card
  (`savedForFuture` / `rememberCard` on the guest payload) are stored as
  pending rows keyed by email lookup and only copied onto the account by
  the same manage-order token. Independent later registration or login
  never claims leftover orders or pending saved checkout (including copies
  still sitting in that browser's guest vault). Integrity-code claim
  attaches leftover **orders** only. Unclaimed pending rows expire with the
  manage-token window (`EMAIL_CONFIRMATION_TOKEN_TTL`) and are removed by
  `POST /operation/process-guest-saved-cleanup`.

Guest address/email/payment drafts use the checkout privacy session described
in [API conventions](00-conventions.md#checkout-privacy-session). Voucher
preview (voucher or loyalty), create-intent and free checkout require
`X-Checkout-Session` and
extend its sliding idle deadline. A full refresh resumes the same encrypted
tab vault while it remains valid. After the configured inactivity window the
front clears sensitive state, informs a guest, and starts a fresh session;
cart lines remain. A new/duplicated live tab gets its own session.

### Shop payment methods (guests)

#### `GET /checkout/payment-methods`

Unauthenticated. Optional query `deliveryCountry` (ISO-3166-1 alpha-2) merges
with best-effort client geo (Cloudflare `CF-IPCountry`, else ipwho.is) into
`countryContext.effectiveCountries`.

Returns shop-wide admin toggles, per-method country allowlists, and geo context:
`{"success":true,"shopPaymentMethods":{…},"paymentMethodCountries":{…},"countryContext":{…}}`.
Empty country lists mean “all countries”. Payment methods default `false`.
Bancontact defaults to `["BE"]` until configured. The loyalty programme is
always on. The composition page has its own Boutique preference
(`GET /gallery/composition-page`) and is not part of this payload.
Guest cart uses this instead of the account payment payload.

#### `POST /checkout/loyalty/preview`

Guest earn preview (no spend). Body needs cart `items` and optional
`voucherCode` only — address/courier are ignored; earn is merchandise-only.
Response `{ "success": true, "preview": { "enabled", "loyaltyEarn", … } }`.

#### `POST /checkout/guest/voucher/validate`

Unauthenticated read-only preview. Body contains `items`, `address`, optional
`billingAddress`, `courierCode`, optional `express`, optional `email` (when
already known, so per-customer caps can fail early), and `code`; guest e-mail
and consent are not required until confirmation. The server reloads products,
stock, delivery prices, cart rules and the voucher, then returns the same
authoritative pricing fields as the account endpoint:
`{"success":true,"voucher":{...},"subtotal":number,"shippingListFee":number,"shippingFee":number,"rulesItemDiscount":number,"cartRules":object,"total":number}`.
Nothing is held or consumed by this preview. Voucher-specific failures are
collapsed to `400 voucher_invalid`, so the public route cannot be used to
enumerate whether a code is absent, disabled, depleted, restricted or merely
not valid yet. `create-intent` and `free` always reprice and validate again.

### Guest-order claim

Authenticated account routes:

- `GET /account/guest-orders` lists otherwise-unlinked guest orders whose
  encrypted checkout email exactly matches the current account email. It
  returns only `{id,orderNumber,total,status}` and excludes orders the account has
  dismissed.
- `POST /account/guest-orders/:id/claim` accepts
  `{"integrityToken":"ABCD-1234-EFGH-5678"}`. Fallback when the manage-order
  email link was never used or expired. The token must match the
  order's current integrity token **and** the guest email must exactly match
  the current account email; on success ownership moves to the account
  (`placed_as_guest` stays true). This guest→account transition is one-way
  and database-enforced. If the order is already `received` and admin-verified,
  any pending loyalty earn is credited to the account wallet in the same
  request.
- `POST /account/guest-orders/:id/dismiss` permanently hides that matching
  guest order from this account without changing the order itself.

Current scope: home delivery only (no Point Relais pickup). Public vouchers
and the same server-side cart-rule discounts/gifts as account checkout are
supported. A voucher with an account allow-list is refused for a guest because
there is no authenticated identity to match. Loyalty may be earned but cannot
be spent. Payment is card / PayPal / Bancontact / Google Pay / Apple Pay only (no
saved/reusable wallet — every guest PaymentIntent is a one-off;
`setup_future_usage` is only set when a guest card is explicitly remembered).

Every route below shares the same request body shape unless noted:

```json
{
  "items": [{ "productId": "uuid", "shapeKey": "string", "lengthKey": "string", "size": "string", "packKey": "string", "quantity": number, "comment": "string|null?" }],
  "address": { "recipientName": "string|null", "companyName": "string|null", "line1": "string", "line2": "string|null", "deliveryNotes": "string|null", "postalCode": "string", "city": "string", "countryCode": "string", "phone": "string|null", "savedForFuture": "boolean?" },
  "billingAddress": { "...same shape as address" },
  "courierCode": "string",
  "express": "boolean?",
  "voucherCode": "string?",
  "email": "string",
  "gdprConsent": { "accepted": true },
  "language": "en",
  "rememberCard": "boolean?"
}
```

`shapeKey`/`lengthKey`/`size`/`packKey` are `""` for a plain accessory line
(same empty-string convention as `cart_items`). Optional `comment` on an item
or a `compositions[]` entry is the customer note typed on the cart card
(trimmed, max 500 characters, line breaks kept, blank means none); it is
copied onto `order_items.comment`. An over-long or control-character note is
`400 invalid_request`. `billingAddress` is optional
— omitted means same-as-shipping. `savedForFuture` / `rememberCard` are
opt-in (`true` only). On a successful confirm they create pending
`guest_saved_addresses` / `guest_saved_cards` rows (a pending Stripe
Customer holds a remembered card). `rememberCard` is ignored for PayPal,
Google Pay, and Apple Pay.
`400 invalid_request` for any missing field, an item whose `productId`
doesn't resolve to a real public product, or `gdprConsent.accepted` not
`true`.
For Mondial Relay Home and Point Relais, `address.phone` must be a valid
non-empty phone number (optional leading `+`, 8–15 digits); checkout
otherwise returns `400 recipient_phone_required`. An ill-formed phone is
`400 invalid_request`.

#### `POST /checkout/guest/create-intent`

Card, PayPal, Bancontact, Google Pay, Apple Pay, or new card (`method` other
than those is rejected). A **saved / vault** card uses a client-tokenized
`paymentMethodId` (no saved-card branch for a guest). `method: "new_card"`
opens a card-only PaymentIntent with `setup_future_usage: on_session` and
no `paymentMethodId` (card collected in the pay sheet). `method: "paypal"` /
`"bancontact"` / `"google_pay"` / `"apple_pay"` omit `paymentMethodId`.
Shop-disabled methods return `403 payment_method_forbidden` (same gate as
authenticated checkout). Before create-intent with a `paymentMethodId`, the
card id must have been registered by `POST /checkout/session/payment-methods`
in the same live session; otherwise the route returns
`409 payment_method_not_available`.
Prices + atomically reserves
stock against the ad-hoc `items`/`address`, then opens a Stripe PaymentIntent
for the total. Bancontact uses automatic capture (order already `captured`);
card / PayPal / wallets stay manual. `method: "new_card"` always sets
`setup_future_usage: on_session`. When `rememberCard` is true on a **saved**
card intent the intent also sets
`setup_future_usage: on_session` so the PaymentMethod can later attach to a
pending customer; ignored for PayPal, Bancontact, and wallets (checkout-only).
For `new_card`, the remember opt-in is chosen in the pay sheet after the
intent exists. The shop records it with `POST /checkout/guest/remember-card`
before confirm, and settlement follows that snapshot flag (the webhook and
`/finalize` race; whichever runs first must already see the choice). Stripe
`allow_redisplay: always` remains a backstop when the snapshot already has a
saved-checkout intent and `rememberCard` is still false.
Response `{"success":true,"clientSecret":"string","reservationExpiresAt":"ISO datetime","amount":number,"subtotal":number,"shippingListFee":number,"shippingFee":number}`.
`409 free_checkout_required` if the total is `0` — use `/free` instead, same
as the authenticated route.

#### `POST /checkout/guest/free`

Confirms a checkout whose authoritative total is exactly `0` without calling
Stripe. This can result from the server's cart rules, a public voucher, or
zero-priced lines; the server reprices the complete request before accepting
the free path. Response
`201 {"success":true,"order":Order}`. `409 payment_required` if the total is
not actually zero.

#### `POST /checkout/guest/remember-card`

Body: `{"paymentIntentId":"pi_...","rememberCard":true}`. Called from the
new-card pay sheet before `confirmPayment`, once per attempt, with the
checkbox's current value. Same ownership as `/finalize`: the PaymentIntent
id plus `guestEmail` metadata and no `userId`. Updates the held guest
reservation so a remembered card is stored at settle even when Stripe leaves
`allow_redisplay` off `always`. `rememberCard: false` clears a previous opt-in
and does not drop an address that was already marked `savedForFuture`.
`400 invalid_request` when the id or the boolean is missing. `404 not_found`
when the intent is not an open guest checkout. `409 reservation_not_held`
when the intent is no longer confirmable or the stock hold is gone.
Response `{"success":true}`.

#### `POST /checkout/guest/finalize`

Body: `{"paymentIntentId":"pi_..."}`. Same shape as the authenticated route,
routed to the same `settlePaymentIntent` (guest-aware — branches on the
intent's `guestEmail` vs `userId` metadata). Ownership is proven by knowing
the PaymentIntent id itself plus its `guestEmail` metadata being set — there
is no bearer token to compare against. `404 not_found` if the intent has no
`guestEmail` metadata (e.g. it belongs to the authenticated flow instead).
Response `201 {"success":true,"order":Order}`.

#### `POST /checkout/guest/cancel`

Body: `{"paymentIntentId":"pi_..."}`. Same behavior as
`/account/checkout/cancel`, ownership proven the same way as `/finalize`.

#### `POST /checkout/guest/extend`

Body: `{"paymentIntentId":"pi_..."}`. Same behavior, limits and response as
`/account/checkout/extend`, ownership proven the same way as `/cancel`.

#### `POST /checkout/guest/release-failed`

Body: `{"paymentIntentId":"pi_..."}`. Same behavior as
`/account/checkout/release-failed`.

#### `GET /account/orders/:id/revisions`

Lists accepted amendments for this order (`order_revisions`), oldest first.
Each entry includes `revisionNumber`, `kind` (currently
`billing_address_change`), `diff`, totals, `requestedBy`, a shortened
`integrityToken` for that revision's resulting chained hash, and
`previousIntegrityToken` for the snapshot before the change (nullable for
an older first revision whose confirm-time predecessor was not retained).
New orders retain encrypted, full revision-0 and subsequent snapshots
server-side; the client receives only the relevant tokens and amendment diff.
Each entry also includes
`createdAt`.
`404 not_found` if the order isn't this user's. Response:
`{"success":true,"revisions":[…]}`. The `Order` shape also carries
`revisionCount` so the client can show a history button without a prefetch.

#### `POST /account/orders/:id/revisions/lock`

Acquires (or refreshes the caller's own) edit lock on a `confirmed` /
`in_preparation` order. While `lockUntil` is in the future, ops
`PATCH /operation/orders/:id/status` returns `409 order_revision_locked`
while the lock is active, or `409 order_revision_lock_stale` when the TTL
elapsed but lock columns were never cleared (ops must contact the customer
or pass `bypassLockEdit:true` / CLI `--bypass-lock-edit`).
TTL from `ORDER_REVISION_LOCK_TTL` (default 30m). Refuses when an invoice
already exists (`409 invoice_already_issued`), when `content_hash` is null
(`409 content_hash_missing`), or when status is past `in_preparation`
(`409 order_not_editable`). A cumulative maximum of `ORDER_REVISION_MAX`
(default 3) address amendments per order is enforced server-side
(`409 revision_limit_reached`). Response:
`{"success":true,"lock":{"lockToken":string,"lockUntil":string,"ttlSeconds":number},"order":Order}`.

#### `POST /account/orders/:id/revisions/lock/extend`

Body: `{"lockToken":"…"}`. Extends an active lock by another TTL window.
`409 lock_invalid` if the token is missing/expired/not yours.

#### `DELETE /account/orders/:id/revisions/lock?lockToken=…`

Releases the lock early (cancel without save). Token may also be sent in
the JSON body. `409 lock_invalid` if it doesn't match.

#### `PATCH /account/orders/:id/billing`

Body: `{"lockToken":"…","sameAsShipping":true}` or
`{"lockToken":"…","sameAsShipping":false,"billingAddressId":"uuid"}`.
Snapshots the billing columns from the delivery address (same-as-shipping)
or from a owned `kind='facturation'` address, inserts an
`order_revisions` row (`billing_address_change`), chains `content_hash`,
and clears the lock. If the lock TTL has expired but the order is still
untouched since acquire (same eligible status + same baseline hash), the
server still accepts the save and unlocks. Refuses when an invoice
already exists. Response:
`{"success":true,"changed":boolean,"order":Order}`.

#### `PATCH /account/orders/:id/shipping`

Body: `{"lockToken":"…","addressId":"uuid"}`. Changes the delivery address
snapshot under the revision lock while keeping the **same courier**, the
**same country** as the order, and the **same delivery network** (home vs
point relais). Recomputes shipping fee; if fee would change returns
`409 price_would_change`. Also
`409 shipping_country_mismatch` when the new address is in another country,
`400 recipient_phone_required` when a Mondial Relay Home or Point Relais
address has no phone number, and `409 courier_country_unavailable` /
`courier_network_unavailable` when the
new address cannot use the order's courier/network or switches between home
delivery and a pickup point; `409 revision_limit_reached` after the order's
three permitted address amendments. Inserts
`order_revisions` kind `shipping_address_change`. When
`billing_same_as_shipping` is true, billing snapshot fields are synced
from the new delivery address. Save-after-TTL behaves like billing.
Response: `{"success":true,"changed":boolean,"order":Order}`.

#### `DELETE /account/orders/:id`

Customer self-cancel when either `status === 'confirmed'` and
`paymentCaptureStatus === 'authorized'`, or `total === 0`,
`paymentCaptureStatus === 'not_required'`, and status is `confirmed` or
`in_preparation`. Cancels an existing Stripe PaymentIntent hold, marks the
order `cancelled` (and the payment `canceled` only when an authorization
existed), releases consumed stock, restores the availability of any redeemed
voucher while retaining its audit row, forgets a one-time (non-remembered)
card, clears any edit lock, and emails an annulation confirmation. Otherwise
`409 order_not_cancellable` (or `409 invoice_already_issued`). Response:
`{"success":true,"order":Order}`.

#### `GET /account/orders/:id/invoice`

Backs the "Ma Facture" modal's "Télécharger" choice. `404 not_found` if the
order doesn't exist or isn't this user's. Rate-limited by
`invoiceDownloadRateLimiter` (`RATE_INVOICE_DOWNLOAD`, `<window>:<count>`,
default `15m:5`, own budget, `DISABLE_RATE_INVOICE_DOWNLOAD` dev-only
bypass — per-IP window+max, tracked independently from the `/email`
route's own budget below): exceeding it returns `429
{"error":{"code":"resend_limit_exceeded"}}`.
Response `200` otherwise: the invoice PDF itself (`Content-Type:
application/pdf`, `Content-Disposition: attachment;
filename="FACT-NNNNNN.pdf"`), not JSON. No email side effect — see the
`/email` route below for the modal's other choice.

Generated once per order and reused on every later call (by either route)
— same generate-once-and-cache shape as the shipping label (see
`shippingLabels.service.ts`'s `ensureShippingLabel`, which follows the same
disk-only storage as of `1738000030000_order_shipping_labels_filesystem.js`),
except the PDF lives on disk under `config.invoiceDir`
(`PRIVATE_DIR`/`PRIVATE_INVOICE_DIR`) rather than
`config.shipmentLabelDir` (never as bytes in Postgres —
`order_invoices.file_name` stores only the relative path) and is built with
`pdfkit` directly (no HTML template, no headless browser — see
`invoicePdf.service.ts`'s own doc comment on why, given this app's
no-SSH/shared-hosting deploy). Always French regardless of the customer's
language preference — a legal document. Currently prices the invoice off
the order's existing delivery address (no distinct billing address yet)
and always shows Lumen's micro-entrepreneur VAT-exemption mention
(`COMPANY_VAT_MENTION`), not a computed VAT breakdown.

#### `POST /account/orders/:id/invoice/email`

Backs the "Ma Facture" modal's "Recevoir par email" choice. `404 not_found`
if the order doesn't exist or isn't this user's. Rate-limited by
`invoiceEmailRateLimiter` (`RATE_INVOICE_EMAIL`, `<window>:<count>`,
default `15m:5`, own budget, `DISABLE_RATE_INVOICE_EMAIL` dev-only bypass —
per-IP window+max), tracked independently (`channel: 'email'`) so hitting the
download budget never blocks emailing or vice versa; same
`429 resend_limit_exceeded` shape. Sends the same
idempotent invoice PDF (see above) as an attachment to the customer's own
account email (see `invoiceEmail` in `email.service.ts`), reusable any
number of times as a "resend" — no separate resend endpoint or magic
download link, the attachment itself is what the customer keeps. Unlike
the old combined endpoint this replaces, a send failure here is a real
error (the whole point of the request), not swallowed — Response `200`:
`{"success":true}`; an SMTP failure propagates as a `5xx`.

---
