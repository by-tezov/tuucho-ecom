# RC1 must-haves (shipped)

Checkout: `/home/tezov/Local/tuucho-ecom`. Product version is root `package.json`.

## Must-haves

1. **One product version.** Root `package.json` only. Nested kernel/sdk omit `version`. `check:release` enforces. `release.json` / `plugins/tuucho/manifest.json` `kernel` generated from root. Tags `x.x.x`, no `v`.
2. **One plugin file.** `plugin.json` gone. Leaf `package.json` + `"tuucho": { id, kind, installPath, engines.core, … }` plus npm `version`/`description`/`repository`. Discriminator so `node_modules` is never scanned. Stub generator `write-plugin-packages.mjs` / preinstall removed. Scan, zip, Check, skills, docs read that file.
3. **Check UX.** Loading, then nothing-to-update / ahead / confirm-close. Uninstall toasts auto-dismiss.
4. **Apply** copies root `package.json` on kernel/all. Jump every tag. Fail closed. Never write `plugins/user/`.
5. **Setup from a tag.** Default Postgres role `tuucho`, not `tezov`. No nail/atelier brand in generated env.
6. **Public env.** No PamSurin names, no atelier default copy, no LWS legal as product default. Legal/footer/accessibility are user plugins with real pages (not kernel `LegalNoticePage` + `VITE_LEGAL_*`). Home/about/guides plugin fronts mount; kernel page routes removed.
7. **Unit tests only.** Leftover `PAM_TEST_*` hooks deleted.
8. **Docs.** README install from a tag; Core = root version; Check/Apply; one-file plugin. Kernel AGENTS.md says tuucho-ecom.
9. **Unit tests for Check/Apply.** Tag walk, parse tag, dirty tree, classify overlay, official copy includes `package.json`, never `plugins/user/`, tuucho discriminator.

Kernel UI kit. Contact stays Tuucho + info menu. Legal footer-only.

## Later (not RC1)

SQL nail rename, gift UI out of kernel, full runtime bootstrap, cron, kernel/package.json umbrella, contact PII table move.

## Still blocked on this machine

- `app.test.ts` 401/404/webhook return 500 without Postgres on 5434 (plugin load on `/`). `/healthz` is 200.
- Front typecheck still fails on gift theme keys vs the pamsurin union (Later: gift UI out of kernel).
- `check:docs` still has other stale `features.json` paths (Contact/AdminChats already in plugins).
- Live `kernel/back/.env/.private.env` still has `COMPANY_NAME=Lumen` for this shop. Setup from a tag writes the store name, not Lumen. Live env was not rewritten.

## How Te verifies

- Admin, Plugins: Core line is root `package.json` version (`0.0.3`). Check for updates: loading then nothing / ahead / plan.
- One plugin folder has only `package.json` (plus code). Example: `plugins/user/legal/pages/page-legal/` — no `plugin.json`.
- `npm --prefix kernel/back run check:release`
- `npm --prefix kernel/back run test:unit -- src-test/unit-test/modules/plugins`
- `npm --prefix kernel/front run test:unit -- src-test/unit-test/routes/pluginUpdateCheck.test.ts`
