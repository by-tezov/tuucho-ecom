---
name: tuucho-feature-new
description: Start a new Shop capability end to end - a new backend module with its HTTP surface, schema migration, documentation, feature-map entry, front API client and route, and tests. Use it when a task introduces a capability that does not exist yet, rather than changing one that does. For changing existing behaviour use tuucho-backend-change or tuucho-frontend-change instead.
---

# New Tuucho feature

A new capability spans both workspaces and about a dozen conventions. Most of
the cost of getting it wrong is invisible until review, so this orders the work
so that every machine check that can catch a mistake runs before the feature is
finished.

Repository-root `AGENTS.md` remains the authoritative policy. This skill adds
sequence, not permission.

## Before scaffolding

1. Confirm the capability is genuinely new. Run `npm --prefix tuucho/kernel/back run feature` and read the
   list; if an existing feature owns this behaviour, use
   `tuucho-backend-change` instead and extend it there.
2. Run `npm --prefix tuucho/kernel/back run feature -- <nearest-existing-feature>` and read how a
   comparable capability is laid out. Reuse its shape.
3. Decide the surface: public API (`tuucho/kernel/back/src/app.ts`), or loopback-only
   operations (`tuucho/kernel/back/src/opsRoutes.ts`). They are deliberately separate and `app.ts` must never
   mount `/operation/*`.
4. Decide what the server must stay authoritative for: stock, price, delivery,
   payment, authorization. The front may never be the decider.

## Scaffold

```bash
npm --prefix tuucho/kernel/back run scaffold -- <feature-name> --dry-run   # see what it would create
npm --prefix tuucho/kernel/back run scaffold -- <feature-name>
```

It writes the four backend layers, a router, the module-root re-export, a
dated migration stub, a domain test, and a front API client. It never
overwrites an existing file.

## Then, in this order

The order matters: each step turns on a check that guards the next one.

1. **Domain first.** Put the real rules in `domain/`, with no Express, `pg`,
   filesystem, provider SDK or global config. Write the tests beside them and
   run `npm --prefix tuucho/kernel/back run test:unit`. This is the cheapest place to be wrong.
2. **Migration.** Write the body, keep it additive and compatible with the
   previously deployed version, then apply it immediately:
   `npm --prefix tuucho/kernel/back run operation -- database-migrate --dev`.
   Never leave a pending local migration. Update `tuucho/docs/schema/`.
3. **Infrastructure, then application.** SQL in `infrastructure/`, workflow and
   transaction boundaries in `application/`. Do not hold a transaction open
   across a network call. Keep checkout, webhook and import paths idempotent
   under retry and concurrency.
4. **HTTP.** Parse and validate at the boundary, map errors to
   `{ error: { code } }` per `tuucho/docs/api/00-conventions.md`, and bound every
   input: page size, body size, uploads, list lengths.
5. **Mount it** in `tuucho/kernel/back/src/app.ts` or `src/opsRoutes.ts`, then:
   `npm --prefix tuucho/kernel/back run sync:routes`.
6. **Document every route** in `tuucho/docs/api/`.
   `npm --prefix tuucho/kernel/back run check:routes` fails until
   each one is named there, and fails again if you later remove a route and
   leave the documentation behind.
7. **Feature map.** Add the entry to `tuucho/docs/features.json`, including
   `frontApi`, `frontComponents`, `i18n` and `commands`.
   `npm --prefix tuucho/kernel/back run check:docs` verifies every pointer exists.
8. **Front.** Add the route and components. Every customer-visible string goes
   through `npm --prefix tuucho/kernel/front run i18n -- add <key> "<french>"`,
   which edits the type and all seven locales together. French is the source
   language; no em dash or en dash in copy.
9. **Verify.**

```bash
npm --prefix tuucho/kernel/back run check      # back: types, architecture, docs, routes, lint, unit tests
npm --prefix tuucho/kernel/front run lint      # front: theme, architecture, i18n, api contract
npm --prefix tuucho/kernel/front run typecheck
npm --prefix tuucho/kernel/back run test       # unit tests under src-test/unit-test/
```

## What the checks will not tell you

- Whether the transaction boundary is in the right place.
- Whether the path stays correct under concurrent retries.
- Whether a captured Stripe payment could be refunded automatically. It must
  not be: no cron, webhook, retry or cleanup path may make that decision.
- Whether an unbounded query will still be fine at 1,000 users a day.

Review those by reading the code, and report anything you could not verify.
