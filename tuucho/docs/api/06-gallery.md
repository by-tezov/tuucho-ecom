# Gallery API

No auth. CORS restricted to the front's own origin (`CORS_ORIGIN`) outside
local dev — genuinely cross-origin now that front and this app are
separate subdomains.

### `GET /storefront/bootstrap`

Public shop chrome payload: `coreVersion`, store identity, tax mode, product axes, theme
tokens, menus (page plugins that are on, plus the catalog), `i18n`
(`default`: the configured fallback language from `i18n.default`;
`enabled`: `i18n.enabled` intersected with registered language codes;
`languages`: `{ code, nativeName, ogLocale, dateLocale? }[]` for those
enabled codes), `brandAssets` (static artwork overrides, key to absolute
image URL; empty unless a plugin fills it through the
`storefront.bootstrap` filter — front keys are `BRAND_ASSET_KEYS`, including
optional `favicon`, `ogImage`, `lockProbe`), and
`plugins[]` (`id`, `enabled`, `kind`, `route`, `nav`, `dependsOn`, `settings`)
and `openings` (preferences, profile, signInMethods, notifications, cart
shipping/loyalty/vouchers/gifts, orderHistory). `enabled`
is effective: a complement is off when a `dependsOn` parent is off. The
`storefront.bootstrap` filter may extend the payload and runs before menus of
disabled plugins are pruned, so a filter can reattach such a menu to an
enabled plugin id. No auth.

### `GET /sitemap.xml`

Kernel SEO engine. Public XML urlset of kernel pages, visible catalogue URLs,
and `seo.sitemap.entries` extras (page-plugin routes come from
`tuucho-seo-sitemap`). Loc values use the shop origin.

### `GET /storefront/robots.txt`

Kernel SEO engine. Shop-origin robots document (`Allow: /`, plugin
`seo.robots.rules`, and a `Sitemap:` line). Inspect it here on the API. The
API origin `GET /robots.txt` stays the kernel crawler policy
(`X-Robots-Tag: noindex` on JSON).

### `GET /gallery/feed`

Keyset-paginated, filtered feed — sets ordered alphabetically by their
localized title (case-insensitive), then by id as a stable tie-breaker. With
no bearer token it contains public sets only. With a valid bearer token it
also includes sets assigned to the authenticated customer; those entries
carry `isUserLibrary: true` and the response is private, never shared-cacheable.

Query params (all optional):

| Param            | Type                 | Notes                                                                                                                                                                                                     |
| ---------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cursor`         | string               | Opaque, from a previous response's `nextCursor`. Omit for page 1.                                                                                                                                         |
| `limit`          | number               | Default `24`, max `60`.                                                                                                                                                                                   |
| `occasion`       | string               | Exact match against the set's French occasion text.                                                                                                                                                       |
| `shape`          | string               | Exact match against a shape's French label. |
| `length`         | string (CSV)         | One or more length keys (e.g. `medium`/`long`/`short`). OR-matched: keeps sets that declare any of them under any shape (`product_shape_lengths` — declarative, not stock-dependent, same semantics as `shape`). |
| `size`           | string (CSV)         | One or more of `XS`/`S`/`M`/`L`. OR-matched: keeps sets that currently have effective stock (imported quantity less live holds and unshipped allocations) in any of the listed sizes.                      |
| `ids`            | string (CSV of uuid) | Restricts to exactly these ids, other filters still apply on top. Backs the front's "Favorites" filter (favorites are a client-side-only, localStorage concept — this is how it's expressed server-side). |
| `userLibraryOnly` | `true`              | Authenticated only. Restricts to sets assigned to that customer. |
| `stock`          | `in` \| `out`        | Product-level stock view, using the same effective quantity the cards show (imported stock less live holds and unshipped allocations). `in` keeps sets with at least one purchasable variant, `out` only sets with none anywhere — a set in stock for one shape but not another counts as `in`. **Omitted means no stock filter at all**, which is what cart hydration by `ids` and the build-time prerender rely on; the gallery UI is the one caller that always sends it (`in` by default, `out` behind its switch). `out` **requires a valid bearer token** (`401 unauthorized` otherwise): that view exists so a customer can ask for a sold-out piece to be remade, which needs an account. When Boutique `outOfStockEnabled` is `false`, browsing calls (`stock=in`/`out`/`all`, featured, filter-options) are forced to in-stock only; `ids` without a `stock` param still returns sold-out rows for cart hydration. |
| `minPrice`       | number               | Inclusive lower bound (TTC euros) on the set's current card price (`product_prices` latest effective row). Ignored unless `maxPrice` is also a valid non-negative number and `minPrice <= maxPrice`. Unpriced sets are excluded while a price range is active. |
| `maxPrice`       | number               | Inclusive upper bound — same rules as `minPrice`. |

Response `200`:

```json
{
  "items": [GalleryItem, "..."],
  "nextCursor": "string or null",
  "totalCount": 0,
  "hasUserLibraryItems": false
}
```

### `GET /gallery/featured`

Query: `limit` (optional, default `10`, max `60`).

Response `200`: `GalleryItem[]` — only sets currently inside their
`featured_from`/`featured_for` window, most recently featured first.
When Boutique `outOfStockEnabled` is `false`, sold-out featured sets are
omitted.

### `GET /gallery/set/:uid`

One visible nail set by its customer-facing `product_uid` short code
(A-Z, 0-9, single dashes, 1 to 20 characters, e.g. `AQ-YZ-367`),
case-insensitive. Backs kernel/front's
per-set product pages at `/creations/<uid>`, which are the site's indexable
product URLs. Older links carry the set title in front of the code
(`/creations/<title>-<uid>`); only the trailing code is significant, so they
still resolve, canonical to `/creations/<uid>`.

Response `200`: a single `GalleryItem`, cached for 300s.
Response `404` for an unknown code, a hidden set, an accessory, or a `uid`
that doesn't match the product-uid rule — an unpublished set must not be
discoverable by guessing. When Boutique `outOfStockEnabled` is `false`, a
sold-out public set also returns `404`.

**Optional, by design.** Those product pages are prerendered from
`/gallery/feed` at build time and ship with their content already in the
HTML, so the front never depends on this route being deployed: it uses it
only to pick a set up on client-side navigation and to re-fetch it in
another language. A frontend release therefore never has to wait on a
backend deploy, and a backend that predates this route simply leaves the
prerendered page standing.

### `GET /gallery/filter-options`

Optional query: `productType=nail` (default) or `productType=nail_single`.
Pass `nail_single` so occasion / shape / length / price bounds only reflect
single units, not full sets. Response `200`, cached by the browser for 60s
(`Cache-Control: public, max-age=60`):

```json
{
  "occasion": [{ "value": "string", "label": "localized string" }],
  "shape": [{ "value": "string", "label": "localized string" }],
  "length": [{ "value": "string", "label": "localized string" }],
  "size": [{ "value": "XS", "label": "XS" }],
  "priceRange": { "min": 25, "max": 89 },
  "outOfStockEnabled": true,
  "outOfStockSizeRequestEnabled": true
}
```

`priceRange` is `null` when no public product of that type has a current price.
Bounds are floored/ceiled integer euro amounts for the gallery price slider.
`outOfStockEnabled` is the Boutique toggle (default `true`). When it is
`false`, option lists and the price range only cover in-stock public products
of that type, and the set gallery UI hides the sold-out stock filter.
Sold-out size chips stay visible in the gallery zoom modal and the cart size
picker. `outOfStockSizeRequestEnabled` is true while plugin
`tuucho-commerce-product-requests` is enabled. When false, barred chips stay
visible but a click does nothing.

Only values actually in use on a non-hidden product of the requested
`productType` are listed — no fixed vocabulary (size lists the `XS`/`S`/`M`/`L`
values present in `product_availability` for sets, or boolean unit-offer
rows for `nail_single`, ordered smallest-to-largest).
Default `productType=nail` keeps set-gallery callers unchanged; pass
`nail_single` for the unit catalogue.

`value` is what to send back as a feed filter parameter. For `shape` it is
the **stable catalogue key** (`shapes.key`), so editing a label in catalog source no longer breaks a shared
or bookmarked filter URL. `occasion` has no key table — it is free text per
product — so its `value` remains the French label; `size` remains the letter.
`length`'s `value` is the length key (`shape_lengths.length_key`, e.g.
`medium`) — the feed's `length` param only ever accepts the key, never a
label, since (unlike shape) it never had a label-based form to stay
compatible with.

The feed accepts **either** form for shape: a key, or the French label
it used to hand out. Clients holding a cached option list keep working
unchanged. Options are still deduplicated by French label, so when two keys
share a label they are one choice, and filtering by either resolves to the
whole label group — the result set is identical whichever form is sent.

### `GET /gallery/products?ids=`

Public cart-hydration helper for nails **and** accessories. Query:
`ids` — comma-separated product uuids (required, max 40).

Public products are returned to everyone. User-library products are returned
only when a valid bearer token belongs to an assigned account; unassigned IDs
are omitted, exactly like deleted products.

Response `200`: array of

```ts
{
  id: string;
  productType: 'nail' | 'accessory';
  productUid: string;
  title: string;
  desc: string;
  price?: number | Record<string, number>; // accessories: unit number, or pack map when manager `price` is an object
  photo: string | null;           // first small photo URL, or null; byQuantity uses the first pack's first small
  available:                      // nails: shape→length→size map; accessories: remaining **units**
    | Record<string, Record<string, Partial<Record<'XS'|'S'|'M'|'L', number>>>>
    | number;
  accessoryType?: 'default' | 'byQuantity'; // accessories only
  packs?: Record<string, number>;           // byQuantity multipliers, e.g. { x5: 5, x10: 10 }
  packLabels?: Record<string, string>;      // localized quantity vocab, keyed by pack; missing vocab falls back to the pack key
  photosByPack?: Record<string, string[]>;  // byQuantity small URLs keyed by pack
  inCartCarousel?: boolean;                 // accessories only
}
```

Missing ids are omitted (not an error).

### `GET /gallery/cart-accessories`

Public cart-page upsell. Returns accessories with `hidden = false`,
`in_cart_carousel = true`, `product_type = accessory`, `audience = public`.
Same item shape as `GET /gallery/products?ids=`. Empty array is a valid
response (the front hides the carousel track). Cached for 60s.

Response `200`: `ProductById[]`.

### `GET /gallery/cart-rules`

Public, enabled permanent cart-rule params for client progress / franco
preview. Checkout `priceCheckout` remains authoritative. When the
`tuucho-commerce-cart-rules` plugin is disabled this returns an empty `rules`
array. Franco compares
paid-item subtotal after the nail-qty volume remise to the delivery country's
threshold (`params.thresholdsByCountry`) — never the courier list fee.

Response `200`:

```ts
{
  success: true;
  rules: Array<{
    code: string;
    kind: 'gift_per_nail_set' | 'nail_qty_percent_tiers' | 'free_shipping_above';
    priority: number;
    forbidVoucher: boolean;
    params: unknown;
    giftProductId?: string; // resolved products.id for a valid gift rule; lets guest carts preview the free line
  }>;
}
```

### `GalleryItem` shape

Shared by every gallery endpoint above:

```ts
{
  id: string;                                    // products.id (uuid)
  occasion: string;
  shape: Record<string, string>;                  // keyed by shape key
  shapeGender: Record<string, string>;            // shape key → 'm' | 'f' | 'n' | 'c' | '' in the response's language
  lengthsByShape: Record<string, Record<string, string>>;  // shape key → length key → localized label
  lengthGenderByShape: Record<string, Record<string, string>>;  // same keys as lengthsByShape
  colorMain: string[];
  colorSecondary: string[];
  title: string;
  desc: string;                                   // resolved against the set's default shape and length
  descTemplate: string;                           // as authored, placeholders intact
  alt: string | null;                             // authored image alt text, resolved; null when never generated
  altTemplate: string | null;                     // as authored, placeholders intact
  photosByShapeLength: Record<string, Record<string, { small: string; modal: string }[]>>;  // shape → length → photos; full URLs, already resolved against URL_PUBLIC_MEDIA
  productUid: string;
  featured?: { from: string; for: number };       // present only if currently in its featured window
  isFeatured: boolean;
  price?: number;                                 // current price (TTC), undefined if none set yet
  // Single nails with a variation axis only:
  variation?: {
    key: string;                                  // axis key, e.g. 'color'
    label: string;                                // localized axis title
    options: Array<{
      key: string;
      label: string;                              // localized option name (« Rose »)
      price?: number;                             // overrides `price` for this option
      title: string;                              // the option's own product copy, same meaning
      desc: string;                               //   as the top-level fields
      descTemplate: string;
      alt: string | null;
      altTemplate: string | null;
      occasion: string;
      colorMain: string[];
      colorSecondary: string[];
    }>;
  };
  initialVariation?: string;                      // option the item opens on, when not the first
  photosByVariation?: Record<string, Record<string, Record<string, { small: string; modal: string }[]>>>;
  availableByOption?: Record<string, Record<string, Record<string, Partial<Record<'XS' | 'S' | 'M' | 'L', number>>>>>;
}
```

#### Hidden shapes and lengths

A shape/length hidden by the operator (`product_shape_lengths.hidden`, see
`01-admin.md`) never appears in any response: not in `shape`,
`lengthsByShape`, photos, `available` or `availableByOption`, not matched by
the `shape`/`length`/`size` filters or listed by `filter-options`, and not on
the SEO pages or in the sitemap. A shape whose every length is hidden is
absent; a product whose every shape/length is hidden behaves as a hidden
product (`404` by uid, absent from feeds).

#### Variation options are products

Each option of a single nail is its own product for everything a visitor,
a crawler or a share preview reads: its own title, description, alt text,
occasion and colours (authored per option in catalog source, see
`docs/command/02-imports.md`). The nail stays one item, one card and one
`productUid`. The item's top-level `title`, `desc`, `descTemplate`, `alt`,
`altTemplate`, `occasion`, `colorMain`, `colorSecondary` and
`photosByShapeLength` always describe the option the item opens on
(`initialVariation`, else the first option), so a caller that ignores options
never pairs one option's text with another's photo. A caller with an option
picker reads the selected option's fields from `variation.options[]`. An
option imported before per-option copy existed repeats the nail's copy.

#### Copy placeholders

A set is sold in one or more shapes, so its authored `desc`/`alt` name the
shape as `$shape.title` rather than a literal word, and mark the words that have to
agree with it as `$g{masculin|féminin}`. `desc`/`alt` come back already
resolved against the set's default shape and length (its first, the same
default the first photo follows), so a caller that shows no shape picker can
print them as is. A caller that does let the visitor change shape resolves
`descTemplate`/`altTemplate` itself against the selected shape, using
`shapeGender`/`lengthGenderByShape` for the agreement, otherwise the sentence
keeps describing the shape the visitor moved away from. The grammar is
documented in `src/modules/catalog/domain/productCopy.ts`; the front mirrors it
in `src/utils/productCopy.ts`.

Public localized endpoints select one language from `Accept-Language` and
return only that string per field. `fr-FR` therefore selects `fr`; an
unsupported or absent language selects English. A missing translation falls
back to English, then the mandatory French source value. Responses vary on
`Accept-Language` so caches cannot mix languages.

---

### `GET /gallery/set/:uid/preview`

Server-rendered HTML preview for link unfurling (messaging apps, social cards)
— crawlers that do not run JavaScript get real Open Graph tags instead of the
SPA shell. `:uid` is the customer-facing product code (A-Z, 0-9, single dashes, 1 to 20 characters).

`?lang=<fr|en|th|es|it|nl|pt>` makes the shared URL's language authoritative
for the preview title and description, independent of the crawler's device
language. The front-end bot redirect supplies the `/xx/` code for a
locale-prefixed URL, including `/fr/`. Unprefixed leftover shares still send
`lang=fr`. When omitted (legacy or direct API request), `Accept-Language`
remains the fallback.

Returns `text/html`, `Cache-Control: public, max-age=300` and varies on
`Accept-Language` for legacy/direct requests. A malformed code or a
hidden/unknown set returns `404` with a generic preview pointing at the same
localized `/gallery` URL rather than an error page. A sold-out set does the
same when Boutique `outOfStockEnabled` is `false`. The body carries a
canonical link to the localized `/creations/<uid>` and redirects a real
browser to the same localized `/gallery?product=<uid>` URL.

### `GET /sitemap-products.xml`

Live product sitemap: every visible set's canonical `/creations/<uid>` URL
under every supported
locale prefix (`/fr/`, `/en/`, `/th/`, `/es/`, `/it/`,
`/nl/`, `/pt/`). Each localized URL carries its complete `hreflang` cluster,
with `x-default` pointing at the French `/fr/creations/<uid>`
URL. Each `<lastmod>` is the product's `updated_at` (its last change from
an import or the admin), not its creation date.
It is
generated from the database on each request and is a
relay-only source: the PHP file deployed with kernel/front calls it with
`X-Tuucho-Sitemap-Relay: 1` and exposes the result at
`https://shop.example/sitemap-products.xml`. When Boutique `outOfStockEnabled`
is `false`, sold-out sets and nails no longer offered are omitted. Requests
without that header,
including a direct request to `api.shop.example`, receive `410 Gone`; never
submit the API URL to a search engine. This keeps the public sitemap on the
same host as every URL it lists. The production PHP relay keeps its last good
XML response in a locked filesystem cache for `SITEMAP_RELAY_CACHE_TTL`
(currently `12h`), so catalogue updates can take up to that period to appear
in the public sitemap.

### `GET /seo/gallery`

Server-rendered `<head>` and `#root` markup for the shop's `/xx/gallery` page,
as JSON: `{ title, head, body }`, all three raw HTML.

It exists because the front is a static build with no catalogue access, so
`/gallery` prerendered to a shell holding the site chrome and no product. The
PHP relay deployed with kernel/front (`public/ssr.php`) reads its own
prerendered shell off disk, substitutes these three parts and serves the
result from `https://shop.example/xx/gallery`, so the canonical URL and the
crawlable markup stay on the shop origin.

`body` carries an `h1`, an intro paragraph and one anchor per visible set,
pointing at that set's localized `/creations/<uid>` page. `head` carries
`robots: index, follow`, the description, the canonical, the full `hreflang`
cluster, Open Graph and Twitter cards, plus `CollectionPage` and
`BreadcrumbList` JSON-LD whose `ItemList` names every set in order.

`?lang=<fr|en|th|es|it|nl|pt>` selects the locale; `Accept-Language` is the
fallback. When Boutique `outOfStockEnabled` is `false`, sold-out sets are
omitted, matching `/sitemap-products.xml`.

Relay-only, same rule as the product sitemap: requests without
`X-Tuucho-Ssr-Relay: 1` receive `410 Gone`, so the catalogue is never
crawlable at a second URL on the API host. Returns
`Cache-Control: public, max-age=300` and varies on the relay header.

### `GET /seo/product/:uid`

The same `{ title, head, body }` document for one set. `:uid` is the
customer-facing product code (A-Z, 0-9, single dashes, 1 to 20 characters).

This is the search-crawler counterpart to `/gallery/set/:uid/preview`. That
route is a `302` for link-preview bots and deliberately excluded search
crawlers, which left every `/creations/<uid>` URL served as the SPA fallback,
that is the prerendered `/` splash, carrying `<meta name="robots"
content="noindex">`. Google honours a noindex found in the served HTML and
skips rendering, so no amount of client-side metadata could recover it. This
route is what makes a product page indexable.

`head` declares `index, follow`, the set's own description, the canonical
`/xx/creations/<uid>`, the `hreflang` cluster, `product` Open Graph tags, and
`Product` + `Offer` + `BreadcrumbList` JSON-LD. `body` carries the set's `h1`,
first photo, description, price, stock state and occasion.

A malformed code, or a hidden, unknown or (when Boutique `outOfStockEnabled`
is `false`) sold-out set returns `404` with `Cache-Control: no-store`, which
the relay turns into a real `404` for the crawler rather than caching a page
that should disappear. Relay-only and cached exactly as `/seo/gallery`.
