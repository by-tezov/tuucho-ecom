# Folder-derived shapes, `$` keys everywhere, per-shape/length visibility

Status: **implemented 2026-09-29, pending preprod validation** (then delete
this plan: the live docs are `docs/api/01-admin.md`, `06-gallery.md`,
`07-operation.md`, `docs/schema/01-catalog.md`, `docs/command/02-imports.md`
and pamsurin-manager `product/library/README.md`). Deviations: the admin
control sits in each variant's edit panel (the stock lists are already one
row per shape/length): whole-product switch, this-variant switch, and a
« toute la forme » action; the nail availability page gets the same control
per row. `library-nail` now also upserts the shared colours (option colours
are often new). Across pamsurin-manager, pamsurin-back and pamsurin-front,
for the three catalogues `library` (sets), `library-user` and `library-nail`.

## The three problems

1. **`shape` in `data-generated.json` duplicates the folders.**
   `"shape": { "$oval": ["$medium"] }` says exactly what
   `modal/oval/medium/` already says. Two sources can disagree (a folder
   added without the map, a map entry without photos).
2. **`hidden` is all or nothing.** `data-static.json` `"hidden": true`
   hides the whole product; there is no way to stop selling one shape, or one
   length of one shape, while keeping the rest.
3. **Keys that point into `data-common.json` are written without `$` in
   some places.** `photos` is keyed `oval` → `medium`, `available` is keyed
   `almond` → `medium`, while `shape` and the colour lists use `$oval`,
   `$medium`. The `$` is the marker that says "this is a reference to a
   translated vocabulary entry", so it must be on every such key.

## Decisions (change before implementing if wrong)

1. **The folders are the only source of shapes and lengths.** A product is
   offered in the shape/length pairs that have a folder with at least one
   photo under `modal/` (`modal/<shape>/<length>/`, plus
   `/<option>/` for a nail with variations). `data-generated.json` loses
   `shape`; `data-static.json` loses its `shape` override (hiding replaces
   it, decision 4).
2. **Display order comes from the vocabulary**, not from the product:
   shapes in `data-common.json` `shape` table order, lengths in each shape's
   own `length` list order. The first shown is the default. Same order on
   every product, and no per-product list to keep in sync. (Today the order
   is the `shape` map's key order.)
3. **Every key that names a vocabulary entry carries `$`**, in both files:
   | File | Field | Keys |
   | ---- | ----- | ---- |
   | `data-generated.json` | `photos` | `$shape` → `$length` (→ `$option`) |
   | `data-static.json` | `available` | `$shape` → `$length` → size |
   | `data-static.json` | `hidden` (new form) | `$shape` → `$length` |
   | `data-static.json` | `variations` (nail off tree) | `$option` → `$shape` → `$length` → size |
   | `data-static.json` | `price` object (nail) | `default`, `$option` |

   Sizes (`XS`…`L`) and `default` are not vocabulary and stay bare.
   `prepare-*` rewrites existing files once (idempotent); the importer reads
   both forms during the transition, so nothing breaks between a back
   deploy and a manager run.
4. **`hidden` accepts three depths.** Anything not written is visible.

   ```json
   "hidden": true
   ```
   ```json
   "hidden": { "$oval": true, "$almond": { "$short": true } }
   ```
   `true`/`false`: the whole product (today's meaning). An object: a shape
   key → `true` hides every length of that shape; a shape key → object hides
   only the listed lengths. A key that is not one of the product's folders
   stops the product in prepare and in `check`, like an unknown shape today.
5. **Hidden means not offered anywhere.** A hidden shape/length is absent
   from the card chips, zoom, product page, SEO page, sitemap, filters and
   feed matching, exactly as if its folder did not exist. A product whose
   every shape/length is hidden behaves like a fully hidden product. Photos
   stay on disk and in the database, so unhiding is instant.
6. **Carts already holding a hidden variant** treat that line like a line
   whose product was hidden today: kept, flagged unavailable, blocks
   checkout until changed or removed. Orders already placed are snapshots
   and never change.
7. **Admin and `data-static.json` keep today's precedence** for the
   product-level toggle: an admin change is live immediately, the next
   `seed --update` re-applies `data-static.json`, and
   `library -- seed --direction local` pulls the admin state back into the
   file (it writes the new `hidden` form).

## 1. pamsurin-manager

| Area | Change |
| ---- | ------ |
| `prepare-library.mjs` `generateMetadata` | Stops writing `shape`. |
| One-time migration (every catalogue, idempotent) | Drop `shape` from `data-generated.json`; prefix `$` on `photos` keys; in `data-static.json` prefix `$` on `available`, `variations`, `price` option keys; turn a `data-static` `shape` override that lists fewer pairs than the folders into the equivalent `hidden` object, then drop it (logged). |
| `syncModalPhotoHashes` | Writes `photos` with `$` keys. |
| Validation | `hidden` object keys must be existing folder pairs; `available` keys likewise. |
| `sync-library-shop.mjs` | Reads shapes/lengths from folders instead of `dataGenerated.shape`, `$` keys in `available`. |
| `prepare-accessory.mjs` | Accessory `photos` keys are pack keys, not vocabulary: unchanged. |
| Docs | `product/README.md`, `product/library/README.md`, `library-user`, `library-nail/README.md`, `COMMAND.md`. |

## 2. pamsurin-back

### Schema (one additive migration, then `sync:schema`)

| Table | Change |
| ----- | ------ |
| `product_shape_lengths` | `hidden boolean not null default false`. The import expands the `hidden` object to one flag per (shape, length); hiding a shape sets all its lengths. `products.hidden` keeps the whole-product meaning. |

A shape stays in `product_shapes` while any of its lengths is visible; the
readers below decide visibility, the rows are never deleted by hiding (so
photos, favourites and availability survive).

### Import (`scripts/library.ts`, `librarySetImport.ts`)

- Shapes/lengths from the folders (decision 1), ordered by the vocabulary
  (decision 2); `$` stripped from every key, bare keys still accepted.
- `hidden`: boolean → `products.hidden`; object → `products.hidden = false`
  plus the per-pair flags. Payload gains `hiddenShapeLengths:
  Array<{ shapeKey, lengthKey }>`.
- `check` compares the per-pair flags (`hidden` difference).
- `--direction local` (library only) writes back the new `hidden` form and
  `$` keys.

### Readers

| Reader | Change |
| ------ | ------ |
| `galleryItemAssembly.ts` (`buildProductVariants`) | Skip hidden pairs; drop a shape with no visible length. `available`, photos, `availableByOption` follow. |
| `feedWhere.ts` | Shape/length/size/occasion filters and the base clause require a visible pair; a product with none is excluded (as `hidden = true` today). |
| `filterOptionsQuery.ts`, `gallerySeoQuery.ts`, `productSitemap.ts`, `availability.ts` offer predicates | Visible pairs only. |
| Cart / composition / checkout validation (`compositionWrite`, `compositionCheckout`, guest checkout, gift receiver) | A hidden pair is `unavailable` (decision 6). |
| Admin lists (`adminStockSupport.ts`) | Return the per-pair flags. |

### Admin API

| Route | Change |
| ----- | ------ |
| `PATCH /admin/library-stock/:productUid/hidden` (and the `user-library-stock`, nail equivalents) | Body `{ hidden: boolean }` keeps its meaning (whole product). New optional body `{ shapeKey, lengthKey?, hidden }` flips one shape (all its lengths) or one pair. Response returns `hidden` plus `hiddenShapeLengths`. |

Docs: `docs/api/01-admin.md`, `06-gallery.md` (hidden pairs never
appear), `07-operation.md`, `docs/schema/01-catalog.md`,
`docs/command/02-imports.md`.

## 3. pamsurin-front (admin)

On the three stock pages (sets, user library, nails), the single
« Visible / Masqué » switch becomes a **Visibilité** control:

- The main switch stays where it is and keeps its meaning: the whole product.
- A « Par forme » disclosure under it opens one row per shape: the shape
  label, a switch for the whole shape, and the shape's lengths as toggle
  chips (filled = visible, struck = hidden). A shape with some lengths hidden
  shows its switch in a mixed state (« Partiel »).
- Each change is saved immediately (same optimistic update and rollback as
  the current switch), with the existing toast on failure.
- The row's summary line reads « Masqué : Ovale, Amande court » when
  anything is hidden, so the list shows partial hiding without opening it.
- On the nail availability page (`AdminNailAvailabilityPage`), hidden pairs
  are shown greyed with « Masqué », since availability and visibility are
  separate switches.

Shop side, nothing new to build: hidden pairs are simply absent from the API
(decision 5); a cart line on a hidden pair uses the existing unavailable
state.

## Delivery order

1. **Back**: migration, importer reading folders + both key forms + the
   `hidden` object, readers, admin route. Nothing changes until re-import.
2. **Manager**: migration of every catalogue folder, prepare/sync changes.
   `library -- check`, `library-user -- check`, `library-nail -- check` on
   dev, then `seed --update`.
3. **Front admin** Visibilité control.

## Answered

- Display order: `data-common.json` order for every product (decision 2),
  accepted.
