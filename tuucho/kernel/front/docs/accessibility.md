# Accessibility (RGAA 4.1.2 / WCAG 2.2 AA, shop)

Customer shop target is **RGAA 4.1.2** (the French standard, built on WCAG
2.1 AA) and **WCAG 2.2 Level AA**. Admin operator UI is out of the
conformance claim; shared primitives may still improve it. No measured conformance
audit has been run yet. The public statement (`/accessibility`, user plugin
`page-accessibility`, linked from every footer) says the shop is partially
compliant and lists the residuals below. Keep it in step with them.

## What the app already provides

- Skip links to `<main id="main">` and to the footer in the shop layout
- Global `:focus-visible` outline
- Modal stack: native `<dialog>` backdrop, focus trap, Escape, history-back
  close, body scroll lock, focus restoration. Without an explicit
  `initialFocusRef`, focus lands on the dialog shell (`data-focus-shell`):
  its name is read first, the next Tab reaches its first control, and the
  close icon is never the first focused control. `LoadingModal` is a named,
  focused dialog too.
- One persistent pair of live regions (polite and assertive, mounted under
  `<body>` at startup) behind `announce()`: route titles after SPA navigations
  (`RouteFocusAnnounce`, no programmatic focus move), and any status that has
  no live region of its own on screen
- No content time limit without control (RGAA 13.1): no self-closing dialog
  and no timed redirect. The payment stock hold warns two minutes before it
  expires and offers a one-click extension (`/checkout/.../extend`, at most
  ten times); the guest checkout privacy session warns before it ends.
- Forms: `noValidate` with under-field errors (`aria-invalid`,
  `aria-describedby`, `role="alert"`), a required-field note and mark
  (`RequiredMark`, `RequiredFieldsNote`) with `aria-required`, labelled phone
  inputs (`usePhoneInputLabels`)
- Toggles state their state in text: chips and switches carry a hidden
  state suffix rather than `aria-pressed` on a label that also changes
- Gallery zoom works from the keyboard (`useLightboxKeyboard`: `+`/`-` zoom,
  `0` resets, arrows pan while zoomed and change photo otherwise)
- Enhanced contrast mode (`data-contrast="more"`) with a 7:1 token matrix
- `document.documentElement.lang` synced to the active locale; options naming
  another language carry their own `lang` (`LangSwitcher`)
- Documents from the back end: invoice and gift card PDFs are tagged (title,
  language, reading order, artifacts), and every email carries `<html lang>`

## Automated checks

```bash
npm run check:contrast   # standard AA (4.5:1 text / 3:1 UI) + enhanced 7:1
npm run check:theme      # theme architecture + contrast
npm run check            # full front pre-review gate
```

`scripts/checkThemeContrast.mjs` asserts semantic token pairs for light/dark
**standard** and **enhanced**. Soft decorative borders are not part of the
standard UI matrix; form inputs (`--border-input`) and photo controls are.

## Third-party residuals

These embed third-party iframes. Wrappers (labels, dialogs, posters, theme
appearance) are owned here; iframe internals are not certified as AA:

- Stripe Elements (card / wallets) via `useStripeAppearance`
- Mondial Relay parcel-shop picker widget
- YouTube pose video embeds (players on `/pose` and on each watch page)

Owned here but not yet compliant, and named in the statement: the boot
splash and decorative animations cannot be paused from the page (they stop
under reduced motion).

## Manual AT checklist (before claiming AA)

Keyboard-only and one screen reader (VoiceOver or NVDA) on:

1. Home → gallery → product zoom → add to cart
2. Cart → delivery → payment confirmation dismiss
3. Login / register OTP
4. Contact form errors
5. Gift create + receiver PIN
6. Theme + contrast toggle while a dialog is open
