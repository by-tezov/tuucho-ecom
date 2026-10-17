# Gift offers

Two-person gift promises. Julie’s confirm is a stock hold, not an
`orders` row. Marc’s settled checkout creates the order and freezes
`orders.gift_snapshot`. Live HTTP: [api/08-gift.md](../api/08-gift.md).
Cron: [cron/README.md](../cron/README.md).

New offers are always accepted. TTLs, ceilings, PIN knobs, and purge age come
from `.env/.public.env` (`GIFT_*`). Changing them needs a process restart.

## `gift_settings`

Singleton `id = 1`, seeded by `1738000000000_init.js`.
Public `GET /gift/settings.maxSetsCeiling` is
`max(shipping_packet_measurements.quantity)` after packet import, not a
Boutique column.

The running API does not read this row. Live numbers come from env. The
columns stay so a code rollback still finds them. Migration
`1790700000000_gift_always_on` sets `enabled` to true (and the column default
to true) so that rollback still allows new offers. The current app does not
read or write the column.

| Column                           | Type                                   | Notes                                                 |
| -------------------------------- | -------------------------------------- | ----------------------------------------------------- |
| `enabled`                        | `boolean not null default true`        | Leftover. Forced true. Not read by the current app.  |
| `receiver_token_ttl_days`        | leftover integer                       | Runtime: `GIFT_RECEIVER_TOKEN_TTL_DAYS` (1–365, default 30) |
| `lock_session_ttl_hours`         | leftover integer                       | Runtime: `GIFT_LOCK_SESSION_TTL_HOURS` (1–24, default 2) |
| `stock_hold_ttl_days`            | leftover integer                       | Runtime: `GIFT_STOCK_HOLD_TTL_DAYS` (1–30, default 7) |
| `giver_pay_ttl_days`             | leftover integer                       | Runtime: `GIFT_GIVER_PAY_TTL_DAYS` (1–90, default 30) |
| `visibility_after_terminal_days` | leftover integer                       | Runtime: `GIFT_VISIBILITY_AFTER_TERMINAL_DAYS` (1–90, default 7) |
| `max_budget_ceiling`             | leftover numeric                       | Runtime: `GIFT_MAX_BUDGET_CEILING` (1–9999.99, default 500) |
| `max_accessory_budget_ceiling`   | leftover numeric                       | Runtime: `GIFT_MAX_ACCESSORY_BUDGET_CEILING` (1–9999.99, default 100) |
| `max_open_promises_per_giver`    | leftover integer                       | Runtime: `GIFT_MAX_OPEN_PROMISES_PER_GIVER` (1–100, default 20) |
| `pin_free_failures`              | leftover integer                       | Runtime: `GIFT_PIN_FAILURES` first half (1–20, default 5) |
| `pin_max_failures`               | leftover integer                       | Runtime: `GIFT_PIN_FAILURES` second half (1–100, default 10) |
| `purge_after_days`               | leftover integer                       | Runtime: `GIFT_PURGE_AFTER_DAYS` (30–1095, default 396) |
| `updated_at` / `updated_by`      | timestamptz / uuid                     | Leftover audit columns                                |

## `gift_offers`

Capability tokens: SHA-256 hashes are the lookup keys. Raw tokens are
**encrypted** (`giver_token_enc` / `receiver_token_enc`) so mails and the
share card can reprint URLs. Emails and display names are PII-encrypted;
`*_lookup` columns are HMAC indexes. `giver_email` is written at create.
`receiver_email` / `receiver_email_lookup` are null until the recipient
confirms (`POST /gift/:token/confirm`); then both are set. Progress mail
goes to both (payer: priced order; receiver: products only, no prices or
integrity code). The Mondial Relay label uses `receiver_email` on `orders.gift_snapshot`.

Statuses: `selecting` → `awaiting_payment` →
`paying` → `ordered` \| `cancelled` \| `expired`. Create always writes
`max_budget` (required, > 0) and `max_sets` null. The table check still
allows leftover rows with only `max_sets`. Optional `giver_comment` is
PII-encrypted. `allow_accessories` (default false) plus `max_accessory_budget`
is an extra accessory envelope on top of leftover unused nail `max_budget`.
Leftover unused nail budget may always be spent on accessories.

`share_card_style` (`text`, default `'pamsurin'`, checked against the 20
`GiftShareCardStyle` values) is the giver's chosen share-card style. Written
at create, editable afterwards with `receiver_name` and `giver_comment`
together via `PATCH /gift/giver/:token/share-card` for as long as the offer
is still `selecting` — the same "download gift card" modal that lets the
giver change the card before Julie has claimed it.

Partial index `gift_offers_giver_open_idx` on `(giver_user_id, status)`
where status is `selecting`/`awaiting_payment`/`paying` and
`giver_user_id is not null` (open-promise counts/lists).

`pin_hash` (`text`) stores a peppered argon2id digest (`$argon2id$…`,
same `argon2@0.41.1` costs as `users.password_hash`) of
`{offer_id}:pin:{4-digit PIN}`. Leftover `gscrypt1$…` scrypt and 64-hex
SHA-256 rows still verify; a successful unlock rewrites them to argon2id.
The raw PIN is never stored, mailed, or returned on JSON. Leftover rows
may have a null hash (no PIN gate); new creates always write a hash.

`receiver_email` / `receiver_email_lookup` (nullable text) are written at
confirm. Ciphertext and HMAC, same pattern as `giver_email`. Partial index
`gift_offers_receiver_email_lookup_idx` when the lookup is not null.

## `gift_items`

Nail-set lines and accessory lines. Accessory spend is leftover unused nail
budget plus the optional dedicated `max_accessory_budget`.
PK `(offer_id, product_id, shape_key, length_key, size)`. Size `XS|S|M|L`
for nails, `''` for accessories. `pack_key` (default `''`) matches
`cart_items` for `byQuantity` accessories. `product_id` references
`products(id) ON DELETE CASCADE` (same as `cart_items`).

## `gift_destinations`

One row per offer. PII columns encrypted at rest. Recipient name or
company required. Courier + networks + pickup points as on addresses.

## `gift_lock_sessions`

Hashed lock tokens issued by `POST /gift/:token/session`. Front stores
the raw tokens in **this tab** (`sessionStorage`) and only the expiry
origin-wide (`localStorage`, no token) so a new tab cannot resume the
gift. A tab opened from the gifts panel does not write that origin block
(so the administrator is not locked out after closing it) but still
keeps the tab gift session while acting as the recipient.
A restarted browser may restore `sessionStorage`; the front drops
that restored session unless the tab was just refreshed. Refresh in the
same tab still resumes `shopPath`.
This table is the server record.

## `gift_pin_sessions`

Hashed pin-grant tokens issued by `POST /gift/:token/pin` and
`POST /gift/giver/:token/pin` after a correct 4-digit PIN, and by
`POST /admin/gift/offers/:id/enter` when an administrator opens the offer
as that participant (no PIN; the grant is otherwise the same). `role` is
`giver` or `receiver`. TTL follows `GIFT_LOCK_SESSION_TTL_HOURS`. The front
sends the raw grant as `X-Gift-Pin-Token`.

## `gift_pin_attempts`

Per `(offer_id, role)` soft brake for wrong PIN unlocks. Unlock
serializes attempts with `SELECT … FOR UPDATE` so parallel guesses cannot
race the counter. `failed_count` increments on each invalid unlock. After
`GIFT_PIN_FAILURES`'s free-failures half (default 5), `next_allowed_at`
is set with exponential backoff (2s, 4s, 8s, … cap 300s). At its
max-failures half (default 10) further unlocks return
`403 gift_pin_locked` (signed-in giver ownership still bypasses the PIN
gate). A correct PIN deletes the row. Cascade-deletes with the offer.

## `gift_reminder_sends`

Idempotent `(offer_id, template, day)` for the giver reminder mails. `hold`
and `pay` key `day` on the UTC send day (`GIFT_HOLD_REMINDER_BEFORE`,
`GIFT_PAY_REMINDER_BEFORE` before `hold_expires_at` / `pay_by_at`). `select`
(receiver has not confirmed a choice, `GIFT_SELECT_REMINDER_BEFORE` before
`offer_expires_at`) keys `day` on the expiry date: one mail per expiry,
re-armed by "prolonger".

## Gift-purge cron

Daily `POST /operation/process-gift-purge` hard-deletes `cancelled` /
`expired` gift_offers rows (never `ordered`; `order_id is null` is a
belt-and-suspenders guard on top of the status filter) whose `created_at`
is past `GIFT_PURGE_AFTER_DAYS`. The delete cascades to
`gift_items`, `gift_destinations`, `gift_lock_sessions`,
`gift_pin_sessions`, `gift_pin_attempts`, and `gift_reminder_sends`
(all `ON DELETE CASCADE`), and drops any leftover gift cart first.
`carts.gift_offer_id` / `orders.gift_offer_id` are `ON DELETE SET NULL`, so
the delete can never fail on a dangling reference. See
[cron/README.md](../cron/README.md#gift-purge-cron).

## Cart, stock, orders

See [pricing/cart/orders](./03-pricing-cart-orders.md):

- `carts.kind` includes `'gift'`. Gift carts may be `is_active` so Marc can
  view and pay them in the shop cart. They are listed on `GET /account/carts`
  while the offer is open, excluded from `CART_MAX_PER_USER`, unique
  `(user_id, gift_offer_id)`, and reject merge / delete. Rename updates
  `carts.name` and keeps `kind=gift`. Activate is
  allowed. User lines start locked; `POST /gift/giver/:token/unlock-cart`
  unlocks them after Julie confirms. Unlocked line edits reallocate the gift
  hold and `gift_items` to the remaining user lines. Removing the last user
  line in the shop is cancel-offer, not an empty payable cart.
- `stock_reservations.purpose` is `checkout` (default) or `gift`.
- `orders.gift_offer_id` unique nullable FK; `orders.gift_snapshot` is
  `{ enc }` ciphertext of the frozen giver/receiver names and ceilings.
  Invoice PDF labels the block **Commande cadeau** (`INVOICE_CONTENT_VERSION` 5).
