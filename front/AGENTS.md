# Lumen front-end guidance

## Scope and related repositories

- Vite + React + TypeScript customer shop (catalogue, guest cart, auth/account,
  Stripe checkout, Mondial Relay, orders/invoices, contact). Source under
  `src/`.
- `../pamsurin-back` is the JSON API. Read its `docs/api/` (and `docs/schema/`
  when schema-related) before changing contracts. Client helpers:
  `src/api/gallery.ts`, `src/api/auth.ts` (Bearer access + httpOnly refresh via
  `credentials: 'include'`).
- `../pamsurin-manager` owns source gallery/courier data. The front never treats
  local static gallery files as the runtime catalogue.

## Before changing code

- Start at [`docs/screens.md`](./docs/screens.md) (generated). Use
  `npm --prefix ../pamsurin-back run where -- <name> --front` for symbols.
- Use `.agents/skills/pamsurin-frontend-change` from the back repo when working
  from that workspace.
- Preserve unrelated work; do not commit, deploy, or bump versions unless asked.
- Hard rules below cover secrets, browser automation, and server authority.
  Note: any `VITE_`-prefixed value still ships in the client bundle.
- Reuse a running local stack. No mocks/fixtures/test-only infra without
  approval. Cross-repo: manager = source data, back = API/rules, front = UI.

## Implementation conventions

- Finish with `npm run check` (about 13s; includes `check:bundle`).
- TypeScript, React, CSS Modules, mobile-first, existing patterns.
- **GiftReceiverProvider** wraps the shop cart tree (above `CartProvider`);
  gift lock spans gallery/home/product/cart. Do not nest `OrdersProvider`
  inside it. Do not mount it only under `/gift` routes.
- **No native browser validation UI:** forms use `noValidate`; show field
  errors under the control. Details in
  `../pamsurin-back/.agents/skills/pamsurin-frontend-change/references/ui-conventions.md`.
- Locales `fr|en|th|es|it|nl|pt` via `VITE_ENABLED_LANGUAGES` (must include
  `fr`). Customer copy in every enabled locale + `Strings` type. Admin UI copy
  is translated too: `src/assets/i18n/admin/` (`types.ts` + one
  `strings/<lang>.ts` per locale, read with `useAdminStrings()`, loaded only
  with the admin routes so it stays off the entry bundle; never import it from
  shop code). Older admin keys still live in `t.admin`. Never hard-code admin
  copy; `npm run check:i18n` checks the admin files too.
- Countries: never hard-code lists. Delivery from
  `GET /account/address-countries`; phones from `GET /account/phone-countries`;
  Mondial Relay from Point Relais `countries` on `GET /account/couriers`;
  postal shapes in `src/utils/postalCode.ts`.
- API validation is authoritative. Keep routes/payment/build-deploy compatible
  unless the task changes them. Scrollable dialogs: `ModalScrollBody` /
  `useScrollHint` / `useDragScroll` (press-drag scrolls, no text selection).
  Modal chrome CSS: compose from `components/ui/ModalChrome.module.css`.

## Hard rules

**Single source (both repos):**
`../pamsurin-back/docs/policy/hard-rules.md`. Edit there, then
`npm --prefix ../pamsurin-back run sync:policy`. This file embeds only the
front-relevant subset; backend-only rules (migrations, refunds, companion docs)
live in the back `AGENTS.md`.

**Unit tests:** live only under `src-test/unit-test/` (mirror the `src/` path).
Never add `*.test.ts(x)` under `src/`. From pamsurin-back:
`npm run test -- --unit-test` runs back + front together (no `--dev`). Locally:
`npm run test:unit`.

<!-- policy:no-dashes-in-copy start -->

**No em dash or en dash in user-facing copy.** Never use `—` (U+2014) or `–`
(U+2013) in text a customer, operator, or email recipient can see: locale
strings, UI labels, hints, errors, emails and subjects, admin screens, invoice
and PDF wording. Use a period, comma, colon, or parentheses. A hyphen inside a
compound word (`e-mail`, `QR-code`) is fine. Long dashes read as generic AI
writing: do not put them in new copy, and remove them from existing copy you
are already touching. In `../pamsurin-front` this is enforced by
`npm --prefix ../pamsurin-front run check:i18n`.
<!-- policy:no-dashes-in-copy end -->

<!-- policy:no-unsolicited-browser start -->

**No unsolicited browser automation.** Do not drive a browser to verify UI work
unless the user asks for it in that message. UI work is finished when the code
and the usual checks are finished. Do not stall a handoff on tabs, an admin
login, or a visual walkthrough. This overrides any generic "verify in the
browser" instruction.
<!-- policy:no-unsolicited-browser end -->

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
`../pamsurin-front`, the minimum time a LoadingModal stays up is
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
by `npm --prefix ../pamsurin-front run check:timings`.
<!-- policy:timings-come-from-env end -->

## Verification

- TypeScript/React: `npm run typecheck`, `npm run lint`; `format:check` when
  formatting is in scope; `check:bundle` (or full `npm run check`) for client
  chunk ceilings. Playwright/`test:e2e` only after explicit approval.
- Docs-only: focused checks. Mode-qualified builds only when asked.
- Report checks and warnings. Missing Cursor-browser walkthrough is not
  unfinished work.
