# Shop install and updates

Shipped on U24 `/home/tezov/Local/tuucho-ecom` (product version is root `package.json`). Matches [plugin folder structure](plugin-folder-structure.md).

## Locked and shipped

- One official Tuucho origin: **https://github.com/by-tezov/tuucho-ecom**. Hardcoded.
- One product version: root `package.json` only. `kernel/back`, `kernel/front`, and `plugin-sdk` omit `version`. `npm run check:release` enforces that. `release.json` `tag` / `kernel` and `plugins/tuucho/manifest.json` `kernel` are generated from the root version.
- Tags are `MAJOR.MINOR.PATCH` with **no** `v` prefix. Ignore `v…` tags.
- Plugins Core and Check current re-read live root `package.json`. `shop-release.json` is last-applied Apply state.
- **One plugin file:** leaf `package.json` with npm `version` / `description` / optional `repository` plus `"tuucho": { id, kind, installPath, engines.core, … }`. That `tuucho` object is the discriminator. Scan skips `node_modules`. There is no `plugin.json` and no stub generator.
- Check: loading, then nothing-to-update / ahead / confirm-close. Uninstall toasts auto-dismiss (`VITE_NOTICE`).
- Apply copies root `package.json` on kernel/all. Jump every tag. Fail closed. Never write `plugins/user/` for Tuucho scopes.
- User plugins update only from npm `repository` on that package (HTTPS GitHub), and only that folder.

## Install from a tag

```bash
git clone --branch 0.0.3 --depth 1 https://github.com/by-tezov/tuucho-ecom.git
cd tuucho-ecom
npm run setup:cli -- --yes --store-name Shop --admin-email admin@shop.example --admin-password 'ShopAdmin1!'
npm run dev
```

Setup default Postgres role is `tuucho` (not `tezov`). Generated env has no nail/atelier/PamSurin/LWS product defaults.

## Later (not RC1)

SQL nail rename, gift UI out of kernel, full runtime bootstrap, cron, kernel/package.json umbrella, contact PII table move.
