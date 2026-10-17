---
name: tuucho-backend-change
description: Plan, implement, review, or refactor changes in the Shop backend, including API routes, modules, legacy services, middleware/media, PostgreSQL schema, imports, operational CLIs, checkout/Stripe, social sign-in, crons, dependencies, and project documentation. Use it to choose the owning layer, required companion documentation, adjacent repository checks, production/security/capacity constraints, safety gates, and proportional verification. Do not use it for unrelated generic programming or conceptual provider questions outside this repository.
---

# Tuucho backend change

Treat the repository-root `AGENTS.md` as the authoritative always-on policy.
This skill adds a practical routing workflow; it does not grant permission for
remote, destructive, secret-reading, dependency-upgrade, or out-of-scope
actions.

## Route the task before editing

1. Inspect `git status --short` and preserve unrelated work.
2. Locate the existing path with `rg`: start at the module facade or
   public symbol, then follow it into the owning feature module.
3. Classify the change with the table below and read the listed references.
4. State any assumption that could alter the public contract, persistence,
   payment behavior, capacity, security, dependencies, or target environment.

| Change kind                                       | Required reading                                                                        | Also inspect                                                                                                                |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| API endpoint, validation, envelope, authorization | `docs/api/00-conventions.md` and matching `docs/api/` section                           | Relevant caller under `../front` when the contract may change                                                      |
| Schema, query semantics, retention, encryption    | `npm run table -- <name>` first, then the matching `docs/schema/` section               | Migrations, indexes, query bounds, and application versions that coexist during deploy                                      |
| Catalogue/courier/voucher import                  | `docs/command/00-safety.md`, `docs/command/02-imports.md`, matching operations API docs | Relevant source shape under `catalog import tree`                                                                           |
| Orders, checkout, Stripe, vouchers, loyalty       | Account/guest/admin API docs and `docs/schema/03-pricing-cart-orders.md`                | Transactions, idempotency markers, immutable snapshots, explicit human refund decisions, front checkout expectations        |
| Authentication or social account connection       | `docs/api/02-auth.md`, account security API docs, account schema                        | Current official Google/Meta/Apple docs, JWT/OAuth validation, provider key rotation, linking conflicts, deletion callbacks |
| Operational CLI, backup, deploy, maintenance      | `docs/command/README.md` and matching command section                                   | Whether the requested target/action is read-only, local-writing, remote-writing, or destructive                             |
| Cron or background processing                     | `docs/cron/README.md` and matching operations API docs                                  | Deployment switches, runtime preferences, batching, idempotency, and prohibited automatic payment decisions                 |
| Dependency, SDK, or provider API update           | Official current release, security, migration, and deprecation guidance                 | `package.json`, lockfile, runtime compatibility, affected docs/tests; never widen into unrelated upgrades                   |
| Architecture/refactor                             | `docs/architecture/README.md`                                                           | Compatibility imports, architecture ratchets, and public behavior before/after                                              |
| Documentation-only                                | Relevant documentation index                                                            | `npm run check:docs` expectations and links                                                                                 |

## Keep companion artifacts synchronized

Before implementation, write down the required companion work:

- API behavior → matching `docs/api/`; front-end caller when consumed.
- Schema/stored meaning → migration, matching `docs/schema/`, immediate local
  migration.
- CLI/package script/flag/default/side effect → matching `docs/command/`.
- Cron behavior/schedule/preference/log → `docs/cron/` plus operations docs.
- Import shape → operations API/command docs plus manager contract.
- Module ownership/ratchet → architecture docs and architecture guard.
- Dependency/provider contract → package manifest and lockfile together,
  official deprecation/security review, affected project docs.

Do not postpone documentation as a follow-up when the behavior changes now.
Root documentation stubs remain indexes.

## Choose the owning code layer

- `src/api/`: assemble routers or preserve compatibility exports only.
- `src/modules/<feature>/http/`: Express parsing, route-specific guards, and
  response mapping.
- `src/modules/<feature>/application/`: workflows, transactions, and provider
  orchestration.
- `src/modules/<feature>/domain/`: pure invariants, value types, and state
  transitions with no Express, SQL, filesystem, provider SDK, or global config.
- `src/modules/<feature>/infrastructure/`: SQL repositories and feature-owned
  external adapters.
- `src/platform/`: generic mechanisms with no Shop business vocabulary.
- `src/middleware/`: reusable cross-route HTTP policy.
- `src/media/`: media policy, naming, processing, and storage as focused units.
- `src/services/` is gone. Do not recreate it. Shared behaviour goes in the
  owning module's `application/`; a generic mechanism with no business
  vocabulary goes in `src/platform/`.

Keep a complete transactional invariant together. Split by responsibility,
not merely to reduce line count. Do not create forwarding layers that add no
ownership or abstraction value.

## Apply the production baseline

Treat 1,000 users/day plus bursts as the minimum design floor, not as proof of
measured capacity. For each changed hot path, check:

- bounded input, pagination/batching, query/index shape, and absence of N+1;
- bounded concurrency, memory/cache growth, timeouts, retries, and rate limits;
- idempotency and race behavior across processes;
- sensitive-data storage, redaction, private media, and authorization;
- failure recovery without silently losing payment/order/import state.

Preserve server authority for stock, price, delivery, discounts, payment, and
authorization. Keep immutable order/checkout snapshots and PII encryption/
blind-index behavior.

Never automatically refund captured Stripe funds, and never cancel a captured
PaymentIntent. Only an explicit, documented, audited human/admin workflow may
choose a refund. Pre-capture authorization release must use the existing
idempotent cancellation path. Background jobs and webhook recovery may detect
or surface ambiguity; they must not make the financial decision.

For social sign-in/linking changes, verify current official provider behavior
and review signature/issuer/audience/expiry, state or nonce where applicable,
provider subject uniqueness, verified-email semantics, linking/unlinking
conflicts, account status, deletion callbacks, and signing-key rotation. Do
not assume an SDK's current defaults or a provider's API lifetime from memory.

## Handle doubt and scope explicitly

When investigation reveals an unrelated or ambiguous problem, do not silently
fix it. Capture evidence and report its location, impact/severity, confidence,
and recommended follow-up. Ask before expanding scope when a fix would change
behavior, data, dependencies, contracts, or external state.

Report deprecated dependencies/provider behavior discovered during other work;
do not upgrade or migrate them opportunistically unless the user includes that
work in scope.

## Handle persistence and operations safely

For a schema change, add and document the migration, then immediately run:

```bash
npm run operation -- database-migrate --dev
npm run sync:schema
```

The second refreshes `docs/schema/tables.json`. `npm run check:schema` fails
without it, and `npm run check:sql` validates every query in `src/` against it,
which is the only thing that catches a renamed column before production.

Do not substitute direct database edits for supported operations/import CLIs.
Do not infer permission for `--preprod`, `--prod`, resets, restores, deletes,
status changes, refunds, or secret rotation from permission to edit code.

For data-drift diagnosis, use the relevant read-only `check`, list, preview,
or health command before proposing a writing command.

## Verify proportionally

For relevant TypeScript changes, run:

```bash
npm run check
```

Pure logic changes also belong under `src-test/unit-test/` (never colocated
under `src/`). Prefer `npm run test` or `npm run test:unit` when iterating
on one repo.

Before handoff, confirm compatibility imports resolve, companion documentation
matches the result, and `git diff --check` is clean. Report every meaningful
command and side effect, disposable database migrations/imports, started
containers, dependency/deprecation findings, doubtful out-of-scope issues,
and environment-dependent paths not exercised locally.
