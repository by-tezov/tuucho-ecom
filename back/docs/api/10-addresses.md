# Addresses and favorites API

Split out of the account API so a change to one subject does not carry the
others. The conventions in [00-conventions.md](./00-conventions.md) apply to
every route here.

Related: [Account API](./03-account.md) · [Addresses and favorites API](./10-addresses.md) · [Delivery options API](./11-delivery.md) · [Payment methods API](./12-payment-methods.md) · [Cart API](./13-cart.md) · [Account checkout and orders API](./14-account-checkout.md) · [Loyalty API](./15-loyalty.md).

### `GET /account/address-countries`

No auth. Country select for typing a street (home) address by hand —
`address_countries.enabled = true` only. Response:
`{"success":true,"countries":[{"code":"FR","label":"localized string"}]}`.

### `GET /account/phone-countries`

No auth. Profile phone country options: the union of
`courier_countries` that are enabled on any shop-enabled courier (not the
home-address typing list above). Response shape matches
`address-countries`:
`{"success":true,"countries":[{"code":"FR","label":"localized string"}]}`.

### `GET /account/addresses`

Response: `{"success":true,"addresses":[Address, ...]}`, `is_default` first
then oldest-first. **Saved address book only** — addresses created with
`savedForFuture: false` (one-time checkout) are omitted.

### `GET /account/addresses/:id`

Ownership-checked. Returns an owned address that is still eligible for the
current checkout, including a one-time address while its lifecycle is
`one_time_available`. The active `kind=gift` cart’s copied destination is
readable without a checkout privacy session (`getForUser` when
`carts.address_id` matches). Once a confirmed order consumes a one-time
row, this returns `404 not_found`: the encrypted source remains retained
for its order, but cannot be restored into another checkout.

### `POST /account/addresses`

Body:

```json
{
  "kind": "livraison|facturation",
  "recipientName": "string?",
  "companyName": "string?",
  "line1": "string",
  "line2": "string?",
  "deliveryNotes": "string?",
  "postalCode": "string",
  "city": "string",
  "countryCode": "string",
  "label": "string?",
  "phone": "string?",
  "networkCodes": "string[]?",
  "pickupPoints": "{ [networkCode]: { id: string, name?: string, metadata?: { [key]: string } } }?",
  "isDefault": "boolean?",
  "savedForFuture": "boolean?"
}
```

`kind` required. At least one of `recipientName`/`companyName`, plus
`line1`/`postalCode`/`city`/`countryCode` (`400` otherwise). When `phone`
is sent non-empty, it must be a valid number (optional leading `+`, then
digits / spaces / `()-.`, 8–15 digits).
`networkCodes` defaults to `["home"]` when omitted/empty for livraison (see
`GET /account/delivery-networks`) — an address can belong to more than one
network at once (a physical pickup point can genuinely be registered with
several). `pickupPoints` optionally stores the provider's pickup/locker
reference per network; each key must be in `networkCodes`. Its optional
`name` is the point's own public name (bounded like an address line, since
that is where clients display it: the first line of the address, above
`line1`, never folded into the customer-chosen `label`). Its optional
string metadata map allows other providers to keep their immutable details
without changing this common contract. A user's first **saved** address of
a kind is always forced default regardless of `isDefault`.
`savedForFuture` defaults to `true`. When `false`, the row starts as
`one_time_available`: it is still stored encrypted for the checkout FK,
order snapshot and Mondial Relay sticker, but never becomes default and is
omitted from `GET /account/addresses`. The same transaction that confirms
the first order atomically changes it to `one_time_consumed`; no later API
request, stale browser cache or delayed selection write can reuse it.
Response `201 {"success":true,"address":Address}`.

### `PATCH /account/addresses/:id` / `DELETE /account/addresses/:id`

Ownership-checked (404 if the address isn't this user's). `PATCH` accepts
any subset of the editable address fields, but not `networkCodes` or
`pickupPoints`: delivery is assigned at creation and is immutable afterwards.
Deleting the current default auto-promotes the most recently created remaining
address to default.

### `POST /account/addresses/:id/set-default`

No body. `404` if not owned by this user.

### `POST /account/addresses/:id/unset-default`

No body. `404` if not owned by this user or not currently the default (a no-op
otherwise returns success). Unlike deleting the default, this deliberately
leaves the account with zero default addresses — the customer's own explicit
choice, not an incidental side effect — so checkout then requires an explicit
address pick instead of silently choosing one.

### `Address` shape

```ts
{
  id: string;
  kind: 'livraison' | 'facturation';
  label: string | null;
  recipientName: string | null;
  companyName: string | null;
  line1: string; line2: string | null; deliveryNotes: string | null;
  postalCode: string; city: string;
  countryCode: string; phone: string | null;
  networkCodes: string[];
  pickupPoints: {
    [networkCode: string]: { id: string; name?: string; metadata?: { [key: string]: string } };
  };
  isDefault: boolean;
  savedForFuture: boolean;
}
```

### `GET /account/favorites`

Response: `{"success":true,"favorites":[{"productId":"uuid","shapeKey":"string","lengthKey":"string"}]}`.
Backend-only — no anonymous/localStorage favorites concept anymore.

### `POST /account/favorites`

Body: `{"productId":"uuid","shapeKey":"string","lengthKey"?:"string"}`
(`lengthKey` optional — omitted, it resolves to that shape's first length).
Upsert: adds a new favorite, or updates the recorded shape/length if this
set is already favorited by this user (the front calls this again on every
shape-tab switch for an
already-favorited item, so reopening it later restores that tab). `400
invalid_request` if `shapeKey` isn't actually offered by that set. Response:
`{"success":true}`.

### `DELETE /account/favorites/:productId`

No body. Response: `{"success":true,"deleted":boolean}` (`false` if it
wasn't favorited).
