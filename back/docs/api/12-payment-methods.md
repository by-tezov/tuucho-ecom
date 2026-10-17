# Payment methods API

Split out of the account API so a change to one subject does not carry the
others. The conventions in [00-conventions.md](./00-conventions.md) apply to
every route here.

Related: [Account API](./03-account.md) · [Addresses and favorites API](./10-addresses.md) · [Delivery options API](./11-delivery.md) · [Payment methods API](./12-payment-methods.md) · [Cart API](./13-cart.md) · [Account checkout and orders API](./14-account-checkout.md) · [Loyalty API](./15-loyalty.md).

### Checkout privacy session

Account checkout uses the shared tab-scoped endpoints and
`X-Checkout-Session` contract in [conventions](00-conventions.md#checkout-privacy-session).
Saved addresses/cards remain available after a timeout. An address/card added
with `savedForFuture:false` is bound to the live session and cannot be fetched
or selected by a new/expired session. The signed-in client silently starts a
new session after timeout and reloads only saved data.

### Payment methods

#### `GET /account/payment-methods`

Returns the customer's **saved-for-reuse** Stripe cards together with the
optional checkout preference. Cards added at checkout without remembering
them for future purchases (`allow_redisplay: limited`) stay attached on the
Stripe Customer (so a later refund can still resolve the PaymentIntent) but
are **omitted** here — use `GET /account/payment-methods/:id` or
`POST /account/payment-methods/register` when checkout needs to display a
one-time card. PayPal, Google Pay and Apple Pay are represented as
preferences (enable toggle + optional default), not as saved Stripe
PaymentMethods — wallet checkout still creates a one-off card `pm_…` at
pay time:

```json
{
  "success": true,
  "paymentMethods": [
    {
      "id": "pm_…",
      "brand": "visa",
      "last4": "4242",
      "expMonth": 4,
      "expYear": 2029,
      "cardholderName": "Jean Dupont"
    }
  ],
  "defaultPaymentMethod": { "type": "card", "id": "pm_…" },
  "paypalEnabled": true,
  "bancontactEnabled": true,
  "googlePayEnabled": true,
  "applePayEnabled": true,
  "newCardEnabled": true,
  "shopPaymentMethods": {
    "card": false,
    "paypal": false,
    "bancontact": false,
    "googlePay": false,
    "applePay": false
  }
}
```

`defaultPaymentMethod` may be `null`, `{ "type": "paypal" }`,
`{ "type": "bancontact" }`,
`{ "type": "google_pay" }`, `{ "type": "apple_pay" }`, or
`{ "type": "card", "id": "pm_…" }`. When the shop-wide flag for that method
is off, this field is returned as `null` even if the customer still has a
stored preference (re-enabling the shop flag restores it). `paypalEnabled` /
`bancontactEnabled` / `googlePayEnabled` / `applePayEnabled` /
`newCardEnabled` are the customer's
own opt-out toggles
(payment-methods page), each `true` unless they've explicitly disabled that
method — see `PUT /account/payment-methods/paypal-enabled` (and the matching
`bancontact-enabled` / `google-pay-enabled` / `apple-pay-enabled` /
`new-card-enabled`) below. `newCardEnabled` only moves the cart
"Nouvelle carte" row into overflow; remembered cards stay listed.
`shopPaymentMethods` is
the admin shop-wide gate (defaults all `false`); a shop-off method is hidden
in the cart and rejected at create-intent with `403 payment_method_forbidden`.
Saved cards remain listed when `shopPaymentMethods.card` is false so the
customer can still delete them.

#### `GET /account/payment-methods/:id`

Returns one attached card owned by this customer (same object shape as a list
entry), including a still-available one-time (`allow_redisplay: limited`)
card that the list endpoint hides. A consumed one-time card returns
`404 not_found`; it remains retained only for the completed payment/refund
trail until its normal retention cleanup.
Requires a live `X-Checkout-Session` when resolving a one-time checkout card.

#### `POST /account/payment-methods/register`

After SetupIntent confirm: syncs `customer_card_retention` (one_time vs
saved, upgrade one_time → saved when remembering the same PaymentMethod).
Body:
`{ "paymentMethodId": "pm_…", "savedForFuture": boolean }`. Response:
`{"success":true,"paymentMethod":{…},"savedForFuture":boolean}`. The same
PAN may be stored several times — each new PaymentMethod is its own row.
`400 payment_method_register_failed` on Stripe/ownership errors.
When `savedForFuture:false`, a live checkout session is mandatory and the
created retention row is bound to it. Saved cards remain session-independent.

#### `PUT /account/payment-methods/default`

Body: `{ "type": "paypal" }` / `{ "type": "bancontact" }` /
`{ "type": "google_pay" }` /
`{ "type": "apple_pay" }` or `{ "type": "card", "id": "pm_…" }`.
A card must be attached to the authenticated customer; otherwise this returns
`404 not_found`. Preference methods (PayPal / Bancontact / wallets) are
first-class
defaults even though they are not stored Stripe PaymentMethods — wallet
checkout still creates a one-off `pm_…` at pay time. Response:
`{"success":true,"defaultPaymentMethod":…}`.

#### `DELETE /account/payment-methods/:id`

Detaches the card from the customer's Stripe customer and removes its
`customer_card_retention` row. `404 not_found` when the card is not attached
to this customer (or the customer has no Stripe customer yet), so a caller
cannot probe for other people's PaymentMethod ids. `501 stripe_not_configured`
when Stripe is unavailable. When the deleted card was the stored default
payment method, that preference is cleared too (same behaviour as disabling
PayPal while it is the default). Response: `{"success":true,"deleted":true}`.

#### `POST /account/payment-methods/unset-default`

No body. Always succeeds (clears the preference if set, no-ops otherwise).

#### `PUT /account/payment-methods/paypal-enabled`

Body: `{ "enabled": boolean }`. Response: `{"success":true,"paypalEnabled":boolean}`.
Disabling while PayPal is the current default clears that default too (mirrors
what deleting the default card does). Re-checked server-side at
`POST /account/checkout/create-intent` and `POST /checkout/guest/create-intent`
(`403 paypal_disabled`) — this toggle is not just
a client-side hint.

#### `PUT /account/payment-methods/bancontact-enabled`

Body: `{ "enabled": boolean }`. Response: `{"success":true,"bancontactEnabled":boolean}`.
Same rules as PayPal (clears a Bancontact default when disabled;
`403 bancontact_disabled` on create-intent). Bancontact settles with automatic
capture (order already `captured` after pay).

#### `PUT /account/payment-methods/google-pay-enabled`

Body: `{ "enabled": boolean }`. Response: `{"success":true,"googlePayEnabled":boolean}`.
Same rules as PayPal (clears a Google Pay default when disabled;
`403 google_pay_disabled` on create-intent).

#### `PUT /account/payment-methods/apple-pay-enabled`

Body: `{ "enabled": boolean }`. Response: `{"success":true,"applePayEnabled":boolean}`.
Same rules as PayPal (clears an Apple Pay default when disabled;
`403 apple_pay_disabled` on create-intent).

#### `PUT /account/payment-methods/new-card-enabled`

Body: `{ "enabled": boolean }`. Response: `{"success":true,"newCardEnabled":boolean}`.
Cart placement only: off moves "Nouvelle carte" into overflow. Remembered
cards stay listed. Requires the shop-wide card flag (`403 payment_method_forbidden`
when shop card is off). Not a defaultable payment method.

#### `POST /account/payment-methods/attach`

Attaches an existing Stripe PaymentMethod (one tokenized client-side via
`stripe.createPaymentMethod`, not yet attached to any customer) to the
authenticated user's customer — creating that customer first if needed — then
runs the same register path as `POST …/register`. Used by the front's
guest checkout merge-on-login. Body:
`{ "paymentMethodId": "pm_…", "savedForFuture"?: boolean }` (`savedForFuture`
defaults to `true`). Response: `{"success":true,"paymentMethod":{…}}`.
`400 payment_method_attach_failed` if Stripe rejects the attach.
The guest `pm_…` must already be registered to this same checkout session;
this prevents a payment-method bearer id copied from another tab/session from
being attached.

#### `POST /account/payment-methods/setup-intent`

Starts the authenticated **profile** "add a card" flow (payment-methods
page). Cart checkout collects a new card on the pay sheet via
`method: "new_card"` on create-intent instead (one authorization for the
order amount, no prior SetupIntent). Creates the Stripe Customer if the
account does not have one yet (`getOrCreateCustomerId` — customers are created
lazily at first checkout or first card, not at registration), then returns a
SetupIntent client secret for Stripe.js to confirm against.

Response `200`: `{"success":true,"clientSecret":"seti_…_secret_…"}`.
`501 stripe_not_configured` when Stripe is disabled for the environment.
Rate-limited by `paymentRateLimiter`. The signed-out equivalent is
`POST /account/payment-methods/attach`, which adopts a card tokenized before
the customer was known.
