# Single-nail variations

Status: **implemented, pending preprod validation** (then delete this plan: the live docs are `docs/api/06-gallery.md`, `07-operation.md`, `01-admin.md`, `docs/schema/01-catalog.md` and catalog source `product/library-nail/README.md`). Deviations from the text below: the per-option price lives on `product_variations.price` (not historized; orders snapshot what was paid), and an unknown or switched-off option reuses the existing `unavailable` extra-set code instead of a new `variation_unavailable`. Contract for adding an optional variation axis
(colour first, other axes later) to the single nails of the compose-a-set
gallery (`product_type = 'nail_single'`), across catalog source,
kernel/back and kernel/front. Axes and their options are a translated
**vocabulary**, like shapes and colours, declared once and reused by every
product; the vocabulary files become layered (root + per catalogue).

## What a variation is

A single nail today is chosen on three axes: shape and length per nail, size
for the whole composed set. A variation adds a fourth, **per nail**, axis:

- **Optional.** A nail without variations behaves exactly as today.
- **Vocabulary, not per-product text.** An axis ("Couleur") and its options
  ("Rose", "Émeraude", "Nuit") are declared and translated once in a
  `data-common.json`; products reference them by key (`$color`, `$pink`),
  exactly like `shape` and `color` today. Any number of axes can exist
  ("Couleur", "Motif", "Finition"); a product uses **at most one**, never two
  (confirmed).
- **Photo-bearing.** Each option has its own photo in every shape/length the
  nail is offered in: `modal/<shape>/<length>/<variation>/1.webp`.
- **Price per option, optional.** `price` stays a single value, or becomes an
  object keyed by option with a reserved `default` key, the same authoring
  shape as the courier files (`"countries": { "default": false, "FR": true }`).
  See "Price per option" below.
- **Scope.** `nail_single` only. Sets (`product_type = 'nail'`) and
  accessories are untouched; the new columns default to `''` so sets could
  adopt the axis later without another migration.

## Decisions taken in this plan (change before implementing if wrong)

1. **Complete matrix (confirmed).** A nail with variations must have a photo
   for every option × every offered shape/length. `prepare-library-nail`
   refuses the product otherwise, and `library-nail -- check` refuses it again
   server side. No option is ever shown without its photo.
2. **Availability can be switched off per option at any depth (confirmed).**
   An option is offered for one exact nail (shape, length, size) when the
   existing shape → length → size boolean is true **and** that option is not
   switched off there. The switch can target the whole option, one shape,
   one length of a shape, or one size (see `data-static.json`). Made to
   order, so there is still no stock count to model.
3. **The default option is the first one.** It drives the gallery card photo,
   SEO image, share preview and anything that shows "the" photo of the nail.
4. **Keys are English slugs** (`color`, `pink`, `emerald`), stable once
   published, same convention as the root colour keys. Removing a key from the
   vocabulary behaves like removing a shape (cascade on the catalogue side,
   order snapshots untouched).
5. **A key lives at exactly one vocabulary level** (root or catalogue). The
   same key defined at both levels is an error, because the backend
   vocabulary tables are global: two definitions would fight over one row.

## 1. catalog source (`prepare-library-nail`)

### Layered vocabulary: `data-common.json` per catalogue

Today there is one `product/data-common.json` (shape, length, color) read by
`library`, `library-user` and `library-nail`. It becomes the **root** layer,
and every catalogue folder may add its own:

```
product/
  data-common.json               # root: shape, length, color (unchanged)
  library/data-common.json       # optional, sets only
  library-user/data-common.json  # optional, user sets only
  library-nail/data-common.json  # optional, single nails only: variation
```

- **Effective vocabulary** of a catalogue = root merged with that
  catalogue's file, per table (`shape`, `length`, `color`, `variation`, …)
  then per key. Either file may hold any table.
- **One level per key** (decision 5): a key present in both is a hard error
  naming both files, so the operator moves it rather than guessing which
  wins.
- **Where new keys are written.** Keys minted automatically by prepare keep
  their current home: new colours and new shape lengths go to the root (they
  are shared). `variation` keys are hand-written and live wherever the
  operator puts them: in `library-nail/data-common.json` while only single
  nails use them, moved to the root the day sets want the same axis.
- **Saving** writes each key back to the file it was read from, never
  copying root keys into a catalogue file.

One shared loader implements this, used by every reader:

| Reader | Today | Change |
| ------ | ----- | ------ |
| `scripts/prepare-library.mjs` `loadDataCommon` / `saveDataCommon` | root file only | Load both layers, merge, remember each key's origin, save per origin. |
| `scripts/product-copy-placeholder.mjs` `shapeVocabulary` | root file only | Use the merged vocabulary of the catalogue it runs on. |
| kernel/back `scripts/library.ts` `vocabularyPath` | `dirname(sourceDir)/data-common.json` | Read root + `sourceDir/data-common.json`, merge with the same rule, push the result to `/operation/library-import/vocabulary`. |

A catalogue without its own file behaves exactly as today.

### Variation vocabulary (`library-nail/data-common.json`)

```json
{
  "variation": {
    "color": {
      "title": { "fr": "couleur", "en": "colour", "es": "color", "…": "…" },
      "option": {
        "pink": { "fr": "rose", "en": "pink", "…": "…" },
        "emerald": { "fr": "émeraude", "en": "emerald", "…": "…" },
        "night": { "fr": "nuit", "en": "night", "…": "…" }
      }
    }
  }
}
```

- `title` is the axis name shown above the picker; each `option` entry is
  one choice. Same per-language object shape as a root `color` entry.
- The French text is hand-written (or created by `--create-missing-variation`,
  see below); the existing `translateDataCommon` pass fills the missing
  languages once, for every product that will ever use it.
- **Reusing existing words (confirmed).** An option (or an axis `title`)
  may be a reference string instead of a translation object:

  ```json
  "option": {
    "pink": "$color.pink",
    "gold": "$color.gold",
    "night": { "fr": "nuit", "en": "night", "…": "…" }
  }
  ```

  `"$color.pink"` means "the `pink` entry of the `color` table of the
  effective vocabulary" (root or catalogue layer), with its 7 translations.
  Rules:
  - The path is `$<table>.<key>` or deeper (`$shape.almond.title`); it must
    end on a per-language object. Anything else stops prepare with the path
    and what it found.
  - A reference cannot point at another reference, and cannot point into the
    `variation` table itself, so there is never a chain or a loop.
  - Prepare and kernel/back `scripts/library.ts` resolve references before
    anything else; the vocabulary push sends plain translations, the
    database never stores a `$` string.
  - `translateDataCommon` skips a referenced entry (its source is translated
    where it lives).
  - Renaming or removing the target (`color.pink`) makes every reference to
    it fail loudly at the next prepare, listing the referencing options, so a
    variation can never silently lose its name.

### Product folder layout

```
product/library-nail/0042/
  modal/almond/medium/pink/1.webp
  modal/almond/medium/emerald/1.webp
  modal/almond/long/pink/1.webp
  …
  small/…                      # generated, same depth
  data-generated.json
  data-static.json
```

The third level is the **option key**. In `_new/` drops, the folder may also
be named with the option's French label (`rose/`), like shape folders use
French names today; prepare renames it to the key. A nail without variations
keeps `modal/<shape>/<length>/1.webp`. Mixing the two layouts inside one
product is an error.

### `data-generated.json`

```json
"variation": { "$color": ["$pink", "$emerald", "$night"] },
"photos": {
  "almond": { "medium": { "pink": [{ "photo": "1", "hash": "…" }], "emerald": [ … ] } }
}
```

- Same reference style as `shape`: one axis key, its option keys in display
  order; the first is the default (decision 3).
- Every referenced key must exist in the effective vocabulary.
- `photos` gains one level only when `variation` exists.

### Price per option (`data-static.json`)

```json
"price": 2.5
```

```json
"price": { "default": 2.5, "chrome": 3.5 }
```

- A number keeps today's meaning: every option (or the nail without
  options) costs that.
- An object needs `default`; every other key must be one of the product's
  options and overrides the price for that option only. An unknown key or a
  missing `default` stops the product in prepare and in `library-nail --
  check`.
- The object form is only valid on `library-nail` products with options.
  Sets and accessories keep a number (accessory packs already have their own
  pricing).

### Unknown variation keys: `--create-missing-variation`

By default `prepare-library-nail` accepts **only variation keys that already
exist** in the effective vocabulary (root or `library-nail/data-common.json`).
An unknown axis or option, whether it comes from a `_new/` folder name or
from a `$ref` in `data-generated.json`, stops that product with the list of
known keys, and the product's files are left untouched.

```bash
npm --prefix catalog import tree run prepare-library-nail -- --create-missing-variation
npm --prefix catalog import tree run prepare-library-nail -- --create-missing-variation --variation-axis finish
```

With `--create-missing-variation`, each unknown entry is created instead:

- **From a folder name** (`_new/…/almond/medium/rose/`): if the axis is
  `color` and a root colour has that French title, the option is created as
  a reference (`"pink": "$color.pink"`), nothing to translate. Otherwise the
  name is the French title; the key is its English translation slugged
  (`rose` → `pink`), the same way new root colours get their English key, and
  the other languages come from the usual `translateDataCommon` pass in the
  same run.
- **From a `$ref`** (`"$emerald"`): the reference is the key; prepare asks
  for the French title and the other languages from it.
- **Where it is written:** always `library-nail/data-common.json` (a new key
  is catalogue-specific until someone moves it to the root). If the key
  already exists at the root, nothing is created (decision 5 forbids a
  duplicate).
- **A created key is logged** (`[prepare-library] data-common: new
  variation option "color.pink" (rose) added`) so the operator can review
  the translation before `library-nail -- seed`.

**Which axis a drop belongs to.** A product that already declares
`variation` keeps its axis. A new drop takes the axis from
`--variation-axis <key>`; without it, prepare uses the only axis in the
vocabulary, and refuses when there are none or several. An unknown
`--variation-axis` key is created by `--create-missing-variation` like an
option (its title from the key, then translated), and refused without it.

The flag never renames or deletes an existing key, and never touches the
root file.

### `data-static.json`: switching options off

`available` is unchanged (shape → length → size booleans for the nail). A new
`variations` object lists only what is switched **off**, as a sparse tree
that follows the same shape → length → size order. `false` at a level
switches the option off for everything below it; anything not written stays
on.

```json
"variations": {
  "night": false,
  "gold": { "square": false },
  "emerald": { "almond": { "long": false, "medium": { "XS": false } } }
}
```

Reads as: "night" off everywhere; "gold" off in square only; "emerald" off
in almond long, and off in almond medium for size XS only. Every other
combination of those options stays on. Keys must be the product's options,
then its shapes, lengths and sizes; an unknown key stops the product.
Switching off never deletes photos, so switching back on is just removing
the entry.

What the customer sees:

- The picker greys an option that is off for the nail's current shape and
  length (and, in the composer, for the set's current size).
- Changing shape, length or the set size so that a placed nail's option
  becomes off marks that nail unavailable in the carousel, the same way an
  unoffered shape/length/size is flagged today, and blocks the cart until it
  is changed.

### Script changes (`scripts/prepare-library.mjs`)

| Area | Change |
| ---- | ------ |
| `shapeLengthFoldersOf` / `modalDirFor` / `smallDirFor` | Walk one more level when variation folders exist; return `(shape, length, variation)` triples. |
| New-folder intake (`_new/`, `assembleManualSubfolder`) | Accept `<shape>/<length>/<option>/` drops; resolve each folder name against the axis options (key or French label, like shape folders). Unknown names follow the rule in "Unknown variation keys" below. |
| `resizeMissingSmalls`, `syncModalPhotoHashes`, WebP pass | Recurse into the variation level. |
| `generateMetadata` (AI description) | Describe the default variation's photo; the prompt names the axis so the copy does not claim a single colour. |
| `translateDataCommon` / `findDataCommonTranslationWork` | Cover `variation.<axis>.title` and every `option` entry, in whichever layer they live; write translations back to that layer. |
| Validation | Vocabulary: no key at two levels, every `$ref` resolves (or is created under `--create-missing-variation`). Product: complete matrix (decision 1), options ⊂ the axis vocabulary, no mixed layout, `data-static.variations` keys ⊂ the product's options. |
| CLI | `--create-missing-variation` and `--variation-axis <key>` parsed only for the `library-nail` run; rejected with a clear message on `prepare-library` / `prepare-library-user`. |
| `product/README.md`, `library-nail/README.md`, `COMMAND.md` | Document the layered vocabulary, the variation table, the layout and validation. |

Sets (`prepare-library`) and user sets are not changed: the variation level is
only read when `LIBRARY_SOURCE_DIR` is `product/library-nail`.

## 2. kernel/back

### Schema (one migration, then `sync:schema`)

| Table | Change |
| ----- | ------ |
| **new** `variation_axes` | Vocabulary: `key text PK`, `title jsonb not null`. Seeded by the vocabulary push like `shapes` / `colors`. |
| **new** `variation_options` | Vocabulary: `(axis_key → variation_axes on delete cascade, option_key text, title jsonb not null, sort_order int)`, PK `(axis_key, option_key)`. |
| `products` | `variation_axis_key text null references variation_axes(key) on delete set null`. Null = no variations. |
| **new** `product_variations` | `(product_id → products on delete cascade, axis_key, option_key, sort_order int not null)`, PK `(product_id, option_key)`, composite FK `(axis_key, option_key)` → `variation_options on delete cascade`. Which options a product has, in order. |
| `unit-offer table` | `option_key text not null default ''`, added to the PK: `(product_id, shape_key, length_key, size, option_key)`. The import expands `available` + the `variations` tree into one row per exact combination, so the shop and the admin read a flat matrix and never interpret the tree. A product without options keeps its rows with `''`. |
| `product_photos` | `variation_key text not null default ''`; index becomes `(product_id, shape_key, length_key, variation_key, position)`. |
| `extra-set cart child rows` | `variation_key text not null default ''`. |
| `extra-set order child rows` | `variation_key text not null default ''`, `variation_label jsonb null`, `variation_axis_label jsonb null`, copied from the vocabulary at confirm like `shape_label`, so renaming or deleting a vocabulary entry never rewrites a past order. |
| `product_prices` | `option_key text not null default ''`: `''` is the product's default price, a key is that option's override. The latest row per `(product_id, option_key)` applies; a latest override row with `price null` means "use the default". Check becomes `price > 0 or (price is null and option_key <> '')`; index `(product_id, option_key, effective_at desc)`. Existing rows are the default price. |
| `favorites` (nail variant columns) | `variation_key text not null default ''`, so a favourited cat eye reopens on its colour. |

Existing rows get `''`: every current nail, cart and order keeps its meaning.
Update `docs/schema/01-catalog.md`, `02-accounts.md` and `03-pricing-cart-orders.md`.

### Import (`npm run library-nail`)

- `scripts/library.ts`: layered vocabulary read (see section 1), strip the
  `$` of the product's `variation` references like it does for `shape`.
- Vocabulary endpoint (`libraryVocabulary.router.ts`): accept a `variation`
  table and upsert `variation_axes` / `variation_options`; deletions follow
  the existing `delete-shape` style (explicit, confirmed).
- `librarySetImport.ts`: set `products.variation_axis_key`, replace
  `product_variations` (diff, not delete-all, same reason as
  `replaceSetShapeLengths`), store photos with `variation_key`. An option not
  in the vocabulary is refused, like an unknown shape.
- `media/storage.ts`: on-disk path gains the variation segment.
- Price: `price` accepts a number or `{ default, <option>: … }`;
  `setPriceIfChanged` runs per `(product, option_key)`, so re-importing an
  unchanged object adds no row. An override removed from the object gets an
  `option_key` row with `price = null` ("back to default"), so the
  append-only history still says when that option stopped costing more, and
  a later change of the default applies to it.
- `check` subcommand: reject an incomplete matrix server side too.

### Catalogue read (`GET /gallery/nails`, `/gallery/nail/:uid`, relay/preview)

`GalleryItem` gains, only when the product has variations:

```ts
variation?: {
  key: string;                                // axis vocabulary key, e.g. 'color'
  label: string;                              // localized axis title
  options: { key: string; label: string; price?: number }[];
};
/** Offer per option, same shape as `available`. `available` itself stays the
 * union (offered in at least one option) so existing checks keep working. */
availableByOption?: Record<string, SetAvailability>;
// item.price stays the default price; an option's `price` is set only when
// it overrides it.
/** photos per option; photosByShapeLength stays = the default option's
 * photos so every existing consumer keeps working unchanged. */
photosByVariation?: Record<string, Record<string, Record<string, Photo[]>>>;
```

`assembleItems` (`catalog/application/products.ts`) loads the extra photos
and `product_variations` (joined to the vocabulary for the localized labels)
in the same batch queries. SEO document and preview
keep using the default option's photo; `productImages` includes every option
(JSON-LD `image`).

### Cart, extra sets, checkout

| Place | Change |
| ----- | ------ |
| `contract/cart.ts` `CartCompositionNail` (+ front mirror) | `variationKey?: string`. |
| extra-set domain validation | Required and must be an `available` option when the product has variations; must be absent/`''` otherwise. New error code `variation_unavailable` (error catalogue + front message). |
| extra-set write / read / checkout | Persist, read and re-validate `variation_key`; read also returns `variationLabel` and the option photo. |
| Guest checkout (`guestCheckoutSchemas.ts`, `priceGuestCheckout.ts`) | Accept and validate `variationKey` per nail. |
| Gift receiver extra-set (`giftReceiver extra-set router`, `receiver extra-set`, `receiverConfirm`) | Same field, same validation. |
| Extra-set price (extra-set checkout, `cartTotalsSql.ts`, `cartNailUnitsSql.ts`) | A nail's unit price = its option's override, else the product default. The extra-set unit price is still the sum of its nails, now per option. |
| Vouchers, loyalty (`pricedLineKey`, `voucherPricing`, `merchandiseLoyaltyPreview`) | They work on the extra-set line total, so they follow automatically; check that no path re-reads `products` price directly for an extra-set unit. |

### Orders, invoice, emails, ops

| Place | Change |
| ----- | ------ |
| `placement/orderConfirmationSupport.ts` | Snapshot `variation_key`, `variation_label`, `variation_axis_label`, and the option's photo into `extra-set order child rows`. |
| `orders/infrastructure/orderRows.ts`, `contract/orders.ts`, `contract/admin/orders.ts` | Expose `variationKey`, `variationLabel`, `variationAxisLabel` per extra-set unit. |
| `utils/groupOrderDisplayLines.ts`, `messaging/application/orderEmailLines.ts`, `emailStrings.ts` | Nail line reads "Index gauche · Amande · Medium · Couleur : Rose". |
| `invoicing/infrastructure/invoiceDocument.ts` / `invoicePdf.ts` | Same wording on the PDF extra-set sub-lines. |
| Admin order detail / return review / stock actions | Show the variation (production needs it to make the right nail). |
| `scripts/order.ts` archive (`catalog source/order/<status>/*.json`) | Carries the new contract fields automatically; verify one archived extra set. |
| Admin nail availability (`adminNailAvailability.router.ts`, front `AdminNailAvailabilityPage`) | The matrix gains the option dimension: for a product with options, one row of size toggles per shape × length × option, plus shortcuts to switch an option off for a whole shape or for the whole nail. Writes `unit-offer table` rows directly, like today; the next `library-nail -- seed --update` re-applies `data-static.json`, same precedence rule as the existing size toggles (documented in `01-admin.md`). |

Docs: `docs/api/06-gallery.md` (item shape), `13-cart.md` (extra-set unit),
`04-guest-checkout.md`, `08-gift.md`, `01-admin.md`, `errors.json`,
then `sync:routes`, `sync:api-reference`, `sync:contract`.

## 3. kernel/front

### The picker: `VariationTag`

A new tag beside `ShapeTag` / `LengthTag` (same file family, same
`TagMenuPlus`, floating portaled listbox, darkened `backdrop`, keyboard
listbox handling, `useFloatingMenuRect`). Differences:

- The button shows the option's small photo (round, 20px) + label + `+`.
- Each option row shows its photo thumbnail + label; unavailable options are
  greyed and not selectable (same as `FingerTag` used to do for taken
  fingers).
- Hidden entirely when the item has no `variation`.

### Where it appears

| Surface | Desktop | Mobile |
| ------- | ------- | ------ |
| Gallery-nail card (`GalleryCard` compose) | Below the description, labelled with the axis name ("Couleur"). | In the card caption (description is hidden on mobile), same place. |
| Zoom modal (`PhotoLightboxView` compose) | Below the description, above the hands picker. | Below the description in the sheet's scrollable content. |
| Composer carousel card (`ComposeCarousel`) | In the card body, above the finger row, so a nail's colour can be changed after it is placed. | Same. |
| Nail page (`NailProductPage`) | A third variant block ("Couleur") after shape and length. | Same. |

Selecting an option swaps the photo to
`photosByVariation[shape][length][option]`. Changing shape/length keeps the
option (the matrix is complete, decision 1).

### State and data flow

| Place | Change |
| ----- | ------ |
| `data/types.ts` `GalleryItem` | `variation?`, `photosByVariation?` (mirror of the API). |
| New `data/nailVariation.ts` | `defaultVariationKey(item)`, `variationPhotos(item, shape, length, key)`, `isOptionOffered(item, shape, length, size, option)` reading `availableByOption`. |
| `ComposeNail` (`ComposeCarousel`) and `GalleryNailPage.addFromGallery` | Carry `variationKey`. |
| extra-set client helpers (`validateExtraSet`, unit price) | Mirror the new server rule (`variation_unavailable`) and price each nail with its option's override (preview only; the server stays authoritative). |
| Picker / cards | An option with an override shows its price in the list (e.g. "Chrome · 3,50 €"); the card and modal price follow the selected option. |
| `state/galleryNailEditSession.ts` | Draft nails keep `variationKey` + label + photo. |
| Guest cart (`state/guestCart.ts`, `utils/guestCompositionCart.ts`, `state/guestSync.ts`) | Store and send `variationKey`; a guest cart saved before the change reads as `''`. |
| `useCompositionCommands`, `api/cart.ts`, `api/contract/cart.ts` | Pass it through. |
| Cart drawer (`CartDrawerCompositionLines`), cart page (`CompositionCartBlock`) | Nail line shows the option label and the option photo. |
| Orders (`OrderCompositionBlock`, `OrdersList`, `groupOrderItems`), admin order detail | Same. |
| Gift receiver cart / follow pages | Same. |
| Favorites (`useGalleryFavorites`, `FavoriteButton`, `api/favorites.ts`) | Remember `variationKey` with shape/length. |
| `useGalleryProductDeepLink` / share | Optional `&variation=<key>` in the share link, opening the modal on that option. |
| i18n | Only generic copy (unavailable notice, error message); axis and option names come from the vocabulary through the API. 7 locales. |

## Delivery order

Each step ships on its own and is safe with the previous state of the others,
because every new field is optional and defaults to "no variation".

0. **Layered vocabulary loader** (manager + back `scripts/library.ts`),
   shipped alone: with no catalogue file present it changes nothing, which is
   the test.
1. **Back schema + vocabulary push + import + catalogue read.** Nails without
   variations read identically; with variations, the API already returns
   them.
2. **Manager prepare.** Write the `color` axis in
   `library-nail/data-common.json`, produce the first cat eye product;
   `library-nail -- check` then `seed --update` on dev.
3. **Front picker (gallery card, modal, nail page)**, read only: shows and
   switches photos; adding to the set still uses the default option.
4. **Composition + cart + checkout** (back validation first, then front
   state, guest cart, drawer, cart page, gift).
5. **Orders, invoice, emails, admin, ops archive.**
6. **Favorites, share link option.**

Steps 4 and 5 must deploy together before the first variation product is
made visible, or an order could lose the colour.

## Test fixtures

Fake products in `catalog source/product/library-nail/` (to be replaced by
real ones), plus the `color` and `finish` axes in
`library-nail/data-common.json`:

| Folder | UID | Covers |
| ------ | --- | ------ |
| `0004` | `NL-DD-004` | `color` axis, 3 options, one price; `emerald` off for almond long in size XS only (size-level switch). |
| `0005` | `NL-EE-005` | `color` axis, `price: { default: 3, gold: 4.5 }`; `night` off everywhere, `gold` off in square (whole-option and shape-level switches). |
| `0006` | `NL-FF-006` | Second axis (`finish`), `price: { default: 2.8, matte: 3.2 }`. |
| `0001`–`0003` | `NL-AA-001`… | Nails without variations (must keep working unchanged). |

Each photo is a drawn nail labelled `<uid> · <shape>/<length> · <option>`,
so a wrong photo in any surface is visible at a glance.

## Answered

- Missing photo for one option in one shape/length: **not allowed**
  (decision 1).
- Option price: **yes**, number or `{ default, <option> }` object.
- Gallery filters: **no** variation filter.
- Switching an option off for part of a nail: **yes**, at any depth, in
  `data-static.json` and in the admin (decision 2).
- Two axes on one product: **never**.
- Colour options reusing the root colours: **yes**, through
  `"pink": "$color.pink"` references (section 1).

No open question left; the plan is ready to implement.
