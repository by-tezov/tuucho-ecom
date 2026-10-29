# tuucho-ecom agent guidance

One repository, npm workspaces. Backend at `tuucho/kernel/back`, front-end at
`tuucho/kernel/front`, plugin SDK at `tuucho/plugin-sdk`, plugins at
`tuucho/plugins`, all project documentation at `tuucho/docs`.

## Repository ownership

- `tuucho/kernel/back` owns the PostgreSQL schema, JSON API, authentication,
  checkout and Stripe integration, shipping labels/tracking, vouchers,
  invoices, and API-side business validation.
- `tuucho/kernel/front` is the Vite + React + TypeScript customer shop
  (catalogue, guest cart, auth/account, Stripe checkout, Mondial Relay,
  orders/invoices, contact). It consumes the public API. A contract change
  updates the matching `tuucho/docs/api/` section and the front caller in the
  same task when required. Client helpers: `src/api/gallery.ts`,
  `src/api/auth.ts` (Bearer access + httpOnly refresh via
  `credentials: 'include'`). Any `VITE_`-prefixed value ships in the client
  bundle.
- `tuucho/sample/` (catalog import tree) owns demo catalogue data, courier
  definitions, and seed defaults. Import through documented commands only;
  never depend on that tree at runtime. The front never treats local static
  gallery files as the runtime catalogue.

For implementation work, use `.agents/skills/tuucho-backend-change/SKILL.md`
(or `tuucho-frontend-change` / `tuucho-feature-new` when those apply).

## Keep contracts and documentation synchronized

| Changed artifact or behavior                                                         | Required companion update/check                                                                                                                                                                              |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public/admin/operations HTTP path, input, output, status, error, auth, or limit      | Update the matching `tuucho/docs/api/` section; inspect and update `tuucho/kernel/front` when it consumes the contract.                                                                                      |
| PostgreSQL table, column, constraint, index, retention, or stored meaning            | Add a migration under `tuucho/kernel/back/src/db/migrations/`; update the matching `tuucho/docs/schema/` section; immediately apply it on local/dev, then `npm --prefix tuucho/kernel/back run sync:schema`. |
| Package script, CLI command/subcommand, option, default, target rule, or side effect | Update the matching `tuucho/docs/command/` section and examples; keep `npm --prefix tuucho/kernel/back run check:docs` passing.                                                                              |
| Cron schedule, eligibility, state transition, preference, log, or deploy switch      | Update `tuucho/docs/cron/README.md` and the relevant operations API/command documentation.                                                                                                                   |
| Source ownership, module boundary, compatibility facade, or size rule                | Update `tuucho/docs/architecture/README.md` and `tuucho/kernel/back/scripts/checkArchitecture.mjs` when the enforceable rule changes.                                                                        |
| Catalogue/courier/voucher import shape                                               | Update operations API and command docs; verify the relevant `tuucho/sample/` (catalog import tree) source contract.                                                                                          |
| Live root scaffold, `tuucho-config/`, or `src/plugins/` in this product repo (gitignored) | Run `npm run factory-sync` (or `node tuucho/scripts/factory-sync.mjs`) so `tuucho/factory-backup/root|config|plugins` match. `factory-sync:check` fails on drift when live trees exist. Pack git ships templates only under `factory-backup/`. |
| Environment variable                                                                 | Update the relevant README/command/cron documentation and safe public env examples; never expose private values.                                                                                             |
| Dependency, SDK, provider API version, or runtime requirement                        | Update factory `tuucho/factory-backup/root/package.json` and its lockfile together (then factory-sync); check current official migration/deprecation/security guidance; update affected API/command docs. Do not opportunistically upgrade unrelated packages. |

`tuucho/API.md`, `tuucho/SCHEMA.md`, `tuucho/COMMAND.md`, and `tuucho/CRON.md`
remain index stubs.
Feature map: [`tuucho/docs/features.json`](./tuucho/docs/features.json).

## Before changing front code

- Start at [`tuucho/docs/front/screens.md`](./tuucho/docs/front/screens.md)
  (generated). Use `npm --prefix tuucho/kernel/back run where -- <name> --front`
  for symbols.
- Use `.agents/skills/tuucho-frontend-change` when the task is front work.
- Hard rules below cover secrets, browser automation, and server authority.
- Reuse a running local stack. Cross-repo roles: manager = source data,
  back = API/rules, front = UI.

## Front implementation conventions

- Finish with `npm --prefix tuucho/kernel/front run check` (about 13s;
  includes `check:bundle`).
- TypeScript, React, CSS Modules, mobile-first, existing patterns.
- **GiftReceiverProvider** wraps the shop cart tree (above `CartProvider`);
  gift lock spans gallery/home/product/cart. Do not nest `OrdersProvider`
  inside it. Do not mount it only under `/gift` routes.
- **No native browser validation UI:** forms use `noValidate`; show field
  errors under the control. Details in
  `.agents/skills/tuucho-frontend-change/references/ui-conventions.md`.
- Locales `fr|en|th|es|it|nl|pt` via `VITE_ENABLED_LANGUAGES` (must include
  `fr`). Customer copy in every enabled locale + `Strings` type. Admin UI copy
  is translated too: `src/assets/i18n/admin/` (`types.ts` + one
  `strings/<lang>.ts` per locale, read with `useAdminStrings()`, loaded only
  with the admin routes so it stays off the entry bundle; never import it from
  shop code). Older admin keys still live in `t.admin`. Never hard-code admin
  copy; `npm --prefix tuucho/kernel/front run check:i18n` checks the admin
  files too.
- Countries: never hard-code lists. Delivery from
  `GET /account/address-countries`; phones from `GET /account/phone-countries`;
  Mondial Relay from Point Relais `countries` on `GET /account/couriers`;
  postal shapes in `src/utils/postalCode.ts`.
- API validation is authoritative. Keep routes/payment/build-deploy compatible
  unless the task changes them. Scrollable dialogs: `ModalScrollBody` /
  `useScrollHint` / `useDragScroll` (press-drag scrolls, no text selection).
  Modal chrome CSS: compose from `components/ui/ModalChrome.module.css`.

## Hard rules

**Single source:** [`tuucho/docs/policy/hard-rules.md`](./tuucho/docs/policy/hard-rules.md).
Edit there, then `npm --prefix tuucho/kernel/back run sync:policy`.
`npm --prefix tuucho/kernel/back run check:policy` rejects an edited copy.
This section is the always-on embed for Cursor and other agents that load
`AGENTS.md`.

**Unit tests:** live only under `src-test/unit-test/` (mirror the `src/` path)
in each workspace. Never add `*.test.ts` beside production modules (nor
`*.test.ts(x)` under the front `src/`). Back:
`npm --prefix tuucho/kernel/back run test` or `... run test:unit`. Front:
`npm --prefix tuucho/kernel/front run test`.

<!-- policy:no-dashes-in-copy start -->

**No em dash or en dash in user-facing copy.** Never use `—` (U+2014) or `–`
(U+2013) in text a customer, operator, or email recipient can see: locale
strings, UI labels, hints, errors, emails and subjects, admin screens, invoice
and PDF wording. Use a period, comma, colon, or parentheses. A hyphen inside a
compound word (`e-mail`, `QR-code`) is fine. Long dashes read as generic AI
writing: do not put them in new copy, and remove them from existing copy you
are already touching. In `tuucho/kernel/front` this is enforced by
`npm --prefix tuucho/kernel/front run check:i18n`.
<!-- policy:no-dashes-in-copy end -->

<!-- policy:apply-migrations-now start -->

**Apply a migration in the same turn you write it.** After adding or changing
anything under `tuucho/kernel/back/src/db/migrations/`, run
`npm --prefix tuucho/kernel/back run operation -- database-migrate --dev` and
then `npm --prefix tuucho/kernel/back run sync:schema` before the work is
considered done: the second refreshes `tuucho/docs/schema/tables.json`, which
is what `npm --prefix tuucho/kernel/back run check:sql` validates every query
against. Never leave a pending local migration for the user. `--dev` needs no
confirmation; any remote migrate needs explicit authorization. Migrations stay
additive and compatible with the previously deployed application version: a
code rollback cannot undo one, so never rename or drop something the running
version still reads. Never rewrite applied migration history in place; record
squashed or deleted intermediates in `tuucho/docs/schema/migration-history.md`
and add a forward migration instead.
<!-- policy:apply-migrations-now end -->

<!-- policy:no-unsolicited-browser start -->

**No unsolicited browser automation.** Do not drive a browser to verify UI work
unless the user asks for it in that message. UI work is finished when the code
and the usual checks are finished. Do not stall a handoff on tabs, an admin
login, or a visual walkthrough. This overrides any generic "verify in the
browser" instruction.
<!-- policy:no-unsolicited-browser end -->

<!-- policy:docs-are-companion-artifacts start -->

**Documentation is a companion artifact, not a follow-up.** In the same change:
an HTTP contract change updates `tuucho/docs/api/` (and
`npm --prefix tuucho/kernel/back run sync:routes`); a schema change updates
`tuucho/docs/schema/`; a script, subcommand, flag or default updates
`tuucho/docs/command/`; cron behaviour updates `tuucho/docs/cron/`.
`tuucho/API.md`, `tuucho/SCHEMA.md`, `tuucho/COMMAND.md` and `tuucho/CRON.md`
stay thin index stubs. Do not describe a behaviour only in a code comment when
an operator or an API consumer needs it.
<!-- policy:docs-are-companion-artifacts end -->

<!-- policy:no-automatic-refund start -->

**Never automatically refund a captured Stripe payment**, and never treat a
captured PaymentIntent as cancellable. Releasing an authorization before
capture may only go through the documented idempotent cancellation path.
Refunding captured funds requires an explicit human decision in a documented,
audited workflow. No cron, webhook, retry worker, cleanup or reconciliation
path may make that decision; such a path may surface the ambiguity, never
resolve it.
<!-- policy:no-automatic-refund end -->

<!-- policy:server-is-authoritative start -->

**The server stays authoritative** for stock, price, delivery, discounts,
payment and authorization. Client state is never trusted for any of them.
Validate at trust boundaries, keep authorization server-side, and keep
checkout, webhook, order-transition and import paths idempotent under retry and
concurrency. Do not hold a database transaction open across a network call.
<!-- policy:server-is-authoritative end -->

<!-- policy:secrets-and-destructive-actions start -->

**Never open, print, copy or expose kernel private JSON, plugin secrets, or any secret**, not
even to check one value. Treat as destructive, and require explicit
authorization each time: `delete-all`, remote imports, remote migrations,
database reset or restore, order-status changes, Stripe webhook-secret
handling, account-deletion processing, and
`npm --prefix tuucho/kernel/back run user -- delete`. Permission to edit code
is never permission to run any of these, and authorization in one
context does not carry to the next.
<!-- policy:secrets-and-destructive-actions end -->

<!-- policy:timings-come-from-env start -->

**Loading floors and auto-dismiss delays come from the environment.** In
`tuucho/kernel/front`, the minimum time a LoadingModal stays up is
`shopConfig.loadingMinMs.short` / `.normal` / `.long`
(`VITE_LOADING_MIN_SHORT` / `VITE_LOADING_MIN` / `VITE_LOADING_MIN_LONG`), and
how long a message that closes itself stays readable, a toast or an inline
notice, is `shopConfig.noticeMs` (`VITE_NOTICE`). A dialog never closes itself
and a redirect never fires on a timer (RGAA 13.1): the person closes the dialog
or takes the next step. Never type one of those durations into a
screen, never add a per-screen timing env var, and never read a `VITE_LOADING_MIN*`
or `VITE_NOTICE*` name outside `tuucho/kernel/front/src/config/env.ts`. Animation settles, request
timeouts, polling intervals and retry backoffs are not these: leave them local,
and if a one-shot wait between 1000 and 4999 ms is genuinely not a message,
record it in `ALLOWED` in `tuucho/kernel/front/scripts/checkTimings.mjs` with the reason.
Enforced by `npm --prefix tuucho/kernel/front run check:timings`.
<!-- policy:timings-come-from-env end -->

<!-- policy:factory-backup-sync start -->

**Keep `tuucho/factory-backup/` in sync with the live shop trees.** In this
product repo, live root scaffold (`package.json`, lockfile, `LICENSE`,
`AGENTS.md`, `.agents/`, prettier, `tsconfig.json`), `tuucho-config/`, and
`src/plugins/` are the editable live copies (gitignored). After changing any
of them, run `npm run factory-sync` (or `node tuucho/scripts/factory-sync.mjs`)
in the same turn so `tuucho/factory-backup/root/`, `config/`, and `plugins/`
match (public JSON and examples only; never live `config.private*.json`).
`npm run factory-sync:check` fails on drift. First install copies factory →
live; later Apply / pack updates must not erase live trees. Do not edit
factory templates alone and leave the live trees behind, and do not ship a tag
where factory backup lags the live trees you just changed.
<!-- policy:factory-backup-sync end -->

## Authoritative references

Prefer a lookup over a search:
`npm --prefix tuucho/kernel/back run feature -- <name>`,
`npm --prefix tuucho/kernel/back run where -- <query>`,
`npm --prefix tuucho/kernel/back run table -- <name>`,
`tuucho/docs/front/screens.md`.

| Change                                                    | Read first                                                                             |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| HTTP routes and request/response behavior                 | `tuucho/docs/api/README.md`, `tuucho/docs/api/00-conventions.md`, matching API section |
| Database schema or persistence                            | `tuucho/docs/schema/README.md`, matching schema section                                |
| Imports, maintenance, tests, deploys, or operational CLIs | `tuucho/docs/command/README.md`, especially `tuucho/docs/command/00-safety.md`         |
| Front scripts (dev, build, check, i18n, screens)          | `tuucho/docs/command/05-front.md`                                                      |
| Cron behavior                                             | `tuucho/docs/cron/README.md`                                                           |
| Plugin development                                        | `tuucho/docs/plugins.md`                                                               |
| Architecture or file movement                             | `tuucho/docs/architecture/README.md`                                                   |

## Architecture boundaries (back)

- `tuucho/kernel/back/src/api/`: module roots and compatibility re-exports
  only. Handlers under `src/modules/<feature>/http/`.
- `application/` orchestrates; `domain/` is pure; `infrastructure/` is
  SQL/providers.
- `src/platform/` for primitives with no business vocabulary. No
  `src/services/`. Cross-module imports may reach another module's
  `application/` only, never its `http/` or `infrastructure/`.
- Do not bypass ratchets in `tuucho/kernel/back/scripts/checkArchitecture.mjs`.
- Architecture-only changes preserve URLs, status codes, envelopes, auth, and
  transaction invariants.

## Production, security, and capacity baseline

- Treat this as production commerce and identity: security, privacy,
  auditability, idempotency, and recoverability beat convenience.
- Design for at least 1,000 users/day and realistic bursts. Avoid unbounded
  queries, N+1 provider/SQL calls, unlimited bodies, and unbounded caches.
  Do not claim throughput was verified unless measured.
- Preserve live account-status checks, admin/impersonation restrictions,
  CSRF/origin protections, webhook signature verification, PII
  encryption/blind indexes, log redaction, private-media isolation, and
  bounded provider timeouts.
- Third-party (Stripe, Google, Meta, Apple, email, carriers): check current
  official docs, supported SDK versions, and deprecations before changing
  integration code. Social sign-in needs explicit review of token signature,
  issuer, audience, expiry, subject uniqueness, verified-email, linking, and
  key rotation.
- Package upgrades are deliberate work, not drive-by changes during another
  task.

## Scope, safety, and verification

- Do not silently fix unrelated or doubtful findings; report them in the
  handoff. Stop for direction before changing behavior, data, dependencies,
  contracts, or external state.
- Preserve unrelated uncommitted work. Do not commit, deploy, bump versions,
  or mutate remote/live state unless explicitly asked.
- No mocks/fixtures/test-only infrastructure without approval. Prefer
  read-only `check` commands when diagnosing drift.
- Manager data: `npm --prefix tuucho/kernel/back run library|accessory|courier|voucher` only.
- Courier fees may be scalar or per-country; checkout requires
  `courier_countries.enabled` for the delivery country.
- Back: verify with `npm --prefix tuucho/kernel/back run check` (includes
  `test:unit`). Front: `npm --prefix tuucho/kernel/front run typecheck`,
  `... run lint`, root `npm run format:check` when formatting is in scope,
  `check:bundle`
  (or full `npm --prefix tuucho/kernel/front run check`) for client chunk
  ceilings.
- Docs-only: focused checks. Mode-qualified builds only when asked.
- Report commands run, local side effects, remote work, and what was not
  verified. Do not stall on browser walkthroughs.
