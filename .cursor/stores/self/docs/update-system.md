# Shop install and updates

Plan only (2026-10-19). Checkout `/home/tezov/Local/tuucho-ecom` on U24, kernel `CORE_VERSION` **1.0.9**. This is the locked design, not a menu of options. Do not implement from this file until Te asks.

Matches [plugin folder structure](plugin-folder-structure.md) and the product vision: one public shop, kernel as mechanic, bundled `tuucho-*` under `plugins/tuucho/`, shop and third-party packages under `plugins/user/`.

The current tree has **no** Admin GitHub pull. Updates today are zip upload plus `Scan`. Kernel schema uses `node-pg-migrate` (`pgmigrations`). Plugin schema uses `back/migrations/` (`plugins_schema_migrations`). This plan adds a Jenkins-simple Check / Apply that walks **every tag**.

---

## Locked decisions

- One official Tuucho origin: **https://github.com/by-tezov/tuucho-ecom**. Hardcoded. Not a setting.
- One tag = one shop release (`1.0.9` = kernel `CORE_VERSION` = official `release.json` `tag` / `kernel`). Tags are `MAJOR.MINOR.PATCH` with **no** `v` prefix (`1.0.9`, never `v1.0.9`). Ignore `v…` tags if they appear. Root `package.json` is the operator’s; Check / Apply never read it for kernel version. No per-plugin GitHub for Tuucho.
- Check reads **the latest git tag**, never untagged `master` HEAD.
- Jump (shop on tag 1, latest 5): apply **2 then 3 then 4 then 5**. Skipping a tag is forbidden.
- `plugins/user/` is never overwritten by a Tuucho update.
- User / third-party plugins update only from the `repository` URL on **that** `plugin.json`, and only that plugin’s folder.
- Backup, then apply. Fail closed. No half-updated shop. Operator never git-pulls by hand.

---

## How the tree works today (do not reinvent)

Scan roots (nested `plugin.json`, leaf folder = `id`):

1. `plugins/tuucho/` first. Id **must** start with `tuucho-`.
2. `plugins/user/` second. Id **must not** start with `tuucho-`.

`installPath` is the repo-relative posix path of that leaf. Zip unpack uses it. Path guards reject the wrong tree, `..`, overlap, and kernel overwrite. Archive **members** still cannot be named `plugins/…` or `kernel/…`.

| Layer | Path | Version today |
| --- | --- | --- |
| Kernel | `kernel/` plus `plugin-sdk` | Running identity is `CORE_VERSION` `1.0.9` plus `shop-release.json`. Official-repo CI keeps `CORE_VERSION` in lockstep with `kernel/back/package.json` and `kernel/front/package.json`, not the shop root `package.json`. |
| Bundled set | `plugins/tuucho/manifest.json` | `{ kernel, plugins: [{ id, version, defaultEnabled }] }`. Disk `plugin.json` remains scan source of truth. |
| Plugin package | `…/<id>/plugin.json` | `id`, `version`, `kind`, `description` (required except locale), `installPath`, `engines.core`, optional `dependsOn` |
| Kernel schema | `kernel/back/src/db/migrations/` | Timestamped `node-pg-migrate` files. History is sometimes squashed (see `migration-history.md`). That is why jumps must walk tags: later tags can delete intermediate files. |
| Plugin schema | `<plugin>/back/migrations/` | `^\d{3,}[_-][a-z0-9][a-z0-9_-]*\.js$`, `up` / `down`. Tables must be `plugin_<id_with_underscores>_…`. Applied names live in `plugins_schema_migrations`. Enable / scan / boot of an enabled plugin runs pending `up`, then sets `plugins.schema_version` to the package version. |
| First-run | `npm run setup` / `setup:cli` | Writes env, starts Postgres, `npm install`, `database-migrate`, sample seed, admin user, `installed.lock`. Shop on **5174**. |
| Admin install today | Plugins → Upload archive | Blocking `LoadingModal` plus per-file log. Then scan and enable. |

There is **no** `repository` field on `plugin.json` yet. There is **no** shop-release record beyond `CORE_VERSION` and each package version.

---

## Two origins

### 1. Official Tuucho (kernel + every bundled `tuucho-*`)

Only **https://github.com/by-tezov/tuucho-ecom**.

Check and Apply for scopes **kernel**, **all Tuucho plugins**, **all**, or **one bundled plugin** talk to this origin. They download tag zipballs (or the equivalent public archive URL). They never clone untagged `master`. They never follow a fork URL, a mirror, or an operator-typed origin.

### 2. User / third-party (one plugin under `plugins/user/`)

`plugin.json` **may** include:

```json
"repository": "https://github.com/acme/gift-wrap"
```

Rules:

- HTTPS GitHub repo root only (`https://github.com/<owner>/<repo>`, no `.git` required, no `git@`, no GitLab / npm / arbitrary URL in v1).
- Used for **that plugin id only**. Complements (`*-locale-fr`) are separate packages with their own `repository` if they want updates.
- Missing `repository`: that plugin is zip-only. Check skips it. Upload archive remains the install path.
- A Tuucho core update **does not** read these URLs and **does not** write under `plugins/user/`.

A `tuucho-*` id **must not** carry `repository`. If present, scan and Check ignore it. Bundled plugins update from origin 1 only.

---

## Install

Operator does not need git after the first clone.

```bash
git clone --branch 1.0.9 --depth 1 https://github.com/by-tezov/tuucho-ecom.git
cd tuucho-ecom
npm run setup:cli -- --yes --store-name … --admin-email … --admin-password …
npm run dev
```

Or `npm run setup` and the wizard on `:8787`. Same as today: env / config → Postgres → migrate → seed → run.

After a successful setup, write **`shop-release.json`** next to `installed.lock` (gitignored):

```json
{
  "origin": "https://github.com/by-tezov/tuucho-ecom",
  "tag": "1.0.9",
  "kernel": "1.0.9",
  "releaseId": 9,
  "installedAt": "2026-10-19T00:00:00.000Z"
}
```

If an existing shop has `installed.lock` but no `shop-release.json`, Check treats current kernel `CORE_VERSION` as the tag (same `MAJOR.MINOR.PATCH` string), and refuses Apply until it can confirm that tag exists on origin 1. It does not read any `package.json`.

User plugins already on disk stay. Setup never fetches third-party origins.

---

## Catalog

### Official release manifest (every Tuucho tag)

Commit **`release.json`** at the **repo root** on every tag. Check reads this file from the **latest tag**, then from each intermediate tag during Apply. Official-repo CI (`npm run check:release`) fails the tag if this file is missing, if `tag` / `kernel` disagree with `CORE_VERSION` or `kernel/back` / `kernel/front` `package.json`, or if the plugin list disagrees with `plugins/tuucho/manifest.json`. It must **not** require the running shop’s root `package.json` to match.

```json
{
  "tag": "1.0.9",
  "kernel": "1.0.9",
  "releaseId": 9,
  "kernelMigrations": [
    "1738000000000_init",
    "1791331200000_staff_roles"
  ],
  "plugins": [
    {
      "id": "tuucho-theme-default",
      "version": "1.0.0",
      "installPath": "plugins/tuucho/theme/default/tuucho-theme-default"
    }
  ]
}
```

- `releaseId`: integer, **strictly increasing** with each published tag. Holes are a refused catalog.
- `kernelMigrations`: ordered `node-pg-migrate` names **present in that tag**. Apply uses the files from **that tag’s tree**, not from latest.
- `plugins`: every bundled `tuucho-*` id. Disk `plugin.json` at `installPath` must match `id` + `version`.
- Keep `plugins/tuucho/manifest.json` as the enable / defaultEnabled catalogue. `release.json` is the update catalog. They must not drift.

Tags are `MAJOR.MINOR.PATCH` (no `v`). Order is semver, not git-date. A `v1.0.9` tag is ignored.

### Third-party catalog (each publisher tag)

See [Publisher contract](#publisher-contract). The shop reads `plugin-release.json` from that tag (or falls back to `plugin.json` `version` equal to the tag).

---

## Check

One button. Staff permission: existing Plugins permission (`preferences`). No extra role in v1.

1. Read `shop-release.json` (official current tag) and running `CORE_VERSION`. Never root `package.json`.
2. GET origin 1 tag list. Pick the **latest semver tag** (`MAJOR.MINOR.PATCH` only; ignore `v…`, draft, `-rc`, `-beta`) that has a valid `release.json`.
3. Diff current tag → latest: kernel semver, each bundled plugin version, `releaseId` sequence.
4. For each installed `plugins/user/` package with `repository`: GET that origin’s latest tag, diff that plugin’s version only.
5. Show a list of **what would change**. Do not download full trees yet except the latest `release.json` / `plugin.json`.
6. Never propose `master`. Never propose skipping a tag.

If GitHub is unreachable: fail closed, keep the shop running, show the error in the overlay log. Do not cache a stale “you are current” as success.

---

## Apply (including jumps)

Jenkins-simple: **Check → list → Apply**. Apply is blocking. Same overlay idea as plugin zip install (`LoadingModal` + scrolling log of steps). Shop is in maintenance until Apply finishes or rolls back.

### Scopes

| Scope | Writes | Walks |
| --- | --- | --- |
| One bundled plugin | That `installPath` under `plugins/tuucho/` only | Every official tag between current and latest where that id’s version (or migrations) changed |
| All Tuucho plugins | Every path under `plugins/tuucho/` | Every official intermediate tag |
| Kernel | `kernel/`, `plugin-sdk`, root `release.json`. Never the shop root `package.json` or lockfile. | Every official intermediate tag |
| All | Kernel + all bundled plugins | Every official intermediate tag |
| One user plugin | That plugin’s folder under `plugins/user/` only | Every tag on **that** `repository` between installed version and latest |

**One bundled plugin** still walks tags (plugin `up` files can appear on an intermediate tag and vanish after a later tidy). If that plugin’s `engines.core` no longer matches the **current** kernel, Apply **refuses** and tells the operator to use Kernel or All.

A user-plugin Apply never writes `plugins/tuucho/` or `kernel/`. If `engines.core` does not match, refuse (zip install already returns `409 plugin_incompatible`).

### Official jump (shop on `v1`, latest `v5`)

For tags `v2`, `v3`, `v4`, `v5` in order:

1. **Snapshot** (once before the first tag, reused if a later tag fails):
   - `pg_dump` of the shop database.
   - Tarball of `kernel/`, `plugin-sdk`, `plugins/tuucho/`, `release.json`, `shop-release.json`. **Exclude** shop root `package.json` / lockfile, `plugins/user/`, `.env`, `installed.lock`, media uploads, `node_modules`.
2. Download that tag’s zipball from origin 1 into a staging dir.
3. Validate `release.json` (`releaseId` is current+1, no hole, kernel semver matches tag).
4. Copy the scoped paths from staging over the live tree. **Never copy `plugins/user/`.**
5. `npm ci` in `kernel/back` and `kernel/front` (fail closed on lock mismatch). Never `npm ci` against the shop root lockfile.
6. Kernel `database-migrate` against **this tag’s** `kernel/back/src/db/migrations/` (pending `up` only; `pgmigrations` is the cursor).
7. Plugin scan. For enabled compatible plugins, run pending `back/migrations/` `up` from the **new** disk files. Record names in `plugins_schema_migrations`. Set `plugins.schema_version`.
8. Write `shop-release.json` for **this** tag (so a retry does not re-apply it).
9. Next tag.

After the last tag: leave maintenance, reload plugin host / ask for process restart if the kernel binary changed. Overlay log stays until the operator dismisses it (RGAA: no auto-close).

**Fail closed:** any step throws → restore the snapshot (files + `pg_restore`) → keep the pre-Apply `shop-release.json` → stop. Do not apply the next tag. Do not leave kernel files from tag 4 with a database from tag 2.

### User-plugin jump (installed `1.0.0`, latest tag `1.3.0`)

Same shape, smaller blast radius:

1. Snapshot: `pg_dump` plus a copy of **that** `installPath` only.
2. For each intermediate tag on that origin: download, run the [Publisher contract](#publisher-contract) refuse list, replace **that folder only**, run pending plugin `up`.
3. Failure restores that folder and the dump. Kernel and other plugins stay untouched.

Locale complements are not auto-pulled. If `gift-wrap-locale-fr` has its own `repository`, it is a second Check row.

### Why every tag (Flyway-style)

Kernel already squashes and deletes intermediate migration files (`docs/schema/migration-history.md`). Plugin packages can do the same. Latest-only would skip `up` that no longer exist on HEAD. Walking tags applies each release’s files while they still exist in that tag’s tree. `pgmigrations` / `plugins_schema_migrations` make a already-applied file a no-op.

---

## What is never updated

| Path / data | Tuucho Apply | Third-party Apply |
| --- | --- | --- |
| `plugins/user/` | Never | Only the one plugin folder in scope |
| Shop root `package.json` / lockfile | Never | Never |
| `.env`, `.private.env`, secrets | Never | Never |
| `installed.lock` (store name, admin email) | Never | Never |
| Media / uploads | Never | Never |
| Postgres **rows** (orders, users, catalogue) | Only via kernel / plugin `up` | Only that plugin’s `plugin_<id>_…` tables |
| Operator edits under `plugins/tuucho/` | Overwritten if Apply runs. Check **refuses** when the folder hash disagrees with the recorded tag (see Risks). | Never writes here |
| `sample/` | Not part of Apply | Never |
| Official origin URL | Not a setting | N/A |

Zip **upload** remains for first install of a user plugin and for publishers who do not set `repository`. Upload still refuses an already-on-disk id (`already_installed`). Update of a user plugin with `repository` is Apply, not a second zip.

---

## Admin UI

Hub lives on **Admin, Plugins**. No new instructional body copy on that page (existing rule: Core version is already inlined with the title).

- Title row: **Plugins** plus Core `1.0.9` plus, after Check, a quiet “update available” / “up to date” on that same Core line.
- Toolbar: existing Scan and Upload. Add **Check for updates**. After a Check that found work, **Apply** (primary). Scope: All (default), Kernel, All Tuucho plugins. One-plugin Apply is on that row.
- User plugin row with `repository`: version line plus origin host. Badge when that origin has a newer tag.
- Bundled `tuucho-*` rows: no per-plugin GitHub. One-plugin Apply is an advanced control on the row, still origin 1.
- Check result is a list: tag path (`1.0.9` to `1.0.10` to `1.0.11`), kernel, each plugin version that would change, third-party rows separately. Confirm, then Apply.
- Apply uses the same blocking overlay + log as zip install (`pending` / `installing` / `ok` / `error` per step, including “snapshot”, “tag 1.0.10 files”, “kernel migrate”, “plugin tuucho-mail-spy up”). Operator cannot click Scan, Upload, or another Apply until it finishes.
- Kit: kernel Button, ConfirmModal, LoadingModal. No native file chrome on Upload (already). Mobile: full-width stack.

---

## Publisher contract

Third parties who want Check / Apply must publish so the shop can detect and walk tags. Zip-only publishers can ignore this section.

**Write later (not this file):** an in-app handbook article under `tuucho-docs-developer` (and a short operator page) titled **Publishing a plugin for updates**. Same rules as below. Do not duplicate a second policy.

### Must publish

| Rule | Locked value |
| --- | --- |
| Host | Public GitHub repository |
| Tags | `MAJOR.MINOR.PATCH` on that repo. Order is semver. Never `v1.2.0`. |
| Version | `plugin.json` `"version"` **equals** the tag (`1.2.0` ↔ `"1.2.0"`). Mismatch: shop refuses that tag. |
| Package layout | **Repo root is the plugin package.** `plugin.json` and `back/register.ts` (or `.js`) at the root of the zipball. Nested `plugins/user/…` inside the archive is refused (same as today’s zip members). |
| `installPath` | Under `plugins/user/…`, leaf equals `id`, posix, no `..`. Shop writes there. |
| Id | `[a-z0-9-]+` and **must not** start with `tuucho-`. Leaf folder name equals id. |
| Description | Required except locale plugins (`kind: locale` or `*-locale-[a-z]{2}`). |
| Changelog | `CHANGELOG.md` at package root, or `changelog` string on `plugin-release.json`. Check shows the notes for each walked tag. Missing changelog: still allowed, list shows version only. |
| Migrations | Additive `back/migrations/` files. Never rewrite or delete an `up` that shops may already have applied. Each file exports `up` / `down`. SQL may only mutate `plugin_<id_with_underscores>_…`. |
| Jump / transitive | Every tag between the shop’s version and latest must be a complete, bootable package. The shop will fetch **each** tag and run that tag’s new `up` files. Do not tell operators to “just install latest”. |
| `engines.core` | Semver range. Shop refuses the tag when it does not match the running kernel (`plugin_incompatible`). |
| `plugin-release.json` (required for updates) | Next to `plugin.json` on every tag. See shape below. |

```json
{
  "id": "gift-wrap",
  "version": "1.2.0",
  "tag": "1.2.0",
  "releaseId": 4,
  "migrations": ["001_tables.js", "002_indexes.js"],
  "changelog": "Adds gift-wrap SKUs."
}
```

`releaseId` strictly increases. `migrations` lists files **in that tag**. The shop applies names not yet in `plugins_schema_migrations`.

Set `"repository"` on `plugin.json` to the repo root URL so shops can Check.

### What the shop will refuse

Reuse today’s archive and path guards, plus catalog checks:

| Code / reason | When |
| --- | --- |
| `missing_manifest` | No `plugin.json` |
| `invalid_manifest` | Not JSON, bad id, missing `back/register.ts`, missing description on a non-locale plugin |
| `unsafe_path` / `zip_slip` / `absolute_path` | `..`, absolute `installPath`, unsafe segment |
| `kernel_overwrite` | Archive member named `plugins/…` or `kernel/…` |
| Wrong tree | `tuucho-*` id, or `installPath` not under `plugins/user/` |
| `path_conflict` / `already_installed` | Overlap with another plugin (first install only) |
| `plugin_incompatible` | `engines.core` or `dependsOn` fail |
| Tag / version mismatch | Git tag `1.2.0` but `plugin.json` version `1.1.0`, or a `v…` tag |
| `releaseId` hole or decrease | Missing intermediate publisher tag |
| Non-GitHub or non-HTTPS `repository` | Ignored / Check error for that plugin |
| Private repo / 404 / auth required | Fail that plugin’s Check. v1 has no GitHub token UI. |
| Id change across tags | Refuse. Updates replace the same id / `installPath` only. |

Uninstall stays the existing trash + confirm path (runs `down`, drops `plugin_<id>_…`, deletes the `plugins` row). Updates never uninstall.

---

## Risks

**Operator edits under `plugins/tuucho/`.** A Tuucho Apply replaces those folders. Check hashes each bundled `installPath` against the recorded tag zipball. If dirty: list the paths, **refuse Apply** until the operator copies the edits out (or into a `plugins/user/` plugin). No silent overwrite. No “force” in v1.

**Database migrations.** Kernel `up` cannot be walked back (no down on `node-pg-migrate` history). Plugin `down` exists for uninstall, not for a failed jump. The only rollback is the **snapshot** (`pg_restore` + file tarball). A migration that mutates live orders must stay additive and backward compatible with the previous tag’s running code, same as today’s policy.

**GitHub egress.** The **shop server** must reach `github.com` and `codeload.github.com` (HTTPS). Firewalls, missing DNS, and API rate limits fail Check / Apply closed. Official origin is public; no token in v1. Third-party private repos are out of v1. Do not proxy the archive through the operator’s browser.

**Rollback.** Success path does not keep every intermediate snapshot (disk). Keep the pre-Apply snapshot until the operator dismisses the overlay as success, then delete it. A later “go back to 1.0.9” is restore-from-backup, not tag-walk `down`. Document that in the handbook.

**Half-applied process restart.** Kernel Apply may need a Node restart. Overlay stays up through restart if possible; if not, `shop-release.json` plus a `update-in-progress` flag in that file tells the next boot to restore the snapshot instead of serving a mixed tree.

**User-plugin trust.** `repository` is attacker-controlled once written to disk. Only HTTPS GitHub, only that plugin folder, same zip path guards as upload. Changing `repository` to a different owner after install: Check shows the new origin and requires Confirm before Apply (still that id only).

---

## Out of scope (v1)

- Untagged `master` / branch deploys as an update source
- Per-plugin GitHub for `tuucho-*`
- Operator-configurable official origin, mirrors, GitLab, npm registry
- Private GitHub tokens, signed commits, checksum allowlists beyond zipball of the tag
- Auto-update cron
- Skipping tags / “latest only” fast path
- Updating `plugins/user/` from origin 1 (including demo Guides)
- Rewriting kernel tables from a plugin `up`
- Multi-shop, staging slot, blue-green
- Walking kernel `down`
- Changing Vite **5174** or stealing that port during this work
- Implementing this plan

---

## Later, when implementing

1. `release.json` generator + CI drift check against `CORE_VERSION` and `plugins/tuucho/manifest.json`.
2. `shop-release.json` written by setup.
3. `plugin.json` optional `repository` (user ids only) on the kernel contracts.
4. Admin Plugins: Check / list / Apply overlay; Core line status; per-user-plugin origin badge.
5. Update worker: tag walk, snapshot, scoped copy, migrate, fail-closed restore.
6. Handbook article **Publishing a plugin for updates** (publisher contract above).
7. Operator handbook: install from a tag, Check, Apply, what is never touched, egress, rollback = restore snapshot.
