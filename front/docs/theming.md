# Theming and style architecture

## Goals

The theme is a small application subsystem, not a collection of page-level
dark-mode overrides. It has four boundaries:

1. `src/styles/theme.css` owns semantic colour and elevation values.
2. `src/styles/tokens.css` owns theme-independent typography, radii, layout,
   breakpoints and motion.
3. `src/theme/` owns preference types, browser persistence, DOM application
   and authenticated account reconciliation.
4. Components consume semantic tokens and `useTheme()`; they do not know how
   the preference is stored or synchronized.

This separation lets palette, layout, account and feature work proceed in
different files with fewer merge conflicts.

## Runtime flow

```text
index.html bootstrap
  -> resolves local light/dark/system and contrast before first paint
  -> sets data-theme + data-contrast + mobile browser theme colour

themePreference.ts
  -> localStorage, system media queries, cross-tab events, DOM attributes

ThemeProvider.tsx
  -> React snapshot + useTheme()
  -> stale-read-safe account reconciliation
  -> serialized account writes

ThemeSwitch / ContrastControl / Stripe integration / feature components
  -> consume the provider or semantic CSS tokens
```

`ThemeProvider` is intentionally below `AuthProvider`: the theme can paint
before React from the local cache, while the provider can later reconcile the
account preferences through authenticated requests. Theme and contrast have
independent revision guards, so an older account GET cannot replace a click
made while that request was in flight. Account writes are serialized so
first-login seeding cannot finish after a newer selection.

Stripe Elements is the one major exception to CSS-token consumption because
its fields live in cross-origin iframes. `useStripeAppearance()` derives a
memoized Stripe Appearance from the resolved theme and contrast; React Stripe
forwards a change to the mounted Elements instance.

## Accessibility contrast

Contrast is not a third colour theme. It is a separate dimension so all four
combinations stay valid: light/standard, dark/standard, light/enhanced and
dark/enhanced. `data-theme` selects light or dark and `data-contrast` selects
standard or more. Enhanced overrides belong only in `styles/theme.css`, never
in feature CSS Modules.

The effective priority is:

1. browser/OS forced colours (for example Windows High Contrast);
2. an explicit account or guest choice (`standard` or `more`);
3. `prefers-contrast: more` when the saved choice is `system`;
4. standard contrast.

Enhanced palettes target at least 7:1 for normal semantic text pairs and 3:1
for control boundaries, focus cues and meaningful icons. Large text therefore
also exceeds its 4.5:1 enhanced target. Standard (default) palettes are gated
to WCAG AA: 4.5:1 for the maintained text matrix and 3:1 for form/photo UI
pairs. `scripts/checkThemeContrast.mjs` checks complete enhanced overrides and
both standard and enhanced ratio matrices. It complements visual and
assistive-technology review; it does not claim that every possible component
state is automatically WCAG-conformant.

Shop accessibility policy and residuals live in
[`docs/accessibility.md`](./accessibility.md).

`ContrastControl` is the single UI implementation. The public header, footer
and admin chrome expose a quick standard/enhanced toggle; the mobile header
and footer use the same compact icon and the burger does not duplicate it. The
footer keeps the control in a dedicated right-hand rail, labelled on desktop
and compact on mobile, without displacing its centred mobile legal links.
The account page keeps the choice compact beside the theme switch: standard,
enhanced and system are icon options rather than a separate settings block.
Guests retain the choice in `pamsurin-contrast-preference`; signed-in users additionally persist it through
`/account/preferences/contrast`, making the account value portable across
devices while localStorage remains the first-paint cache. The light/dark
preference uses the same pattern and `/account/preferences/theme`.

## Token contract

Theme tokens describe roles, not literal colours or individual components:

- content/surfaces: `--color-bg`, `--color-bg-card`, `--color-ink`;
- brand emphasis: `--color-accent`, `--color-accent-subtle`;
- state: `--color-danger`, `--color-success-soft`;
- boundaries: `--border-soft`, `--border-input`;
- elevation: `--shadow-card`, `--shadow-popover`, `--shadow-modal`, and the
  upward-facing `--shadow-sheet`, `--shadow-bar`, `--shadow-drawer`.

Each standard light/dark pair is declared once with `light-dark()`.
`color-scheme` selects the correct side for explicit light, explicit dark and
system mode, so there is no second hand-maintained system-dark token map. The
two enhanced selectors override the complete semantic contract; the static
check fails when either misses a newly introduced token.

When adding a visual value:

1. Reuse an existing role if its meaning matches.
2. If the role is new and reused, add one semantic token to `theme.css` with
   reviewed light and dark values.
3. Keep one-off layout dimensions in the owning CSS Module; do not create a
   token merely because `8px` occurs elsewhere.
4. Keep third-party brand colours, payment-network marks and intentional
   photo/lightbox treatments local. They are assets, not application palette.
5. Never add `:root[data-theme=...]` to a feature stylesheet for an ordinary
   colour. Add or correct the semantic token instead.

Adding another appearance dimension keeps component code unchanged only when
it remains orthogonal: extend `theme/types.ts`, `ThemeProvider`, first-paint
bootstrap and the API contract, then add complete semantic overrides in
`theme.css`. Do not encode combinations in feature components.

## CSS ownership

- `styles/`: global reset, application-wide layout helpers and token contracts.
- `components/ui/`: generic interactive primitives and their own CSS Modules.
- feature folders (`components/cart`, `components/gallery`, ...): reusable
  domain visuals and behavior.
- `routes/`: page grid, route composition and route-only responsive layout.

A reusable component may import its own module, a feature-owned shared module,
or a UI primitive. It should not import a route stylesheet. A route may compose
components but should not become their implicit style API.

Avoid a universal component based only on similar appearance. Modal focus
trapping, browser-back behavior, body locking, nested z-index, desktop versus
sheet layout and scroll ownership must converge before their React shells are
merged. Sharing tokens without sharing behavior is often the safer boundary.

## Audit result and shared UI boundaries

The August 2026 audit covered 133 CSS Modules and roughly 24k CSS lines.
Before this refactor, the dark semantic palette was copied into both an
explicit-dark selector and a system-dark media query, and newer tokens could
be missed in either map. Theme state was also split between the switch and
`AuthContext`; mounted Stripe fields sampled the theme only once.

Modal behavior now converges on `components/ui/ModalBackdrop`: a native dialog
owns the accessible modal semantics and one semantic backdrop control, while
each feature keeps its own panel layout. `useFocusTrap`,
`useHistoryBackClose`, and `useLockBodyScroll` remain separate behavior hooks
so nested overlays can compose them deliberately. `ModalScrollBody` and
`useScrollHint` own the common scroll behavior without forcing identical
feature presentation. Mouse press-drag on that body scrolls; it must not
select text (same contract as cart drawer / filter sheet). Panels that own
their scroll element spread `useDragScroll()` on it instead of copying the
handlers.

Visual chrome is shared the same way, through CSS Modules `composes` rather
than a shared shell: `components/ui/ModalChrome.module.css` (backdrops,
header divider, close button, scroll chevrons), `components/ui/Typography.module.css`
(eyebrow, micro label, field error, dialog title) and
`components/admin/AdminList.module.css`. CSS Modules prepends a composed file
to each module that composes it, so a later copy can win over an earlier
module's equal-specificity override: never override a composed class's
property at the same specificity (a media query does not raise it).
Viewport overlay stacking uses the `--z-header` / `--z-modal` /
`--z-modal-raised` / `--z-modal-top` layers from `tokens.css`.

This shared UI work deliberately remains outside the palette subsystem.
Theme files define visual roles; modal, scrolling, and form primitives define
interaction contracts. Keeping those ownership lines explicit prevents a
palette edit from becoming coupled to checkout or account behavior.

## Review checklist

- Check light, dark and system with both standard and enhanced contrast at
  mobile and desktop widths.
- Change the OS theme/contrast while system mode and a Stripe form are open.
- Check Windows High Contrast or another `forced-colors` environment.
- Verify focus outlines, disabled states and semantic status contrast.
- Verify the `<meta name="theme-color">` changes with the resolved palette.
- Confirm a signed-in contrast choice restores on another session/device and
  that a guest choice survives reload without an account request.
- Confirm raw colours added to a component are third-party/illustrative, not
  an application semantic role.
- Run `npm run check:theme`, `npx tsc -b --pretty false` and `npm run lint`.
