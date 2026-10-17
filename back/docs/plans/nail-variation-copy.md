# Each variation option is a product

Status: **implemented 2026-09-29, pending preprod validation** (then delete
this plan: the live docs are `docs/api/06-gallery.md`, `07-operation.md`,
`docs/schema/01-catalog.md`, `docs/command/02-imports.md` and
pamsurin-manager `product/library-nail/README.md`). Deviations: the importer
still accepts the list form (every option then repeats the nail's copy); the
front route is two routes (`nail/:slug` and `nail/:slug/:variation`); option
page URLs used by the back (canonical, sitemap) are bare-uid
`/nail/<uid>/<option>`, the front's own links carry the title slug. The
data-generated.json shape shipped is flatter than section 1 below:
`"is-variation": true` plus one root `"$<axis>.<option>"` entry per option
carrying its copy and its own `photos` (see pamsurin-manager
`product/library-nail/README.md`). Follow-up
to [nail-variations.md](./nail-variations.md), across pamsurin-manager,
pamsurin-back and pamsurin-front.

## The problem

A variation option is, in practice, a different product: `0003` offers
`black-cherry`, `deep-cherry`, `honey-caramel`, `muted-coral`, `rosy-mocha`
and `true-red`. Today everything descriptive is stored once per nail and
generated from the **first option's photo only**, so for every other option
the title, description, alt text, occasion and colours are wrong, and the
nail has a single page, a single sitemap entry, a single share preview and a
single JSON-LD `Product`, all describing the first option.

Shape and length never had this problem because the copy writes
`$shape.title` and the renderer substitutes it. A placeholder is not enough
for an option: tone, finish wording, occasion, colours and the photo the alt
text describes all change.

## Principle

**One option = one product** for everything a visitor, a crawler or a share
preview sees: its own title, description, alt, occasion, colours, photo,
URL, canonical, sitemap entry, preview card and JSON-LD `Product`.

**One nail = one gallery card**: the options stay grouped under the same
`productUid` (one `GalleryItem`, one card with the option picker, one
availability matrix, one price rule), exactly as today.

No public surface ever shows one option's copy next to another option's
photo.

## Decisions (change before implementing if wrong)

1. **Per-option fields:** `title`, `desc`, `alt`, `occasion`, `color-main`,
   `color-secondary`. Structural fields (`shape`, lengths, photos, price,
   availability) are unchanged.
2. **Sparse inheritance**, same rule as `data-static.json` `variations`: an
   option field that is absent falls back to the nail-level field. A field
   that really is shared is written once at the top.
3. **The generator writes everything per option**: one metadata call per
   option on that option's photo.
4. **Per-option URL**: `/nail/<option-title-slug>-<uid>/<option-key>`, e.g.
   `/fr/nail/cerise-noire-nl-bb-003/black-cherry`. It is the canonical of
   that option. The bare `/nail/<slug>-<uid>` of a nail with variations
   renders the default option with its canonical pointing at the explicit
   option URL, so existing links keep working and there is one canonical per
   option. A nail without variations keeps `/nail/<slug>-<uid>`.
5. **Structured data follows Google's product-variant model**: each option
   page's `Product` has `color` (the option label) and `isVariantOf` a
   `ProductGroup` (`productGroupID` = uid, `variesBy` =
   `https://schema.org/color`, `hasVariant` = every option's URL).
6. **Filters: any option matches, and the card opens on it.** The occasion
   filter is live: a nail matches when any option has that occasion, and the
   feed tells the card which option matched so it opens on that option rather
   than the default. `filter-options` lists occasions from every option.
7. **Nails without variations are untouched.**

## 1. pamsurin-manager

### `data-generated.json`

`variation` changes from an ordered list to an ordered object: option key →
that option's copy. Key order is the display order; the first is the
default.

```json
{
  "shape": { "$almond": ["$medium", "$short"], "…": "…" },
  "variation": {
    "$color": {
      "$black-cherry": {
        "title": { "fr": "Cerise noire brillante", "en": "…" },
        "desc": { "fr": "Ongles $shape.attributive …", "en": "…" },
        "alt": { "fr": "…", "en": "…" },
        "occasion": { "fr": "soirée", "en": "…" },
        "color-main": ["$burgundy"],
        "color-secondary": []
      },
      "$honey-caramel": { "title": { "fr": "Caramel miel" }, "…": "…" }
    }
  }
}
```

- The nail-level `title` / `desc` / `alt` / `occasion` / `color-main` /
  `color-secondary` become optional for a nail with variations (shared
  fallback). After resolution every option must have all six; prepare
  refuses the product otherwise.

### `prepare-library-nail`

| Area | Change |
| ---- | ------ |
| Migration (idempotent) | An array-form `variation` becomes the object form. The existing nail-level copy was generated from the first option's photo, so it moves **into the first option**; the others are generated in the same run. |
| `generateMetadata` | Per option whose copy is missing, on that option's photo (first shape/length), with the option's vocabulary label (« cerise noire ») as a hint so the colour wording matches the picker. Same schema, validation and `$shape.title` / `$g{}` rules. Runs in the existing `mapWithConcurrency` pool. |
| `backfillMissingAlt`, `translateMissingLanguages` | Walk the option objects too. |
| `rekeyCreatedOptions`, `rewriteColorReferences` | Work inside the object form. |
| `syncSetVariation` | Keeps object order; a new option folder adds an empty entry (generated next), a removed folder drops its entry. |
| Docs | `product/library-nail/README.md`, `COMMAND.md`. |

A 6-option nail makes 6 metadata calls instead of 1, once; re-runs only fill
missing options.

## 2. pamsurin-back

### Schema (one additive migration, then `sync:schema`)

| Table | Change |
| ----- | ------ |
| `product_variations` | `title jsonb null`, `"desc" jsonb null`, `alt jsonb null`, `occasion jsonb null`: the option's resolved copy. Null only on rows imported before this change. |
| `product_colors` | `option_key text not null default ''`; primary key `(product_id, option_key, color_key, role)`. A nail with variations gets its colour rows per option; `''` rows are for nails without variations and sets. |
| `products` | Unchanged columns. For a nail with variations, `title` / `desc` (NOT NULL) hold the nail-level fallback; **no public reader uses them** for such a nail (see "One read path"). |

Docs: `docs/schema/01-catalog.md`.

### One read path for option copy

A single function in `catalog/application/` resolves "the copy of this
product for this option" (`productCopyFor(productId, optionKey)`, batched):
option columns when the product has variations, `products` columns
otherwise. Every reader below goes through it; `npm run check:sql` plus a
unit test on the resolver guard it.

### Import (`npm run library-nail`)

- `scripts/library.ts`: read the object form, resolve inheritance per
  option, require all six fields and existing colour refs. The array form is
  refused with "run prepare-library-nail first".
- Payload `variations[]` gains `title`, `desc`, `alt`, `occasion`,
  `colorMainKeys`, `colorSecondaryKeys`.
- `nailVariationImport.ts` / `librarySetImport.ts`: write the option columns
  and option colour rows (diff, not delete-all). `check` compares them.
- Docs: `docs/api/07-operation.md`, `docs/command/02-imports.md`.

### Gallery API (`/gallery/nails`, `/gallery/nail/:uid`, gift receiver gallery)

Still one `GalleryItem` per nail. `GalleryVariation.options[]` gains the
option's own product fields, localized like the item's:

```ts
options: Array<{
  key: string;
  label: string;
  price?: number;
  title: string;
  desc: string;
  descTemplate: string;
  alt: string | null;
  altTemplate: string | null;
  occasion: string;
  colorMain: string[];
  colorSecondary: string[];
  /** Path of this option's page, e.g. /nail/cerise-noire-nl-bb-003/black-cherry. */
  path: string;
}>;
/** Set when a filter matched a non-default option: the card opens on it. */
initialVariation?: string;
```

The item's top-level copy fields mirror its initial option (the default, or
`initialVariation`), so a card renders correctly before any picker
interaction. `GET /gallery/nail/:uid?variation=<key>` returns the item with
that option as the initial one (404 for an unknown key).

### SEO, share, sitemap

| Surface | Change |
| ------- | ------ |
| `GET /seo/nail/:uid` → `/seo/nail/:uid/:option?` | Renders one option: its title, description, photo, canonical (decision 4), hreflang cluster of that option URL, JSON-LD per decision 5. Bare uid of a nail with variations = default option, canonical to its explicit URL. |
| `GET /seo/gallery-nail` (`listGallerySeoIndex`) | One anchor **per option** (own title, photo, alt, link), nails without variations unchanged. |
| Related nails (`listRelatedSeoSets`) | On an option page: the nail's other options first ("same model, other colours"), then related nails, each option as its own entry. |
| Preview `GET /gallery/nail/:uid/preview` | Accepts `/gallery/nail/:uid/:option/preview` and `?variation=`: og:title, og:description, og:image and og:url of that option. |
| `GET /sitemap-products.xml` | One `<url>` per option per language, with its hreflang cluster; nails without variations unchanged. |
| `seoDocument.ts` `productJsonLd` | `ProductGroup` / `isVariantOf` / `color` for options. |
| Set pages | Unchanged. |

Docs: `docs/api/06-gallery.md`, `sync:routes`, `sync:contract`.

### Cart, orders, emails, invoice

| Place | Change |
| ----- | ------ |
| `cart/application/compositionRead.ts`, `compositionCheckout.ts` | A nail line's title and photo are its option's. |
| `orders/application/placement/orderConfirmationSupport.ts` | `order_composition_items.title` snapshot = the option's title (column exists). |
| Emails, invoice PDF, admin order detail | Read the snapshot, nothing else to change. |
| `feedWhere.ts`, `filterOptionsQuery.ts` | Occasion: any option (decision 6), computes `initialVariation`. Colour: see "Dead colour filter". |
| `priceGuestCheckout.ts` / `priceAuthenticatedCheckout.ts`, `libraryList.ts`, `adminProducts.ts` | Read `option_key = ''` colour rows (set lines only). |

## 3. pamsurin-front

| Place | Change |
| ----- | ------ |
| `App.tsx` | Route `nail/:slug/:variation?`. |
| `utils/productUrl.ts` | `nailPath(item, optionKey?)` builds the option URL from the option's title; `uidFromSlug` unchanged. |
| `NailProductPage` | Reads `:variation` (unknown key → default option). Title, description, alt, occasion, photo, `<Seo>` (title, description, canonical, JSON-LD) are the option's. Picking another option replaces the URL with that option's path, so the address bar is always shareable. |
| Gallery-nail card, zoom modal, composer carousel | Title, description and alt follow the selected option (`variationCopy(item, key)` in `data/nailVariation.ts`); the card starts on `initialVariation` when present. Card links to the nail page go to the selected option's path. |
| Share (`nailGalleryDeepLinkPath`, `SharedNailZoom`) | Always carries `&variation=<key>`; already read on arrival. |
| `public/.htaccess` | Bot rules: `/nail/<slug>-<uid>/<option>` → `/gallery/nail/<uid>/<option>/preview`; `/gallery-nail?product=<uid>&variation=<key>` forwards the option. SSR rule: `/nail/<slug>-<uid>/<option>` → `ssr.php?ssr=nail&uid=…&variation=…`. |
| `public/ssr.php` | Forwards `variation` to `/seo/nail/:uid/:option`, caches per option. |
| Cart / orders / favorites | Titles come from the API; favorites already remember `variationKey`. |

## Dead colour filter

pamsurin-front still sends `colorMain` / `colorSecondary` / `colorMode` from
`useGalleryFeed.ts`, but nothing in the UI calls `toggleColor`, so they are
always empty. The data (`color-main`, `color-secondary`, `product_colors`)
stays, as asked. Two options:

- **A (recommended):** remove the filter plumbing (front state and params,
  back `feedWhere` colour clauses, `filterOptions.color*`, API docs) in a
  separate cleanup before this work, so there is less to port.
- **B:** keep it and apply decision 6 (any option matches, card opens on it).

## Delivery order

1. **Back**: migration, importer, one read path, gallery API, SEO / preview
   / sitemap per option, cart and order titles. Nothing changes until a nail
   is re-imported.
2. **Front**: option routes, copy following the option, `.htaccess` and
   `ssr.php`.
3. **Manager**: migrate `0001`/`0003` to the object form, generate per-option
   copy, `library-nail -- check`, then `seed --update` on dev.

Steps 1 and 2 deploy together before a re-imported variation nail is public.

## Open question

- None. Dead colour filter: A, removed on 2026-09-28 (back feed params, filter-options `color`/`colorSecondary`, front state).
