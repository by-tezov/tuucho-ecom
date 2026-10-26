---
cursor:
  subagentId: "bc-b06b1e38-478e-5519-8e55-50ae73fdc64b"
---

# Plugin config bulk (plan only)

Checkout: `/home/tezov/Local/tuucho-ecom`. **Do not execute** until Te says go. Git **read-only**. Do not steal or kill Vite **5174** or API **3010**. Stay generic ecommerce. No shop brands, no extra product languages.

Related: **[plugin-config-files.md](plugin-config-files.md)** (per-plugin files, first-launch, drift, Configure chrome, permissions). This file does **not** replace it. Bulk is the list-page + archive layer on top of that loader and those two permission codes. Also [config-ui.md](config-ui.md) (kit), [config-architecture.md](config-architecture.md) (DB remains SoT), [config-migrate.md](config-migrate.md) (factory vs shop JSON; migrate does not write DB).

**Why:** Operators move many plugin configs between shops. Per-plugin Configure already Update / Import / Export one id. They need **all**, as **archives**, with each file naming its plugin, and a compat check that **blocks unsafe apply**.

---

## Locked product rules

| Rule | Locked |
| --- | --- |
| Runtime SoT | Unchanged: DB `plugins.settings` / sealed `plugins.secrets`. Archives are input/export, not a live tree. |
| First-launch | Unchanged per [plugin-config-files.md](plugin-config-files.md). Boot still does **not** overwrite Admin. |
| Disk JSON on the shop | Unchanged flat schema keys under `tuucho-config/plugins/<id>/` (bundled) or the user-plugin config dir. **No** envelope required on disk. |
| Archive / download JSON | **Envelope** (below). Every member file names `pluginId`. |
| Permissions | Same two kernel codes. **No new codes.** `plugin_config_import` = Update all + Import all (and existing per-plugin apply/import). `plugin_config_export` = Export all (and existing per-plugin export). Ordinary Configure Save stays `preferences`. |
| Super-admin | Both codes (implicit catalogue). |
| Role `user` (customer) | Never. |
| Other staff | Off until Roles grants the same codes as today. |
| Plugins without `settingsSchema` | Never in bulk. Same as per-plugin: no files, no chrome. |
| Enable/disable | Bulk **never** enables or disables a plugin. |
| Write destination | Import/Update write **DB only** (same `writePluginConfigToDb`). They do not rewrite `tuucho-config/`. |
| Secrets | Never in logs, activity detail, handbook, or the public layer. Private layer is live secrets when set. |

---

## Disabled plugins (Te left this open)

**Locked recommendation:**

| Action | Disabled plugin |
| --- | --- |
| **Update all** (disk → DB) | **Skip.** Disk apply is for plugins that are on. Enable later; first-launch or Configure still apply. |
| **Export all** | **Skip.** Operator who needs a disabled plugin’s JSON uses that plugin’s Configure Export. |
| **Import all** (archive) | **Apply if the archive names that plugin id.** Do **not** enable it. Restore settings so a later enable is already configured. Unnamed disabled plugins stay untouched. |

Justification: Update/Export-all are “current shop, running plugins.” Import-all is a backup restore keyed by **named files**, so a disabled id in the archive is intentional. Skipping unnamed disabled plugins avoids surprising writes.

Unknown `pluginId` in the archive → skip that member with a warning (do not 400 the whole archive unless **zero** members are usable).

---

## Archive format

Reuse kernel `pluginArchive.ts` (`extractZip` / `extractTarGz` / `buildStoredZip`). **No new zip library.** Same zip-slip / absolute-path rejects as plugin install. Accept **`.zip` and `.tgz` / `.tar.gz`**.

### Layout (bulk)

```
<plugin-id>/config.json
<plugin-id>/config.private.json
```

Optional extra path prefix (`tuucho-plugin-config/` or a single root folder) is stripped if every entry shares it. Filename still `config.json` / `config.private.json`. Directory segment **is** the plugin id (must match `^[a-z][a-z0-9-]{1,63}$` and the envelope).

Path id ≠ envelope `pluginId` → **block that plugin** (no write).

### Envelope (format `1`) — archive members and downloads only

```json
{
  "pluginId": "tuucho-payment-stripe",
  "layer": "public",
  "format": 1,
  "compat": {
    "core": ">=0.0.1 <1.0.0",
    "plugin": "^1.0.0"
  },
  "values": {
    "publishableKey": ""
  }
}
```

| Field | Rule |
| --- | --- |
| `pluginId` | Required. Installed plugin id. |
| `layer` | `public` or `private`. Must match filename (`config.private.json` → `private`). |
| `format` | Integer. Unknown format → **block** that plugin. |
| `compat.core` | npm-style range. Must satisfy shop `CORE_VERSION` via existing `satisfiesRange`. Taken from the plugin’s `engines.core` **at export**. |
| `compat.plugin` | npm-style range. Must satisfy the **installed** plugin `version`. At export: `^` + that plugin’s npm version (same-major). |
| `values` | Schema keys only. Public layer: secret key names → `400 invalid_request` for that file (blocks that plugin). Unknown keys: ignore + warn. |

Public and private for one id are **one transaction**: if either layer is blocked, write neither.

Disk files used by Update all / first-launch stay **flat** (no envelope). Compat is not re-checked on disk apply (this shop, this kernel).

### Per-plugin Configure export (today: two JSON downloads)

| Layers present | Download |
| --- | --- |
| Public and private | **One zip** (`<id>-config.zip`) with both enveloped files. |
| Only one layer | That **one JSON** file (enveloped). Not a zip. |

Per-plugin **Import** already takes one or many files. **Also accept one archive** (zip/tgz) of that plugin’s files. Members must name **this** `:id` (path and/or envelope). Wrong id → `400 invalid_request`. Loose flat JSON without envelope still works on this page (id is the route), same classify-by-name as [plugin-config-files.md](plugin-config-files.md).

---

## Version compatibility (unsafe apply)

Must **block** (no DB write for that plugin) when any of:

1. Plugin id not installed (no row / no manifest).
2. Plugin has no `settingsSchema`.
3. Envelope `format` ≠ `1`.
4. Shop core does not satisfy `compat.core`.
5. Installed plugin version does not satisfy `compat.plugin`.
6. Path id ≠ envelope id, or layer ≠ filename.
7. Public payload contains secret keys.

HTTP for a **single** blocked per-plugin import: `409 plugin_config_incompatible` (or `400 invalid_request` for mixed secrets / bad JSON). Message names the plugin id and which check failed. **Never** the secret values.

Bulk import: **not** all-or-nothing across the shop. Per-plugin atomic. Response:

```json
{
  "success": true,
  "applied": ["tuucho-signin-google"],
  "skipped": [{ "id": "page-legal", "reason": "no_schema" }],
  "blocked": [{ "id": "tuucho-payment-stripe", "reason": "compat_plugin" }]
}
```

`success: true` if the request was authorized and the archive parsed. If the archive itself is zip-slip / not an archive → `400 invalid_archive` and **zero** writes.

---

## Admin UI

### Plugins list (`/admin/plugins`)

Kernel **FormSection** near the top of the page (with Scan / zip-install toolbar, not buried in a row): **Update all / Import all / Export all**.

| Control | Perm | Behaviour |
| --- | --- | --- |
| **Update all** | `plugin_config_import` | ConfirmModal. Apply disk files for every **enabled** schema plugin that has files. Skip disabled / no files / no schema. |
| **Import all** | `plugin_config_import` | `ui.FileField` `accept` zip/tgz, not multiple. ConfirmModal (overwrites DB for named plugins). |
| **Export all** | `plugin_config_export` | ConfirmModal (private layers may contain secrets). Download one zip of enabled schema plugins. |

Hide without the matching permission (no disabled tease). `preferences` alone is not enough. Super-admin sees all three.

Kit: `FormSection`, `Button`, `FileField`, `ConfirmModal`, `DocsCallout`, `LoadingModal`. **No** native `<input type="file">` on the page. Extract `AdminPluginConfigBulk.tsx` so `AdminPluginsPage.tsx` does not grow past its ratchet.

Chrome strings: `admin.whiteLabel` + `tuucho-kernel-locale-fr`. Report line for applied/skipped/blocked counts.

### Configure (`/admin/plugins/:id`)

Keep Update / Import / Export. Change Export to zip-when-two-files. Change Import to accept archive **or** JSON. Same permissions and kit.

---

## HTTP

Existing per-plugin routes stay. File routes still sit behind `requireAuth` + `requirePermission('preferences')` (Plugins area) **and** the file code.

| Method | Path | Perm | Notes |
| --- | --- | --- | --- |
| `POST` | `/admin/plugins/config-files/apply-all` | `plugin_config_import` | Disk → DB, enabled + schema + files. |
| `POST` | `/admin/plugins/config-files/import-all` | `plugin_config_import` | `multer` memory, same size cap as plugin zip install. Body is the archive. |
| `GET` | `/admin/plugins/config-files/export-all` | `plugin_config_export` | `Content-Disposition` zip. Never log body. |
| `POST` | `/admin/plugins/:id/config-files/import` | `plugin_config_import` | Extend: JSON `{ files: [{ name, text }] }` **or** multipart archive. |
| `GET` | `/admin/plugins/:id/config-files/export` | `plugin_config_export` | One JSON **or** zip (`application/zip`) per the two-file rule. |

`check:routes` / `01-admin.md` / `09-reference.md`. 403 without the file code even with `preferences`. 403 export with only import, and the reverse.

---

## Docs

- Kernel handbook article `config-files`: add **Bulk** (list actions, archive layout, envelope example with placeholders, compat block list, disabled rule).
- [plugin-config-files.md](plugin-config-files.md) Related already points here. Per-plugin Export sentence becomes: two layers → zip; Import accepts archive.
- Plugin handbooks: one line that list-page bulk uses the same files; no second JSON dump.
- Skills: `tuucho-plugin-admin` / create-plugin — schema plugins participate in bulk automatically (no extra register).

---

## Execute after Te says go (do not run now)

1. **Envelope + unpack helper** next to `pluginConfigFiles.ts` / reuse `pluginArchive.ts`. Unit tests: path vs envelope, zip-slip, mixed public secrets, `satisfiesRange` core/plugin, format ≠ 1, disabled skip vs named import, no-schema skip, per-plugin atomic (public fail ⇒ no private write).
2. **HTTP** apply-all / import-all / export-all + per-plugin import/export shape. Multer only on import-all (and optional per-plugin multipart). Never log bodies. Route inventory.
3. **Front** `AdminPluginConfigBulk` on Plugins list; Configure export/import archive. Kit only. EN/FR. Permission hide. ConfirmModals.
4. **Docs** kernel `config-files` + this plan’s examples. Placeholder secrets only.

Verify: `/healthz` still up. **Do not bind or kill 5174/3010.** Spot-check: staff without import sees no Update/Import all; export-all zip has no public file with secret keys; blocked compat does not change that plugin’s DB.

---

## Out of scope

- Changing first-launch or boot overwrite ([plugin-config-files.md](plugin-config-files.md)).
- Putting kernel `tuucho-config/config.json` in the same archive.
- Auto-enable on import.
- Writing the archive back onto disk.
- New permission codes.
- Extra product languages, shop brands, commit / push / GitHub. Plan only until Te says go.
