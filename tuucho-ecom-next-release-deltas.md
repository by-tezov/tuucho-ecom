# tuucho-ecom deltas still required by PamSurin (against 0.0.9)

Local `pamsurin-shop/tuucho` should track product **0.0.9**. The four
0.0.8 forks below are opened upstream; Pam can drop the local patches and
re-audit.

## Closed in 0.0.9

- Front Vite shop JSON (`front.json` / `front.<env>.json`) — product Vite
  loads `VITE_` / `SITEMAP_` / `SSR_` from `tuucho-config/`.
- Dev HTML shell title + public favicon — `shellTitle` +
  `tuucho-config/front-public/` overlay.
- Language switcher only unlocks `tuucho-kernel-locale-<lang>` — any
  enabled `*-locale-<lang>` pack unlocks the code.
- `FlagIcon` only draws FR / UK — optional `registerLanguage({ flagUrl })`
  through bootstrap; stock SVG for en/fr only; unknown codes get a
  neutral badge.

## Closed since 0.0.6

- Storefront languages beyond en|fr — `registerLanguage` + `i18n.enabled` →
  `VITE_ENABLED_LANGUAGES`.
- Favicon / OG / lock-probe (runtime) — `brandAssets` keys.
- Cart `wrapNotifiedAdd` / `notifyCartAdded` on commands context.
- `paths.publicMediaDir` leading slash treated as under `publicDir`.
- `/media` mounted before catch-all `/` plugin middleware.

## Not a kernel opening

- FTP host credentials and LWS API token — shop private JSON + shop deploy.
- Production cron enable flags (`ENABLED_CRON_*`) — shop deploy.
- Product-request SMTP password and similar plugin secrets — plugin private
  / Configure secret store, not kernel schema.
