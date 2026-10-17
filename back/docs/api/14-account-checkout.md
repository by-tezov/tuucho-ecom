# Account checkout and orders API

Split out of the account API so a change to one subject does not carry the
others. The conventions in [00-conventions.md](./00-conventions.md) apply to
every route here.

Related: [Account API](./03-account.md) · [Addresses and favorites API](./10-addresses.md) · [Delivery options API](./11-delivery.md) · [Payment methods API](./12-payment-methods.md) · [Cart API](./13-cart.md) · [Account checkout and orders API](./14-account-checkout.md) · [Loyalty API](./15-loyalty.md).

### Checkout selection

Advisory only — never trusted for pricing/stock/courier-compatibility, which
`confirmOrder`/`priceCheckout` always re-derive server-side regardless. Exists
purely so the cart page's delivery choice survives a full remount: navigating
away and back (the Mondial Relay pickup-point picker page, a PayPal redirect
that fails and returns to `/cart`), or logging in from a different device.
A stale/deleted `addressId` or shop-disabled `courierCode` restored from here
is harmless — the cart page demotes customer-disabled couriers to overflow (via
`GET /account/disabled-couriers`) and its own country/network compatibility
checks already handle a no-longer-valid selection the same way they handle a
customer picking one by hand. Checkout pricing only rejects shop-disabled
couriers (`courier_not_found` / `courier_country_unavailable`).

#### `GET /account/checkout/selection`

Response:
`{"success":true,"addressId":string|null,"courierCode":string|null,"express":boolean,"billingAddressId":string|null,"sameAsBilling":boolean,"paymentMethodId":string|null,"voucherCode":string|null}`
from the **active cart** (empty defaults when none).

After a successful order, any selected one-time address (`savedForFuture:false`)
or one-time card is atomically marked `one_time_consumed` and cleared from
these cart columns. The server retains the underlying encrypted address/card
record only as required by the completed order, its refund trail and shipping
documents; its lifecycle, not browser state, prevents restoration into the
next checkout selection.

#### `PUT /account/checkout/selection`

Body:
`{"addressId":string|null,"courierCode":string|null,"express":boolean,"billingAddressId":string|null,"sameAsBilling":boolean,"paymentMethodId":string|null,"voucherCode":string|null}`
— a full replace of the **active cart**'s checkout columns (not a
user-level preference). The server silently clears an address/card that is
not checkout-eligible, including `one_time_consumed` resources. Response:
same shape as the `GET` above.

### Checkout and orders

Creating a payment attempt atomically validates the address, billing choice,
courier, price, promotions and exact cart stock, then reserves a full encrypted
commercial snapshot for
`STOCK_RESERVATION_TTL` (10 minutes by default); merely putting an item in a
cart never reserves it. `byQuantity` accessory reservations consume
`quantity × pack multiplier` units from the shared `''/''/''` pool; order
lines still store pack count and `packKey`. A later checkout attempt by the same customer
replaces their previous unpaid reservation, which lets the payment UI switch
from card to PayPal without blocking itself. The reservation turns into the
order's permanent stock allocation only after Stripe reports payment success.
The payment modal receives the server expiry. Two minutes before it, the modal
warns the customer and offers to extend the hold (`POST …/checkout/extend`,
RGAA 13.1); at expiry it cancels the still unconfirmed PaymentIntent and keeps
an expiry message on screen until the customer closes the modal (it never
closes itself). On success, finalization uses the
reserved snapshot — never a cart, price, rule or stock recalculation after the
customer has entered a payment method.

While an order is `confirmed` or `in_preparation`, the owning customer can
amend the billing address (see revision lock + `PATCH …/billing` below).
Item edits and customer cancellation remain disabled (`409 order_locked`)
pending dedicated flows. An administrator can cancel a pre-shipment order
through the operations status endpoint; this restores its stock allocation
but never refunds Stripe automatically. Ops `set-status` is refused with
`409 order_revision_locked` while the customer holds an active edit lock.

`Order` shape (returned by every route below):

```ts
{
  id: string;
  orderNumber: string; // "CMD-000001"
  status: 'confirmed' | 'in_preparation' | 'to_send' | 'sent' | 'disponible' | 'received' | 'cancelled' | 'need_review' | 'return_review';
  recipientName: string | null;
  companyName: string | null;
  line1: string;
  line2: string | null;
  deliveryNotes: string | null;
  postalCode: string;
  city: string;
  countryCode: string;
  phone: string | null; // required when the selected courier/network is Mondial Relay Home or Point Relais
  addressId: string | null; // livraison address snapshotted at confirm
  networkCode: string | null;
  pickupPoint: { id: string; name?: string; metadata?: { [key: string]: string } } | null;
  courierCode: string | null;
  courierName: string | null;
  packetKey: string | null;
  express: boolean;
  shippingFee: number; // charged fee after free-shipping rule (0 when free)
  shippingListFee: number; // list fee before franco (for strikethrough UI)
  rulesItemDiscount: number; // nail qty % tier discount
  cartRulesSnapshot: object; // frozen applied rules at confirm
  voucherCode: string | null;
  voucherDiscount: number | null; // combined item + shipping discount, null when voucherCode is null
  integrityToken: string | null; // HMAC content fingerprint of the *current* snapshot (latest revision); null for orders confirmed before content_hash existed
  revisionCount: number; // accepted amendments in order_revisions (0 = never amended)
  paymentCaptureStatus: 'authorized' | 'captured' | 'not_required' | 'canceled' | 'expired';
  /** Confirm-time how-paid snapshot; null for orders placed before this field existed. */
  paymentMethod: {
    type: 'card' | 'paypal' | 'bancontact' | 'free';
    brand: string | null;
    last4: string | null;
  } | null;
  total: number; // sum(items[].lineTotal) + shippingFee - rulesItemDiscount - (voucherDiscount ?? 0)
  confirmedAt: string;
  statusUpdatedAt: string;
  billingSameAsShipping: boolean;
  billingAddressId: string | null;
  billingRecipientName: string | null;
  billingCompanyName: string | null;
  billingLine1: string;
  billingLine2: string | null;
  billingPostalCode: string;
  billingCity: string;
  billingCountryCode: string;
  billingPhone: string | null;
  placedAsGuest: boolean; // true when placed through guest checkout, kept after later attach
  gift: {
    offerId: string;
    giverDisplayName: string;
    receiverName: string;
    maxSets: number | null;
    maxBudget: number | null;
    hideReceiverPrices: boolean;
  } | null; // frozen gift snapshot; null when the order is not a gift promise
  items: {
    id: string;
    productId: string | null;
    productUid: string;
    title: string;
    desc: string | null; // localized product description snapshot; null for legacy rows
    occasion: string | null; // localized; null for accessories / legacy
    colorMain: string[]; // localized main color labels frozen at confirm
    colorSecondary: string[]; // localized secondary color labels frozen at confirm
    shapeKey: string;
    shapeLabel: string; // localized; falls back to shapeKey for orders placed before this field existed
    lengthKey: string;
    lengthLabel: string; // localized; frozen at confirm, shown next to shapeLabel in order history/emails/invoice
    photo: string | null; // verified first small URL, or null when missing / modal hash mismatch
    photos: { position: number; small: string | null; modal: string | null }[]; // full shape/length snapshot; URLs null when modal hash fails
    size: 'XS' | 'S' | 'M' | 'L' | '';
    packKey: string; // byQuantity pack at confirm; '' for nails and default accessories
    packLabel: string; // localized pack label snapshot (e.g. "x2"); '' when packKey is ''
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    origin: 'user' | 'rule';
    locked: boolean;
    ruleCode: string | null;
    comment: string | null; // customer note typed on the cart card, frozen at confirm; same value on every size line of one card
  }[];
}
```

Every field on the order itself (address, courier/shipping, `items[].title`/
`desc`/`occasion`/`colorMain`/`colorSecondary`/`productUid`/`photo`/`unitPrice`) is a **snapshot** taken at confirm time — it
never changes even if the catalog, the courier's pricing, or the customer's
saved address is edited later. `packetKey` is never something the client
sends or picks: `confirmOrder` derives it itself from customer-added
nail-set quantity (accessories and rule gifts count as 0; see
[schema](../schema/README.md)'s `courier_packets`). Each item also stores
every photo path + modal SHA-256 for the ordered shape; list/detail
responses trust that stored hash for `photo` / `photos[].small|modal`
(empty hash → `null` placeholder). Live re-hash of on-disk modal bytes is
reserved for import/checkout verification, not customer reads.

#### `GET /account/orders?scope=active|history`

`scope` optional, default `active` (`status` in `confirmed`/
`in_preparation`/`to_send`/`sent`/`disponible`/`need_review`/`return_review`); `history` = `status:"received"` or
`"cancelled"`. Optional keyset pagination: `limit` (integer, clamped to
20–50, default 30) and opaque `cursor` from a previous page's
`pagination.nextCursor`. Response:
`{"success":true,"orders":[Order, ...],"pagination":{"limit":N,"nextCursor":string|null,"hasMore":boolean}}`,
newest first. A `need_review` order
remains visible in the active list but is an internal payment exception: the
customer response contains the status value for API completeness, while the
customer UI renders neither a badge nor a status label. The internal reason
is never included in this payload. Each `Order` now
also carries `trackingAvailable:boolean` — a live lookup against the
order's `courierCode` in the `couriers` table (not a snapshot taken at
confirm time), so flipping a courier's catalog flag takes effect
immediately for its in-flight orders. See `GET /account/orders/:id/tracking`
below for what actually powers the "Track my package" button.

Photo URLs on list/detail trust the confirm-time modal SHA-256 stored on
each item; the API does not re-hash on-disk files on every read.

#### `GET /account/orders/:id`

`404 not_found` if it doesn't exist or isn't this user's. Response:
`{"success":true,"order":Order}` (includes `trackingAvailable`, see above).

#### `GET /account/orders/:id/invoice` and `POST /account/orders/:id/invoice/email`

Download or email the idempotent invoice for an owned order. A
`need_review` order returns `409 order_payment_review_required`: no financial
document is generated until the administrator resolves the payment exception.
The existing per-user download/email day/month limits otherwise apply.

#### `GET /account/orders/:id/tracking`

Auth required, ownership-checked the same way as the route above. Reads the
cached tracing from the order's courier and refreshes it live when the cache
is at least four hours old (currently only Mondial Relay is
wired up — see `shippingTracking.service.ts`'s `resolveTrackingProvider`,
which resolves the actual carrier the same config-driven way
`shippingLabels.service.ts` picks a label provider, never off a hardcoded
courier name). Carrier-confirmed milestones (`PRISE EN CHARGE POINT RELAIS`,
locker / Point Relais availability, `Livré`, WSI2 STAT `82`) also advance the
order status here, same walk as `POST /operation/process-shipment-tracking`.
When the cached events do not yet justify the next lifecycle step, a tracking
open may refresh SOAP after 15 minutes so a locker that landed between hourly
cron polls is not stuck behind the four-hour cache. Response `200`:
`{"success":true,"tracking":{"shipmentNumber":"string","events":[{"label":"string","dateTime":"string|null","location":"string|null","countryCode":"string|null"}],"fetchedAt":"ISO datetime|null","externalUrl":"string|null"}}`.
`fetchedAt` is `null` and `events` falls back to any stale cache when the
_live_ carrier call fails but a shipment number is already known — the
customer still gets `shipmentNumber`/`externalUrl` to fall back on rather
than a bare error in that case. `externalUrl` is the carrier's own public
tracking page when configured (`MONDIAL_RELAY_PUBLIC_TRACKING_URL`),
otherwise `null`; Mondial Relay links include the shipment number and the
recipient postal code from the immutable order snapshot. Results are cached
server-side for several hours per
Mondial Relay's own usage guidance (their tracing method must not be polled
more than a handful of times a day per shipment), so repeat opens of the
tracking modal the same day don't re-hit the carrier.

Two failure outcomes: `404 {"error":{"code":"shipment_not_found"}}` means
this order was moved to `to_send` without ever generating a carrier
shipment (e.g. `npm run order -- set-status --skip-shipment-label`) — there
is nothing to retry. Everything else — tracking disabled for the courier,
no provider implemented yet, or a config/carrier-API error — collapses to
`409 {"error":{"code":"tracking_unavailable"}}`; the real reason is logged
server-side only, since the customer can't act differently on any of those.

#### `POST /account/checkout/create-intent`

Body: `{"addressId":"uuid","courierCode":"string","express":"boolean?","method":"paypal"|"bancontact"|"google_pay"|"apple_pay"|"new_card"?,"paymentMethodId":"pm_…"?,"billingAddressId":"uuid"?,"voucherCode":"string"?}`.
For a **saved** card, `paymentMethodId` is required and must be this customer's
saved card or `one_time_available` card; a consumed one returns
`409 payment_method_not_available` before stock is reserved or Stripe is
asked to authorize a payment. `method: "new_card"` opens a card-only
PaymentIntent (`payment_method_types: ['card']`, `setup_future_usage:
on_session`, no `paymentMethodId` in metadata). The front collects the card
in the pay sheet and confirms against the order amount (one bank
authorization; no prior SetupIntent). After confirm, the client calls
`POST /account/payment-methods/register` with `savedForFuture` from the
remember checkbox. `method: "paypal"` opens a PayPal-only
PaymentIntent (no card id, manual capture). `method: "bancontact"` opens a
Bancontact-only PaymentIntent (no card id, **automatic** capture — order is
`captured` at settle). `method: "google_pay"` / `"apple_pay"` open the
same automatic card/wallet PaymentIntent shape as a normal card intent, but
without a `paymentMethodId` and without `setup_future_usage` — one-off
checkout only (never saved), confirmed by the front via Express Checkout
Element. At settle time the wallet’s card `pm_…` is accepted without a
`customer_card_retention` row (those rows only exist for Add-Card /
register flows);
guest confirm already skipped that path. Cart selection may persist the
sentinels `paypal` / `bancontact` / `google_pay` / `apple_pay` / `new_card` in
`carts.payment_method_id`
the same way; wallets / Bancontact may also be the account default payment
preference
(same shape as PayPal — not a saved Stripe PM). Create-intent first
checks the shop-wide admin flag (`403 payment_method_forbidden` when that
method is shop-off). Account payment toggles only affect cart primary
placement (overflow still works).
This route, the authenticated voucher preview and `/checkout/free` require a
live `X-Checkout-Session`. Saved resources work in the newly created session;
one-time resources must belong to it. Finalize/cancel/release-failed remain
PaymentIntent-based so an already-authorized payment can always reconcile.
The authenticated loyalty checkout preview follows the same session and
address-availability checks.
The server re-derives address/courier/price and atomically reserves the cart
before creating the Stripe PaymentIntent. Fully out-of-stock cart lines
(`available_quantity === 0`) are **skipped** — they are not reserved, not
charged, and never appear on the resulting order (nor in its integrity
hash). Checkout still succeeds for the remaining in-stock lines. It returns
`{"success":true,"clientSecret":"string","reservationExpiresAt":"ISO datetime","amount":number,"voucher":{"code":"string","itemDiscount":number,"shippingDiscount":number,"discount":number,"offer":Offer}|null}`. A supplied voucher is re-validated and held for the same checkout TTL as stock; it is consumed only if payment succeeds. `400
size_unavailable` means a **purchasable** line no longer fits (another
checkout or paid order already has the last matching size), or the cart
has no in-stock lines left; `empty_cart`, `price_missing`, courier and shipping validation
errors follow the same rules as the order below.

If an applied voucher reduces the whole checkout to `0`, this endpoint returns
`409 free_checkout_required` instead: no zero-value Stripe PaymentIntent is
created.

#### `POST /account/checkout/free`

Body: `{"addressId":"uuid","courierCode":"string","express":"boolean?","voucherCode":"string"?}`.
This is the explicit confirmation action for a checkout whose authoritative
server-side total is exactly `0`. It reserves stock and the voucher, confirms
the order, consumes the voucher and sends the usual confirmation email without
calling Stripe. When the active cart is a gift cart, it binds that order to
the offer the same way Stripe settlement does (`gift_offer_id` and
`gift_snapshot`). It returns `201 {"success":true,"order":Order}`. If the total
is no longer zero it returns `409 payment_required`, so a stale free-order UI
can never bypass payment.

#### `POST /account/checkout/voucher/validate`

Auth required. Body:
`{"addressId":"uuid","courierCode":"string","express":"boolean?","code":"string"}`.
Read-only server-side preview for the current cart, delivery choice and code.
On success it returns `{"success":true,"voucher":{...,"description":"localized offer text"},"subtotal":number,
"shippingFee":number,"shippingListFee":number,"rulesItemDiscount":number,"cartRules":object,"total":number}`. `description` is rendered from the
manager-owned voucher type template for the request's `Accept-Language`, so
the cart can state the precise validated benefit (for example “15 % de
réduction” or “Livraison offerte”). The client must call this before
offering payment, but `create-intent` re-checks it and performs the actual
temporary reservation. When the active cart is a gift cart, the destination
address attached for Julie is accepted the same way as `create-intent` and
`checkout/free` (it may be a one-time address from open-pay, not this
checkout privacy session), and units already held for that offer are treated
as available stock for that cart. Invalid/disabled/not-yet-valid/expired/depleted codes,
codes restricted to another account, a `free_item_nth` code whose paid nail-set
quantity is too low, or a `free_item` code with no paid nail set at or below
`maxItemPrice`, return an error code. Applied permanent cart rules with
`forbid_voucher` reject the code.

#### `POST /account/checkout/finalize`

Body: `{"paymentIntentId":"pi_..."}`. The server retrieves the PaymentIntent
from Stripe and only creates an order when it has succeeded and still owns an
unexpired matching reservation. The Stripe webhook is the durable backstop
for redirects or a closed browser. The order is built from the immutable
server-priced reservation snapshot, so a mutable cart cannot invalidate a
payment already authorized. A paid intent whose reservation actually expired
is refunded rather than creating an unallocated order. If this empties the
active cart entirely (no `cart_items` rows left), that cart row is deleted
and another cart (if any) is reactivated — `default`/`wishlist` are
recreated on demand the next time one is needed (see `cart.service.ts`'s
`ensureActiveCart`/`moveToWishlist`), so this is safe for every cart kind.
Response `201`: `{"success":true,"order":Order}`.

#### `POST /account/checkout/cancel`

Body: `{"paymentIntentId":"pi_..."}`. Cancels only the caller's still
unconfirmed PaymentIntent (`requires_payment_method`, `requires_confirmation`
or `requires_action`) and immediately releases its exact stock/voucher
reservation. Authorized or captured payments return `409 payment_not_cancellable`.

#### `POST /account/checkout/extend`

Body: `{"paymentIntentId":"pi_..."}`. Extends the caller's still-held checkout
reservation linked to that PaymentIntent, with its voucher and loyalty holds,
to `STOCK_RESERVATION_TTL` from now. The payment modal calls it when the
customer accepts the expiry warning (RGAA 13.1: a time limit the customer can
extend with one action, at least ten times). Ownership as for `/cancel`
(`404 not_found` otherwise). The intent must still be unconfirmed
(`requires_payment_method`, `requires_confirmation` or `requires_action`), and
the reservation still held, at least 5 seconds from expiry, and younger than
11 × `STOCK_RESERVATION_TTL` (the initial hold plus ten extensions);
otherwise `409 reservation_not_extendable`. Response:
`{"success":true,"reservationExpiresAt":"ISO datetime"}`. Rate limited like
`/cancel`.

#### `POST /account/checkout/release-failed`

Body: `{"paymentIntentId":"pi_..."}`. Called immediately after Stripe.js
reports a card decline. The server retrieves the PaymentIntent itself, verifies
that it belongs to the authenticated user and is truly a failed
`requires_payment_method` intent, then idempotently releases only its linked
stock/voucher hold. It returns `{"success":true}`. The signed Stripe webhook
remains the durable fallback if the browser is closed before this request.
