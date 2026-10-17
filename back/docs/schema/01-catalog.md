# Catalogue tables

## `shapes`

| Column  | Type             | Notes                                                                                                 |
| ------- | ---------------- | ----------------------------------------------------------------------------------------------------- |
| `key`   | `text` PK        | e.g. `almond`, `oval` — also names the shape level of pamsurin-manager's `modal/<shape>/<length>/` photo subfolders. |
| `label` | `jsonb not null` | `PartialTrilingual` — `{"fr": "...", "en"?: "...", ...}`, at minimum `fr`. From the shape entry's `title` in data-common.json. |
| `gender` | `jsonb not null default '{}'` | Grammatical gender of the label, per language — `{"fr": "f", "en": "", "nl": "c"}`. From the shape entry's `gender` in data-common.json. Read by `catalog/domain/productCopy.ts` to resolve the `$g{}` agreement token in a set's authored copy, which writes `$shape.title` rather than a literal shape word because one set can be sold in several shapes. `m`/`f`/`n`/`c`, or `""` when the language does not mark gender on that word; an absent language resolves to the unmarked variant. Deliberately unconstrained: a new language must not need a migration. Added by `1789800000000_shape_length_gender.js`. |

Seeded by `POST /operation/library-import/vocabulary` (`npm run library`,
reading pamsurin-manager's shared `product/data-common.json`, also used by
`library-user` and `library-nail` for these words). An admin with
`catalogue_edit` can also edit one shape, length or colour at a time via
`/admin/catalogue-vocabulary`. That page writes the shop database only.

## `shape_lengths`

The lengths each shape is cut in, one row per (shape, length) pair — the key
is composite: `medium` under `almond` and `medium` under `oval` are two
distinct rows, even though pamsurin-manager's `data-common.json` now defines
`medium`'s translation exactly once, in a shared root `length` table, and
has each shape merely reference it by key (`scripts/library.ts` resolves
that reference into this table's flattened per-shape-per-length rows before
pushing, so the DB shape below is unaffected by that dedup).

| Column       | Type                                                     | Notes                                                                                     |
| ------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `shape_key`  | `text not null references shapes(key) on delete cascade` |                                                                                            |
| `length_key` | `text not null`                                          | e.g. `medium` — also names the length level of `modal/<shape>/<length>/`.                  |
| `value`      | `text not null default ''`                               | The physical length as free-form text (e.g. `"16"`), from data-common.json's `value`.      |
| `label`      | `jsonb not null`                                         | `PartialTrilingual`, from the length entry's `title`.                                      |
| `gender`     | `jsonb not null default '{}'`                            | Same contract as `shapes.gender`, for the `$gl{}` token. Added by `1789800000000_shape_length_gender.js`. |
| `sort_order` | `integer not null default 0`                             | Order of that shape's `$length` list. Added by `1792100000000_catalogue_vocabulary.js`. The library import leaves an existing value in place. |

PK `(shape_key, length_key)`. Seeded by the same vocabulary endpoint as
`shapes`; a length the manager no longer declares is deleted on upsert.
Every shape has at least an implicit `medium` length; `almond` additionally
offers `long`. `short`/`extra-short` exist in the shared vocabulary for
future use but aren't offered by any shape yet. The gallery card's length
tag is a plain label when a shape offers only one length, or a clickable
tag with a picker when it offers several.

## `vocabulary_lengths`

The shared length table from `product/data-common.json` (`length`), one row
per length key. A shape only lists references (`$medium`). The title, gender
and `value` live here and are copied onto each `shape_lengths` row that
offers that length. Added by `1792100000000_catalogue_vocabulary.js`,
backfilled from the lengths already offered by a shape. A length no shape
offers yet (the manager file's `short` / `extra-short`) is absent until an
admin saves it.

| Column   | Type                          | Notes                                      |
| -------- | ----------------------------- | ------------------------------------------ |
| `key`    | `text` PK                     | e.g. `medium`, `long`.                     |
| `value`  | `text not null default ''`    | Physical length as free-form text.         |
| `label`  | `jsonb not null`              | `PartialTrilingual`, the length `title`.   |
| `gender` | `jsonb not null default '{}'` | Same contract as `shapes.gender`.          |

## `colors`

Same shape as `shapes` (`key` PK, `label jsonb`) — open vocabulary on the
pamsurin-manager side (a new color mints a new row automatically there),
but on this DB it's upserted the same way as shapes, same endpoint.

## `accessory_quantities`

Same storage shape as `colors` (`key` PK, `label jsonb` `PartialTrilingual`)
— pack chip labels for `byQuantity` accessories (`x5`, `x10`, …). Seeded
from pamsurin-manager `product/accessory/data-common.json` `quantity` via
`POST /operation/library-import/accessory-vocabulary` (`accessory -- seed`).
The customer-facing string is localized at read time; a missing vocab key
falls back to the pack key itself.

## `products`

The core catalogue table — one row per sellable product (`nail` set,
`nail_single` one-nail design, or `accessory`). Public gallery feed/featured
only return `product_type = 'nail'`. Single nails use `GET /gallery/nails`.
A composed set is never a catalogue row; it lives in `cart_compositions` /
`order_items` with `product_type = 'composition'`.

| Column                          | Type                                 | Notes                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                            | `uuid` PK                            | App-generated. This is `GalleryItem.id` / cart `productId` — referenced by URLs, so never reassigned once created (a library-import "update" edits the row in place rather than delete+recreate).                                                                                                                                                                       |
| `product_uid`                   | `text not null unique`               | Customer-facing short code (`LL-LL-DDD`, e.g. `AQ-YZ-367`). Idempotency key for library/accessory import (`findProductIdByProductUid`). Issued from pamsurin-manager `product/data-registry.json`.                                                                                                                                                                       |
| `product_type`                  | `text not null`                      | `nail` \| `nail_single` \| `accessory`. `nail_single` added by `1790200000000_compose_nail_set.js`.                                                                                                                                                                                                                                                                      |
| `audience`                      | `text not null default 'public'`     | `public` \| `user-library`. User-library products never appear in anonymous gallery queries. |
| `title` / `"desc"`              | `jsonb not null`                     | Each a `PartialTrilingual`.                                                                                                                                                                                                                                                                                                                                              |
| `occasion`                      | `jsonb`, nullable                    | Required for nails (gallery filters); null for accessories.                                                                                                                                                                                                                                                                                                              |
| `alt`                           | `jsonb`, nullable                    | Added by `1787370000000_product_alt.js`. Optional authored image alt text per set (PartialTrilingual, same shape as `title`/`desc`/`occasion`). Null until pamsurin-manager's generation pass is re-run for that set; `products.service.ts`'s `assembleItems` falls back to a generated string, so the public API always returns an `alt` field. |
| `hidden`                        | `boolean not null default false`     | Excluded from the public feed when true.                                                                                                                                                                                                                                                                                                                                 |
| `featured_from`                 | `date`, nullable                     | Start of the "Nouveautés" window.                                                                                                                                                                                                                                                                                                                                        |
| `featured_for`                  | `integer`, nullable                  | Length in days.                                                                                                                                                                                                                                                                                                                                                          |
| `creation_date`                 | `date not null default current_date` | pamsurin-manager's own `data-static.json` `"creation-date"` — preserved across (re-)imports, not "the day this DB row was written" (that's `created_at`).                                                                                                                                                                                                                |
| `accessory_type`                | `text not null default 'default'`    | `default` \| `byQuantity`. Nails are forced to `default`. Missing manager `type` imports as `default`. `byQuantity` accessories share one unit pool and sell in packs (`x5`, `x10`, …).                                                                                                                                                                                |
| `accessory_packs`               | `jsonb not null default '{}'`        | `{ "x5": 5, "x10": 10 }` multipliers. Empty for nails and default accessories. Cart quantity is pack count; stock consumed is `quantity × multiplier`.                                                                                                                                                                                                               |
| `accessory_pack_prices`         | `jsonb not null default '{}'`        | Explicit per-pack prices. Empty means derive pack price from `product_prices` × multiplier (manager `price` was a unit number).                                                                                                                                                                                                                                       |
| `in_cart_carousel`              | `boolean not null default false`     | When true on a visible accessory, `GET /gallery/cart-accessories` includes it. Nails stay false.                                                                                                                                                                                                                                                                  |
| `created_at` / `updated_at`     | `timestamptz not null default now()` |                                                                                                                                                                                                                                                                                                                                                                          |

Constraints:

- `products_featured_pair_ck`: `featured_from`/`featured_for` are
  either both null or both set — never just one.
- `products_featured_for_positive_ck`: `featured_for` is null or `> 0`.
- `products_accessory_type_check`: `accessory_type` is `default` or `byQuantity`.
- `products_nail_accessory_type_ck`: `nail` and `nail_single` must stay
  `accessory_type = 'default'`.
- `products_accessory_packs_object_ck` / `products_accessory_pack_prices_object_ck`:
  both jsonb columns are objects (not arrays/scalars).

Indexes: `products_hidden_idx (hidden)`,
`products_feed_idx (hidden, created_at desc, id desc)` (the public
feed's sort/pagination).

`legacy_folder` (pamsurin-front's old static-JSON folder id, for
localStorage-favorite continuity) existed briefly in the initial migration
and was dropped before this site ever had real traffic — see
`1738000002000_products_drop_legacy_folder.js`'s comment.

`admin_users` and `session` (the server-rendered HTML backoffice's login
table and its `connect-pg-simple` session store) existed from the initial
migration and were dropped once that backoffice was removed in favor of
`npm run library` as the only write path — see
`1738000003000_drop_admin_backoffice_tables.js`.

## `product_nail_availability`

Boolean offer flags for `nail_single` products (made to order, no stock
count). Added by `1790200000000_compose_nail_set.js`.

| Column       | Type                                                          | Notes |
| ------------ | ------------------------------------------------------------- | ----- |
| `product_id` | `uuid not null references products(id) on delete cascade`     |       |
| `shape_key`  | `text not null`                                               |       |
| `length_key` | `text not null`                                               |       |
| `size`       | `text not null` (`XS`/`S`/`M`/`L`)                            |       |
| `available`  | `boolean not null default true`                               | Live; may flip false later without a reservation. |

PK `(product_id, shape_key, length_key, size)`. Catalogue sets keep using
`product_availability` quantities.

Single nails with variations have one row per option: `variation_key text
not null default ''` (added by `1790300000000_nail_variations.js`) is part of
the primary key `(product_id, shape_key, length_key, size, variation_key)`.
`''` is a nail without variations. The library import expands the product's
`available` grid and its data-static `variations` "switched off" tree into
these rows; `GET /admin/nail-availability` lists every possible combination
and `PATCH` switches one cell or a slice.

## `variation_axes` / `variation_options`

Vocabulary of single-nail variations (docs/plans/nail-variations.md), pushed
by `npm run library-nail` from pamsurin-manager's
`product/library-nail/data-common.json` (`variation` table). This file is
not the shared `product/data-common.json`. Added by
`1790300000000_nail_variations.js`. An admin with `catalogue_edit` can edit
one axis title, or one option, via `/admin/catalogue-vocabulary`.

| Table | Columns | Notes |
| ----- | ------- | ----- |
| `variation_axes` | `key text` PK, `title jsonb not null` | The axis ("color" → « couleur »). |
| `variation_options` | `axis_key → variation_axes on delete cascade`, `option_key text`, `title jsonb not null`, `sort_order integer` | PK `(axis_key, option_key)`. `$table.key` references in the manager file are resolved before the push; only translations are stored. |

## `product_variations`

Which options a single nail offers, in display order. `products.variation_axis_key`
(`text null → variation_axes(key) on delete set null`) names the axis; null
means no variations.

| Column | Type | Notes |
| ------ | ---- | ----- |
| `product_id` | `uuid → products on delete cascade` | |
| `axis_key` / `option_key` | `text not null` | Composite FK → `variation_options on delete cascade`. PK `(product_id, option_key)`. |
| `sort_order` | `integer not null` | 0 is the default option (its photos stand in for the nail). |
| `price` | `numeric(10,2) null`, `>= 0` | Overrides the product price for this option; null uses `product_prices`. Not historized: orders snapshot the unit price they paid. |
| `title` / `"desc"` / `alt` / `occasion` | `jsonb null` | The option's own product copy, already resolved against the nail-level fallback by `library-nail` (added by `1790900000000_nail_variation_copy.js`). Each option is its own product for the gallery, its page, share preview, sitemap and cart/order title. Null only on rows imported before that migration; readers then use the `products` columns. |

For a nail with options, the `products` copy columns hold the first option's
copy (they are `not null`); public readers take each option's copy from here
instead.

## `product_user_library_users`

Access list for a `products.audience = 'user-library'` nail set. `product_id`
and `user_id` are cascading foreign keys and form the primary key. Manager
emails are resolved at import time; only stable account IDs are stored. An
empty access list is valid and keeps a product visible to nobody.

## `product_shapes`

Join table: which shape(s) a set is offered in, and their display order.

| Column           | Type                                                          | Notes                                             |
| ---------------- | ------------------------------------------------------------- | ------------------------------------------------- |
| `product_id` | `uuid not null references products(id) on delete cascade` |                                                   |
| `shape_key`      | `text not null references shapes(key)`                        |                                                   |
| `sort_order`     | `integer not null`                                            | Which shape chip shows first on the gallery card. |

PK `(product_id, shape_key)`. Nail-only join — accessories have no rows here.
Which **lengths** of each offered shape a set is sold in lives one level
down, in `product_shape_lengths` (see below).
Removing a vocabulary row from `shapes` cascades to these rows (and to nail
favorites that referenced them). Photos/availability/cart FKs point at
`products` directly, so shape removal does not cascade those by itself;
import/ops code is responsible for wiping nail photos when shapes change.

Removing a vocabulary row from `shapes` (through `library --delete` or
`library -- delete-shape`) cascades to these rows. The
product itself and historical order snapshots remain.

## `product_shape_lengths`

Join table one level below `product_shapes`: which lengths of an offered
shape a set is actually sold in — a subset of that shape's `shape_lengths`
rows.

| Column       | Type                                                                                                | Notes                                            |
| ------------ | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `product_id` | `uuid not null`                                                                                     |                                                  |
| `shape_key`  | `text not null`                                                                                     |                                                  |
| `length_key` | `text not null`                                                                                     |                                                  |
| `sort_order` | `integer not null`                                                                                  | Display order within the shape (vocabulary order, from the importer); the first is that shape's default length. |
| `hidden`     | `boolean not null default false`                                                                    | This shape/length alone is hidden (added by `1791000000000_shape_length_hidden.js`): absent from every shop surface while the rest of the product stays visible; a cart line on it is unavailable. Photos, availability and favourites are kept, so unhiding is instant. Written by the importer from data-static.json `hidden` and by the admin visibility toggle. `products.hidden` keeps the whole-product meaning; a product whose every pair is hidden is treated as hidden. |

PK `(product_id, shape_key, length_key)`, with composite FKs onto
`product_shapes(product_id, shape_key)` and
`shape_lengths(shape_key, length_key)`, both `on delete cascade` — so
dropping a shape from a set, or a length from the vocabulary, removes the
matching rows (and, through their own FKs, that variant's photos and
favorites). `replaceSetShapeLengths` diffs rather than delete-all for
exactly that reason (see `adminProducts.service.ts`).

## `product_colors`

Join table: a set's main + secondary colors, and their display order.

| Column           | Type                                                          | Notes                   |
| ---------------- | ------------------------------------------------------------- | ----------------------- |
| `product_id` | `uuid not null references products(id) on delete cascade` |                         |
| `option_key`     | `text not null default ''`                                    | `''` = the product's own colours. A single nail's variation option key for that option's colours (added by `1790900000000_nail_variation_copy.js`). No FK: rows are rewritten with `product_variations` by the importer. |
| `color_key`      | `text not null references colors(key)`                        |                         |
| `role`           | `text not null check (role in ('main', 'secondary'))`         |                         |
| `sort_order`     | `integer not null`                                            | Order within that role. |

PK `(product_id, option_key, color_key, role)` — the same color can appear as
both `main` and `secondary` on the same set (two separate rows) but not twice
in the same role of the same option. Every reader of the product's own
colours (checkout snapshots, admin, `library -- check`) filters
`option_key = ''`.

Removing a `colors` vocabulary row cascades to the affected association(s),
without deleting the gallery set.

## `product_photos`

| Column                      | Type               | Notes                                                                             |
| --------------------------- | ------------------ | --------------------------------------------------------------------------------- |
| `id`                        | `uuid` PK          | App-generated.                                                                    |
| `product_id`                | `uuid not null`    | FK → `products(id) on delete cascade`.                                            |
| `shape_key`                 | `text not null default ''` | Nail photos use a real shape key; default accessories use `''`; `byQuantity` accessories use the pack key (`x5`, `x10`, …). No FK to `shapes`. |
| `length_key`                | `text not null default ''` | Nail photos use a real length key; accessories use `''`.                   |
| `position`                  | `integer not null` | Display order within its set+shape+length — becomes the on-disk filename (`storage.ts`). |
| `small_path` / `modal_path` | `text not null`    | Paths relative to `config.mediaDir` (`PUBLIC_DIR` + `PUBLIC_MEDIA_DIR`). Filenames are `<position>-<modalSha256>.…` so a re-import never overwrites a previous version on disk — order snapshots keep working. |
| `content_hash`              | `text not null default ''` | SHA-256 hex of the **modal** file bytes (from prepare-library / verified at import). Site `small/` thumbs are derived at import and are not hashed separately — order display re-checks the modal. |

| `variation_key` | `text not null default ''` | Single-nail variation option; `''` for everything else. Disk path gains the segment (`<set>/<shape>/<length>/<variation>/…`). |

Index: `product_photos_set_shape_idx (product_id, shape_key, length_key, variation_key, "position")`.
