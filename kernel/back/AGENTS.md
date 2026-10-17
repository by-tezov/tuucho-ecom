# Tuucho back-end guidance

## Repository ownership

- This repository owns the PostgreSQL schema, JSON API, authentication,
  checkout and Stripe integration, shipping labels/tracking, vouchers,
  invoices, and API-side business validation.
- `../front` consumes the public API. A contract change updates the
  matching `docs/api/` section and the front caller in the same task when
  required.
- `catalog import tree` owns source catalogue data, courier definitions, and
  gitignored voucher/order archives. Import through documented commands only;
  never depend on the manager at runtime.

For implementation work, use `.agents/skills/tuucho-backend-change/SKILL.md`
(or `tuucho-frontend-change` / `tuucho-feature-new` when those apply).

## Keep contracts and documentation synchronized

| Changed artifact or behavior                                                         | Required companion update/check                                                                                                                                                                         |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public/admin/operations HTTP path, input, output, status, error, auth, or limit      | Update the matching `docs/api/` section; inspect and update `../front` when it consumes the contract.                                                                                          |
| PostgreSQL table, column, constraint, index, retention, or stored meaning            | Add a migration under `src/db/migrations/`; update the matching `docs/schema/` section; immediately apply it on local/dev, then `npm run sync:schema`.                                                  |
| Package script, CLI command/subcommand, option, default, target rule, or side effect | Update the matching `docs/command/` section and examples; keep `npm run check:docs` passing.                                                                                                            |
| Cron schedule, eligibility, state transition, preference, log, or deploy switch      | Update `docs/cron/README.md` and the relevant operations API/command documentation.                                                                                                                     |
| Source ownership, module boundary, compatibility facade, or size rule                | Update `docs/architecture/README.md` and `scripts/checkArchitecture.mjs` when the enforceable rule changes.                                                                                             |
| Catalogue/courier/voucher import shape                                               | Update operations API and command docs; verify the relevant `catalog import tree` source contract.                                                                                                      |
| Environment variable                                                                 | Update the relevant README/command/cron documentation and safe public env examples; never expose private values.                                                                                        |
| Dependency, SDK, provider API version, or runtime requirement                        | Update `package.json` and its lockfile together; check current official migration/deprecation/security guidance; update affected API/command docs. Do not opportunistically upgrade unrelated packages. |

Root `API.md`, `SCHEMA.md`, `COMMAND.md`, and `CRON.md` remain index stubs.
Feature map: [`docs/features.json`](./docs/features.json).

## Hard rules

**Single source:** [`docs/policy/hard-rules.md`](./docs/policy/hard-rules.md).
Edit there, then `npm run sync:policy`. `npm run check:policy` rejects an
edited copy. This section is the always-on embed for Cursor and for agents that
load `AGENTS.md`. `CLAUDE.md` must not re-embed these rules.

**Unit tests:** live only under `src-test/unit-test/` (mirror the `src/` path).
Never add `*.test.ts` beside production modules. Per-repo: `npm run test` or
`npm run test:unit`. Front: `npm --prefix ../front run test`.

<!-- policy:no-dashes-in-copy start -->

**No em dash or en dash in user-facing copy.** Never use `—` (U+2014) or `–`
(U+2013) in text a customer, operator, or email recipient can see: locale
strings, UI labels, hints, errors, emails and subjects, admin screens, invoice
and PDF wording. Use a period, comma, colon, or parentheses. A hyphen inside a
compound word (`e-mail`, `QR-code`) is fine. Long dashes read as generic AI
writing: do not put them in new copy, and remove them from existing copy you
are already touching. In `../front` this is enforced by
`npm --prefix ../front run check:i18n`.
<!-- policy:no-dashes-in-copy end -->

<!-- policy:apply-migrations-now start -->

**Apply a migration in the same turn you write it.** After adding or changing
anything under `src/db/migrations/`, run
`npm run operation -- database-migrate --dev` and then `npm run sync:schema`
before the work is considered done: the second refreshes
`docs/schema/tables.json`, which is what `npm run check:sql` validates every
query against. Never leave a pending local migration for the user. `--dev` needs no
confirmation; any remote migrate needs explicit authorization. Migrations stay
additive and compatible with the previously deployed application version: a
code rollback cannot undo one, so never rename or drop something the running
version still reads. Never rewrite applied migration history in place; record
squashed or deleted intermediates in `docs/schema/migration-history.md` and add
a forward migration instead.
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
an HTTP contract change updates `docs/api/` (and `npm run sync:routes`); a
schema change updates `docs/schema/`; a script, subcommand, flag or default
updates `docs/command/`; cron behaviour updates `docs/cron/`. Root `API.md`,
`SCHEMA.md`, `COMMAND.md` and `CRON.md` stay thin index stubs. Do not describe
a behaviour only in a code comment when an operator or an API consumer needs
it.
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

**Never open, print, copy or expose a `.private.env` file or any secret**, not
even to check one value. Treat as destructive, and require explicit
authorization each time: `delete-all`, remote imports, remote migrations,
database reset or restore, order-status changes, Stripe webhook-secret
handling, account-deletion processing, and `npm run user -- delete`. Permission
to edit code is never permission to run any of these, and authorization in one
context does not carry to the next.
<!-- policy:secrets-and-destructive-actions end -->

<!-- policy:timings-come-from-env start -->

**Loading floors and auto-dismiss delays come from the environment.** In
`../front`, the minimum time a LoadingModal stays up is
`shopConfig.loadingMinMs.short` / `.normal` / `.long`
(`VITE_LOADING_MIN_SHORT` / `VITE_LOADING_MIN` / `VITE_LOADING_MIN_LONG`), and
how long a message that closes itself stays readable, a toast or an inline
notice, is `shopConfig.noticeMs` (`VITE_NOTICE`). A dialog never closes itself
and a redirect never fires on a timer (RGAA 13.1): the person closes the dialog
or takes the next step. Never type one of those durations into a
screen, never add a per-screen timing env var, and never read a `VITE_LOADING_MIN*`
or `VITE_NOTICE*` name outside `src/config/env.ts`. Animation settles, request
timeouts, polling intervals and retry backoffs are not these: leave them local,
and if a one-shot wait between 1000 and 4999 ms is genuinely not a message,
record it in `ALLOWED` in `scripts/checkTimings.mjs` with the reason. Enforced
by `npm --prefix ../front run check:timings`.
<!-- policy:timings-come-from-env end -->

## Authoritative references

Prefer a lookup over a search: `npm run feature -- <name>`,
`npm run where -- <query>`, `npm run table -- <name>`,
`../front/docs/screens.md`.

| Change                                                    | Read first                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------------ |
| HTTP routes and request/response behavior                 | `docs/api/README.md`, `docs/api/00-conventions.md`, matching API section |
| Database schema or persistence                            | `docs/schema/README.md`, matching schema section                         |
| Imports, maintenance, tests, deploys, or operational CLIs | `docs/command/README.md`, especially `docs/command/00-safety.md`         |
| Cron behavior                                             | `docs/cron/README.md`                                                    |
| Architecture or file movement                             | `docs/architecture/README.md`                                            |

## Architecture boundaries

- `src/api/`: module roots and compatibility re-exports only. Handlers
  under `src/modules/<feature>/http/`.
- `application/` orchestrates; `domain/` is pure; `infrastructure/` is
  SQL/providers.
- `src/platform/` for primitives with no business vocabulary. No
  `src/services/`. Cross-module imports may reach another module's
  `application/` only, never its `http/` or `infrastructure/`.
- Do not bypass ratchets in `scripts/checkArchitecture.mjs`.
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
- Manager data: `npm run library|accessory|courier|voucher` only.
- Courier fees may be scalar or per-country; checkout requires
  `courier_countries.enabled` for the delivery country.
- Verify with `npm run check` (includes `test:unit`).
- Report commands run, local side effects, remote work, and what was not
  verified. Do not stall on browser walkthroughs.
