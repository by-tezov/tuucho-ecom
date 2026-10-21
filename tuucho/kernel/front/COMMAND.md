# Commands

Every `npm run` script in this repo, with its arguments.

## Quick command menu

[`check`](#npm-run-check) · [`assets:optimize`](#npm-run-assetsoptimize) · [`build`](#npm-run-build) · [`check:api`](#npm-run-checkapi) · [`check:architecture`](#npm-run-checkarchitecture) · [`check:bundle`](#npm-run-checkbundle) · [`check:context`](#npm-run-checkcontext) · [`check:i18n`](#npm-run-checki18n) · [`check:screens`](#npm-run-syncscreens--checkscreens) · [`check:theme`](#npm-run-checktheme) · [`dev`](#npm-run-dev) · [`i18n`](#npm-run-i18n) · [`sync:ratchets`](#npm-run-syncratchets) · [`sync:screens`](#npm-run-syncscreens--checkscreens) ·
[`format`](#npm-run-format) · [`format:check`](#npm-run-formatcheck) · [`lint`](#npm-run-lint) · [`typecheck`](#npm-run-typecheck) ·
[`test`](#npm-run-test--testunit--testunitwatch) / [`test:unit`](#npm-run-test--testunit--testunitwatch) / [`test:unit:watch`](#npm-run-test--testunit--testunitwatch)

## `npm run assets:optimize`

No arguments. Regenerates the WebP delivery siblings for the large static
JPG/PNG sources listed in `scripts/optimizeStaticImages.mjs`. The typed image
manifest imports those optimized files; run this command after replacing one
of their source artworks. It reports the source and delivery byte totals so a
regression in asset weight is visible during review.

## `npm run dev`

```bash
npm run dev
npm run dev -- maintenance-prepare --from DD/MM/YY-HH:mm --to DD/MM/YY-HH:mm [--message "..."]
```

Starts the Vite dev server (`http://localhost:5173` by default; this shop
uses **5174** via `--port 5174 --strictPort`). Origins come from kernel
`config/` (`http.apiBaseUrl`, `http.frontendBaseUrl`). Shop copy and plugin
keys come from `/storefront/bootstrap`.

`maintenance-prepare` previews the `MaintenanceBanner` in the dev server
instead of requiring a full `npm run build` — same `--from`/`--to`/
`--message` semantics as the `build` form below (`DD/MM/YY-HH:mm`, local
time, `--to` after `--from`), just injected straight into the dev process's
env instead of baked into a build. There's no `maintenance` (lockdown page)
form here — that one only exists as a real deploy artifact.

## `npm run build`

```bash
npm run build -- --prod|--preprod [--version X.Y.Z|bump-patch|bump-minor|bump-major] [--patch-version X.Y.Z] [--local] [--verbose]
npm run build -- maintenance-prepare --from DD/MM/YY-HH:mm --to DD/MM/YY-HH:mm [--message "..."] --prod|--preprod [--version ...] [--local]
npm run build -- maintenance [--from DD/MM/YY-HH:mm] [--to DD/MM/YY-HH:mm] [--message "..."]
```

The full build: `tsc -b` → `vite build` (client) → `vite build --ssr` →
`prerender.mjs` → `version-dist.mjs`.

| Flag                                      | Required                                | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--preprod` / `--prod`                    | yes for the first two forms, no default | `prod` or `preprod` — picks which target's env-file pair is used. No default deliberately: a silently-defaulted mode previously caused a preprod build to load prod's env file (and hit prod's API) unnoticed until it failed confusingly mid-prerender.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `--version`                               | no                                      | Explicit `X.Y.Z`, or `bump-patch`/`bump-minor`/`bump-major` to auto-increment the **root** `package.json` version (written back before building).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `--patch-version X.Y.Z`                   | no                                      | Names the output folder `dist/vX.Y.Z/` (and its `.htaccess` RewriteBase) instead of `dist/v<root package.json version>/` — **never** writes `package.json`. Set by `kernel/back`'s `deploy -- --patch`; rarely passed directly. Cannot combine with `--version`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--local`                                 | no                                      | Adds a `dist/index.html` redirect to `dist/<version>/` — a convenience for previewing the build locally (e.g. `npx serve dist`). Never upload this file; it's not part of the real deploy (only `dist/<version>/` + `dist/.htaccess` are).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `--verbose`                               | no                                      | Prints every prerendered URL and its generated HTML file during the prerender step.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `maintenance-prepare --from ... --to ...` | —                                       | Builds the app with a maintenance-window banner baked in (`VITE_MAINTENANCE_FROM`/`_TO`/`_MESSAGE`, see `MaintenanceBanner.tsx`). `--from`/`--to` are `DD/MM/YY-HH:mm` (a 4-digit year also works), parsed as local time on the machine running the build; `--to` must be after `--from`. This is an advance notice, not a "maintenance in progress" flag: the banner shows the announced `from`/`to` window (each visitor's own local time) as soon as the build goes live, stays up through the window itself, and disappears once `to` has passed — it is never gated on `from` having started. `--message` appends extra text after that sentence (overriding the default caveat), shown only if given/non-default.                                                                                                                                                                              |
| `maintenance`                             | —                                       | Doesn't build the app at all — just (re)generates `dist/maintenance.html` + `dist/maintenance.htaccess`, a standalone full-site lockdown page you FileZilla-upload (rename the `.htaccess` file) to take the live site down, and remove to restore it. target flags not required/used for this form. `--from`/`--to`/`--message` are all optional here (unlike `maintenance-prepare`, which requires `--from` and `--to`) and get baked as plain text into the lockdown page itself, since a visitor hitting a live lockdown has no other way to know when the site is expected back — the page has no JS, so the time shown is fixed at build time (the machine running the build's own local clock), not converted per visitor the way the banner is. Passing only `--to` shows "Retour prévu / Expected back"; both `--from` and `--to` show the full window; `--message` adds a line under that. |

## `npm run check`

No arguments. Read-only. **The pre-review gate for this repository**, the
counterpart of `npm --prefix ../back run check`.

```bash
npm run check
```

Runs `typecheck`, the whole `lint` bundle (oxlint, theme, architecture, i18n,
api contract, screens), `check:context`, the unit tests, and `check:bundle`.
About 13 seconds.

Before this existed, `lint` covered four checks and `typecheck` and `test:unit`
were outside it, so nothing ran the front-end's own guarantees together.

## `npm run check:bundle`

No arguments. Read-only aside from a disposable `.bundle-check/` outDir (gitignored,
removed when the script finishes). Part of `npm run check`.

```bash
npm run check:bundle
```

Runs a **client-only** `vite build` (no SSR, prerender, or deploy) and fails when
any built `assets/*.js` or `*.css` exceeds 500 kB after minify (same ceiling as
Vite's chunk-size reporter). Deploy builds must stay under that line so the
Vite warning does not appear.

This does **not** replace a full `npm run build`. It catches chunk-size
regressions without a deploy. Do not silence overruns by raising
`build.chunkSizeWarningLimit` or by restoring catch-all `manualChunks` — see the
rationale in `vite.config.ts`. Prefer moving work off the entry static import
graph (`lazy()` / dynamic `import()`).

## `npm run sync:screens` / `npm run check:screens`

No arguments. `sync:screens` regenerates [`docs/screens.md`](./docs/screens.md);
`check:screens` fails when that file is stale and runs as part of `lint`.

The map lists every URL the router serves with its page file, the components
directories that page imports from, the API modules it calls, and the i18n
namespaces it reads, plus the files under `src/routes/` that have no URL of
their own. It is read out of `App.tsx` and `src/config/poseVideos.ts`, so it
cannot disagree with the router.

**Start a front-end task here.** It is the front's counterpart of the backend's
`npm run feature`, and it replaces the several greps that used to be the only
way to find which file draws a screen.

## `npm run check:context`

No arguments. Read-only. Part of `npm run check`.

The per-feature context budget: how many lines a change to one feature must be
able to read. It is defined once, in
`../back/scripts/featureContext.mjs`, and this runs it there rather
than keeping a second copy.

It matters here because the front is the larger half of 9 of the 15 features,
so a front-side change is the one most likely to blow a budget. Lower a budget
by splitting a feature; raising one is not a fix.

Skipped when the sibling backend checkout is absent. `npm run context` prints
the same table without failing.

## `npm run lint`

No arguments. Runs `oxlint` over the repo, then the semantic theme-contract
check, then `check:architecture` (route file-size ratchets), `check:i18n`,
`check:api` and `check:screens`.

Prefer `npm run check`, which adds `typecheck`, `check:context` and the unit
tests.

## `npm run sync:ratchets`

No arguments. Lowers every route ratchet in `scripts/checkArchitecture.mjs` to
what its file now measures, and prints each reduction.

The ratchets are one-way: `check:architecture` fails when a ratcheted route
grows past its number **and** when it has shrunk below it, so a reduction is
locked in rather than left as slack. Split a file, run this, commit the smaller
numbers.

## `npm run check:architecture`

Runs two checks. The first is the route file-size ratchets. The second is layer
direction: `routes` above `ui` above `api` above `platform`, imports downward
only.

`state/`, `theme/` and the `.tsx` hooks count as `ui`, not as something below
it, because those modules render: `AuthContext` mounts a dialog and
`ThemeProvider` calls the account API. Only value imports count; `import type`
creates no runtime edge.

No arguments. Enforces a stage ceiling of about 2200 lines for
`src/routes/*.tsx`, with individual non-growth ratchets for known oversized
pages (`cart/ShopCartPage`, `AdminOrdersPage`, and other listed offenders).
Split before growing past a ratchet.

## `npm run typecheck`

No arguments. Runs the strict TypeScript project check without generating
application output.

## `npm run check:api`

No arguments. Read-only. Runs as part of `npm run lint`.

Every endpoint this app calls must be one the backend actually serves. The
backend publishes what it serves in `../back/docs/api/routes.json`,
generated from its live Express stack; this walks every request `src/api/**`
makes and matches path and method against that inventory.

It closes the cross-repo failure that nothing else catches: both repositories
typecheck green while this app calls a path the backend renamed or removed, and
the break only shows up in the browser.

Interpolated path segments match a backend path parameter. An interpolated
suffix (a query string) truncates the comparison to the part that is actually
known. Modules that wrap the shared transport with a fixed base path, such as
`src/api/chat.ts`, are resolved through that prefix. A path or verb assembled
at runtime cannot be checked and is counted in the summary line instead.

Skipped entirely when the sibling backend checkout is absent, so this
repository still builds standalone. When a route was just added on the backend,
regenerate its inventory with
`npm --prefix ../back run sync:routes`.

## Where copy lives

`src/assets/i18n/strings/<lang>/<namespace>.ts`, one file per screen, and
`strings.<lang>.ts` only assembles them. `common.ts` holds the loose top-level
labels.

The types mirror that split exactly: `src/assets/i18n/types/<namespace>.ts`
holds the interfaces for one screen, and `types.ts` keeps only `Lang`, the
top-level labels, the `Strings` assembly, and a re-export of every interface,
so existing `import type { NavStrings } from '.../i18n/types'` call sites are
unaffected.

That layout exists to keep reading cheap: finding what one screen says used to
mean opening a 2,701-line file, and is now a median of 33 lines; its type used
to mean opening a 2,344-line file, and is now a median of 27. Nothing is
authored in `strings.<lang>.ts`.

`npm run check:i18n` fails when a namespace has copy but no matching type file,
or the reverse, so the two cannot drift back into one file.

## `npm run check:i18n`

No arguments. Read-only. Runs as part of `npm run lint`.

`tsc` already proves each locale satisfies `Strings`, so this covers what a
type cannot. French is the source language; every other locale is compared
against it. It fails when a locale:

- misses a key French has, or carries one French does not;
- interpolates a different set of `{token}` placeholders for the same key;
- has a plain string where French has a function (or takes different
  arguments);
- contains an em dash or en dash anywhere, which is a hard copy rule;
- gained a value byte-identical to the French one.

That last check is a ratchet. Around 470 values are legitimately the same word
in both languages, so the accepted set lives in
`src/assets/i18n/untranslated-baseline.json`. It may shrink freely; it grows
only through `npm run check:i18n -- --update-baseline`, which is a deliberate
decision to accept a value as-is rather than translate it.

## `npm run i18n`

```bash
npm run i18n -- add <key.path> "<french text>" [--en="..."] [--th="..."] ...
npm run i18n -- remove <key.path>
npm run i18n -- rename <old.path> <new.path>
```

Edits the owning type file and all seven locale files together, then formats
the files it touched. Doing this by hand is eight edits in eight files, which
is where half-finished locale sets came from.

`add` resolves the key path through the `Strings` type graph, which now spans
`types.ts` and every file under `types/`, so it inserts into the right
interface in the right file, whether that is a named one (`NavStrings` in
`types/nav.ts`) or an inline object type in `types.ts`. A locale given no `--<lang>` text is seeded with the French text
and reported; it is deliberately left out of the untranslated baseline, so
`npm run check:i18n` keeps failing until it is really translated.

`rename` changes the last path segment only. Move a key with `remove` then
`add`. Typecheck lists the call sites to update.

## `npm run check:theme`

No arguments. Verifies that every `--color-*`, `--border-*` and `--shadow-*`
CSS variable used under `src/` exists in `src/styles/theme.css`, and that
feature styles do not redeclare that semantic contract locally.

## `npm run format`

No arguments. `prettier --write` over `src/**/*.{ts,tsx,css}` and
the application, tests, scripts, documentation, root configuration, and CI
workflow files covered by the repository's Prettier command.

## `npm run format:check`

No arguments. Runs the same Prettier scope in check-only mode; it is safe for
CI and does not modify files.

## `npm run test` / `test:unit` / `test:unit:watch`

```bash
npm run test
npm run test:unit
npm run test:unit:watch
```

Runs Vitest unit/component regressions under `src-test/unit-test/` (isolated
jsdom). Never place `*.test.ts(x)` under `src/`. `npm run test` is an alias of
`test:unit`. The watch form is for local development; CI uses the one-shot form.
