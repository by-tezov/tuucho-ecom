# Front-end architecture

This document defines the ownership boundaries for the React application. The
goal is to let several developers change the same product without turning the
application shell, API client, or design system into shared dumping grounds.

## Dependency direction

```text
routes -> feature components -> shared UI
  |              |                |
  +----------> hooks/state ------> theme
  +----------> domain API -------> API client
```

- `routes/` compose a page and own URL/query-string behavior. They should not
  contain reusable controls or low-level HTTP code.
- `components/<feature>/` owns UI that is specific to one business area.
- `components/ui/` contains small, business-agnostic controls. Shared controls
  use theme tokens and accept data/callbacks instead of importing feature state.
- `hooks/` and `state/` own reusable client behavior and cross-route state.
  Prefer narrow contexts so a session, cart-data, cart-command, or overlay
  change only rerenders consumers that use it.
- `api/<domain>.ts` owns request/response types and operations for one API
  domain. Larger surfaces use narrow subdomains such as `api/admin/orders.ts`
  and `api/admin/chats.ts`. `api/client.ts` is the shared transport layer.
  Feature code imports its domain module directly; `api/admin.ts` is a
  compatibility-only index.
- `theme/` owns theme state and composition. `styles/tokens.css` contains
  semantic design tokens; `styles/theme.css` maps theme modes to those tokens.

Dependencies point down this list. In particular, shared UI must not import a
route, and one feature directory should communicate with another through
props, a domain hook, or a deliberately shared module.

## Component rules

- Keep route components focused on orchestration: load/derive page data,
  compose sections, and connect navigation.
- Extract a section when it has its own state machine, API lifecycle, modal, or
  reusable visual contract. Do not extract one-line wrappers solely to reduce
  a file's line count.
- Model mutually exclusive async UI with a discriminated union instead of
  several booleans. Every request must settle loading on success and failure,
  and stale responses must not overwrite a newer account, route, or mutation.
- Use semantic HTML first. Dialogs use the shared focus trap, an accessible
  name, Escape handling, focus restoration, and a single close contract. The
  close icon is never the initial focused control: without an explicit
  `initialFocusRef`, focus lands on the dialog itself (`data-focus-shell`), so
  its name is read and the next Tab reaches its first control. Status messages
  that are not rendered inside an already-mounted live region go through
  `announce()` (`state/liveAnnouncer.ts`). Shop RGAA / WCAG policy, contrast
  gates, and third-party residuals: [`accessibility.md`](./accessibility.md).
- Lazy-load route-sized code that is not needed for the initial shell. Keep
  error boundaries around the application and around independently recoverable
  remote sections when appropriate.
- Keep bootstrap/cache loaders in `state/` or a domain module, never under a
  route when hooks, components, or caches also consume their contracts.
- Overlay and message timings are configuration, not per-screen constants.
  A LoadingModal floor is `shopConfig.loadingMinMs.short` (an overlay over
  something already on screen), `.normal` (the default: anything replacing the
  view or hitting the network) or `.long` (the overlay carries a message that
  must be read first), passed to `withMinDuration`. A toast or an inline notice
  that closes itself waits `shopConfig.noticeMs`. A dialog never closes itself
  and a redirect never fires on a timer (RGAA 13.1): the person closes it or
  takes the next step. `npm run check:timings`
  rejects a numeric floor, a one-shot wait in the 1000-4999 ms band outside its
  documented exceptions, and any `VITE_LOADING_MIN*` / `VITE_NOTICE*` read
  outside `src/config/env.ts`. Animation settles, request timeouts, polling
  intervals and retry backoffs stay local to their file.

## State ownership

Use the narrow public hooks:

- authentication: `useAuthSession`, `useAuthCommands`, `useAuthPrompt`
- cart: `useCartData`, `useCartCommands`, `useCartOverlay`

Do not rebuild a broad context value in a consumer. A provider may expose
separate values when their update frequencies differ. Server-authoritative
price, stock, payment, delivery, and authorization decisions stay on the API;
client state is an optimistic display and must reconcile with the response.

## Styling and theming

Follow [`theming.md`](./theming.md). New components use semantic tokens rather
than literal brand colors or theme selectors. A feature-owned shared CSS module
may serve several components in that feature; reusable components never import
route-owned CSS. Global styles are limited to reset, typography, tokens, and
theme mappings.

## Static assets

Large static JPG/PNG files under `src/assets/images/` are retained as editable
sources. The application imports their optimized WebP siblings through
`assets/images/manifest.ts` when that format is materially smaller; regenerate
those delivery files after changing artwork. Onboarding artwork is imported from
`assets/images/onboarding/manifest.ts` so it stays out of the prerender entry
chunk.

```bash
npm run assets:optimize
```

Keep folder-driven capsule photos in a single format per numbered slide so the
glob does not treat source and delivery variants as separate carousel items.

Runtime catalogue photos remain API-provided, content-hashed URLs. Gallery
cards keep a skeleton visible while a bounded concurrency gate queues or loads
their thumbnail. A gate timeout releases scheduling capacity and advances only
that card to its next source; it does not declare the backend unavailable or
interrupt the customer with a global dialog. A real image error follows the
same local path: retry the thumbnail without cache, then fall back to the modal
asset. If every bounded attempt fails, the card keeps an accessible retry
control instead of painting a broken or empty image.

## Quality gates

Every change must pass:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run check:theme
npm run check:timings
npm run test:unit
npm run check:bundle
npm run test:e2e:ci
```

Prefer `npm run check` for the usual pre-review gate (typecheck, lint, context,
unit tests, and bundle). The CI workflow runs these gates on Node 22. Add a
focused regression test for race conditions, state transitions, accessibility
contracts, or bugs that can recur. Do not weaken strict TypeScript or lint
rules to land a feature. Do not hide fat chunks by raising
`chunkSizeWarningLimit` or by catch-all `manualChunks` (see `vite.config.ts`).

## Review ownership

Review by boundary, not by file size:

- a route owner validates navigation and composition;
- a domain owner validates API contracts and server-authoritative behavior;
- a UI/theme owner validates reusable controls, tokens, responsiveness, and
  accessibility;
- the author validates strict types, tests, and all quality gates.

When a change crosses boundaries, keep each concern in its owning module and
request the corresponding reviews. This prevents parallel feature work from
converging on a monolithic route or catch-all API file.
