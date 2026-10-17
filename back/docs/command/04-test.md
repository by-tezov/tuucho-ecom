# Tests

## `npm run test`

`--dev` only for fixtures, lock, `--api`, and `--load`. No `ALLOW_TEST_API` gate.
`--unit-test` takes **no** target flag (environment-agnostic).

```bash
# Unit tests (back + front; no disposable stack, no --dev)
npm run test -- --unit-test

# Unit coverage HTML → output/report/coverage/{back,front}/ (+ hub refresh)
npm run test:coverage

# Fixture renderer (no HTTP/DB/sendMail) — writes under output/test/emails
npm run test -- template-invoice [--json] --dev
npm run test -- template-gift-card [--json] --dev
npm run test -- template-email [--json] --dev

# Lock stress probe (Node fetch; no Chrome) — report under output/test/lock/
npm run test -- lock [--image] [--api] --dev
npm run test -- lock --image --concurrency 40 --total 1000 --dev
npm run test -- lock --api --bytes 262144 --ramp 2 --dev
npm run test -- lock --image --queue 15 --total 1000 --dev
npm run test -- lock --image --queue 15 --pace "each:150 between:250" --dev

# Patchright suites against an isolated disposable local stack
npm run test -- --dev --functional
npm run test -- --dev --functional --grep admin
npm run test -- --dev --api
npm run test -- --dev --functional --api

# Live preprod critical path (mobile only, no catalogue seed, no DB cleanup).
# Requires exactly one of --ftp or --ssh. Turns folder mail routing on for the
# run, then restores it.
npm run test -- --preprod --ftp --functional
npm run test -- --preprod --ssh --functional
npm run test -- --preprod --ftp --functional --throttle 500
npm run test -- --preprod --ssh --functional --grep "create account"

# k6 load (requires k6 ≥ 0.57 on PATH)
npm run test -- --dev --load
npm run test -- --dev --api --load
npm run test -- --dev --load --load-profile baseline
npm run test -- --dev --load --load-profile contention --vu 20 --duration 45
npm run test -- --dev --load --vu 25 --duration 120

# API concurrency races only (stock, vouchers, gift, invoices, two devices)
npm run test -- --dev --api --grep "API concurrency"

npm run test -- --dev --functional --throttle 400
npm run test -- --dev --functional --headless
npm run test -- --dev --functional --verbose
npm run test -- --dev --functional --grep "PayPal full|Bancontact full|new_card 4242"
npm run test -- --dev --functional --fail-fast
npm run test -- --dev --functional --type "web" --index "1 4 7"
npm run test -- --dev --functional --type "mobile" --index "1001 1002"
```

### HTML reports (`output/report/`)

Every readable HTML report lives under `output/report/` (gitignored with the
rest of `output/`):

| Suite | Path | Notes |
| ----- | ---- | ----- |
| Hub | `output/report/index.html` | Links whichever suite reports exist |
| Functional (web) | `output/report/functional-web/` | Patchright HTML for the desktop functional suite |
| Functional (mobile) | `output/report/functional-mobile/` | Patchright HTML for the handset functional suite |
| API | `output/report/api/` | Patchright HTML for `--api` |
| Load | `output/report/load/` | k6 `summary.json`, `invariants.json`, `db-metrics.json` + generated `index.html` |
| Coverage | `output/report/coverage/back/` and `…/front/` | `npm run test:coverage` (c8 / Vitest) |

Failure screenshots/traces stay under `output/test/tmp/`. Chrome profiles stay
under `output/test/browser-profile/`.

## `npm run test:coverage`

Runs back then front unit coverage and refreshes the report hub.

```bash
npm run test:coverage
npm run test:coverage:back
npm run test:coverage:front
```

| Script | Output |
| ------ | ------ |
| `npm run test:coverage:back` | c8 HTML under `output/report/coverage/back/` |
| `npm run test:coverage:front` | Vitest HTML under `output/report/coverage/front/` |
| `npm run test:coverage` | both of the above, then `tsx scripts/writeReportHub.ts` |

No target flag. Same unit suites as `npm run test:unit` / front `vitest`, with
HTML reporters enabled.

`--index` is one test: **1–1000** is desktop (PC) viewport, **1001–2000** is mobile. A `common/` scenario that covers both sizes is two `test()` calls on two source lines, never one number for both.

Common suite flags:

| Flag                                                   | Meaning                                                  |
| ------------------------------------------------------ | -------------------------------------------------------- |
| `--unit-test`                                          | Back + front unit tests under `src-test/unit-test/`. No `--dev`/`--preprod`. |
| `--functional` / `--api` / `--load`                    | Select one or more test suites.                          |
| `--headless`                                           | Hide the browser; functional runs are headed by default. |
| `--verbose`                                            | Print each browser step as `ACTION` / `EXPECT` / `RESULT` (`OK`, `KO`, or `NO`). Missing halves print `no`. Fixture setup is omitted. |
| `--grep <pattern>` / `--type <kind>` / `--index <ids>` | Focus the functional suite. One `--index` is one test: 1–1000 desktop, 1001–2000 mobile. `--index` / `--type` are resolved with Patchright `--list` **before** the disposable database and servers start, so an unavailable number exits without occupying `PAM_TEST_WEB_FRONT_PORT` (default 4173) or leaving an isolated API running. |
| `--fail-fast` / `--max-failures <n>`                   | Bound failures before stopping.                          |
| `--throttle <ms>`                                      | Pause after a click that triggered an API request. Typing and UI-only clicks stay at full speed. Preprod defaults to `500`. The title bar can change it while that lane runs: Set or Enter applies, `0` turns the pause off, and the value is capped at 60000. Unrelated to lock-probe pacing. |
| `--ftp` / `--ssh`                                      | Exactly one is required with `--preprod`, and they are mutually exclusive. `--ftp` reaches `/operation/*` through the PHP gateway, which spawns the loopback `opsServer` from a web request; `--ftp` retries while that server is still starting. `--ssh` forwards a local port to the same `opsServer`, started and stopped by the SSH session itself. Neither is valid with `--dev`. |
| (default timeouts)                                     | No per-test wall-clock cap. Each browser action, navigation, and `expect` fails within 15 seconds (`test.setTimeout()` is forbidden in specs). |
| `--load-profile smoke\|baseline\|contention`           | Select the k6 workload profile (see Load profiles below). |
| `--vu <n>` / `--duration <sec>`                        | Override k6 virtual users or duration.                   |
| `--json`                                               | Emit machine-readable output where supported.            |

Compatibility-only flags `--headed`, `--keep-servers`, and `--stop-servers`
are accepted so older invocations do not fail. They are no-ops: headed mode
and automatic server cleanup are now the defaults.

On a terminal, once the Patchright process is running (`--functional` or
`--api`, dev or preprod), single keys control the whole run. `p` pauses every
lane and leaves the browser windows where they are, so a 15 second action
limit does not expire while you look. `r` (or `c`) restarts every paused lane
from the frozen moment. The servers and the disposable databases stay up.
`q` and Ctrl-C quit the whole run, then the usual cleanup runs. There is no
key to re-run one test from the beginning. A pipe or CI run has no keys.
Ctrl-C still quits.

Each headed window controls only its own lane. Pause and Restart freeze or
continue that lane's test process. The other lane keeps going. Stop ends that
lane: its test process, then its servers and its database, and that window
closes. The other lane runs until it finishes, and its window stays up. A run
with one window is the whole run, so its Stop ends that run. The buttons keep
working while that lane is paused, because the window is not frozen.

The same bar has a throttle field, in milliseconds, and a Set button. Set, or
Enter, applies that pause to the next click on that lane that triggers an API
request. Typing and UI-only clicks stay at full speed. `0` turns the pause
off. The value is capped at 60000. Escape leaves the field without applying
it. The keyboard stays in your windows except while that field is focused.

`--verbose` prints one manual-test triplet per customer step. Fixture and
hook internals stay hidden. A navigation that is then asserted looks like:

```
      ACTION  Navigate to "/"
      EXPECT  visible #hero-h
      RESULT  OK (1.2s)

      ACTION  no
      EXPECT  URL
      RESULT  OK (22ms)
```

`RESULT` is `OK` when the step succeeded, `KO` when it failed, and `NO` when
it never ran (skipped or interrupted). `no` in `ACTION` or `EXPECT` means that
half of the triplet did not apply.

A `test()` title states what is tested and what is expected, as
`<what is tested>: <what is expected>`. The live line and the end summary
print that title after the index (`56  Compose order flows › guest one-nail pay: the order reaches received`).

Each functional `test()` verifies one product rule or one outcome. A later
`expect` stays in that test only when it cannot fail while the named outcome
is still true: those checks are the path to that result. A check that can
fail for a different product reason is its own `test()`. A loop of the same
check over different items is one `test()` per item, and the title names the
item. `test.step` does not replace that split: the reported failure is still
the outer title. Web and mobile stay two `test()` calls on two source lines.
`--index` numbers are list order and move when tests are added; titles and
`--grep` stay the stable handle. Each new `test()` starts a fresh Chrome
context, so shared setup belongs in `src-test/dev/support/` and a form-rule
test stops before payment.

When a `--dev` Patchright run finishes, the summary lists each failed test
and each test that did not run as its index plus that title. It also prints
one copy-pasteable line that re-runs only the failed indexes (same suite
flags as the original run: `--functional` / `--api`, `--headless`,
`--verbose`, `--throttle`), for example
`npm run test -- --dev --functional --index "11 14 15"`.

A headed functional run, and a headed preprod run, opens a nested display
at `PAM_TEST_WINDOW_POSITION` (default `0,0`). Chrome runs inside that window.
The window draws its own title bar. The top row is Pause, Restart, and Stop,
and that row is the drag handle. A button brightens while it is pressed.
The throttle field sits on the right of the second row. On the left of that
row the bar shows `index - current/total - failed` for that lane only.
The index is the one printed on the console, so 1017 stays 1017. `current/total`
is which test this is in that lane, so two selected handset tests show
`1017 - 1/2 - 0` and then `1052 - 2/2 - 0`. A retry that later passes is not
left in the failed count. Under that, the bar
shows the test that just started, the same title the console prints on the
`→` line. The `›` separator is drawn as `>`. The handset window wraps that
title onto several lines. The desktop window keeps it on one line. Other
windows can cover it. Its size stays fixed, so the browser inside keeps the
lane's width and height. When desktop and mobile
run together, each lane gets
its own nested display, placed side by side (the handset starts 1280 pixels
to the right). Each Chrome keeps the focus of its own display, so the lanes
cannot take focus from each other, and opening the windows leaves the keyboard
where it was. To watch the suite on another monitor, set the origin to that
monitor, for example
`PAM_TEST_WINDOW_POSITION=1920,0 npm run test -- --dev --functional`.
Negative coordinates are supported for a display left of the primary monitor.
A scenario that opens another customer window, including the concurrent cart
and reservation cases, uses that lane's origin.
Before opening the windows the suite checks for Xephyr (package
`xserver-xephyr`), `gcc`, and `libx11-dev`. If one is missing it stops and
prints the `apt install` line. On GNOME Wayland each nested display is one X
window, so the coordinates are honored. Ordinary Chrome is unchanged.

Each functional test launches a fresh persistent Chrome context in its own
subdirectory of `output/test/browser-profile/`, keeps Chrome's initial tab as
an inert buffer, and runs the scenario in a new second tab. This avoids
browser-owned banners that some Chrome installations show only in their
launch tab, and it prevents a crashed profile from failing every later test.
All tabs and the context are still closed after the test. Front-end storage
is cleared once in that second tab's top-level document. Child frames and
later payment/email navigations do not clear it, so an anonymous basket
survives exactly as it does for a real customer.

Customer order scenarios type only `/`, then use rendered links, tabs, menus,
forms and modal actions for every same-site transition. API calls are limited
to deterministic preconditions (account/catalogue/voucher setup) and
postconditions; following an email confirmation/manage/gift-giver link, a
gift share-card QR URL, and Stripe's external authorization page are the
only out-of-band browser navigations.

Functional helpers never `force` a click, type, or scroll through an overlay.
A loading `alertdialog` is waited out. The checkout idle dialog (`Session de
paiement expirée`) is dismissed with Continuer before the next pointer
action. Any other modal stays up, so a later click or scroll cannot land on
the page beneath it.
The local `--dev` functional suite uses the dev frontend's client-public Stripe and
Mondial Relay configuration so its real payment and pickup widgets are
exercised against the disposable API/database.

`--preprod --ftp|--ssh --functional` is a separate mobile-only critical-path suite
against the live preprod shop (`src-test/preprod/functional`). It does not
create a disposable database, does not seed or clean the catalogue, and does
not drop leftover accounts, orders, or vouchers. Before the run it turns
`ROUTE_EMAIL_FOLDER` on via `PUT /operation/email-folder` so OTP and order
mails land in the dump folder (read back with `GET /operation/email-folder/mails`
over the PHP gateway) instead of real SMTP — a real cPanel env var change plus
an app restart (`cloudlinux-selector`), never a DB row, so it can never drift
silently from what the deployed env actually says — and `relax_rate_limits` on
via `PUT /operation/relax-rate-limits` (still a DB preference — HTTP limiters
alone, nothing that changes what the process is doing) so login, register,
contact, gift, and checkout HTTP limiters do not 429 the suite. Enabling
folder-mail waits for the restarted app to answer `/healthz` before the suite
starts. When the run ends — normally, on a thrown error, or on Ctrl-C/SIGTERM —
both are restored to their pre-run value; `SIGINT`/`SIGTERM` handlers cover
the interruption paths a plain `finally` cannot (only `kill -9` or a machine
crash can skip this).
Default `--throttle` is `500` ms after a click that caused an API request
(xhr/fetch to the shop API). Typing and UI-only clicks are not delayed, so
the suite does not crawl through forms. The handset window can change that
value while the suite runs. `--ssh` is rejected. Specs must
contain `mobile` in the title.
Google Pay still needs a usable Payment Request sheet in headed Chrome; the
test fails clearly when that sheet never appears. These ops routes must be
deployed on preprod before the suite can run there. Never point this runner
at production.

The first lines on stderr are the gateway `/healthz` check (fails within 20s)
then folder-mail GET/PUT and relax-rate-limits GET/PUT. The first
`/operation/*` call may look idle while PHP cold-starts loopback
`opsServer` (up to ~120s); the runner prints a heartbeat every 15s until
that answers. Once folder-mail is on, the runner also polls the public
`/healthz` (up to 60s) since the PUT just restarted the app. After that
Patchright starts headed Chrome, which is another quiet stretch
until `Running N tests` appears. Gateway calls use curl with connect and
max-time limits (dual-stack; do not force `--ipv4`, IPv4:443 to this host
is refused from some operator networks while IPv6 works).

The `--dev` orchestrator creates an empty disposable database, applies migrations,
then starts the isolated API (and the front for `--functional`). Seed runs
after the API is up, so boot probes and the in-process mail worker never hit
a missing schema. Teardown stops the isolated process groups (stdin death
pipe + SIGTERM, then SIGKILL if needed) and only then drops the disposable
database/role, so the mail worker cannot reconnect after the role is gone.

A `--dev --functional` run that includes both desktop and mobile starts two of
those environments and runs them at the same time. Each has its own database,
API, ops server, shop, mail folder (`output/test/mail-web` and
`output/test/mail-mobile`), private files, browser profile, and Stripe webhook
relay. Tests inside one environment stay one after another, because they share
that environment's catalogue stock. The run lasts about as long as the slower
environment. Web uses `PAM_TEST_WEB_FRONT_PORT` (default 4173). Mobile uses
`PAM_TEST_MOBILE_FRONT_PORT` (default 4174). The two ports must differ. The handset window sits to the right of the desktop
window, shifted by that window's width (1280 pixels). Each lane has its own
nested display, so the two Chromes keep focus independently.
`--api` stays on one environment,
the same way `--load` does: neither runs beside the functional lanes. A run
that is only web, only mobile, `--api`, or `--load` stays on one environment.
The end summary lists both functional lanes. HTML reports are
`output/report/functional-web` and `output/report/functional-mobile`.

Admin UI coverage lives under `src-test/dev/functional/common/admin/` (desktop
and mobile). Each test has one purpose (shell, role create/assign, limited
nav, inheritance, delegate assign, order ship, product request, chat, guest
contact, one stock screen, client lock, voucher, cart rule, loyalty, gift,
preferences, journals, impersonation). Avis clients / reviews is not opened.
Order status moves stop before any refund path. Narrow with `--grep admin`.
Role inheritance edge cases and the HTTP permission matrix live in
`npm run test:int` and `src-test/dev/api/admin/roles.spec.ts`.

`--load` redirects folder mail to a fresh `output/test/load-mail/` tree for
that run (API + k6 mail helper), so OTP polls never scan the long-lived
`output/dev/email-user` dump.

### Load profiles and checks

| Profile | Default | What runs |
| ------- | ------- | --------- |
| `smoke` | 25 VUs × 60s, constant | The whole customer mix: catalogue reads, auth/account, contact/chat, account `checkout/free`, the single-nail gallery with a crawler pass (`/seo/*`, `/sitemap-products.xml` with their relay headers) every fourth iteration, composed sets (create, edit, pay, order, invoice), the full gift cycle (signed-in offer, receiver PIN/choice/destination/confirm, giver `checkout/free`), and guest `checkout/free`. |
| `baseline` | 50 VUs × 120s, ramping | Same mix, ramping up and down. |
| `contention` | 25 VUs × 60s, constant (min 4) | About half the VUs buy one real set variant whose stock is cut to the VU count, every other iteration with one voucher usable VUs/2 times; about 30% share accounts two by two and shop and pay the same cart from two sessions; the rest browse single nails and crawl. Losing a race (400/409) is expected there. |

Load fixtures (disposable database only): every stock row is raised to
100,000,000 (except the contention variant), the manager's `library-nail` is
seeded for composed sets, and every VU gets its own amount voucher (one made
by `npm run voucher -- init`, the rest copied from it in SQL). The load API
also turns off the gift, invoice and contact rate limits and raises
`GIFT_MAX_OPEN_PROMISES_PER_GIVER` to its maximum, since an ordered gift keeps
its cart.

A run fails on any of:

- a k6 threshold: any 5xx (`server_errors` must stay 0), failed checks over
  1%, request failure over 1% (not in `contention`), overall VU p95 over
  800 ms, or a per-endpoint p95 over its budget in
  `src-test/dev/load/_lib/thresholds.ts`;
- a post-run SQL invariant (`scripts/loadIntegrity.ts`, `invariants.json`):
  no variant allocated beyond its stock, no voucher redeemed beyond its
  quantity or per-customer cap, no loyalty lot below zero or above its grant,
  at most one order per gift offer, and invoice numbers issued during the run
  with no gap;
- any Postgres deadlock during the run (`db-metrics.json` also records peak
  connections, sessions waiting on a lock and idle-in-transaction sessions,
  sampled every 2 seconds).

The API concurrency specs (`src-test/dev/api/concurrency/`) are the exact
counterpart: each fires one race at once and asserts the single outcome the
locks promise, both in the responses and in the database. They buy only the
`RACE_*` E2E sets, which they restock to an exact number of free units first.

The focused mobile order matrix can be run with:

```bash
npm run test -- --dev --functional --headless --grep "Mobile order pathways from the public root"
```

It proves five distinct outcomes and states the reason for each expectation in
the Patchright report: normal password login with two sets, a paid accessory,
a percent voucher and card payment; normal email OTP with PayPal; cart login
with an explicit merge; cart OTP with an explicit new named cart; and a guest
amount voucher that reaches zero and confirms without Stripe. Voucher formula
branches (`percent`, `amount`, free shipping, free item, nth free item) remain
exhaustively covered at API level; the browser matrix covers the two checkout
shapes that materially change the customer journey.

### Lock stress probe (`lock`)

Node `fetch` storm against the local front and/or API to find where the
path dies under concurrency. No Patchright/Chrome.

- `--image` — GET `{URL_FRONTEND_BASE}/lock-probe.jpg?n=<random>` (cache-bust).
  Requires `pamsurin-front/public/lock-probe.jpg`.
- `--api` — GET `{URL_API_BASE}/operation/lock-probe?bytes=&nonce=` with
  `OPS_TOKEN`.
- Neither `--image` nor `--api` → both phases (image then api).
- Migrates the disposable database, then starts an isolated API (+ front
  when `--image` / both), runs the probe, then tears the stack down. Same
  pattern as Patchright.

| Flag                | Default  | Notes                                                                                                                              |
| ------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `--image` / `--api` | both     | Select phase(s).                                                                                                                   |
| `--concurrency <n>` | `20`     | Max in-flight requests.                                                                                                            |
| `--total <n>`       | `500`    | Attempts per phase.                                                                                                                |
| `--bytes <n>`       | `65536`  | API payload size (64…2_000_000).                                                                                                   |
| `--duration <sec>`  | `0`      | Stop after N seconds (`0` = until `--total`).                                                                                      |
| `--ramp <sec>`      | `0`      | If &gt; 0, start concurrency at 1 and +1 every N seconds.                                                                          |
| `--queue <n>`       | disabled | Caps actual in-flight requests via a queue layered on top of `--concurrency`/`--ramp`.                                             |
| `--pace <spec>`     | disabled | Space-separated `each:<ms>` and/or `between:<ms>`. `between` requires `--queue`. Not the same as `--throttle` (pause after API-triggering clicks). |

Report: `output/test/lock/<stamp>/SUMMARY.md`, `summary.json`,
`requests.ndjson`, `dualstack.ndjson` (IPv4/IPv6 probes every ~2s).

### Fixture renderer

Local fixture renderer (no HTTP, no DB, no `sendMail`). Loads the
dev env, then writes under `output/test/emails/`:

- `template-invoice` → `invoice/` — 14 PDFs. Eight standard nail-set
  invoices (`keys|realistic` × `1page|multipage` × voucher on/off), plus
  accessory, cart-rule free product (`Cadeaux offerts` / Gratuit), and
  gift-order (`Commande cadeau`) cases (`keys|realistic` × each, 1 page).
- `template-gift-card` → `gift-card/` — one PDF and one JPEG per share-card
  style and message length (`keys|short|mid|full|wrap` × the 20 live models).
  `short` is one short line, `mid` is three lines, `full` is six (the print
  cap), `wrap` is one long line that wraps. The JPEG is the 5 x 3 inch card
  alone.
- `template-email` — every customer, gift, loyalty, order-status, product-request,
  spy, and chat mail the app sends (`keys.html` and `realistic.html` per kind),
  including gift confirm/share-card/cancelled/promise and the pay/hold
  relances (`gift-reminder-pay`, `gift-reminder-hold`, `gift-reminder-select`).

See `src-test/README.md` for Patchright/k6 layout under `src-test/dev/`.
