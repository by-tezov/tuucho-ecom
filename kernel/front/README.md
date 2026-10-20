# tuucho-ecom shop front

Multilingual (`fr`/`en`) customer shop and admin. Vite + React +
TypeScript, CSS Modules, mobile-first responsive. Catalogue, cart, auth,
Stripe checkout, Mondial Relay addresses, and orders talk to
[kernel/back](../back). See COMMAND.md for every `npm run`
script's arguments.

## Getting started

```bash
# From the repo root (npm workspaces, one lockfile):
npm install
npm --prefix kernel/front run dev -- --port 5174 --strictPort
```

### Development

- `npm run dev` — dev server with HMR
- `npm run assets:optimize` — regenerate optimized WebP delivery files after
  changing a large static JPG/PNG source
- `npm run typecheck` — strict TypeScript project check
- `npm run lint` — oxlint plus the theme semantic-contract check
- `npm run format:check` — verify Prettier formatting without changing files
- `npm run format` — apply Prettier formatting
- `npm run test` / `test:unit` / `test:unit:watch` — isolated Vitest component and hook regressions

### Build

Type-checks (`tsc -b`), builds, prerenders, then writes the output into a
version folder — see "Deploying" below for why and how that's uploaded.

> **The build is API-independent.** `scripts/prerender.mjs` renders only the
> static application routes. The catalogue is loaded by the browser at
> runtime, so a frontend build does not require a reachable API or a populated
> database.

`--prod|--preprod` is **mandatory** on every command below (except the
standalone `maintenance` lockdown, which doesn't build the app at all) —
deliberately no default, after a preprod build silently loaded prod's env
file (and hit prod's live API) because the flag was left off and nothing
caught it until prerendering failed confusingly partway through.

- `npm run build -- --prod` — production build. `dist/` ends up with
  `vX.Y.Z/`, root `dist/.htaccess` routing to it, `root.htaccess`, and the
  dynamic product-sitemap relay `sitemap-products.php` — ready to upload as-is.
  The version folder also carries `ssr.php` and a `<lang>/ssr-shell.html` per
  language: the server-side rendering relay for `/gallery` and
  `/creations/<slug>`, which are database-backed and cannot be prerendered.
  Prod only; a preprod build deletes `ssr.php`. Each language also gets a
  head-only `<lang>/gift.html` (`headOnlyPages` in `entry-server.tsx`): the
  gift page's indexable head over an empty body, so `/xx/gift` no longer
  falls back to the `noindex` splash while its lazy route still renders in
  the browser.
- `npm run build -- --preprod` — same, but Vite reads kernel
  `config/preprod/` `http.*` instead (see `vite.config.ts`) — e.g. a
  different API origin, pointed at preprod's backend rather than prod's.
- `npm run build -- --prod --local` (or `--preprod`) — same build,
  plus a `dist/index.html` redirect to the version folder, for opening
  `dist/` directly in a browser (e.g. `npx serve dist`) while working
  locally. Never upload this file — it's not part of the production `dist/`
  and isn't generated unless `--local` is passed.
- `npm run build -- --prod --verbose` (or `--preprod`) — additionally prints
  every prerendered URL and its generated HTML file, useful for checking why
  the final prerender page count is high.
- `npm run build -- --prod --version 1.2.3` — set an explicit version
  before building.
- `npm run build -- --prod --version bump-patch` (or `bump-minor` /
  `bump-major`) — increment the current root `package.json` version before
  building, instead of editing it by hand.
- `npm run build -- --prod maintenance-prepare --from DD/MM/YY-HH:mm --to DD/MM/YY-HH:mm [--message "..."]` —
  a normal full build (upload and cut over exactly as usual), except every
  page carries a banner that shows itself automatically to visitors between
  `--from` and `--to` (their own clock, not the server's). `--version` can be
  combined with this, e.g.
  `npm run build -- --prod --version bump-patch maintenance-prepare --from 01/08/26-09:00 --to 01/08/26-18:00`.
- `npm run build -- maintenance` — skips the app build entirely and instead
  writes a standalone `dist/maintenance.html` + `dist/maintenance.htaccess`
  you upload to take the whole site down (see "Deploying"). No target flag
  needed — this doesn't touch the app build.

## Deploying (FileZilla, no shell access on the host)

`npm run build` never overwrites a previous build — each run adds a new
`dist/vX.Y.Z/` folder, and `dist/.htaccess` is the one file that decides
which version is live. That split makes zero-downtime deploys possible over
plain FTP.

**Where things go** — `preprod` is a real cPanel subdomain with its own
docroot (`public_html/preprod`), so `dist/vX.Y.Z/` and `dist/.htaccess` go
straight into it, same as always. `prod` is the apex domain — its docroot
is `public_html` itself, which is also the _filesystem parent_ of
`preprod`'s (and `preprod-api`'s) folders. Apache merges `.htaccess` from
every parent directory in the path, so a version-routing rule sitting at
`public_html`'s own root would cascade into those sibling folders too,
regardless of which subdomain a request was actually for — that already
broke `preprod`/`preprod-api` once. To keep prod's per-deploy `.htaccess`
swap scoped to only its own folder (exactly like preprod's already is),
`--prod` nests it one level down instead: `dist/vX.Y.Z/` and
`dist/.htaccess` go into `public_html/prod/`, and a separate
`dist/root.htaccess` — generated only for `--prod`, `HTTP_HOST`-scoped
so it can never affect the sibling folders — goes into `public_html/`
itself, **once**; it never references a version number, so it never needs
re-uploading again after the first deploy (harmless if you do).

1. Bump the version (`npm run build -- --version bump-patch`, or `-minor`/
   `-major`) and build with plain `npm run build -- --prod` (or
   `preprod`, no `--local`) — upload the generated `vX.Y.Z/` and `.htaccess`;
   prod also has `root.htaccess` and `sitemap-products.php`.
2. FileZilla: upload the new `dist/vX.Y.Z/` folder — the live site keeps
   serving the old version untouched while this uploads.
3. FileZilla: upload `dist/.htaccess`, overwriting the old one — this single
   small-file swap is the moment the site switches versions. Rollback is
   re-uploading the previous `.htaccess`. (Prod only, first deploy after
   this change: also upload `dist/root.htaccess` to `public_html/.htaccess`
   — see "Where things go" above.)
4. Prod only: upload `dist/sitemap-products.php` beside the live `.htaccess`
   (`public_html/`). It relays the live database sitemap to
   `/sitemap-products.xml`; it is not versioned. Preprod explicitly returns
   `404` for both sitemap paths and remains blocked in `robots.txt`.
5. Apple Pay (once): download Stripe’s domain association file into
   `public/.well-known/apple-developer-merchantid-domain-association`, rebuild,
   and upload `dist/.well-known/` next to `current/` / `media/` (sibling of
   `.htaccess`, not inside a version folder). Register shop hosts in Stripe
   Payment method domains (test: `localhost`, `preprod.shop.example`; live:
   `shop.example`) and enable Google Pay + Apple Pay in test and live. No Apple
   Developer account / Mac / iOS certificates — this is web Apple Pay via
   Stripe. Then enable Apple Pay in admin Préférences. See
   `public/.well-known/README.md`.

To take the site fully offline instead (planned downtime, not a version
switch): `npm run build -- maintenance`, then FileZilla-upload
`dist/maintenance.html`, then `dist/maintenance.htaccess` **renamed to
`.htaccess`**, into the same per-deploy location as step 3 above (never the
prod root one). Restore by re-uploading whichever versioned `.htaccess` was
live before.

## Configuration

Shop copy, Stripe publishable key, and Mondial widget brand come from
`GET /storefront/bootstrap` (Admin / plugin settings), not `VITE_*`. Kernel
machine config is JSON in `kernel/back` (see that README). Vite origins come
from kernel `http.apiBaseUrl` / `http.frontendBaseUrl`. OAuth app ids and
return URLs come from `/storefront/bootstrap` plugin settings
(`tuucho-signin-*`). Do not add shop or plugin `VITE_*`.
`APP_TARGET` is `dev` for `npm run dev`, or `preprod` / `prod` for
`npm run build -- --prod` or `--preprod` (exactly one).

Sensitive checkout state has a separate server-authoritative lifecycle:
`POST /checkout/session/start` supplies a tab-scoped AES key and the parsed
`CHECKOUT_PRIVACY_SESSION_IDLE_TTL` deadline (30 minutes by default). The raw
key stays in RAM; only the opaque session token and AES-GCM ciphertext live in
`sessionStorage`, so F5 can resume the same tab while the session is live. A
new/duplicated live tab starts fresh. Real pointer/keyboard/form activity sends
throttled sliding heartbeats. On expiry, address/card/email/identification
drafts are cleared and the cart is retained; guests see an expiry dialog,
whereas authenticated customers silently reload saved account data only.
Mondial Relay parcel-shop picker countries come from the Point Relais
courier's enabled `countries` on `GET /account/couriers` — not from an env
gate. Profile phone country options use `GET /account/phone-countries`
(union of countries served by any shop-enabled courier). Until a delivery
address is set, the cart shows a pending shipping fee (`?? €` /
`shippingPricePending`) because map-shaped packet prices need a destination
country. Leftover origin vars `VITE_API_BASE_URL` and `VITE_SITE_URL` are
required with no fallback (the app fails loudly at startup if missing, see
`src/config/env.ts`). Stripe publishable key and Mondial brand are plugin
public settings on bootstrap.

Production also sets two build-only durations. Neither is shipped to the React
bundle: the deploy writes both into Apache for the PHP relays to read.

`SITEMAP_RELAY_CACHE_TTL=12h` is how long the product-sitemap relay keeps one
locked filesystem copy. Catalogue additions, removals, and URL updates can
therefore take up to 12 hours to appear in `/sitemap-products.xml`.

`SSR_RELAY_CACHE_TTL=5m` is the same idea for `ssr.php`, which caches a
rendered gallery or product page per language. It is deliberately much shorter:
that cache holds a price and a stock state, so anything longer would show a
shopper a figure the shop no longer intends. It matches the `max-age=300` the
API sends and the LsCache policy in `public/.htaccess`, so the three layers
expire together.

### Server-side rendering (`ssr.php`)

`/gallery` and every `/creations/<slug>` come from the database, so
`scripts/prerender.mjs` cannot snapshot them. Until this relay existed they
fell through to the SPA-fallback rewrite, which serves the prerendered `/`
splash — and that page carries `noindex` by design. Google honours a noindex
found in the served HTML and skips rendering the page, so the entire catalogue
was excluded from the index no matter what `Seo.tsx` did after hydration.

`ssr.php` reads the placeholder shell `prerender.mjs` writes beside it, fills
the title, head and body from kernel/back's `/seo/gallery` and
`/seo/product/:uid`, and serves the result from the shop origin so the
canonical URL stays on `shop.example`. Everyone gets the same document: serving
different markup to crawlers would be cloaking. The shell carries no prerender
payload, so `main.tsx` takes its `createRoot` branch and the SPA replaces the
server markup instead of trying to hydrate against it.

Degradation is deliberate. A stale cached copy is served for a minute while
the API recovers; failing that the gallery falls back to its own prerendered
snapshot, which is exactly what the URL served before. A product page has no
snapshot, so it answers `503` with `Retry-After` rather than a thin `200` that
would invite Google to index an empty page.

## Adding real photos

- **Gallery** (the filterable portfolio grid): lives in
  [catalog source](catalog import tree)'s `library/`, imported into
  [kernel/back](../back) via `npm run library` (no admin
  backoffice). This front reads gallery/featured data from the API
  (`src/api/gallery.ts`).
- **Everything else** (hero, featured creations, about portrait,
  size-guide step photos, size chart illustration): overwrite the
  matching placeholder file under `src/assets/images/` — filenames are
  documented in `src/assets/images/manifest.ts`.

All current images are on-brand generated placeholders, not real photos.

## Structure

```
src/
  routes/        page-level components (Home, Gallery, Product, About,
                  Contact, auth/account/cart/orders, Pose, Guide, legal,
                  Sitemap, …)
  components/
    layout/       Header, Footer, Layout shell
    ui/           small reusable pieces
    home/ gallery/ about/ capsules/ pose/ guide/ seo/
    account/ address/ auth/ cart/ orders/
  api/            narrow domain clients (identity, account, cart, checkout,
                  orders, favorites, loyalty, admin/*, gallery, chat)
                  → kernel/back
  state/ utils/   client state helpers
  theme/          preference store, React theme provider and shared types
  assets/
    images/         fixed one-off image slots
    i18n/           locale strings + language context (7 languages)
  hooks/          gallery, nav, auth-related hooks, …
  config/         env.ts (import.meta.env; layering is in vite.config.ts),
                  stripeClient.ts
  styles/         semantic theme, static design tokens, reset, global styles
```

Theme ownership and extension rules are documented in
[`docs/theming.md`](docs/theming.md).

Module ownership, dependency direction, state boundaries, and the complete
quality gate are documented in
[`docs/frontend-architecture.md`](docs/frontend-architecture.md).

Routes (see `App.tsx`): `/` (entry splash), `/home` (Accueil), `/gallery`, `/creations/:slug`, `/about`,
`/contact`, `/pose`,
`/sizes`, `/legal`, `/privacy`, `/terms`, `/sales-terms`, `/sitemap`, `/gift`,
`/login`, `/register`, `/forgot-password` (redirects to `/login`), `/account`,
`/account/addresses`, `/account/addresses/mondial-relay`,
`/account/payment-methods`, `/account/reset-password`,
`/account/confirm-email`, `/account/security-lock`, `/cart`,
`/checkout/return`, `/orders`, `/orders/history`. Contact is its own page
(`/contact`); the Home hero “order” CTA scrolls to `#commander`.

## SEO

Everything below is produced by the build; there is nothing to maintain by
hand and nothing to remember to regenerate.

**Prerendering.** `scripts/prerender.mjs` renders every indexable route to
static HTML so crawlers — including the social ones that never run
JavaScript — see the real content. That's the 13 static routes in
`config/prerenderedPaths.ts`, plus **one page per set** at
`/creations/<title>-<uid>`, rendered from the live catalogue
(`GET /gallery/catalog`). Each page embeds the data it was built with in a
`<script id="__PRERENDER__">` tag, which `main.tsx` reads back so hydration
reproduces the same tree without a second round-trip, and which tells it
whether the served markup really belongs to the current URL (see
`state/PrerenderPayload.tsx`).

**Product URLs.** The trailing `product_uid` short code is the only
significant part of a set's slug — renaming a set changes the readable part
but old links still resolve, so inbound links and ranking survive edits (see
`utils/productUrl.ts`).

**Structured data.** A site-wide `OnlineStore` + `WebSite` graph on every
page; `Product` + `Offer` + `BreadcrumbList` on product pages
(`utils/productSeo.ts`); `FAQPage`/`CollectionPage`/`ContactPage`/`AboutPage`
on the routes that warrant them (`utils/pageSeo.ts`). The same builders feed
both the prerendered HTML and the runtime `<Seo>` component, so a crawler
and a client-side visitor are never described differently. Deliberately **no
`aggregateRating`**: the home-page testimonials are marketing copy, not
collected reviews, and unbacked rating markup is a manual-action risk.

**robots.txt / sitemap.xml / llms.txt** are written only for a `--prod`
build. Non-prod builds get a hard `Disallow: /` and no sitemap, so a preprod
copy can never be indexed (`entry-server.tsx`'s `isProd` drives the matching
per-page `noindex`). The sitemap carries `lastmod` from each set's own
`updatedAt`, per-section `changefreq`/`priority`, and an `<image:image>`
entry per product photo — that last part is what puts the catalogue into
Google Images. In production, the separate dynamic product sitemap is served
at `/sitemap-products.xml` by a PHP relay at the same public host; it fetches
the database-backed XML from the production API. Preprod publishes neither
sitemap and returns `404` for both XML paths.

**Canonical host.** `public/.htaccess` 301s `www.*` to the apex, so each page
answers at exactly one address. Product photos must be served from that same
host — see kernel/back's `URL_PUBLIC_MEDIA`.
