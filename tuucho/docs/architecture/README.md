# Backend architecture

Shop is a modular monolith. Business capabilities remain in one deployed
process and one PostgreSQL database, but source-code dependencies follow the
direction below:

```text
HTTP router/controller -> application use case -> domain policy
                                      |
                                      v
                         repository / external gateway
```

## Source roles

- `src/api/` contains only module roots and compatibility re-exports.
  Endpoint handlers live with their feature under `src/modules/*/http`. A
  route validates transport input, calls one application use case, maps its
  result to the documented response envelope, and stops there.
- `src/modules/` owns business capabilities. Small capabilities may stay flat;
  larger ones use `http`, `application`, `domain`, and `infrastructure`
  subfolders only when those distinctions add useful navigation.
- `src/platform/` owns application-independent infrastructure such as HTTP
  errors, configuration loading, database transaction helpers, logging, and
  outbound mail transport.
- There is no `src/services/`. It was a compatibility location for services
  not yet moved to a feature module, and it is now empty and removed: every
  unit lives in its owning module or in `src/platform/`. Do not recreate it.
  Behaviour shared by several modules belongs in the owning module's
  `application/` (which other modules may import) or, when it carries no
  business vocabulary at all, in `src/platform/`.
- `src/app.ts`, `src/opsRoutes.ts`, and the server entry points are module
  roots. They may wire modules together; business modules must not import them.
  `app.ts` must never mount `/operation/*` or `/ops-gateway`; those routes are
  loopback-only (`opsServer`) or reached through the PHP gateway at
  `OPS_GATEWAY_URL`.

## Current feature map

```text
src/api/account.routes.ts                 account module root
src/api/admin.routes.ts                   administration module root
src/api/auth.routes.ts                    authentication module root
src/api/contact.routes.ts                 contact/product-request module root
src/api/gallery.routes.ts                 catalogue/SEO module root
src/api/operation.routes.ts               core operations module root
src/modules/account/                      profile, security, lifecycle, social identity
src/modules/activity/                     append-only administration journal
src/modules/admin/                        browser administration routes and presenters
src/modules/auth/                         credentials, OTP, sessions, recovery, social auth
src/modules/cart/                         cart collections, active cart, presentation
src/modules/catalog/                      gallery catalogue, product preview, sitemap
src/modules/chat/                         authenticated customer chat
src/modules/checkout/                     authenticated/guest checkout contracts and settlement
src/modules/contact/                      anonymous contact and product requests
src/modules/customers/addresses/          address contracts, presentation, account routes
src/modules/customers/favorites/          favorites routes
src/modules/delivery/                     courier payloads and account delivery routes
src/modules/loyalty/                      customer wallet and administration routes
src/modules/gift/                         two-person gift offers, giver checkout, cron
src/modules/operations/                   imports, maintenance, diagnostics, ops routes
src/modules/orders/                       domain, queries, notifications, presentation, persistence adapters
src/modules/plugins/                      drop-in plugin runtime, store identity, theme, bootstrap
src/modules/payments/                     payment preferences and payment-method routes
src/modules/vintedReviews/                home-page reviews scraped from the public Vinted profile
```

## Shared infrastructure map

| Concern                                                   | Location                     | Rule                                                                                                                            |
| --------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| HTTP authentication, throttling, uploads, request logging | `src/middleware/`            | One middleware owns each cross-route HTTP policy; feature validation stays in its router/application layer.                     |
| Public catalogue images                                   | `src/media/storage.ts`       | Stores immutable, content-hashed catalogue assets and derived thumbnails.                                                       |
| Private contact/chat images                               | `src/media/privateImage*.ts` | Policy, file naming, image processing, and private storage are separate units; `privateUploads.ts` is the compatibility facade. |
| Application-independent primitives                        | `src/platform/`              | Small reusable mechanisms such as opaque-token generation/hashing; no feature or Express policy.                                |

## Where a new change belongs

| If the change is…                                                  | Put it in…                                          |
| ------------------------------------------------------------------ | --------------------------------------------------- |
| An HTTP path, parameter, response mapping, or route-specific guard | `src/modules/<feature>/http/`                       |
| A business workflow or transaction boundary                        | `src/modules/<feature>/application/`                |
| A pure invariant, state transition, or value type                  | `src/modules/<feature>/domain/`                     |
| SQL persistence or an external-provider adapter for one feature    | `src/modules/<feature>/infrastructure/`             |
| A generic technical primitive with no business vocabulary          | `src/platform/`                                     |
| Application assembly                                               | `src/api/`, `src/app.ts`, or the server entry point |

Checkout pricing, reservation, confirmation, and lifecycle transactions live
under `src/modules/orders/application/` (`checkoutPricing`,
`checkoutReservation`, `orderConfirmation`, `orderLifecycle`).

A unit one module owns but another needs is exposed through a small named
contract in `application/`, never by importing across into `http/` or
`infrastructure/`. `modules/auth/application/socialTokens.ts`,
`modules/gift/application/giftMailSending.ts` and
`modules/orders/application/orderItems.ts` are the current examples.

Units carried out of the old services layer whole still carry individual
non-growth ratchets in `scripts/checkArchitecture.mjs`. Each is a split that
has not happened yet: an edit must stay under the ceiling or lower it.

## Enforced dependency rules

1. Router files never import another router file for data parsing, presenters,
   constants, or business operations. Shared HTTP contracts live with their
   feature module.
2. Router files do not gain new SQL, transaction, Stripe/carrier, or mail
   orchestration. Compatibility routers may retain moved legacy orchestration
   until an application use case replaces it; do not copy those exceptions.
3. Application use cases own orchestration and transaction boundaries.
4. Domain policies are pure TypeScript and do not import Express, `pg`, Stripe,
   the filesystem, or the global application configuration.
5. Infrastructure modules may depend on domain/application contracts, never
   on HTTP routers.
6. Cross-module imports go through an explicit contract. A module never
   imports another module's HTTP or private infrastructure implementation.
7. Expected business failures use typed discriminated results. Unexpected
   failures propagate to the final Express error middleware.

## File sizing

Line counts are review signals, not design goals. API roots stay below 100
lines and cannot register endpoint handlers. Middleware and media adapters
stay below 150 lines; platform primitives stay below 300. Leaf routers have a
stage ceiling of **350** lines (`scripts/checkArchitecture.mjs`); known
oversized routers carry individual non-growth ratchets. Ordinary source files
above roughly 400 lines require a clear cohesion reason. A complete
transactional use case should stay together when splitting it would hide its
invariants. Existing large compatibility services have individual non-growth
ratchets: edits must either stay inside the current ceiling or move a cohesive
slice into its owning module. Routers must return
`{ success: false, error: { code: '…' } }` (string `error` values are banned).

Ops routers for loyalty, gift, and chat live under
`src/modules/operations/http/` (`loyaltyOps`, `giftOps`, `chatOps`) even when
they call into a feature application/domain contract.

## Refactoring compatibility

Architecture-only changes preserve every documented URL, status code, JSON
envelope, authorization check, and database transaction invariant. Large
legacy services are split behind compatibility re-exports first so callers
can migrate in small, reviewable changes. Database migrations and public API
changes are separate work and must not be mixed into a structural refactor.

Run `npm run check:architecture` locally and in CI. It rejects import cycles,
module-to-module dependencies, endpoint handlers under `src/api`,
non-router imports between legacy route files, impure domain imports,
operations routes mounted on the public API, and growth beyond the current
size ratchets.

## Shop pack layout (paths outside `kernel/back/src`)

Paths below are relative to the clone root (not to `tuucho/kernel/back`):

| Path | Role |
| ---- | ---- |
| `tuucho/kernel/` | API + shop front |
| `tuucho/plugins/` | Bundled plugins (`tuucho-*` ids) |
| `tuucho/plugin-sdk/` | `@tuucho/plugin-sdk` |
| `tuucho/scripts/` | Pack scripts (setup, dev, versioning, factory-sync) |
| `tuucho/sample/` | Demo catalogue + courier JSON and seed-defaults.env |
| `tuucho/factory-backup/config/` | Shipped JSON templates → `tuucho-config/` on first install |
| `tuucho/factory-backup/plugins/` | Shipped shop examples → `src/plugins/` on first install |
| `tuucho/factory-backup/migrations/` | Optional publisher `config:migrate` steps |
| `tuucho-config/` | Live shop JSON (survives Apply; never written by Tuucho Apply) |
| `src/plugins/` | Live user / demo / zip plugins (gitignored; survives Apply) |

In this product repo, after changing live `tuucho-config/` or `src/plugins/`,
run `npm run factory-sync` so factory backup matches
(`factory-sync:check` / `check:factory-sync`).
