---
cursor:
  subagentId: "bc-b06b1e38-478e-5519-8e55-50ae73fdc64b"
---

# Plugin config files (plan only)

Checkout: `/home/tezov/Local/tuucho-ecom`. **Do not execute** until Te says go. Git **read-only**. Do not steal or kill Vite **5174** or API **3010**. Stay generic ecommerce. No shop brands, no extra product languages.

Related: [config-architecture.md](config-architecture.md) (kernel JSON merge, secrets at rest, isolation), [config-ui.md](config-ui.md) (Configure kit + `settingsSchema`), [v0.0.4.md](v0.0.4.md) (`tuucho-config/` lives outside `tuucho/`; Apply never writes it), [config-migrate.md](config-migrate.md) (factory templates, first-install copy, `config:migrate` add/rename/drop), [plugin-config-bulk.md](plugin-config-bulk.md) (Plugins list Update/Import/Export **all**, archives, compat). **This file wins** for plugin JSON files, first-load, drift, Configure import/export, and where those files are documented. Where [config-architecture.md](config-architecture.md) still says plugin files live “inside that plugin”, bundled plugins use `tuucho-config/plugins/<plugin-id>/` instead. Shipped templates for those files live in `tuucho/factory-config/plugins/<plugin-id>/` ([config-migrate.md](config-migrate.md)).

**Why:** After 0.0.4, plugin credentials left process env. They only live in Admin Configure + sealed DB. Env cannot be reused. Operators who already keep kernel JSON as public git + gitignored private files need the **same** for plugins. Admin Configure **stays**.

---

## Locked product rules

| Rule | Locked |
| --- | --- |
| Source of truth at runtime | DB: public `plugins.settings`, sealed `plugins.secrets`. Files are an operator **input/export** surface, not a second live config tree. |
| Admin Configure | Stays. Schema form from [config-ui.md](config-ui.md). Files do not replace it. |
| Boot overwrite | **Forbidden.** Do **not** auto-sync from file hash on every boot. That fights Admin edits (files ≠ DB). |
| Hash | May be stored to **detect** drift and show “files differ” on Configure. Never to overwrite DB from files. |
| First launch only | Plugin **not set up yet** (empty operator settings/secrets) **and** config files exist → load files into DB **once**, then stamp applied. |
| Secrets in git | Never. Private file gitignored. Committed `*.example` uses placeholders only. Export of live secrets is a **private** download, not mixed into public JSON. |
| Kernel JSON | Still must not name plugin brands or plugin keys ([config-architecture.md](config-architecture.md)). Plugin file keys come from that plugin’s `settingsSchema` only. |
| Plugins without `settingsSchema` | No config files, no handbook JSON section, no Configure file chrome. |
| Ordinary Configure save | Existing kernel permission **`preferences`** (today’s Plugins / Configure gate). File import/export **not** this code. |
| Load files into DB | Kernel **`plugin_config_import`** — Import **and** Update from files. |
| Download files from DB | Kernel **`plugin_config_export`** — Export only (including private/secrets). |

---

## File layout (same public / private / example as kernel)

Merge order matches kernel ([config-architecture.md](config-architecture.md), [v0.0.4.md](v0.0.4.md)): common public → env public → common private-or-example → env private-or-example. No process-env overlay of plugin keys.

Private missing + example present → **warn**, load example (placeholders). Private and example both missing, but public exists → load public only (warn: no secrets file). Public missing when this plugin has `settingsSchema` and the operator expected files → **not** a boot-fatal for the shop; skip file layer (Configure still works). Bundled **committed** examples must exist for every schema plugin (doctor/check, not silent).

Optional env folders use `APP_TARGET`, same as kernel. Missing env folder for a plugin is **not** an error (plugin files may be common-only).

### Bundled plugins (`tuucho-*` under `tuucho/plugins/`)

Always:

```
tuucho-config/plugins/<plugin-id>/
  config.json                         # public, committed
  config.private.json                 # gitignored
  config.private.example.json         # committed placeholders
  <APP_TARGET>/config.json            # optional
  <APP_TARGET>/config.private.json    # gitignored, optional
  <APP_TARGET>/config.private.example.json
```

Apply / Tuucho updates **never** write `tuucho-config/` ([v0.0.4.md](v0.0.4.md)). Do not put operator-editable copies under `tuucho/plugins/…`.

`.gitignore` (shop root): `tuucho-config/plugins/**/config.private.json` (covers env overlays). Keep existing `tuucho-config/config.private.json` and `tuucho-config/*/config.private.json`.

### User plugins (outside `tuucho/`)

**Operator choice.** Default = **same folder as that plugin’s `package.json`**:

```
<user-root>/…/<plugin-id>/package.json
<user-root>/…/<plugin-id>/config.json
<user-root>/…/<plugin-id>/config.private.json
<user-root>/…/<plugin-id>/config.private.example.json
```

`package.json` `tuucho` **may** set the config directory (shop-relative or package-relative; must not escape the plugin package or write into `tuucho/`):

```json
{
  "tuucho": {
    "id": "page-legal",
    "configDir": "config"
  }
}
```

`configDir: "config"` → `<package>/config/` with the same four filenames. A user plugin may also point at `tuucho-config/plugins/<id>/` if the operator wants all JSON in one tree.

Gitignore user private files: `**/config.private.json` at shop root (or document that user roots must gitignore it). Never commit live secrets from zip-installed plugins.

---

## JSON shape (schema is the vocabulary)

Two objects, **flat keys matching `settingsSchema`**:

| File | Keys | Destination |
| --- | --- | --- |
| `config.json` (and env public) | Every schema field whose `type` is **not** `secret` | `plugins.settings` |
| `config.private.json` (and env private / example) | Every schema field with `type: "secret"` | `plugins.secrets` (seal with kernel PII helper) |

Unknown keys: ignore + warn (named plugin id + key). Wrong type: skip that key + warn. Empty string in private: skip (same as Configure: blank secret does not clear). To clear a secret, Admin Configure already has replace/empty semantics — files do not invent a second clear protocol in this pass unless Configure already supports it.

Example (generic sign-in style — **not** a product brand; real files at execute come from each plugin’s schema):

`config.json`:

```json
{
  "clientId": "",
  "signupTokenTtl": "10m"
}
```

`config.private.example.json`:

```json
{
  "appSecret": "replace-me"
}
```

Public file must not contain secret key names. Private file must not contain public keys. Check fails if a key appears in the wrong file.

Kernel `tuucho-config/config.json` shape is unchanged: http, paths, database, session, smtp shell, security, logs. Documented in **kernel docs**, not in plugin handbooks.

---

## First launch (once)

A plugin is **not set up yet** when:

1. No secret keys are stored (unsealed map empty), and
2. Every public schema key is missing, `""`, or deep-equal to `tuucho.defaultSettings`.

Then, if merged config files exist (public and/or private-or-example):

1. Upsert settings + secrets into DB (same path as Admin PATCH: `patchPluginSettings` / `patchPluginSecrets`).
2. Stamp `config_files_applied_at` (timestamptz) and store `config_files_hash` (canonical JSON of merged public + private **as loaded**).
3. Never run this path again for that plugin id until uninstall recreates an empty row.

If files are only examples with placeholders, still load once (kernel-style warn). Operator then edits Configure or files + **Update from files**.

Not first-launch: files present, DB already has operator values → do nothing at boot. Show drift on Configure if hashes differ.

---

## Drift (detect, do not overwrite)

Canonical hash: stable JSON stringify of merged public object + merged private object (key-sorted). Store on the plugin row (new columns on `plugins`, not a fake settings key).

Configure GET includes:

- `configFiles: { present, hash, appliedHash, differ, paths[] }` (`paths` are shop-relative, never file contents of private).
- `differ: true` when files exist and `hash !== appliedHash` (or files exist and DB was only ever Admin-edited so applied hash is null but files are non-empty).

UI: kit callout “Files differ from what is saved.” Actions below. **No** automatic write either direction.

Changing Admin fields does not rewrite files. Changing files does not rewrite DB until the operator clicks **Update from files**.

---

## Configure UI (kernel kit)

Chrome on `/admin/plugins/:id` when `settingsSchema` has keys. Extra **below** the schema form, same composition rule as [config-ui.md](config-ui.md) (`pluginFront.configure` still composes, never replaces).

| Action | Behaviour |
| --- | --- |
| **Update from files** | `plugin_config_import`. Read merged files on disk → PATCH settings/secrets → refresh hash. Hidden without the permission. Disabled if no files. Confirm if `differ` and DB has values (operator is replacing Admin with files). |
| **Export** | `plugin_config_export`. Download current **DB** values. **Public** file: non-secret keys only. **Private** file: secret keys only; `ConfirmModal` warning; if a secret is set, export the live value for that private download. If a secret is not set, omit or empty string — never a fake value. Do **not** put secrets in the public download. Archive members and downloads use the envelope in [plugin-config-bulk.md](plugin-config-bulk.md). Two layers → one zip (`<id>-config.zip`); one layer → that JSON file. Import also accepts a zip/tgz of this plugin’s files. Hidden without the permission. |
| **Import** | `plugin_config_import`. Operator picks **one or many** JSON files, or one zip/tgz of this plugin’s files. Map by name (`config.json` / `config.private.json` / `*.example`) or by key ∩ schema. Loose flat JSON still works (id is the route). Inject into DB. Reject files that mix secret keys into a public payload (`invalid_request`). Hidden without the permission. |
| Schema Save | **`preferences` only.** Same as today’s Configure PATCH. Must not require or grant the file codes. |

**Kit first** ([config-ui.md](config-ui.md)): if missing, add to `KERNEL_UI` then Configure consumes:

- `ui.FileField` (or `ui.FilePicker`) — labelled file input, 44px, help text, multiple. **No** native `<input type="file">` on the Configure page itself.
- Existing `Button`, `ConfirmModal`, `DocsCallout` / `FormSection` for the files panel.

English chrome strings on `admin.whiteLabel` + `tuucho-locale-fr` overlay. Do not hardcode field copy.

HTTP: `/admin/plugins` stays `requireAuth` + `requirePermission('preferences')` for list and ordinary Configure PATCH (today). File routes add a **second** gate (403 `forbidden` without it). Do not reuse `preferences` for file bodies.

- `POST /admin/plugins/:id/config-files/apply` — `plugin_config_import`
- `POST /admin/plugins/:id/config-files/import` — `plugin_config_import` (multipart or JSON array of `{ name, text }`)
- `GET /admin/plugins/:id/config-files/export` — `plugin_config_export` — `{ public, private }` JSON; never log bodies

Do not print secrets in logs, activity detail, or handbook.

---

## Permissions (locked)

Kernel codes on `CORE_PERMISSIONS` (not plugin-manifest permissions). Same wiring as `orders` / `preferences`: vocabulary migration row, Admin → Roles toggle, `admin.whiteLabel` / `tuucho-locale-fr` labels. Pattern `^[a-z][a-z0-9_]{1,63}$`.

| Code | Grants | Why separate |
| --- | --- | --- |
| `plugin_config_import` | **Import** and **Update from files** | Can overwrite production settings/secrets from disk or uploaded JSON. |
| `plugin_config_export` | **Export** (public + private download) | Can dump secrets off the shop. |
| `preferences` | Plugins nav, Configure form, ordinary Save | Already the plugin-configure permission. Do **not** mix file ops into it. |

| Role | Import/update | Export | Configure save |
| --- | --- | --- | --- |
| `super-admin` | yes (implicit catalogue) | yes | yes |
| `user` (customer) | never | never | never |
| Other staff | off until granted on Roles | off until granted | existing `preferences` grant |

UI: hide Import / Update from files unless the session holds `plugin_config_import`; hide Export unless `plugin_config_export`. Do not disable-and-show (no tease). Drift callout may still mention files differ; actions stay hidden.

API: missing matching permission → **403**, even if `preferences` is held. Holding import does not allow export, and the reverse.

First-launch file load at boot is **not** an admin permission (no HTTP user). It stays the empty-plugin seed path above.

Tests: `CORE_PERMISSIONS` includes both codes; `user` resolve is empty; super-admin catalogue includes them; router source uses `requirePermission('plugin_config_import')` / `plugin_config_export` on the file routes only; Configure PATCH still `preferences`. Front: buttons wrapped in the matching access check (`adminNavAccess` / roles rows cover the new codes like other kernel permissions).

---

## Documentation (locked)

**Every JSON config file the product can load must appear in documentation**, with the real shape — not “see Admin”.

### Plugin handbook

Every plugin that declares `settingsSchema` ships a handbook section (existing `docs/handbook.json`, already required by `pluginDocsDisk` tests):

- Heading e.g. **Config files**.
- Paths: bundled vs user default vs optional `tuucho.configDir`.
- Merge / warn-example / gitignore, one short paragraph (do not duplicate the whole kernel essay).
- **Code blocks** (`type: "code"`, `language: "json"`) whose contents are the **same structure** as the committed examples:
  - public `config.json`
  - private `config.private.example.json` (placeholders only — never live secrets)
- Optional `defs` or `table`: key, type, public vs secret, one-line meaning (from schema `label` / `description`).
- Point to Admin Configure for editing; files are optional.

Plugins **without** `settingsSchema`: no fake JSON section.

### Kernel docs

Kernel documents **`tuucho-config/`** JSON (not plugin keys):

- README shop-root section (already started) + **developer handbook** article in `tuucho-docs-developer` `docs/articles.json` (group `kernel`), e.g. id `config-files`.
- Code blocks for `config.json`, `config.private.example.json`, env overlay, `plugins.json` / `plugins.example.json` ([v0.0.4.md](v0.0.4.md)).
- Pointer to this layout for `tuucho-config/plugins/<id>/`.
- Required private kernel paths remain `database.url`, `jwt.secret`, `pii.encryptionKey`, `pii.lookupPepper`, `ops.token`.
- Name the two kernel permissions (`plugin_config_import`, `plugin_config_export`) vs ordinary Configure (`preferences`).

`check:docs` / disk tests: kernel article exists; schema plugins have JSON code blocks; parsed keys **equal** `settingsSchema` split public vs secret; committed `tuucho-config/plugins/<id>/config.json` and `config.private.example.json` **byte-equivalent (canonical JSON)** to those handbook blocks.

Skills (`tuucho-create-plugin`, `tuucho-plugin-admin`): new schema plugin must add files + handbook blocks. Locale packs have no schema → no JSON files.

---

## Execute after Te says go (do not run now)

1. **Gitignore + loader** — reuse `deepMerge` / `loadPrivateLayer` from `tuucho/kernel/back/src/config/loadJsonConfig.ts` (extract shared helper if needed). Resolve bundled vs user `configDir`. Unit tests: merge order, warn vs error, unknown keys, secret/public split, path escape rejected.
2. **DB** — `config_files_hash`, `config_files_applied_at` on `plugins` (kernel migration, not a plugin table). First-launch hook after `ensurePluginRows` / scan, before runtime register. Tests: empty → load once; second boot no-op; Admin values not overwritten.
3. **Admin API + Configure chrome** — kit `FileField` first ([config-ui.md](config-ui.md) order), then files panel, apply/import/export, drift callout. Add `plugin_config_import` / `plugin_config_export` to `CORE_PERMISSIONS` + permissions vocabulary migration + Roles copy. Tests: public export has no secret keys; import mixed file 400; apply/import 403 without import permission; export 403 without export permission; Save still `preferences`; buttons hidden without grants.
4. **Ship files** — for every bundled plugin with `settingsSchema` (sign-in, Stripe, Mondial, contact, spy, gift, loyalty, vouchers, product-requests, vinted-review, …): committed public + private example under `tuucho-config/plugins/<id>/`. Placeholders only.
5. **Docs** — handbook JSON sections + kernel `config-files` article + README. Disk tests as above. `tuucho-locale-fr` chrome strings only.
6. **Doctor / setup** — first-setup does **not** copy plugin private examples over existing privates. Missing plugin examples for a schema plugin → check error. Shop still boots if a plugin file set is absent (Configure-only).

Verify: `/healthz` still up. **Do not bind or kill 5174/3010.** Spot-check Configure: switch gone stays a different bug; this pass is files + docs. Do not print secrets.

---

## Out of scope

- Factory vs shop tree and `config:migrate` (owned by [config-migrate.md](config-migrate.md)).
- Rewriting kernel JSON vocabulary or leftover env (done / owned by [config-architecture.md](config-architecture.md)).
- Auto-writing files when Admin saves.
- Env flatten of plugin keys (`FACEBOOK_*` etc. stay deleted).
- Payment-method / courier shells.
- Extra product languages.
- Commit / push / GitHub. Plan only until Te says go.
