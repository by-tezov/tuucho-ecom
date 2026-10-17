# Catalogue and rule imports

Every command here that targets `--preprod` or `--prod` also needs a transport
flag, `--ssh` or `--ftp`; `--dev` needs neither. See
[Remote transport](README.md#remote-transport).

## Seed defaults file

Seed-only configuration for cart rules, shop payment methods / countries,
courier live toggles, and third-party sign-in methods lives in
`.env/.seed.env` (optional `.env/<mode>/.seed.env` overlay). These keys are
**not** loaded by the running API. Only the matching `npm run … -- seed`
CLIs and the aggregate `npm run seed` read them.

## `npm run product`

```bash
npm run product -- seed [--ssh|--ftp] [--update] [--delete] [--direction local|remote] [--confirm] [--json] --dev|--preprod|--prod
```

Seeds the four product catalogues in order: `library`, `library-nail`,
`library-user`, then `accessory`. `library` runs first because it owns the
shared shape, length, and color vocabulary. Flags are forwarded to each
child. `--delete` requires `--update`. `--ssh` or `--ftp` is required for
`--preprod` and `--prod`. `--confirm` is required only for `--prod` with
`--direction remote`.

`library-nail` and `library-user` have no local pull. With
`--direction local` they are skipped, and `library` plus `accessory` still
run. With `--json`, stdout is one object; each child result is under
`results.library`, `results.libraryNail`, `results.libraryUser`, and
`results.accessory`. A skipped child is `{ skipped: true, reason }`. The
command stops at the first failed child.

One folder or one product uid still uses that catalogue's own command.

## `npm run library`

```bash
npm run library -- seed [<target>] [--update] [--delete] [--direction local|remote] [--json] --dev|--preprod|--prod [--source <path>]
npm run library -- delete <target> [--json] --dev|--preprod|--prod
npm run library -- delete-shape <key> [--json] --dev|--preprod|--prod
npm run library -- delete-color <key> [--json] --dev|--preprod|--prod
npm run library -- delete-all [--json] --dev|--preprod|--prod
npm run library -- check [--json] --dev|--preprod|--prod [--source <path>]
npm run library -- stock-report [--from <val>] [--to <val>] [--limit <n>] [--with-orders] [--not-sent] [--json] --dev|--preprod|--prod
```

Drives `pamsurin-manager`'s static library into any environment's DB
through the `OPS_TOKEN`-gated `/operation/library-import/*` API (never a
direct DB/filesystem connection — see [Library import](../api/07-operation.md)
in the API docs for the full endpoint contract). Shape/length/color vocabulary
is read from the shared `pamsurin-manager/product/data-common.json` (also used
by `library-nail` and `library-user`). `--update`, `--delete`, and every
`delete`/`delete-shape`/`delete-color`/`delete-all` subcommand write to the
target: they need their own explicit flag, plus `--confirm` on `--prod`.

| Arg                            | Applies to       | Notes                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<target>`                     | `seed`, `delete` | A folder id (`0158`) or a product-uid (`AQ-YZ-367`, case-insensitive). Omitted on `seed` = every folder in the library.                                                                                                                                                                                                                      |
| `--update`                     | `seed`           | Without it, a product-uid already in the DB is a no-op. With it, each metadata, price, stock, and photo difference is applied independently to the same `id`. Photos are cleared and re-uploaded only when their ordered count/hash state differs.                                                                                           |
| `--delete`                     | `seed`           | Requires `--update` and no `<target>`. In `remote` direction, deletes DB-only sets/shapes/colors; in `local` direction, removes manager-only set folders (metadata, generated data, photos) and vocabulary keys absent from the DB.                                                                                                                                     |
| `--direction`                  | `seed`           | `remote` (default) pushes the manager library into the DB. `local` pulls the DB's current metadata into each matching local `data-static.json`; it never pulls photos.                                                                                                                                                                       |
| `--from` / `--to`              | `stock-report`   | Same three value forms as `user -- list`'s own `--from`/`--to` (index / relative day count `Nd` / absolute date `YYYY-MM-DD`), but bounding a product's own `creation-date` instead of `last_connected_at` — `--from` is the more-recent boundary, `--to` the further-back one. No `--sort`: creation-date (newest first) is the only order. |
| `--limit <n>`                  | `stock-report`   | Caps the displayed table. Omitted = every matching product shown. Cannot combine with an index `--to`. Totals always reflect every product matching `--from`/`--to`, regardless of `--limit`.                                                                                                                                                |
| `--with-orders` / `--not-sent` | `stock-report`   | Mutually exclusive; both switch the count from `available` stock to live order-item quantities. See subcommands below.                                                                                                                                                                                                                       |
| `--dev`/`--preprod`/`--prod`   | all              | Required, no default — `dev`, `preprod`, or `prod`. Picks both the target API and which `.env/<mode>/.private.env`'s `OPS_TOKEN` to send.                                                                                                                                                                                                    |
| `--source`                     | `seed`, `check`  | Defaults to `../pamsurin-manager/product/library` (sibling checkout assumption).                                                                                                                                                                                                                                                             |

Shapes and lengths come from the folders only (docs/plans/variant-visibility.md):
a product is offered in every `modal/<shape>/<length>/` holding a photo (or
an `<option>/` subfolder with one, for a single nail with variations), in the
order of `data-common.json` (shape table order, then each shape's `length`
list). A folder name the vocabulary does not know is ignored with a warning.
A leftover `shape` map in either JSON file is not read (warning; prepare
removes it). Keys naming a vocabulary entry are written `$key`
(`available`, `hidden`, `photos`, the nail `variations` tree and `price`
options); bare keys are still read. `data-static.json` `hidden` is `true` /
`false` for the whole product, or `{ "$shape": true }` /
`{ "$shape": { "$length": true } }` for part of it; a key that is not one of
the product's folders makes the product invalid.

Subcommands:

- `seed` — import/sync (see `--update` above). Remote seeds send all valid
  product metadata in one batch request; photos stay in bounded multipart
  requests per set/shape/length so the payload cannot exceed proxy upload
  limits. The multipart field is `photos` on `--dev` / `--ssh`. `--ftp` sends
  `photos[]` so the PHP gateway keeps every file, then rewrites the field back
  to `photos` for loopback Multer. Every supported image in each modal folder (`jpg`/`jpeg`/`png`/
  `webp`) is included: numbered files first in numeric order, then named
  showcase files alphabetically (including manager-generated `z.kit.webp`).
  The manager's full preparation commands normalize modal/small sources to
  verified WebP before refreshing their JSON hashes; the importer continues
  to accept JPEG and PNG for backward-compatible or custom `--source` inputs.
  With `--direction local`, pulls DB metadata into local `data-static.json`
  instead, as a minimal override: `creation-date`/`price`/`available`/
  `featured`/`hidden`/`loyalties`/`users` are always written (`available` and
  `hidden` with `$shape`/`$length` keys, `hidden` in its shortest form), while
  `title`/`desc`/`occasion`/`alt`/`color-main`/`color-secondary` are
  written only when the DB value differs from that folder's
  `data-generated.json`, so the pull never freezes generated metadata behind
  a hand override. Logs created/updated/unchanged/skipped-invalid counts for remote
  imports. When stock changes, the summary includes a `stock updated` count
  while every result row—created, changed, or unchanged—shows the source price
  and every declared shape/length with all four sizes (including zeroes) and
  the total. The `result`/`changes` columns carry the operation status, without
  repeating it inside the price or availability values. With `--json`, the same per-product
  details are returned in `rows`, plus structured variant data in `stock`.
  Each row's `changes` column lists every changed field (including `shape`,
  `length`, `price`, `availability`, and photo refresh); JSON also exposes
  this as the `changedFields` array.
- `seed --update --delete` — full directional synchronization. In remote
  direction, removes DB-only sets/shapes/colors. In local direction, removes
  each manager-only set folder entirely (metadata, generated data, photos)
  and local-only shape/color vocabulary entries.
- `delete <target>` — removes one set (cascades to its shapes/colors/photos
  rows; photo files on disk are left behind).
- `delete-shape <key>` / `delete-color <key>` — remove one vocabulary entry.
  The affected live set association is removed too; shape removal cascades
  its lengths (`shape_lengths`) and its variant-scoped photos, availability,
  favorites, and cart rows.
- `delete-all` — full reset: every gallery set **and** the shapes/colors
  vocabulary tables.
- `check` — read-only: reports drift between the local library and the
  target DB (not-yet-imported folders, DB rows with no matching folder,
  and per-set field/photo differences). Never writes anything.
- `stock-report` — read-only. Prints stock units (not product headcount) by
  size (XS/S/M/L) plus a grand total, sorted by creation-date (newest
  first). By default, units come from each product's own `available` stock
  table (what's currently sellable), one table row per product (productUid,
  title, created, price, XS/S/M/L, total). `--with-orders` counts units already
  committed to an order anywhere in the confirmed → sent pipeline
  (`confirmed`, `in_preparation`, `to_send`, `sent`) instead; `--not-sent`
  narrows that to orders not yet physically shipped (`confirmed`,
  `in_preparation`, `to_send`). In either order mode the table switches to
  one row per order item instead (orderNumber, userEmail, orderCreated,
  productUid, title, size, quantity) — a product's committed stock can span
  several different orders/customers, so only order items that actually
  match are listed (no zero-rows for the rest of the catalog).

## `npm run library-user`

```bash
npm run library-user -- seed [<target>] [--update] [--delete] --dev|--preprod|--prod
npm run library-user -- check --dev|--preprod|--prod
npm run library-user -- delete <target> --dev|--preprod|--prod
npm run library-user -- stock-report [--from <val>] [--to <val>] [--limit <n>] [--with-orders] [--not-sent] [--json] --dev|--preprod|--prod
```

Imports `pamsurin-manager/product/library-user` through the same photo,
stock, price and validation pipeline as `npm run library`, but marks every
set with DB/API `audience=user-library` (folder and CLI are named
`library-user`; the audience string is unchanged). Vocabulary comes from the
shared `pamsurin-manager/product/data-common.json`. Its
`data-static.json.users` values are resolved by the API as account UUIDs or
emails. An empty list remains hidden from all users; an unknown value fails
the import. The command intentionally cannot delete shared vocabulary or the
full product catalogue.

`stock-report` is read-only and mirrors `library -- stock-report`, but scopes
the report to `audience=user-library`. Its rows include the assigned account
email address(es) in the `users` column; an empty value means the product is
intentionally visible to nobody.

## `npm run library-nail`

```bash
npm run library-nail -- seed [<target>] [--update] [--delete] [--json] --dev|--preprod|--prod
npm run library-nail -- delete <target> [--json] --dev|--preprod|--prod
npm run library-nail -- check [--json] --dev|--preprod|--prod
```

Imports `pamsurin-manager/product/library-nail` through the same photo and
price pipeline as `npm run library`, but writes `product_type = 'nail_single'`
and boolean rows in `product_nail_availability` (not quantity stock). Source
`--source` is fixed to that folder. Shared shape, length and colour vocabulary
(`product/data-common.json`) is seeded by `npm run library`. Nail variation
labels come from `product/library-nail/data-common.json` during this import.
The admin vocabulary page can edit those shop rows one entry at a time and
does not write manager files. Preparation
on the manager side is the `prepare-library-nail` script in `pamsurin-manager`.

A nail with variation options has `"is-variation": true` in
`data-generated.json` and one root entry per option keyed
`"$<axis>.<option>"` (e.g. `"$color.pink"`), in display order, each with its
own `title`, `desc`, `alt`, `occasion`, `color-main`, `color-secondary` and
`photos` (`$shape` → `$length`); a field an option leaves out falls back to
the root one. The importer sends each option's copy separately, since each
option is its own product on the shop. The older `"variation": { "$color":
… }` forms still import. `check` also reports an option copy or colour
difference as `variations`.

## `npm run accessory`

```bash
npm run accessory -- seed [<target>] [--update] [--delete] [--direction local|remote] [--json] --dev|--preprod|--prod [--source <path>]
npm run accessory -- delete <target> [--json] --dev|--preprod|--prod
npm run accessory -- check [--json] --dev|--preprod|--prod [--source <path>]
npm run accessory -- stock-report [--from <val>] [--to <val>] [--limit <n>] [--json] --dev|--preprod|--prod
```

Same HTTP-only import pattern as `library`, but for
`pamsurin-manager/product/accessory`. Uses `/operation/library-import/sets/batch`
with `productType: 'accessory'`. Default type: scalar `available` / `price`,
flat `modal/*.webp` photos. `byQuantity` type: `available.max` unit pool plus
pack multipliers, photos under `modal/<packKey>/` (uploaded at
`shape_key=<packKey>` / `length_key=''`), and either a unit `price` number or
an explicit per-pack price object. `inCartCarousel` (boolean) flags the
cart-page “Ajoutez des accessoires” carousel. Pack chip labels come from
`product/accessory/data-common.json` `quantity` (pack key → PartialTrilingual,
no nested `title`) and are upserted before products on each remote seed.
Remote seed metadata is sent in one batch
request; photos remain bounded per accessory (one request per pack) and use
the same multipart field convention as `library` (`photos` locally / over
SSH, `photos[]` through the PHP `--ftp` gateway). `--source` defaults to
`../pamsurin-manager/product/accessory`.

`--direction remote` (default) pushes manager metadata/photos to the DB.
`--direction local` reads the DB and reports differences against each matching
manager folder; with `--update`, it overwrites only that folder's
`data-static.json` (including `type`, object `available`, object-or-scalar
`price`, and `inCartCarousel`) and never touches `data-generated.json` or photos.
Quantity labels in `data-common.json` are round-tripped the same way.

Accessory updates are independently diffed too: unchanged photos are retained,
and every console/JSON row reports the source stock quantity (`available.max`
for `byQuantity`), marked as `updated` only when it changed during that run.
`check` also diffs `type`, packs, pack prices, and photo counts/hashes per pack.

`stock-report` is read-only. It reports the sellable accessory unit pool from
`available`, newest creation date first, with product UID, title, type, price,
and remaining units. For `byQuantity` accessories with explicit pack prices,
the price column lists each pack price. `--from`, `--to`, and `--limit` use the
same creation-date/index conventions as `library -- stock-report`.

`--delete` has the same full-sync guard as the library command: it requires
`--update` and cannot be combined with `<target>`. Remote direction deletes DB
accessories absent from the complete manager source and reports them under
`deleteSync.deletedAccessories`. Local direction removes the whole folder
(metadata, generated data, photos) of each manager accessory absent from the
DB and reports them under `deleteSync.deletedLocalAccessories`.

## `npm run courier`

```bash
npm run courier -- seed [<code>] [--update] [--delete] [--direction local|remote] [--json] --dev|--preprod|--prod [--source <path>]
npm run courier -- delete <code> [--json] --dev|--preprod|--prod
npm run courier -- delete-network <code> [--json] --dev|--preprod|--prod
npm run courier -- delete-all [--json] --dev|--preprod|--prod
npm run courier -- check [--json] --dev|--preprod|--prod [--source <path>]
```

Same idempotent-import pattern as `library` above, driving
`pamsurin-manager`'s `courier/*.json` files into any environment's DB
through the `OPS_TOKEN`-gated `/operation/courier-import/*` API (see
[Courier import](../api/07-operation.md)). `--update`, `--delete`, and every
`delete`/`delete-network`/`delete-all` subcommand write to the target: they
need their own explicit flag, plus `--confirm` on `--prod`.

`seed` also pushes the two shared vocabularies in the same folder, before
the couriers themselves: `data-countries.json` (shipping countries) then
`data-networks.json` (delivery networks). A courier's `countries` map can
only name a country the first of those has declared, which is why they go in
that order.

`data-countries.json` is keyed by ISO 3166-1 alpha-2 code, key order is the
display order, and each entry carries a label plus `enabled`:

```json
{
  "FR": { "enabled": true,  "label": { "fr": "France", "en": "France", … } },
  "NL": { "enabled": false, "label": { "fr": "Pays-Bas", "en": "Netherlands", … } }
}
```

`enabled` controls one thing: whether the country appears in the country
select when a customer types a street address. It is **not** what opens a
country for business — that is each courier's own `countries` map (and
`courier_countries.enabled`) — and it is not needed for a parcel-shop
address, which carries its country from the chosen point. So a country can
sit `false` here and still receive Mondial Relay pickup orders.

Countries are never deleted: `addresses`, `orders`, `guest_saved_addresses`
and `courier_countries` all reference them, so an order's history would go
with them. Dropping one out of the file under `--delete` closes it
(`enabled = false`) instead. `check` reports country drift alongside courier
and network drift.

Each courier file's `countries`, `deliveryTime`, `custodyTime`, and packet
`price` / `expressPrice` accept scalar | country map | `{ "default": …, …overrides }`
(reserved key `"default"` is never a country code). The CLI expands those
shapes before POST: with `default` (or a scalar) `countries` materialises
every `data-countries.json` key; without `default`, only listed codes are
catalogued. Preferred `countries` is a bare boolean map
(`{ "default": false, "FR": true, … }`); legacy `["FR","BE"]` and
`{ "FR": { "enabled": true } }` are still accepted. `deliveryTime` must cover every catalogued courier country after expand
(hard-fail if incomplete without `default`). Packet `price` / `expressPrice`
may list only some countries when `default` is omitted — missing prices block
admin activation and checkout for that country (`packet_price_missing`). `custodyTime` is omitted for
home; when present, scalar/`default` fills all courier countries, while a
listed-only map leaves the rest `null`.

| Arg                          | Applies to                         | Notes                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<code>`                     | `seed`, `delete`, `delete-network` | A courier's natural key for `seed`/`delete`; a delivery-network vocabulary key for `delete-network`. Omitted on `seed` = every `*.json` file in the source folder.                                                                                                                                                                                                      |
| `--update`                   | `seed`                             | Without it, a code already in the DB is a no-op. With it, a difference from the local file updates that courier in place (same `id`). Diffs include per-country `enabled` and scalar-or-map packet prices.                                                                                                                                                              |
| `--delete`                   | `seed`                             | Requires `--update` and no `<code>`. In `remote` direction, deletes DB-only couriers/networks; in `local` direction, deletes manager-only courier files and network entries absent from the DB.                                                                                                                                                                         |
| `--direction`                | `seed`                             | `remote` (default) pushes manager courier files to the DB. `local` pulls DB couriers into local `<code>.json` files (creating missing files) and the DB vocabulary into `data-networks.json`; differences are written only with `--update`. Local writes compact boolean `countries` (scalar / `default`+overrides / listed map) and compact times/prices the same way. |
| `--dev`/`--preprod`/`--prod` | all                                | Required, no default.                                                                                                                                                                                                                                                                                                                                                   |
| `--source`                   | `seed`, `check`                    | Defaults to `../pamsurin-manager/courier` (sibling checkout assumption).                                                                                                                                                                                                                                                                                                |

Subcommands:

- `seed` — first pushes `data-countries.json`, then
  `courier/data-networks.json` (the delivery-network vocabulary — open,
  unlike `address_countries`, same idea as library shapes/colors), then
  `data-packet.json` into `shipping_packet_measurements` (public gift
  `maxSetsCeiling` is that table's max `quantity`, unused for create), then
  imports/syncs all couriers in one batch HTTP request. Hard-fails a file
  with incomplete `deliveryTime` (after scalar/`default` expand). A listed-only
  `price` / `expressPrice` map may omit catalogued countries — those countries
  cannot be enabled until prices exist. `packets[].maxQuantity` must be strictly increasing (nail-set ceilings; accessories count as 0 at checkout); an unresolved
  `"$key"` in `networks[]` is dropped with a warning (not a hard failure
  for the rest of the batch). Soft warnings also cover delivery-time keys
  naming countries the courier does not serve.
- `seed --direction local` — reverse synchronization. A DB-only courier
  is created locally as `<code>.json`; use `--update` to write it and any
  detected differences locally (compact boolean `countries`, compact
  times/prices).
- `seed --direction local --update --delete` — full local synchronization.
  It also removes manager courier files with no matching DB courier; pulling
  the DB vocabulary removes local-only `data-networks.json` entries.
- `seed --update --delete` — explicit full synchronization. It removes
  DB-only couriers, then removes DB-only networks. A removed network is
  unlinked from saved addresses and historical orders retain the order but
  have their nullable `network_code` cleared.
- `delete <code>` — removes one courier (cascades its countries/networks/
  packets rows).
- `delete-network <code>` — removes one delivery-network vocabulary entry,
  unlinking it from live couriers and saved addresses; historical orders
  remain but have their nullable `network_code` cleared.
- `delete-all` — full reset: every courier **and** the delivery-network
  vocabulary.
- `check` — read-only: reports courier **and delivery-network vocabulary**
  drift between the local files and target DB (same hard-fail validation as
  `seed` for incomplete times/prices). Never writes anything.

## `npm run voucher`

```bash
npm run voucher -- init [--name my-voucher] --quantity 20 --end 30d [--max-per-user 1] [--min-buy 50] [--users <uuid> ...] --percent 15 [--json] --dev|--preprod|--prod
npm run voucher -- init [--name my-voucher] --quantity 20 --end 30d [--max-per-user 1] [--min-buy 50] [--users <uuid> ...] --amount 5 [--json] --dev|--preprod|--prod
npm run voucher -- init [--name my-voucher] --quantity 20 --end 30d [--max-per-user 1] [--min-buy 50] [--users <uuid> ...] --free-shipping [--json] --dev|--preprod|--prod
npm run voucher -- init [--name my-voucher] --quantity 20 --end 30d [--users <uuid> ...] --free-item 15 [--json] --dev|--preprod|--prod
npm run voucher -- init [--name my-voucher] --quantity 20 --end 30d [--users <uuid> ...] --free-item-nth 2 [--json] --dev|--preprod|--prod
npm run voucher -- seed [<name>] [--update] [--delete] [--direction local|remote] [--json] --dev|--preprod|--prod
npm run voucher -- enable <name> [--json] --dev|--preprod|--prod
npm run voucher -- disable <name> [--json] --dev|--preprod|--prod
npm run voucher -- delete <name> [--json] --dev|--preprod|--prod
npm run voucher -- delete-all [--json] --dev|--preprod|--prod
npm run voucher -- check [--json] --dev|--preprod|--prod
```

The source is `../pamsurin-manager/voucher` by default. It includes one JSON
per voucher plus `data-type.json`, the complete multilingual templates for
`percent`, `amount`, `free_shipping`, `free_item`, and `free_item_nth`. This follows the same
import model as `library` and `courier`: `init` creates a source file **and**
its new row in the selected target; `seed` synchronizes later source changes
and the type vocabulary with that target. `--update`, `--delete`, `enable`,
`disable`, and both `delete`/`delete-all` subcommands write to the target:
they need their own explicit flag, plus `--confirm` on `--prod`.

| Argument                     | Applies to                            | Notes                                                                                                                                                                                                                                                     |
| ---------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--name <name>`              | `init`                                | Optional source code/name. It may be any non-empty filename-safe name. Omit it to generate `ABC-123`. Names are checked case-insensitively both locally and against `--dev`/`--preprod`/`--prod`.                                                         |
| `<name>`                     | `seed`, `enable`, `disable`, `delete` | One existing voucher name. Omit it from `seed` to process every source JSON file. Matching is case-insensitive.                                                                                                                                           |
| `--quantity <N>`             | `init`                                | Required positive integer: maximum number of successful redemptions.                                                                                                                                                                                      |
| `--max-per-user <N>`         | `init`                                | Optional non-negative integer per-customer cap (default `1`; `0` = unlimited per customer — global `--quantity` still applies).                                                                                                                           |
| `--min-buy <euros>`          | `init`                                | Optional minimum merchandise subtotal (after cart-rule item discounts, before shipping/voucher). Allowed only with `--amount` or `--free-shipping`.                                                                                                       |
| `--start YYYY-MM-DD`         | `init`                                | Optional absolute first-valid day. Defaults to the day the command runs.                                                                                                                                                                                  |
| `--end YYYY-MM-DD`           | `init`                                | Required absolute last-valid day, inclusive. Example: `--start 2026-09-01 --end 2026-09-30`.                                                                                                                                                              |
| `--end <N>d`                 | `init`                                | Required alternative to an absolute end date: N calendar days after `--start` (or after today when `--start` is omitted). Example: `--end 30d`.                                                                                                           |
| `--users <uuid> ...`         | `init`                                | Optional allow-list of one or more account IDs. Separate IDs with spaces or commas; the voucher is usable only by these accounts. Omit it for a voucher available to every user.                                                                          |
| `--percent 1..100`           | `init`                                | Exactly one offer type is required. Reduces item subtotal by that percentage.                                                                                                                                                                             |
| `--amount <euros>`           | `init`                                | Exactly one offer type is required. Fixed direct reduction from item subtotal.                                                                                                                                                                            |
| `--free-shipping`            | `init`                                | Exactly one offer type is required. Removes the shipping fee.                                                                                                                                                                                             |
| `--free-item <euros>`        | `init`                                | Exactly one offer type is required. Makes one paid nail set free, choosing the highest-priced nail unit whose price is at most this cap. Accessories never count. If no nail set is at or below the cap, validation fails (`voucher_conditions_not_met`). |
| `--free-item-nth X`          | `init`                                | Exactly one offer type is required. For every X paid nail sets, the lowest-priced extra nail set is free; `--free-item-nth 2` means buy two, get one free. Accessories never count.                                                                       |
| `--update`                   | `seed`                                | An existing destination voucher is normally unchanged. This flag applies differences from the source JSON, including its `enabled` state.                                                                                                                 |
| `--delete`                   | `seed`                                | Requires `--update` and no `<name>`. Makes the destination match the full source: removes target-only definitions.                                                                                                                                        |
| `--direction`                | `seed`                                | `remote` (default) pushes manager JSON → target DB. `local` pulls target DB → manager JSON; differences only overwrite with `--update`.                                                                                                                   |
| `--dev`/`--preprod`/`--prod` | all                                   | Required target: `dev`, `preprod`, or `prod`. `init` needs it to reject an already-used remote name before writing the local file.                                                                                                                        |
| `--source <path>`            | `init`, `seed`, `check`               | Overrides `../pamsurin-manager/voucher`.                                                                                                                                                                                                                  |

Subcommands:

- `init` — validates that the name is unused locally and on `--dev`/`--preprod`/`--prod`, then
  creates exactly one JSON source file **and** the remote voucher row. If the
  remote creation fails, the just-created local file is removed. `--start`
  defaults to today; `--end` is always mandatory and can be either an ISO
  date or a duration such as `30d`.
- `seed` — idempotent import/synchronization. With `--direction remote`,
  creates a missing `data-type.json` vocabulary and missing DB vouchers;
  matching definitions are skipped. Differences, including type templates,
  are applied only with `--update`. With `--direction local`, creates missing
  manager files and only overwrites differences (including the type
  vocabulary) with `--update`.
- `seed --update --delete` — explicit full directional synchronization.
  In the remote direction it deletes DB-only unused vouchers (clearing any
  expired/released hold first), but disables a redeemed DB-only voucher to
  retain its order audit trail. In the local direction it deletes manager-only
  source files.
- `seed --direction local` — also refreshes the generated `usage` key in
  each voucher JSON with configured, redeemed, held and remaining quantities
  plus each consuming user/order and email (for both account and guest
  checkouts).
- `enable <name>` / `disable <name>` — changes only the remote definition's
  enabled state. The local source file is unchanged, so a later
  `seed --update` can deliberately restore its source-controlled state.
- `delete <name>` — deletes one remote unused voucher. It clears that
  voucher's expired or released checkout holds, but refuses a live checkout
  hold or a redeemed voucher. It does not delete the local source file.
- `delete-all` — deletes every remote unused voucher. The
  operation fails if any redeemed voucher exists, preserving the audit trail.
- `check` — read-only comparison of local source files, `data-type.json`, and
  target DB. Never writes anything.

## `npm run cart-rule`

Permanent storefront rules live in the DB only (no manager JSON). OPS API:
`/operation/cart-rules`. Codes are **lowercase** slugs (`tip-pot`).

```bash
npm run cart-rule -- check [--json] --dev|--preprod|--prod
npm run cart-rule -- seed [--json] --dev|--preprod|--prod

# One command per kind — friendly flags, no JSON:
npm run cart-rule -- gift [--code tip-pot] --product TK-PT-248 [--per-nail-set 1] [--min-nails 5] [--priority 10] [--forbid-voucher] [--disabled] [--json] --dev|--preprod|--prod
npm run cart-rule -- nail-tiers [--code nail-qty-tier] --tier 2=5 --tier 3=10 --tier 5=15 [--min-nails 5] [--priority 20] […] --dev|--preprod|--prod
npm run cart-rule -- free-shipping [--code ship-franco] --threshold FR=65 --threshold BE=75 […] --dev|--preprod|--prod

npm run cart-rule -- enable <code> [--json] --dev|--preprod|--prod
npm run cart-rule -- disable <code> [--json] --dev|--preprod|--prod
npm run cart-rule -- delete <code> [--json] --dev|--preprod|--prod
```

Both `check` and `seed` print the rules as a readable table with code, kind,
enabled state, priority, voucher restriction, and kind-specific parameters.
With `--json`, the existing structured `rules` array is returned instead.
`check` is read-only, like the other seeders' `check` — the difference is
that rules have no local source file, so it reports what the target DB holds
rather than a local-vs-DB comparison.

Examples:

```bash
# Install / refresh the three permanent defaults, and delete tip-pot-compose
npm run cart-rule -- seed --dev

# Change the free gift product (keeps other gift fields if omitted)
npm run cart-rule -- gift --product TK-PT-248 --per-nail-set 1 --min-nails 5 --dev

# Replace nail volume tiers. A composed set counts as one from 5 nails.
npm run cart-rule -- nail-tiers --tier 2=5 --tier 3=10 --tier 5=15 --min-nails 5 --dev

# Set franco thresholds by delivery country
npm run cart-rule -- free-shipping --threshold FR=65 --threshold BE=75 --dev

npm run cart-rule -- disable tip-pot --dev
npm run cart-rule -- delete tip-pot --dev
```

| Argument                     | Applies to             | Notes                                                                                                                                              |
| ---------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--code <slug>`              | kind upserts           | Optional. Defaults from `CART_RULE_*_CODE`. Lowercase `a-z0-9-` only.                                                                              |
| `--product <uid>`            | `gift`                 | Required when creating `gift`; optional on update (keeps existing). Product UID e.g. `TK-PT-248`.                                                  |
| `--per-nail-set <n>`         | `gift`                 | Free units per set unit (default `CART_RULE_GIFT_QTY_PER_NAIL_SET`). Catalogue sets and qualifying composed sets both count.                      |
| `--min-nails <n>`            | `gift`, `nail-tiers`   | 1 to 10. A composed set counts as one unit from this many nails (defaults `CART_RULE_GIFT_MIN_NAILS` and `CART_RULE_NAIL_TIER_MIN_NAILS`).       |
| `--tier min=percent`         | `nail-tiers`           | Repeatable. e.g. `--tier 2=5` means 5% from 2 set units. Replacing tiers requires listing all desired tiers.                                      |
| `--threshold country=euros`  | `free-shipping`        | Repeatable ISO-2. e.g. `--threshold FR=65`. Replacing thresholds requires listing all desired countries.                                           |
| `--priority <n>`             | kind upserts           | Lower runs earlier among stacked kinds.                                                                                                            |
| `--forbid-voucher`           | kind upserts           | When this rule applies, checkout rejects voucher codes.                                                                                            |
| `--disabled` / `--enabled`   | kind upserts           | Start disabled, or re-enable on update.                                                                                                            |
| `--dev`/`--preprod`/`--prod` | all                    | `dev` \| `preprod` \| `prod`.                                                                                                                      |
| `--json`                     | all                    | Machine-readable stdout.                                                                                                                           |

`seed` upserts the three defaults (`tip-pot`, `nail-qty-tier`, `ship-franco`)
and deletes the retired `tip-pot-compose` code when that row is still present.
`tip-pot` counts each catalogue nail set as one unit, and each composed set
of at least `minNails` nails as one unit. `nail-qty-tier` uses the same unit
for its percent steps.
Default `ship-franco` thresholds are per delivery country (see
`CART_RULE_FREE_SHIPPING_THRESHOLDS`). Franco is earned against paid items after
the volume remise, never against the courier fee itself (promo codes run after
and do not count). It also rewrites any legacy uppercase codes to lowercase.
Kind commands upsert by `--code`; omitted flags keep the existing rule’s
values, or take the same defaults `seed` uses when the code is new.

Those defaults are not hard-coded: they come from `CART_RULE_*` in
`.env/.seed.env`, with the usual per-target overlay
(`.env/<mode>/.seed.env` wins), so a different franco threshold or gift
product is an env edit, not a code change. A missing or malformed key fails
the command immediately rather than silently falling back.

| Key                                          | Default           |
| -------------------------------------------- | ----------------- |
| `CART_RULE_GIFT_CODE`                        | `tip-pot`         |
| `CART_RULE_GIFT_PRODUCT_UID`                 | `TK-PT-248`       |
| `CART_RULE_GIFT_QTY_PER_NAIL_SET`            | `1`               |
| `CART_RULE_GIFT_MIN_NAILS`                   | `5`               |
| `CART_RULE_GIFT_PRIORITY`                    | `10`              |
| `CART_RULE_GIFT_FORBID_VOUCHER`              | `false`           |
| `CART_RULE_NAIL_TIER_CODE`                   | `nail-qty-tier`   |
| `CART_RULE_NAIL_TIER_STEPS`                  | `2=5,3=10,5=15`   |
| `CART_RULE_NAIL_TIER_MIN_NAILS`              | `5`               |
| `CART_RULE_NAIL_TIER_PRIORITY`               | `20`              |
| `CART_RULE_NAIL_TIER_FORBID_VOUCHER`         | `false`           |
| `CART_RULE_FREE_SHIPPING_CODE`               | `ship-franco`     |
| `CART_RULE_FREE_SHIPPING_THRESHOLDS`         | `FR=65,BE=75`     |
| `CART_RULE_FREE_SHIPPING_PRIORITY`           | `30`              |
| `CART_RULE_FREE_SHIPPING_FORBID_VOUCHER`     | `false`           |

`CART_RULE_NAIL_TIER_STEPS` and `CART_RULE_FREE_SHIPPING_THRESHOLDS` are
comma-separated lists of the exact same `a=b` tokens `--tier` / `--threshold`
take.

## `npm run payment-method`

Shop-wide payment method availability lives in the target database only (no
manager files and no Stripe credential is read). The OPS API is
`/operation/payment-methods`; these toggles only decide which methods the shop
offers. Stripe still determines real payment-method eligibility.

```bash
npm run payment-method -- check [--json] --dev|--preprod|--prod
npm run payment-method -- seed [--json] --dev|--preprod|--prod
npm run payment-method -- enable <card|paypal|bancontact|google-pay|apple-pay|all> [--json] --dev|--preprod|--prod
npm run payment-method -- disable <card|paypal|bancontact|google-pay|apple-pay|all> [--json] --dev|--preprod|--prod
```

`check` is read-only. `seed` explicitly applies the defaults from the
layered seed env (`.env/.seed.env`, overridden by
`.env/<target>/.seed.env`); it is idempotent and has no dependency on
`pamsurin-manager`. `enable` and `disable` change only the named shop-wide
flag; use `all` deliberately to change every flag. As with every target write,
production requires `--confirm`.

| Key                                 | Default |
| ----------------------------------- | ------- |
| `PAYMENT_METHOD_CARD_ENABLED`       | `true`  |
| `PAYMENT_METHOD_PAYPAL_ENABLED`     | `true`  |
| `PAYMENT_METHOD_BANCONTACT_ENABLED` | `true`  |
| `PAYMENT_METHOD_GOOGLE_PAY_ENABLED` | `true`  |
| `PAYMENT_METHOD_APPLE_PAY_ENABLED`  | `true`  |

Examples:

```bash
# Apply the target defaults, including on the disposable test database.
npm run payment-method -- seed --dev

# Inspect production without changing it.
npm run payment-method -- check --ssh --prod

# Temporarily remove PayPal from shop checkout.
npm run payment-method -- disable paypal --ssh --prod --confirm
```

## `npm run sign-in-method`

Shop-wide Google / Facebook / Apple sign-in availability lives in the target
database only (no manager files; OAuth credentials stay in env). The OPS API is
`/operation/sign-in-methods`; these toggles only decide which third-party
providers the shop offers. Email + password / OTP are never gated.

```bash
npm run sign-in-method -- check [--json] --dev|--preprod|--prod
npm run sign-in-method -- seed [--json] --dev|--preprod|--prod
npm run sign-in-method -- enable <google|facebook|apple|all> [--json] --dev|--preprod|--prod
npm run sign-in-method -- disable <google|facebook|apple|all> [--json] --dev|--preprod|--prod
```

`check` is read-only. `seed` applies the defaults from the layered seed env
(`.env/.seed.env`, overridden by `.env/<target>/.seed.env`); it is
idempotent. `enable` and `disable` change only the named shop-wide **availability**
flag (not the per-provider verbose create/link flow); use `all` deliberately to
change every availability flag. Production writes require `--confirm`.

| Key                                | Default |
| ---------------------------------- | ------- |
| `SIGN_IN_GOOGLE_ENABLED`           | `true`  |
| `SIGN_IN_FACEBOOK_ENABLED`         | `true`  |
| `SIGN_IN_APPLE_ENABLED`            | `true`  |
| `SIGN_IN_GOOGLE_VERBOSE_ENABLED`   | `false` |
| `SIGN_IN_FACEBOOK_VERBOSE_ENABLED` | `false` |
| `SIGN_IN_APPLE_VERBOSE_ENABLED`    | `true`  |

Verbose = when the social email is unknown, offer create vs link (OTP) instead of
silent account creation. Seed writes all six flags; admin preferences and the
Boutique UI can still override them later.

Examples:

```bash
# Apply the target defaults, including on the disposable test database.
npm run sign-in-method -- seed --dev

# Inspect production without changing it.
npm run sign-in-method -- check --ssh --prod

# Temporarily remove Facebook from shop sign-in / link.
npm run sign-in-method -- disable facebook --ssh --prod --confirm
```

## `npm run courier-live-state`

Shop-wide courier toggles and per-country open/closed rows live in the target
database only. Manager import (`npm run courier -- seed`) remains authoritative
for structure, prices, and delivery times; this command applies predictable
runtime availability from env after import (tests, dev defaults, preprod).

The OPS API is `/operation/courier-live-state`.

```bash
npm run courier-live-state -- check [--json] --dev|--preprod|--prod
npm run courier-live-state -- seed [--json] --dev|--preprod|--prod
```

`check` is read-only. `seed` applies `COURIER_LIVE_DEFAULTS` from the layered
seed env; it is idempotent. Run it after every courier import when you rely
on env defaults rather than manager JSON `enabled` flags. Production writes
require `--confirm`.

| Key                     | Default                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `COURIER_LIVE_DEFAULTS` | `mondial-relay-point=1:FR,BE\|mondial-relay-home=1:FR,BE\|colissimo-home=1:FR,BE\|chronopost-home=0:` |

Format: pipe-separated `code=shopEnabled:openCountries`. `shopEnabled` is
`1`/`0` or `true`/`false`. `openCountries` is a comma-separated ISO-3166-1
alpha-2 list; an empty list closes every catalogued row for that courier.
Only countries listed are enabled; every other imported row is disabled.

Examples:

```bash
# After courier import on dev or the disposable test database.
npm run courier -- seed --dev
npm run courier-live-state -- seed --dev

# Inspect production without changing it.
npm run courier-live-state -- check --ssh --prod
```

## `npm run payment-method-countries`

Per-method checkout country allowlists live in `payment_method_countries`
(database only; no manager files). The OPS API is
`/operation/payment-method-countries`. Checkout primary vs overflow payment
methods follow these lists against the resolved delivery country.

```bash
npm run payment-method-countries -- check [--json] --dev|--preprod|--prod
npm run payment-method-countries -- seed [--json] --dev|--preprod|--prod
```

`check` is read-only. `seed` applies `PAYMENT_METHOD_COUNTRIES_*` from the
layered seed env so tests and dev defaults do not depend on migration
fallbacks alone. Production writes require `--confirm`.

| Key                                   | Default |
| ------------------------------------- | ------- |
| `PAYMENT_METHOD_COUNTRIES_CARD`       | `ALL`   |
| `PAYMENT_METHOD_COUNTRIES_PAYPAL`     | `ALL`   |
| `PAYMENT_METHOD_COUNTRIES_BANCONTACT` | `BE`    |
| `PAYMENT_METHOD_COUNTRIES_GOOGLE_PAY` | `ALL`   |
| `PAYMENT_METHOD_COUNTRIES_APPLE_PAY`  | `ALL`   |

Each value is either `ALL` or a comma-separated ISO-3166-1 alpha-2 list.
When `ALL` appears anywhere in a comma list, the whole method resolves to
`ALL`.

Examples:

```bash
# Apply checkout country defaults, including on the disposable test database.
npm run payment-method-countries -- seed --dev

# Inspect production without changing it.
npm run payment-method-countries -- check --ssh --prod
```

## `npm run loyalty`

Read-only loyalty programme numbers. OPS API `GET /operation/loyalty`.
The programme is always on, so there is no seed and no aggregate `npm run seed`
step. Numbers (`LOYALTY_VALUE_PER_100`, `LOYALTY_LOT_DURATION_MONTHS`,
`LOYALTY_BURN_NOTICE_WEEKS`, `LOYALTY_REMINDER_INTERVAL_DAYS`) live in
`.env/.public.env` and are returned from the running process.

```bash
npm run loyalty -- check [--json] --dev|--preprod|--prod
```

## `npm run compose`

Read-only compose-a-set status. OPS API `GET /operation/compose`.
`enabled` follows the Boutique preference `composition_page_enabled`
(default `true`). **Not** part of `npm run seed`.

```bash
npm run compose -- check [--json] --dev|--preprod|--prod
```

## `npm run gift`

Read-only gift programme numbers. OPS API `GET /operation/gift`. New offers
are always accepted. TTLs, ceilings, PIN knobs, and purge age live in
`.env/.public.env` (`GIFT_*`). **Not** part of `npm run seed`. There is no
production `GIFT_*` overlay.

```bash
npm run gift -- check [--json] --dev|--preprod|--prod
```
