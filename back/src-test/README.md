# src-test

Patchright suites, k6 load, integration tests, and unit tests for Lumen,
driven from **pamsurin-back**.

```bash
npm run test -- --unit-test
npm run test -- --dev --api
npm run test -- --dev --functional
npm run test -- --dev --functional --api
npm run test -- --preprod --ftp --functional
npm run test -- --dev --load
npm run test -- --dev --load --vu 25 --duration 120
npm run test -- --dev --load --load-profile baseline
npm run test -- template-email --dev
npm run test:int
```

| Folder | Purpose |
| --- | --- |
| `unit-test/` | Pure unit tests (no DB/browser). Mirrors `src/`. Combined with front via `npm run test -- --unit-test` (no `--dev`). |
| `int/` | In-process app + real Postgres (`npm run test:int`). |
| `dev/api/` | HTTP API contracts (no browser) — `auth`, `account`, `admin`, `chat`, `checkout` (incl. guest), `contact`, `gallery`, `gift` (settings, guest/signed-in flow, receiver budget/delivery, cancel-expire, pin-throttle), `concurrency` (parallel races on stock, vouchers, gift PIN/confirm/payment/promise ceiling, invoices, guest claims, two devices on one cart) |
| `dev/functional/` | Browser E2E against the Vite front (`common/auth`, `common/checkout`, `common/gift`, `common/admin`, …) |
| `preprod/functional/` | Live preprod mobile critical path (auth OTP from folder mail, gallery top/mid/bottom, accessory + cagnotte, card/PayPal/Google Pay/Bancontact, Colissimo/Mondial Relay, guest + connected, voucher, Offrir, contact). No catalogue seed, no DB cleanup. |
| `dev/load/` | k6 TypeScript load suite (`suite.ts`): guest GETs, auth/account, contact/chat, voucher + checkout/free, single-nail gallery + crawler SEO routes, composed sets, gift cycle, guest checkout; `contention` profile for scarce stock/voucher and two sessions per account; post-run SQL invariants; no Stripe / no Mondial Relay HTTP; requires k6 ≥ 0.57 on PATH |
| `dev/visual/` | Reserved for visual regression |
| `dev/support/` | Env, mail dumps, ops CLI wrappers, page objects, selectors; gift helpers in `gift.ts`, `gift-flow.ts`, `gift-qr.ts`, `pages/gift.pages.ts` |

`--index` numbers are viewport-strict: 1–1000 desktop, 1001–2000 mobile. Specs under `functional/common/` that cover both sizes declare two `test()` calls on separate source lines. The handset title contains the word `mobile`, so Patchright `--index` cannot select both.

Each functional `test()` verifies one product rule or one outcome. A later
`expect` stays in that test only when it cannot fail while the named outcome
is still true. A check that can fail for a different reason is its own test.
A repeated check over different items is one test per item, and the title
names the item. The title form is `<what is tested>: <what is expected>`.

Functional order tests that remain one test are one customer journey, not a
route probe. They enter at `/` and reach gallery, authentication, cart,
delivery, payment and orders only through visible site controls. The
mobile-first matrix in `dev/functional/mobile/checkout/order-pathways.spec.ts`
covers password and OTP entry from both Commandes and the anonymous cart,
cart merge and a new cart as their own tests, payment of those carts as
their own tests, multiple sets, a paid pack accessory, percent/fixed
vouchers, card, PayPal, and a zero-total guest confirmation. Each assertion
step records why the result is expected, including persisted order contents
after payment.

`dev/api/` covers the public surface documented in `docs/api/`: `/auth`,
`/account` (profile, security, addresses, carts, orders, payments), `/admin`,
`/account/chat`, `/checkout/guest`, `/contact`, `/gift` (capability-token
giver/receiver flows under `dev/api/gift/`), and the gallery routes. Orders
are placed through `POST /account/checkout/free` with a CLI-created amount
voucher, so most of the post-purchase surface runs without Stripe; the
card/decline suites need `STRIPE_SECRET_KEY` for the dev target. Operations
routes (`/operation/*`) are not part of this suite — they live on the
loopback ops server and are exercised by the `npm run …` CLIs.

Functional gift journeys live under `dev/functional/common/gift/` (create UI,
validation, guest and signed-in flows, receiver budget/delivery, cancel/expire,
giver hold-edit after confirm). Shared gift setup helpers are in `dev/support/gift*.ts` and
`dev/support/pages/gift.pages.ts`.

Admin functional journeys live under `dev/functional/common/admin/`, one
purpose per test: shell, role create, role assign, users chip, preparator
nav, inherited nav, inherited Roles page, delegate nav, delegate assign,
each order status transition, product request, chat, guest contact, each
stock screen, client open, client lock, client unlock, voucher create,
voucher disable, cart rule create, cart rule disable, loyalty, gift list,
preferences, activity journal, crons journal, api log, impersonate error,
and impersonate return. Avis clients (`/admin/reviews`) is not opened.
Order flows stop before any refund path. Helpers: `dev/support/adminSeed.ts`,
`dev/support/pages/admin.pages.ts` (`adminSurfaceTests`). Run with
`npm run test -- --dev --functional --grep admin`.

Dev runs create an isolated disposable database, migrate it, then start the
isolated API (and front for `--functional`) before seeding. The stack is torn
down when finished. Seed covers catalogue/courier/accessory/cart-rule/payment/sign-in.
Gift offers are always on, so there is no gift seed step. HTML reports use `output/report/` (`functional/`, `api/` for
Patchright; `load/` for k6 `summary.json` + HTML; `coverage/{back,front}/` for
unit coverage). Hub: `output/report/index.html`.

Chrome's launch tab is intentionally unused because it may carry a
browser-owned banner. The scenario runs in a second tab; test storage cleanup
occurs once in that tab's top-level front document and never in checkout
iframes, so guest persistence and login reconciliation remain testable.

`--load` needs no Chrome and no Stripe PaymentIntent / Mondial Relay API.
Use `--vu <n>` for total concurrent users (default 25; split by weight across
every scenario family, see `_lib/vuAlloc.ts`). The disposable stack forces
`DISABLE_RATE_*=true`, fills stock, seeds single nails and one amount voucher
per VU so `/checkout/free` can complete, then checks SQL invariants after the
run (see docs/command/04-test.md, Load profiles and checks).
Install k6 from
https://grafana.com/docs/k6/latest/set-up/install-k6/ (v0.57+ for native TypeScript).

See [docs/command/04-test.md](../docs/command/04-test.md).
