# Cart API

Split out of the account API so a change to one subject does not carry the
others. The conventions in [00-conventions.md](./00-conventions.md) apply to
every route here.

Related: [Account API](./03-account.md) · [Addresses and favorites API](./10-addresses.md) · [Delivery options API](./11-delivery.md) · [Payment methods API](./12-payment-methods.md) · [Cart API](./13-cart.md) · [Account checkout and orders API](./14-account-checkout.md) · [Loyalty API](./15-loyalty.md).

### Carts (multi-cart)

A user may own several named carts (`CART_MAX_PER_USER`, default 10). The
system `default`, `wishlist`, `unconnected` and `gift` carts do not consume that
allowance, and a user has at most one of each system kind except `gift`
(many, one per open promise). At most one cart is `isActive`.
Item routes below always read/write the active cart. A locked gift cart
may be active for viewing and paying; gallery add while its user lines
are locked goes to a shop cart instead. After unlock, add/patch/delete on
a payable gift cart reallocates that offer’s gift hold to the remaining
user lines (`409 gift_stock_unavailable` if a newly added line cannot be
held).

Cart summary shape:
`{"id":"uuid","name":"string","kind":"default"|"wishlist"|"rebuy"|"custom"|"unconnected"|"gift","isActive":boolean,"itemCount":number,"total":number,"createdAt":"ISO","updatedAt":"ISO","gift"?}`.
`gift` is present on open `kind=gift` carts:
`{"offerId":"uuid","status":"...","receiverName":"string","giverToken":"string","maxBudget":number|null,"allowAccessories":boolean,"maxAccessoryBudget":number|null}`.
`total` is the lines subtotal (TTC, EUR) from current `product_prices`
× quantities — `byQuantity` accessories use explicit pack prices when set,
otherwise unit price × pack multiplier. No shipping or voucher. Empty carts
return `0`. Currency is always EUR (shop-wide); it is not repeated on the
summary.

#### `GET /account/carts`

Response: `{"success":true,"carts":[...],"cartLimit":10}`. `cartLimit` is
the configured maximum for carts other than `default`, `wishlist`,
`unconnected` and `gift`. Carts are ordered by `createdAt` descending (newest first).
Open `kind=gift` carts are included; ordered/cancelled/expired gift carts are not.
When another cart is active and the account has no `default` cart (a rename
promoted it to `custom`, or checkout deleted it after it was emptied), this
read inserts an empty inactive `default` cart so it shows in the other-carts
list and can be activated again.

#### `POST /account/carts`

Body: `{"name"?:string,"activate"?:boolean}` (activate defaults true).
`name` max 50 characters (trimmed); over-length → `400 invalid_request`.
`409 cart_limit_exceeded` when at the cap. Response: `{"success":true,"cart":{...}}`.

#### `PATCH /account/carts/:cartId`

Body: `{"name":"string"}` (required, trimmed, max 50 characters). Empty or
over-length → `400 invalid_request`. Renaming a `default` cart flips `kind`
to `custom`. `wishlist` and `unconnected` carts are named from their kind by
the client and cannot be renamed → `400 invalid_request`. `gift` carts keep
`kind: "gift"` and accept a new `name` (same 50-character limit).

#### `POST /account/carts/:cartId/activate`

Makes this cart active (clears the previous active flag). Gift carts may
be activated so `/account/cart` shows that promise.

#### `POST /account/carts/:cartId/merge`

Body: `{"sourceCartId":"uuid"}`. Additive line merge into `:cartId`, deletes
source, activates target. Copies checkout from source when target has none.
The source's composed sets move to the target (a set in edit stays in edit only
when the target has none).

#### `DELETE /account/carts/:cartId`

Deletes the cart (and its lines). If it was active, another cart is activated
(if any): the `default` cart first, else the most recently updated one, never a
`wishlist` or `gift` cart. **Exception**: a `kind: 'default'` cart
is never actually deleted — its lines and composed sets are cleared but the cart row itself is
kept, since it's what every add-to-cart implicitly assumes exists (see
`ensureActiveCart`) and would just be recreated identical on the next add.

#### `POST /account/carts/rebuy`

Body: `{"orderId":"uuid","mode":"new"|"merge","targetCartId"?:string}`.
Order must be owned and `received` or `cancelled`. Mode `merge` requires
`targetCartId`. Returns
`{"success":true,"cartId":"uuid","snapshotToken":"string","items":[...]}`.
`snapshotToken` feeds cancel below (30m TTL, one-shot). Composed sets on the
order are copied even when a nail is now out of stock (the cart flags them); a
set that can no longer exist (hidden nail, no price) is skipped instead of
failing the rebuy.

#### `POST /account/carts/rebuy/cancel`

Body: `{"snapshotToken":"string"}`. Restores pre-merge state (lines, checkout
selection, and removes the composed sets the rebuy added) or deletes a
cart created with `mode=new`. `400 invalid_or_expired_token` otherwise.

#### `POST /account/carts/import-guest`

Body: `{"mode":"new"|"merge"|"unconnected","targetCartId"?:string,"items":[...],"selection"?:{...},"name"?:string}`.
Optional `name` (mode `new`) max 50 characters (trimmed); over-length →
`400 invalid_request`. Used after login to land the guest cart.
`409 cart_limit_exceeded` on create.
Guest `items` may include `packKey` for `byQuantity` accessories (required and
validated the same way as `POST /account/cart`). Because guest state lives in
browser storage and catalogue entries can change before the visitor signs in,
stale/malformed individual lines (unknown product, unavailable variant, invalid
pack, or quantity) are discarded; they never reject the valid remainder of the
guest cart or trap the visitor in the choice dialog. A product the account
cannot see (another customer's private library product) is discarded the same
way, and a quantity above `FIELD_CART_QUANTITY_MAX` is clamped to it. The
server considers at most its configured guest-import line limit. Merge is still
by `(productId, shapeKey, lengthKey, size)`, one line per accessory: the same
`packKey` adds up (capped at `FIELD_CART_QUANTITY_MAX`), another `packKey`
replaces the line's pack and quantity. `selection` address and payment-method
ids that are not this account's (or no longer usable) are dropped, as in
the checkout selection writer. A composed set that can no longer be written
(unknown or hidden nail, no price, unavailable nail, malformed id) is dropped
without failing the import.
Mode `unconnected` parks the lines in the account's single `kind='unconnected'`
cart (created on first use, merged into on later ones) — no `targetCartId`, no
`name`, outside `CART_MAX_PER_USER` so it never fails on the limit, and the cart
is left inactive so the customer keeps the cart they logged into. Sent when the
customer closes the create-vs-merge dialog without choosing.

### Cart items (active cart)

Relational data only (`productId`/`shapeKey`/`lengthKey`/`size`/`packKey`/`quantity`) — no
title/price/photo. Cart display data comes from `GET /gallery/products?ids=...`
(nails + accessories), or from `GET /account/cart?expand=products` in the same
response (see below). Nail-only gallery feed `?ids=` still works for
favorites. `byQuantity` accessories keep **one line** per product: toggling
`x5`/`x10` changes `packKey` on that line (and the client should swap
`photosByPack[packKey]`). Add-to-cart still does not reserve stock.

#### `GET /account/cart`

Response: `{"success":true,"items":[{"productId":"uuid","shapeKey":"string","lengthKey":"string","size":"XS"|"S"|"M"|"L"|"" ,"packKey":"string","quantity":number,"origin":"user"|"rule","locked":boolean,"comment"?:"string"}],"extra":[...]}`.
`comment` is the customer note of that card, absent
when none; see `PUT /account/cart/comment` below.
Accessory lines use `shapeKey:""`, `lengthKey:""` and `size:""`. `packKey` is
the chosen pack for `byQuantity` accessories, otherwise `""`. Rule gift lines have
`origin:"rule"` and `locked:true` — PATCH/DELETE return `409 line_locked`.
`extra` is an opaque array of plugin extra-set lines when that plugin is on;
otherwise it is empty. Kernel checkout does not interpret those rows.

With `?expand=products`, the response additionally carries
`"products":[...]` — the catalogue data for every product referenced by a
line, in exactly the shape `GET /gallery/products?ids=...` returns. Without the
parameter the response is unchanged, so this is additive: it exists to save the
second call the client otherwise had to make on every cart render.

#### `PUT /account/cart/comment`

Body: `{"productId":"uuid","shapeKey":"string","lengthKey":"string","comment":"string"|null}`.
Sets the note of one cart card: every unlocked customer line of that
product+shape+length in the active cart, whatever its size (accessories use
`""` shape/length). `comment` is trimmed, max 500 characters, line breaks
kept; blank or `null` clears it. A size later added to the same card
inherits the note; moving a line (size/shape change, wish list, cart merge,
guest import, rebuy) keeps it, and on a merge the note already on the
destination line wins. Checkout copies it onto `order_items.comment` (order
page, admin order screen, invoice). `400 invalid_request` for a bad body,
`404 not_found` when the active cart has no such line. Response:
`{"success":true,"comment":"string"|null}`.

#### `POST /account/cart/move-to-wishlist`

Body: `{"items":[{"productId":"uuid","shapeKey":"string","lengthKey":"string","size":"M"}]}`.
Accessories use empty variant fields. Atomically removes each unlocked line
from the active cart and adds its quantity to the account's lazy-created,
non-active `kind:"wishlist"` cart named `Wish List`. Moving from the Wish
List itself is rejected. Response:
`{"success":true,"moved":[...],"wishlist":{...cart summary...}}`.

#### `POST /account/cart`

Nails: `{"productId":"uuid","shapeKey":"string","lengthKey":"string","size":"XS"|"S"|"M"|"L","quantity":number}`
(`quantity` optional, default `1`; `lengthKey` optional — omitted, it
resolves to that shape's implicit length, `medium`; the gallery card's own
length tag lets a shopper pick a different one when a shape offers several).
`400 invalid_request` if the shape/length isn't offered by that nail
product.

Accessories: `{"productId":"uuid","quantity":number,"packKey"?:string}` — shape/length/size
are forced to `''` server-side (any provided values are ignored). Default
accessories ignore `packKey` (stored as `''`). `byQuantity` accessories
**require** a known `packKey` (`400 invalid_request` otherwise). An existing
line for that product with the same `packKey` increments `quantity`; a
different `packKey` **replaces** the line's pack and its quantity (it used to
keep the old count, pricing every earlier pack at the new size).

Upsert on the **active** cart (creates a default cart if none). Adds a new
line, or on an existing line for this exact
`(productId, shapeKey, lengthKey, size)`, **adds** `quantity` on top, capped at
`FIELD_CART_QUANTITY_MAX` (repeated adds never overflow).
Response: `{"success":true}`.

#### `PATCH /account/cart/:productId/:shapeKey/:lengthKey/:size`

The URL identifies the line — shape, length and size are all part of a
line's identity now (a product can have several lines), not just fields on
it. A `quantity`-only body (`{"quantity":number}`) is an absolute set (not
additive), backing the cart page's quantity stepper. A body carrying a new
`shapeKey`, `lengthKey` and/or `size` (`{"shapeKey":"string"}`,
`{"lengthKey":"string"}`, `{"size":"XS"|"S"|"M"|"L"}`, or any combination)
moves this line's quantity onto that new selection — merging with an
existing line there if one already exists (quantities add), or a plain
rename otherwise. Changing shape without naming a length lands on the new
shape's own default length. `404 not_found` if there's no cart line at
`:productId/:shapeKey/:lengthKey/:size`. Response:
`{"success":true,"item":{...}}` (same shape as the list endpoint's items).

Accessories: path segments use the sentinel `-` for shape, length and size
(each maps to DB empty string `''`). Nail-style selection changes are not
allowed on accessory lines. `byQuantity` accessories accept `{"packKey":"x10"}`
to change the pack on that same line (`400 invalid_request` for an unknown
pack). Quantity stepper is unchanged.

#### `DELETE /account/cart/:productId/:shapeKey/:lengthKey/:size`

No body. Accessories use `-`/`-`/`-` path sentinels (→ `''`/`''`/`''`).
Response: `{"success":true,"deleted":boolean}`.
