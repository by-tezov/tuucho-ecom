# tuucho-ecom deltas still required by PamSurin (against 0.0.9)

Local `pamsurin-shop/tuucho` tracks product **0.0.9**. No kernel / plugin-sdk /
docs / scripts **source** forks under `tuucho/`. Item **2** below is still
required on tagged `0.0.9`; item **1** is implemented in the product checkout
awaiting the next tag.

## 1. Docker Compose env file is written inside the product tree

**Status:** implemented in the product tree (not yet on tag `0.0.9`).
`composeEnv.mjs` writes `<outputDir>/docker/.compose.env` (default
`<clone root>/output/docker/.compose.env`). `composeUp.mjs`, install, deploy
local Postgres start, and Apply DB snapshot fallbacks use that path. Nothing
shop-generated for Compose lands under `tuucho/`.

## 2. Kernel Apply overwrites the shop root project manifest

**Status:** implemented in the product tree (not yet on tag `0.0.9`).
Root scaffold ships under `tuucho/factory-backup/root/`, copies once on
`node tuucho/scripts/install.mjs`, Apply no longer writes live
`package.json`, Core / Check read `tuucho/tuucho-versioning.json` `kernel`.

Stock `0.0.9` still includes live `package.json` in Apply scope; Pam must keep
restoring shop scripts/name until that tag is applied.

## Closed in product WIP (next tag)

- Compose env outside `tuucho/` → `<outputDir>/docker/.compose.env`.
- Shop-owned root scaffold + Apply never writes live root `package.json`.

## Closed in 0.0.9

- Front Vite shop JSON (`front.json` / `front.<env>.json`).
- Dev HTML shell title + public favicon (`shellTitle` +
  `tuucho-config/front-public/`).
- Language switcher unlock for any enabled `*-locale-<lang>` pack.
- Optional `registerLanguage({ flagUrl })` for switcher flags.

## Closed since 0.0.6

- Storefront languages beyond en|fr — `registerLanguage` + `i18n.enabled`.
- Favicon / OG / lock-probe (runtime) — `brandAssets` keys.
- Cart `wrapNotifiedAdd` / `notifyCartAdded` on commands context.
- `paths.publicMediaDir` leading slash under `publicDir`.
- `/media` mounted before catch-all `/` plugin middleware.

## Not a kernel opening

- FTP host credentials and LWS API token — shop private JSON + shop deploy.
- Production crontab install ownership — shop `scripts/deploy.mjs`; stock
  prod always installs cron entries; plugin enable gates gift/loyalty.
- Product-request SMTP and similar plugin secrets — plugin private /
  Configure secret store.
