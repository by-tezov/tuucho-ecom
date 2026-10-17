# Delivery options API

Split out of the account API so a change to one subject does not carry the
others. The conventions in [00-conventions.md](./00-conventions.md) apply to
every route here.

Related: [Account API](./03-account.md) · [Addresses and favorites API](./10-addresses.md) · [Delivery options API](./11-delivery.md) · [Payment methods API](./12-payment-methods.md) · [Cart API](./13-cart.md) · [Account checkout and orders API](./14-account-checkout.md) · [Loyalty API](./15-loyalty.md).

### `GET /account/delivery-networks`

No auth. The `delivery_networks` vocabulary (see [schema](../schema/README.md)) — an **open**
vocabulary authored in `catalog source/courier/data-networks.json` and
pushed via `npm run courier` (same idea as gallery shapes/colors), used to
populate the network picker on the address form. Response:
`{"success":true,"networks":[{"code":"home","name":"localized string"}]}`.

### `GET /account/couriers`

No auth. Deliberately the **full** enabled courier list, never filtered by
a country/network **or** by a customer's per-account opt-outs — the front
computes compatibility itself against whichever address/courier the customer
currently has selected and grays out (never hides) whatever doesn't fit, with
a reason (see the cart page). Authenticated cart/checkout additionally
demotes codes from `GET /account/disabled-couriers` to the overflow picker
(guests see the full shop-wide list). Couriers that do not serve the known
destination (selected delivery country ∪ geo) also go to overflow. With no
destination and no geo yet, the primary list stays the shop-enabled set minus
those opt-outs — an empty country context is not a mismatch and must not hide
every courier. `confirmOrder`/`priceCheckout`
re-validate shop-wide availability server-side regardless of what the front
computed — requiring `couriers.enabled`, `courier_countries.enabled` for the
delivery country (`courier_country_unavailable` otherwise), and address/courier
network overlap (`courier_network_unavailable` otherwise). A customer-disabled
courier remains checkout-eligible once explicitly chosen (including from
overflow); only admin/shop toggles block it. Shipping list fee is resolved for
that destination country from the packet tier's scalar or per-country map.
Response:

```ts
{
  success: true,
  couriers: {
    code: string; name: string; description: string; sortOrder: number;
    countries: string[];              // enabled codes, or ["ALL"] when every shop country is open
    catalogCountries?: {              // optional; full catalog including disabled
      code: string; enabled: boolean;
    }[];
    deliveryTimes: {                   // keyed by country code
      [countryCode: string]: {
        minDays: number; maxDays: number;  // maxDays >= minDays, both > 0
        custodyDays: number | null;    // pickup points only: days held before return
      };
    };
    networks: string[];                // delivery_networks codes this courier accepts
    packets: {
      packetKey: string;               // internal, not meant for customer display
      maxQuantity: number;             // nail-set quantity ceiling for this tier (accessories count as 0)
      price: number | { [countryCode: string]: number };
      expressPrice: number | { [countryCode: string]: number } | null;
    }[];                                // ascending maxQuantity — smallest tier first
  }[];
}
```

Until a delivery address (hence destination country) is set, the cart cannot
resolve a map-shaped fee and shows a pending placeholder (`?? €` /
`shippingPricePending`) rather than inventing a price.

### `GET /account/disabled-couriers`

Auth required. Per-customer opt-out list (account/addresses page's courier
tiles) — independent of the `GET /account/couriers` list above, which is
the shop-wide enabled set. Cart UI for authenticated customers demotes these
codes to overflow (mirrors `paypalEnabled` for PayPal); checkout does not
reject an explicit choice. Response:
`{"success":true,"courierCodes":["string"]}`,
empty when the customer hasn't disabled anything (the default).

### `GET /account/default-courier`

Auth required. Returns the customer's explicit courier preference as
`{"success":true,"courierCode":"string"|null}`.

### `PUT /account/default-courier`

Auth required. Body: `{"courierCode":"string"}`. Sets the account default
and applies it to the existing active cart's advisory checkout selection
(resetting express delivery), without creating a cart when none exists.
`400 invalid_request` if missing; `404 courier_not_found` if the courier is
unknown, disabled shop-wide, or disabled by this customer. Response:
`{"success":true,"courierCode":"string"}`.

### `POST /account/default-courier/unset-default`

Auth required. Clears the account preference without changing the courier
already selected for the active checkout. Response: `{"success":true}`.

### `POST /account/disabled-couriers`

Auth required. Body: `{"courierCode":"string"}`. `400 invalid_request` if
missing, `404 courier_not_found` if the code doesn't match any courier.
Disabling the customer's current default courier also clears that default
(same handling as disabling PayPal while it's the default payment method,
see `PUT /account/payment-methods/paypal-enabled`). Response:
`{"success":true}`.

### `DELETE /account/disabled-couriers/:courierCode`

Auth required. Re-enables the courier (no-op if it wasn't disabled). `404
courier_not_found` if the code doesn't match any courier. Response:
`{"success":true}`.
