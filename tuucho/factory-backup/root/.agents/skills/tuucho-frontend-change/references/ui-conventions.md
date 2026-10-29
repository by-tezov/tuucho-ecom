# Tuucho UI conventions

Read this reference for any visual, component, route-presentation, CSS,
responsive, modal, or interaction change in `tuucho/kernel/front`.

## Reuse before creating

Search the closest existing feature and these shared areas first:

- `src/components/ui/` for buttons, icon buttons, modal boundaries, modal scroll
  bodies, form controls, and generic feedback.
- `src/hooks/` for behavior such as focus trapping, history-back closing, body
  scroll locking, and scroll hints.
- `src/styles/theme.css` for semantic colors and elevation.
- `src/styles/tokens.css` for typography, spacing, radii, layout, breakpoints,
  motion, and scroll-indicator geometry.
- The feature's own component and CSS module for domain-specific layout.

Use the existing primitive directly when its contract fits. If several real
consumers need the same missing capability, extend the shared primitive
narrowly. Keep one-off presentation local to the feature. Do not fork shared
behavior by copying markup, SVGs, CSS, or hooks.

## Mobile-first is the default

- Write the narrow-screen layout as the base. Use the existing `min-width`
  breakpoint and tokens to enhance it for wider viewports.
- Design and inspect at 320, 375, and 768 CSS pixels before desktop widths,
  then check the 1024 breakpoint and a typical wide viewport.
- Prefer flexible inline sizes, wrapping, grid/flex constraints, and logical
  properties. Avoid fixed widths that presume a desktop or one language.
- Account for touch targets, software keyboards, safe-area insets, dynamic
  viewport height, long translations, and browser zoom.
- Preserve natural document and touch scrolling. A visual scroll indicator
  augments scrolling; it must never become the only way to scroll.

## Modal contract

Every app-owned modal or bottom sheet must have:

- A visible, localized title in its header.
- The established separator beneath the header/title.
- A top-right close button using the canonical `CloseIcon`, with a localized
  accessible label supplied by the owning button.
- Escape, backdrop, focus-trap/restoration, body-lock, and history-back behavior
  appropriate to the established modal shell. Opening focus parks on the
  dialog shell (no visible ring); pass `initialFocusRef` only when a field
  must open ready to type. The close icon must never receive initial focus
  (`useFocusTrap` skips dismiss controls; Tab still reaches the ×).
- Responsive sizing that is safe on narrow screens and does not hide critical
  actions behind the viewport or software keyboard.

The close icon is the modal's dismiss action. Do not also show a Cancel,
`Annuler`, or equivalent secondary action. In `ConfirmModal`, omit
`cancelLabel` and provide `closeLabel`; this selects the close-icon contract.
An action that navigates to a previous workflow step may say Back when it truly
changes steps, but it must not duplicate modal dismissal.

Prefer `ConfirmModal` for confirmation flows. Use `ModalBackdrop` plus the
closest established shell for feature-specific dialogs. Reuse
`useFocusTrap`, `useHistoryBackClose`, and `useLockBodyScroll`; do not implement
local variants of these behaviors.

## Destructive actions use danger semantics

Trash, delete, remove, disconnect, logout, revoke, and other destructive or
session-ending actions are red through the semantic danger role. Apply it to
the text/icon affordance and the confirmation action:

- Use `Button`'s established danger variant such as `ghostDanger`.
- Use `ConfirmModal`'s danger confirmation state such as `confirmDanger`.
- Use the shared trash/close/logout icon pattern instead of embedding a new
  mismatched icon.
- Keep disabled, hover, active, and focus states accessible in every theme.

Do not encode danger with a raw red value. Do not use danger styling merely to
make a non-destructive action visually prominent.

## Scrollable modal content

Ordinary scrollable dialog content uses `ModalScrollBody`. It owns the hidden
native scrollbar presentation, top and bottom chevrons, vertical bar, hint
visibility, drag support, and measurements.

Mouse press-drag on the scroll body **scrolls** the content. It must never
start a text-selection drag. That means `user-select: none` on the scroll
surface (with `user-select: text` restored on real text fields),
`preventDefault` on non-interactive mouse `pointerdown`, pointer capture once
the drag threshold is crossed, and suppressing the trailing `click` after a
real drag so buttons under the pointer are not activated by accident.

If a specialized scroll region cannot use that component, reuse
`useScrollHint` and the established scroll tokens/CSS structure. Preserve:

- The top arrow, bottom arrow, and vertical bar as one consistent indicator.
- Keyboard, wheel, trackpad, touch, and mouse press-drag scrolling.
- Correct updates after resize and content changes.
- Decorative icon semantics so screen readers are not given fake controls.
- Reduced-motion preferences and high-contrast visible states.

Do not expose a browser-default scrollbar beside the custom indicator, invent a
horizontal variant for ordinary modal content, duplicate the hook, or leave a
scrollable dialog selecting text on mouse drag.

## Theme rules

- Style by semantic role: surface, text, accent, border, danger, success,
  warning, focus, overlay, and elevation.
- Reuse an existing token when the role already exists. Add one semantic token
  at the theme layer only when a genuinely reusable role is missing.
- Keep one-off dimensions and layout in the component's CSS module.
- Do not add feature-level `:root[data-theme]` selectors or raw light/dark
  branches. Do not pass theme booleans throughout the component tree.
- Raw brand colors are limited to external brand marks or assets and stay local
  with a comment explaining why they cannot use a semantic role.
- Reusable components never import route CSS. Route styles may compose shared
  components through their documented API.

Review light, dark, and system modes; live operating-system changes; focus,
hover, active, disabled, error, and loading states; readable contrast; and the
browser theme-color integration.

## Components, copy, and accessibility

- Prefer semantic HTML and native controls. Use `button` for actions and links
  for navigation; never make a generic container clickable without full native
  equivalence.
- Icon-only buttons require a localized accessible name and visible focus.
- Inputs require associated labels, useful errors, autocomplete/input-mode
  where appropriate, and no placeholder-only naming.
- **Hard rule: no native browser validation UI.** App-owned forms must use
  `noValidate`. Do not rely on HTML `required`, `min`, `max`, `pattern`, or
  `type="email"` constraint validation to block submit. Those attributes may
  remain only as non-blocking hints (steppers, input modes) when the form is
  `noValidate`. On invalid input, show a clear red message **under the field**
  (`fieldError` / `role="alert"`, `aria-invalid`, `aria-describedby`) using the
  same pattern as address/auth forms. Never leave the user with the browser’s
  system tooltip bubble. Admin screens follow the same rule as the shop.
- **Hard rule: no em dash or en dash in user-facing copy.** Do not use `—`
  (U+2014) or `–` (U+2013) in locale strings, emails, buttons, hints, errors,
  or titles shown to customers. Split the sentence, or use a comma, colon, or
  parentheses. Compound hyphens (`e-mail`, `QR-code`) are allowed. Long dashes
  are banned because they read as generic AI voice.
- Keep DOM order logical. Do not visually reorder content in a way that breaks
  keyboard or screen-reader order.
- Use shared loading, empty, and error patterns. Avoid layout shifts when
  asynchronous content settles.
- Add visible copy to every enabled locale: `fr`, `en`, `th`, `es`, `it`, `nl`,
  and `pt`. Update locale types and tests where the project requires them.
- A correction to French wording or meaning is a translation-set change, not a
  French-only patch. In the same task, review and update `en`, `th`, `es`, `it`,
  `nl`, and `pt`, including visible labels, validation/error text, aria labels,
  titles, and descriptions affected by that correction. Preserve the corrected
  meaning naturally in each language rather than copying French text literally.
- Do not hardcode country lists or duplicate server-owned commerce rules in the
  client.

Before finishing, compare the changed result to the nearest existing feature,
not to an invented standalone design system. Record any visual behavior that
could not be exercised locally.
