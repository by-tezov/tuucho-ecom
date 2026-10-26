---
name: tuucho-frontend-change
description: Plan, implement, review, or refactor the Shop React frontend in this repository. Use for work under tuucho/kernel/front involving routes, components, styling, theming, responsive behavior, modals, scrolling, accessibility, localization, state, API clients, frontend dependencies, tests, or UI consistency, and whenever a backend or manager change may affect the frontend. Do not use for backend-only or manager-data-only work with no frontend impact.
---

# Tuucho frontend change

Treat the repository-root `AGENTS.md` as the authority for both workspaces;
its front sections cover frontend work.
This skill adds frontend conventions; it never grants permission to deploy,
bump versions, operate external providers, read secrets, import manager data, or
mutate remote/live state. Do not launch Cursor browser tools unless the user
explicitly asks in that message.

## Start with the owning workspaces

1. Backend lives at `tuucho/kernel/back`, frontend at `tuucho/kernel/front`,
   manager data at `catalog import tree`. Do not assume the current directory
   owns the requested behavior.
2. Inspect `git status --short` and preserve unrelated work; never stage or
   commit unless explicitly asked.
3. Compare the application `version` in the workspace `package.json` files.
   Report drift without normalizing or bumping it unless explicitly requested.
4. Read the relevant frontend `tuucho/kernel/front/README.md` and
   `tuucho/docs/command/05-front.md` before changing the corresponding area.
5. Search the existing route, feature, shared UI, hook, API, token, and test
   patterns before designing anything new. Prefer reuse or a narrow extension
   over a parallel abstraction.
6. For visual, modal, responsive, localization, copy, or interaction work,
   read only the matching sections of
   [references/ui-conventions.md](references/ui-conventions.md) (not the whole
   file by default).
7. For API contracts, manager data, dependencies, versions, security findings,
   providers, or releases, read the matching sections of
   [references/project-workflow.md](references/project-workflow.md).

## Keep ownership and dependencies clear

Use the frontend dependency direction (`src/...` paths below are under
`tuucho/kernel/front`):

`routes -> feature components -> shared UI`

- Routes compose pages and navigation; they do not become reusable control
  libraries or low-level HTTP clients.
- Feature folders own domain presentation and feature-specific behavior.
- `src/components/ui/` owns generic visual primitives and must not import routes
  or feature modules.
- `src/hooks/` and state providers own reusable behavior. Expose narrow data,
  command, and overlay/prompt interfaces rather than broad mutable contexts.
- `src/api/` owns typed transport by domain. The server remains authoritative
  for price, stock, delivery, payment, identity, and authorization decisions.
- `src/styles/theme.css`, `src/styles/tokens.css`, and `src/theme/` own reusable
  theme values and preferences. Components consume semantic roles.

Split a file or abstraction when it gains more than one reason to change. Keep
code together when splitting would only add indirection. Do not create barrel
files, wrapper components, generic hooks, or configuration layers without at
least one concrete consumer and a clear ownership benefit.

## Apply the non-negotiable UI contract

- Build mobile-first. Base styles must work on narrow touch screens; add larger
  layouts progressively with the established breakpoints and tokens.
- Every app-owned modal has a localized title, header separator, and accessible
  top-right close icon. Do not add a Cancel/`Annuler` action when that close icon
  already dismisses the modal.
- Destructive or session-ending actions such as trash, delete, remove,
  disconnect, and logout use the semantic danger treatment for both text/icon
  and confirmation action.
- Scrollable modal content uses the established custom vertical indicator with
  top/bottom chevrons and a vertical bar. Reuse `ModalScrollBody` or the shared
  `useScrollHint` behavior; do not copy its mechanics. Mouse press-drag must
  scroll (never select text); keep that contract when extending scroll regions.
- Use semantic theme tokens, the shared primitives, all enabled locales,
  accessible HTML, visible focus, and keyboard/touch behavior.
- Treat every French copy correction as an all-locale change: preserve its
  corrected meaning in `en`, `th`, `es`, `it`, `nl`, and `pt` in the same task.
- **Hard rule: no em dash or en dash in user-facing copy.** Never write `—`
  (U+2014) or `–` (U+2013) in i18n, emails, UI, or other customer-visible
  text. Use a period, comma, colon, or parentheses. Hyphens in compounds
  (`e-mail`) are allowed. Do not “sound literary” with long dashes.

These rules apply to new work and to the exact area being refactored. Do not
silently expand an ordinary feature task into a repository-wide redesign.

## Make state and effects predictable

- Represent meaningful async phases explicitly and settle loading on every
  success and failure path.
- Prevent stale requests from overwriting newer state. Clean up timers,
  observers, subscriptions, and in-flight work when their owner unmounts.
- Keep render logic pure. Place effects near the state they synchronize and
  avoid mirrored state that can be derived during render.
- Keep public hooks small and stable. Memoize context values only when it
  protects a real consumer boundary.
- Give lists stable domain keys; never rely on array indexes for mutable lists.

## Treat incidental security findings as findings

Never read or reproduce kernel private JSON, plugin secrets, credentials, tokens, private uploads,
orders, vouchers, or customer data while doing unrelated work. If suspicious
exposure, unsafe handling, or a security weakness appears incidentally:

1. Stop inspecting or reproducing the sensitive value.
2. Do not silently fix, rotate, migrate, or broaden the task.
3. Report the repository, file and line when safe, finding category, likely
   impact, confidence, and recommended next action without exposing the value.
4. Ask for explicit scope before remediation unless the user already requested
   that security work.

## Verify proportionally

Run checks with `npm --prefix tuucho/kernel/front run ...` using its required
Node version. For a normal
TypeScript/CSS change, run at least:

```bash
npm --prefix tuucho/kernel/front run typecheck
npm --prefix tuucho/kernel/front run lint
npm --prefix tuucho/kernel/front run format:check
npm --prefix tuucho/kernel/front run test:unit
npm --prefix tuucho/kernel/front run check:bundle
```

Or the combined pre-review gate (includes `check:bundle`):

```bash
npm --prefix tuucho/kernel/front run check
```

Unit tests live under `tuucho/kernel/front/src-test/unit-test/` only (mirror
`src/` paths). Never
add `*.test.ts(x)` beside production modules. Combined with the back suite:
`npm --prefix tuucho/kernel/back run test` (no `--dev`).

Use `npm --prefix tuucho/kernel/front run check:theme` when theme or CSS architecture is involved, even if it
also runs through lint. Do not add or run Playwright tests without the explicit
approval required by the frontend repository instructions. Never run preprod or
production builds/deployments without explicit authorization. Do not silence a
failing `check:bundle` by raising `chunkSizeWarningLimit` or restoring catch-all
`manualChunks` (see `tuucho/kernel/front/vite.config.ts`).

Finish by reporting changed files, reused/extended primitives, checks and their
results, cross-repository follow-up, version drift, security findings, and
external action still required. Do not stall the handoff on a Cursor-browser
walkthrough.
