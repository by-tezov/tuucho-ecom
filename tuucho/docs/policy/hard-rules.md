# Hard rules

Single source for always-on agent policy. Edit rules here, then run
`npm --prefix tuucho/kernel/back run sync:policy`. Embeds in `AGENTS.md` (and
any listed consumers) are rewritten from these blocks. Do not edit embeds by
hand.

## Consumers

| Path | Why |
| --- | --- |
| Root `AGENTS.md` | Always-on Cursor / agent policy for this repo |
| `.agents/skills/**/*.md` | Skill files that embed a subset of rules |
| `.cursor/rules/*.mdc` | Optional Cursor rules that embed a subset |

## Rules

<!-- policy:no-dashes-in-copy source -->
**No em dash or en dash in user-facing copy.** Never use `—` (U+2014) or `–`
(U+2013) in text a customer, operator, or email recipient can see: locale
strings, UI labels, hints, errors, emails and subjects, admin screens, invoice
and PDF wording. Use a period, comma, colon, or parentheses. A hyphen inside a
compound word (`e-mail`, `QR-code`) is fine. Long dashes read as generic AI
writing: do not put them in new copy, and remove them from existing copy you
are already touching. In `tuucho/kernel/front` this is enforced by
`npm --prefix tuucho/kernel/front run check:i18n`.
<!-- policy:no-dashes-in-copy end-source -->

<!-- policy:apply-migrations-now source -->
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
<!-- policy:apply-migrations-now end-source -->

<!-- policy:no-unsolicited-browser source -->
**No unsolicited browser automation.** Do not drive a browser to verify UI work
unless the user asks for it in that message. UI work is finished when the code
and the usual checks are finished. Do not stall a handoff on tabs, an admin
login, or a visual walkthrough. This overrides any generic "verify in the
browser" instruction.
<!-- policy:no-unsolicited-browser end-source -->

<!-- policy:docs-are-companion-artifacts source -->
**Documentation is a companion artifact, not a follow-up.** In the same change:
an HTTP contract change updates `tuucho/docs/api/` (and
`npm --prefix tuucho/kernel/back run sync:routes`); a schema change updates
`tuucho/docs/schema/`; a script, subcommand, flag or default updates
`tuucho/docs/command/`; cron behaviour updates `tuucho/docs/cron/`.
`tuucho/API.md`, `tuucho/SCHEMA.md`, `tuucho/COMMAND.md` and `tuucho/CRON.md`
stay thin index stubs. Do not describe a behaviour only in a code comment when
an operator or an API consumer needs it.
<!-- policy:docs-are-companion-artifacts end-source -->

<!-- policy:no-automatic-refund source -->
**Never automatically refund a captured Stripe payment**, and never treat a
captured PaymentIntent as cancellable. Releasing an authorization before
capture may only go through the documented idempotent cancellation path.
Refunding captured funds requires an explicit human decision in a documented,
audited workflow. No cron, webhook, retry worker, cleanup or reconciliation
path may make that decision; such a path may surface the ambiguity, never
resolve it.
<!-- policy:no-automatic-refund end-source -->

<!-- policy:server-is-authoritative source -->
**The server stays authoritative** for stock, price, delivery, discounts,
payment and authorization. Client state is never trusted for any of them.
Validate at trust boundaries, keep authorization server-side, and keep
checkout, webhook, order-transition and import paths idempotent under retry and
concurrency. Do not hold a database transaction open across a network call.
<!-- policy:server-is-authoritative end-source -->

<!-- policy:secrets-and-destructive-actions source -->
**Never open, print, copy or expose kernel private JSON, plugin secrets, or any secret**, not
even to check one value. Treat as destructive, and require explicit
authorization each time: `delete-all`, remote imports, remote migrations,
database reset or restore, order-status changes, Stripe webhook-secret
handling, account-deletion processing, and
`npm --prefix tuucho/kernel/back run user -- delete`. Permission to edit code
is never permission to run any of these, and authorization in one
context does not carry to the next.
<!-- policy:secrets-and-destructive-actions end-source -->

<!-- policy:timings-come-from-env source -->
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
<!-- policy:timings-come-from-env end-source -->

<!-- policy:factory-backup-sync source -->
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
<!-- policy:factory-backup-sync end-source -->
