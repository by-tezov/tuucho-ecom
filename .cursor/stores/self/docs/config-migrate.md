---
cursor:
  subagentId: "bc-b06b1e38-478e-5519-8e55-50ae73fdc64b"
---

# Config factory + migrate (plan only)

Checkout: `/home/tezov/Local/tuucho-ecom`. **Do not execute** until Te says go. Git **read-only**. Do not steal or kill Vite **5174** or API **3010**. Stay generic ecommerce. No shop brands, no extra product languages.

Related: **[v0.0.4.md](v0.0.4.md)** (shop root; Apply never writes `tuucho-config/`), **[config-architecture.md](config-architecture.md)** (merge order, required private paths, warn vs error vs `.example`), **[plugin-config-files.md](plugin-config-files.md)** (plugin JSON on disk, first-launch into DB, no boot overwrite), **[plugin-config-bulk.md](plugin-config-bulk.md)** (list archives). This file does **not** replace those. It wins for: **where shipped templates live**, **how a shop gets its first `tuucho-config/`**, and **how an existing shop upgrades JSON** when the library tag changes.

**Why:** Today `tuucho-config/` sits in the clone and is pushed with tuucho. From the operator’s POV tuucho is a **library**. Apply / next git tag that replaces `tuucho/` (or a naive pull of tracked config) would **erase their config**. Templates must live inside the library. Operator files must live outside it and **survive Apply**.

---

## Locked product rules

| Rule | Locked |
| --- | --- |
| Library templates | **`tuucho/factory-config/`**. Public JSON + `*.example` private placeholders only. **Never** live `config.private.json`. Apply / tag update **may replace** this tree. |
| Operator files | **`tuucho-config/` at shop root**, not inside `tuucho/`. Same merge and gitignore rules as [config-architecture.md](config-architecture.md) / [plugin-config-files.md](plugin-config-files.md). |
| Apply | Still **never writes `tuucho-config/`** ([v0.0.4.md](v0.0.4.md)). Apply may update `tuucho/factory-config/` and bundled plugin migration files under `tuucho/`. |
| First install | If `tuucho-config/` **does not exist** → copy factory → `tuucho-config/`. Materialise private files **from** `*.example` (never overwrite a private that already exists). Baseline the migrate stamp (all migrations in this factory count as applied). |
| Existing shop | If `tuucho-config/` **exists** → **do not copy over**. Run **migrate** (add / rename / drop keys). |
| Runtime SoT | Unchanged. Kernel boot reads `tuucho-config/`. Plugin runtime is still DB; files are input/export ([plugin-config-files.md](plugin-config-files.md)). |
| First-launch plugin DB | **Unchanged.** Empty settings/secrets + files present → load once. |
| Boot overwrite of Admin | **Forbidden.** Migrate writes **files only**. It does not PATCH `plugins.settings` / sealed secrets. |
| Secrets | Never in factory, logs, stamp, handbook, or dry-run dumps of private values. Placeholders only in `*.example`. |
| Library git | The tuucho pack does **not** track operator `tuucho-config/`. Shop git **may** track public JSON + examples; always gitignore `config.private.json` (kernel, env, plugins). |

Where [v0.0.4.md](v0.0.4.md) still describes a packed clone that **contains** operator `tuucho-config/` as product files in the library repo, **this file wins**. A clone of tuucho still becomes a shop: setup / `config:migrate` creates `tuucho-config/` from factory on first run.

---

## Trees

```
<shop>/
  tuucho/
    factory-config/                 # shipped. Apply may replace
      config.json
      config.private.example.json
      plugins.example.json
      <APP_TARGET>/config.json
      <APP_TARGET>/config.private.example.json
      plugins/<plugin-id>/
        config.json
        config.private.example.json
        <APP_TARGET>/…              # optional, same as shop overlay
      migrations/kernel/            # kernel declarative steps
        20261021_01_add-http-timeout.json
    plugins/…/<id>/config/migrations/   # bundled plugin steps (travel with tuucho/)
  tuucho-config/                    # operator. Apply never writes
    config.json
    config.private.json             # gitignored
    config.private.example.json
    plugins.json
    migrate-stamp.json              # applied step ids. Not a secret.
    plugins/<id>/…
  src/plugins/…                     # user plugins: own config/migrations/ + optional JSON beside package.json
```

Doctor / boot still **require** shop root = directory that contains `tuucho/` and (after first install) `tuucho-config/`. Missing `tuucho-config/` before first copy is **not** a boot of a live shop: setup or `config:migrate` must run. After first copy, missing folder is the same named error as today.

`config:env create <name>` copies that env’s factory public + `*.example` into `tuucho-config/<name>/` if the folder does not exist. Never overwrite an existing env folder.

---

## Warn / error vs `.example` (same as config-architecture)

Unchanged loader policy after migrate. Doctor and boot still:

| Situation | Result |
| --- | --- |
| Private missing + example present | **Warn**, load example (placeholders). Print “edit before production”. |
| Private and example both missing, kernel required paths empty | **Error**. Named keys: `database.url`, `jwt.secret`, `pii.encryptionKey`, `pii.lookupPepper`, `ops.token`. Do not boot. |
| Plugin public missing, schema plugin | **Warn**; Configure still works. Not shop-fatal. |
| Plugin private missing + example present | **Warn**, load example. |
| Plugin private and example both missing, public exists | Load public only (**warn**: no secrets file). |
| Missing `APP_TARGET` env folder for kernel | **Error** naming it; list folders that exist under `tuucho-config/`. |
| Missing plugin env overlay | **Not** an error (plugin files may be common-only). |

Migrate never prints private values. Factory never ships live `config.private.json`.

---

## Why Flyway-style steps (not convict as the migrator)

**Pick: declarative, ordered, named steps** (Flyway / the kernel’s own SQL migration habit) plus **factory documents as defaults** (the useful part of convict).

| Approach | Why not as the whole design |
| --- | --- |
| **node-convict schema as runtime** | Convict is env/default/validate for one object. This shop already has **layered JSON** (common → env → private-or-example), public vs gitignored private, and **per-plugin trees**. A convict schema would duplicate `loadJsonConfig` and would not do **renames**. |
| **Rename map only** (`oldPath → newPath`) | One map cannot sequence “rename A→B, then add C, then drop D” across two library tags. Stacked upgrades become a nightmare. |
| **Deep-merge factory over user on every Apply** | That is copy-over. User values lose, or factory defaults clobber Admin-exported files. Forbidden. |

**Locked shape:** each owner (kernel, or one plugin id) ships **versioned files**:

```
<NNNN>_<slug>.json
```

`NNNN` is an integer order (zero-padded). `slug` is `[a-z0-9-]+`. Applied ids are recorded in `tuucho-config/migrate-stamp.json`. Re-run is idempotent (already-applied ids skip). Failed step → stop that owner, leave stamp unchanged for that step, named error, **no partial write of that file** (write temp + rename).

Convict-like **defaults** still exist: they **are** `factory-config` JSON. The `add` op copies a path from factory when the user file lacks it.

---

## Migration document (declarative)

```json
{
  "id": "20261021_01_add-http-timeout",
  "owner": "kernel",
  "ops": [
    {
      "op": "add",
      "path": "http.requestTimeoutMs",
      "layer": "public",
      "env": "common",
      "fromFactory": true
    },
    {
      "op": "rename",
      "from": "http.smallPhotoSize",
      "to": "http.image.smallPx",
      "layer": "public",
      "env": "all"
    },
    {
      "op": "remove",
      "path": "security.deprecatedFlag",
      "layer": "public",
      "env": "all"
    }
  ]
}
```

| Field | Rule |
| --- | --- |
| `id` | Equals filename without `.json`. Stamp key. |
| `owner` | `kernel` or a plugin id (`tuucho-signin-google`). Plugin steps never touch kernel JSON. Kernel steps never touch `tuucho-config/plugins/`. |
| `op` | `add` \| `rename` \| `remove` only in v1. No arbitrary JS in the JSON. (A coded transform is out of scope until a step cannot be expressed as path ops.) |
| `layer` | `public` \| `private` \| `both`. Private ops run on `config.private.json` if present, else `config.private.example.json` (placeholders only). |
| `env` | `common` \| one folder name \| `all` (common + every env folder that exists **in the shop**). Never create a new env folder from a kernel step. |
| `add` | If the path **already has a value** (including empty string for optional public keys) → skip. If `fromFactory: true`, copy from the matching factory file. Else use `value` (non-secret only). **Never** `add` required kernel private paths (`database.url`, `jwt.secret`, `pii.encryptionKey`, `pii.lookupPepper`, `ops.token`) from factory onto an **existing** shop — warn and leave doctor to fail. |
| `rename` | If `from` missing → skip (warn). If `to` already set → **do not clobber** (warn, keep both, do not stamp-fail). |
| `remove` | Delete path if present (warn). |

Unknown `op` / unknown `owner` id that is not installed → skip that file with a warning (plugin uninstalled). Kernel unknown op → **fail** the command (do not stamp).

---

## Command

Shop root (alias) and kernel (same as today’s doctor):

```bash
npm run config:migrate -- --dry-run
npm run config:migrate
# same: npm --prefix tuucho/kernel/back run config:migrate
```

Add `config:migrate` next to `config:doctor` / `config:env` on `tuucho/kernel/back` and a clone-root script that forwards.

| Behaviour | Locked |
| --- | --- |
| Missing `tuucho-config/` | **First install:** copy factory (public + examples), private from example, stamp = all current step ids, print what was created. Same as setup’s “materialise private” ([v0.0.4.md](v0.0.4.md) first-setup), not a second copy on later runs. |
| Existing `tuucho-config/` | No copy-over. Apply pending steps per owner (kernel **and** plugins). Then a **fill pass**: for each factory **public** path missing in the user public file, `add` from factory (warn). Do **not** fill required kernel private from example on an existing shop. |
| Plugins | Every installed schema plugin (bundled + user roots in `plugins.json`) with factory JSON and/or `config/migrations/`. No `settingsSchema` → skip (same as [plugin-config-files.md](plugin-config-files.md)). Disabled plugins **still migrate files** (restore-ready; do not enable). |
| User plugin JSON | Default beside `package.json` or `tuucho.configDir`. Factory for a user plugin = its committed `config.json` + `config.private.example.json` in that package (Apply does not own them). |
| `--dry-run` | Print owners, pending ids, ops, destination paths. **No file writes. No secret values.** |
| Exit | `0` if nothing pending or all applied. `1` if a kernel step failed or required private still missing **after** migrate (same list as [config-architecture.md](config-architecture.md)). Plugin missing optional keys → warn, still `0` unless `--strict`. |
| Apply / boot | **Do not** run migrate implicitly on boot. After Apply, the UI/log **tells** the operator to run `config:migrate` if stamp is behind factory (doctor can warn). |

`config:doctor` stays the boot/check. After migrate, doctor uses the warn/error table above.

---

## Stamp

`tuucho-config/migrate-stamp.json` (not gitignored unless the shop ignores the whole tree):

```json
{
  "kernel": ["20261021_01_add-http-timeout"],
  "plugins": {
    "tuucho-signin-google": ["20261021_01_rename-ttl"]
  }
}
```

No secret values. Safe to commit in a shop repo that tracks public config.

---

## Interaction with plugin DB

Unchanged ([plugin-config-files.md](plugin-config-files.md)):

- Migrate may add keys to **disk**. Admin DB stays as-is.
- First launch still loads files **once** if secrets empty and public unset.
- Boot never hashes-overwrites Admin.
- Configure Update/Import still `plugin_config_import`; Export still `plugin_config_export`. Bulk archives stay envelope-only ([plugin-config-bulk.md](plugin-config-bulk.md)).

---

## Git / Apply

| Tree | Library clone (tuucho pack) | Shop |
| --- | --- | --- |
| `tuucho/factory-config/` | Tracked | Updated by Apply |
| `tuucho-config/` | **Not** in the pack | Operator; gitignore privates; public optional in **their** git |
| `tuucho/plugins/…/config/migrations/` | Tracked | Updated by Apply with the plugin |

Execute must stop tracking operator `tuucho-config/` in the library repo (move templates to factory). `.gitignore` keeps private patterns; may ignore the whole `tuucho-config/` in the pack repo so a stray copy cannot be pushed over users.

---

## Docs (at execute)

- Kernel handbook `config-files`: factory vs shop, first copy, `config:migrate`, stamp, “Apply never writes tuucho-config”.
- [v0.0.4.md](v0.0.4.md) first-setup: copy from **factory-config**, not from a committed operator tree.
- Plugin handbooks: one line that disk JSON is shop `tuucho-config/plugins/<id>/`; shipped template is factory; upgrades use `config:migrate`.
- Skills: `tuucho-create-plugin` — schema plugins ship factory JSON + optional `config/migrations/`; no extra register.
- `01` command docs: `config:migrate` next to `config:doctor` / `config:env`.

---

## Execute after Te says go (do not run now)

1. **Move templates** from tracked `tuucho-config/` into `tuucho/factory-config/` (public + examples only). Loader still reads **shop** `tuucho-config/` only.
2. **Stamp + migrator** (path ops, dry-run, first-install copy, fill pass). Unit tests: missing dir copy; existing dir no clobber; rename; add skip if present; required private not filled on existing shop; plugin disabled still migrates files; zip/Apply path still rejects writes under `tuucho-config/`.
3. **Hook doctor** “stamp behind factory” warning. Apply message to run migrate. **Do not** auto-migrate on boot.
4. **Docs** as above. Placeholder secrets only.

Verify: `/healthz` if the shop is already up. **Do not bind or kill 5174/3010.** Do not start `npm run dev`.

---

## Out of scope

- Changing first-launch or boot overwrite ([plugin-config-files.md](plugin-config-files.md)).
- Putting kernel JSON keys for plugin brands back into factory ([config-architecture.md](config-architecture.md)).
- Auto-running migrate inside Apply.
- Writing migrate results into the plugin DB.
- Convict as the boot loader.
- Extra product languages, shop brands, commit / push / GitHub. Plan only until Te says go.
