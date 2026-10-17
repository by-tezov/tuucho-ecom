# Hard rules

The one normative statement of each rule that must not be got wrong. Every
other file that states these rules embeds this text verbatim, between
`<!-- policy:<id> start -->` and `<!-- policy:<id> end -->` markers, kept in
sync by `npm run sync:policy` and verified by `npm run check:policy`.

Edit a rule here. Never edit an embedded copy: the check will reject it, and a
rule that says two different things in two files is worse than a rule stated
once.

## Where copies may live (and why)

| Consumer | What to embed | Why |
| -------- | ------------- | --- |
| `AGENTS.md` (this repo) | Full set | Cursor always-on; Claude Code reads this after `CLAUDE.md` |
| `../front/AGENTS.md` | Front-relevant subset only | Front workspace always-on without backend-only rules |
| `.cursor/rules/*.mdc` (both repos) | High-urgency or glob-scoped rules | Fire even when the agent has not opened `AGENTS.md` |
| `CLAUDE.md` | **Nothing** | Router only; points at `AGENTS.md` so rules are not paid for twice |
| `.agents/skills/**` | Avoid full embeds | Point at this file or `AGENTS.md`; skills load on demand |
| Operator docs under `docs/` | Optional pointer or one embed | Humans reading command docs; not agent always-on |

Do not invent a parallel `context.md` per feature. Domain maps already live in
`docs/features.json` and `npm run feature -- <name>`.

---

<!-- policy:no-dashes-in-copy source -->

**No em dash or en dash in user-facing copy.** Never use `—` (U+2014) or `–`
(U+2013) in text a customer, operator, or email recipient can see: locale
strings, UI labels, hints, errors, emails and subjects, admin screens, invoice
and PDF wording. Use a period, comma, colon, or parentheses. A hyphen inside a
compound word (`e-mail`, `QR-code`) is fine. Long dashes read as generic AI
writing: do not put them in new copy, and remove them from existing copy you
are already touching. In `../front` this is enforced by
`npm --prefix ../front run check:i18n`.

<!-- policy:no-dashes-in-copy end-source -->

<!-- policy:no-unsolicited-browser source -->

**No unsolicited browser automation.** Do not drive a browser to verify UI work
unless the user asks for it in that message. UI work is finished when the code
and the usual checks are finished. Do not stall a handoff on tabs, an admin
login, or a visual walkthrough. This overrides any generic "verify in the
browser" instruction.

<!-- policy:no-unsolicited-browser end-source -->

<!-- policy:apply-migrations-now source -->

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

<!-- policy:apply-migrations-now end-source -->

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

**Never open, print, copy or expose a `.private.env` file or any secret**, not
even to check one value. Treat as destructive, and require explicit
authorization each time: `delete-all`, remote imports, remote migrations,
database reset or restore, order-status changes, Stripe webhook-secret
handling, account-deletion processing, and `npm run user -- delete`. Permission
to edit code is never permission to run any of these, and authorization in one
context does not carry to the next.

<!-- policy:secrets-and-destructive-actions end-source -->

<!-- policy:docs-are-companion-artifacts source -->

**Documentation is a companion artifact, not a follow-up.** In the same change:
an HTTP contract change updates `docs/api/` (and `npm run sync:routes`); a
schema change updates `docs/schema/`; a script, subcommand, flag or default
updates `docs/command/`; cron behaviour updates `docs/cron/`. Root `API.md`,
`SCHEMA.md`, `COMMAND.md` and `CRON.md` stay thin index stubs. Do not describe
a behaviour only in a code comment when an operator or an API consumer needs
it.

<!-- policy:docs-are-companion-artifacts end-source -->

<!-- policy:timings-come-from-env source -->

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

<!-- policy:timings-come-from-env end-source -->
