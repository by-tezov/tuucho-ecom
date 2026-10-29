# Plugin registry and plugin-owned schema

The kernel owns the plugin catalogue. A plugin **must not ALTER kernel
tables**. Extra columns for a plugin live in tables the plugin creates, named
`plugin_<id>_…`, with foreign keys onto kernel entities (`users`, `orders`,
`products`).

| Action                                                                   | Effect                                                                                                                                                         |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scan / first insert                                                      | Host inserts a `plugins` row. If the plugin is enabled, pending `back/migrations/` files run.                                                                  |
| Enable / boot (enabled)                                                  | Host applies pending `up` files, then sets `plugins.schema_version` to the package `version`.                                                                  |
| Disable                                                                  | Unloads back and front. **Keeps** `plugins` row, settings, schema_version, and plugin tables.                                                                  |
| Uninstall (`POST /admin/plugins/:id/uninstall` with `{ confirm: true }`) | Runs each applied file `down` (newest first), drops leftover `plugin_<id>_…` tables, deletes `plugins_schema_migrations` rows, then deletes the `plugins` row. |

Required plugins (`tuucho-theme-default`) cannot be disabled or
uninstalled. Storefront example pages (`page-home`, `page-about`) live under
`src/plugins/` (first-install copy from `tuucho/factory-backup/plugins/`;
gitignored; Apply never writes it) and are not bundled. Deleting a folder
without uninstall leaves an orphan row:
Admin, Plugins shows the localized **Folder missing** badge and hint (never
the English API compatibility string). Restore the folder, or uninstall to
drop tables.

Example: `tuucho/plugins/messaging/mail-spy/tuucho-mail-spy/back/migrations/001_spy_mail.js`
is that plugin's **only** baseline (channels + recipients). Enable applies it
once; uninstall runs `down`. Plugin-owned tables are not part of the kernel
schema snapshot (`sync:schema` skips names that start with `plugin_`).

## `plugins`

One row per installed plugin id (bundled under
`tuucho/plugins/<group>/<feature>/<id>/` or drop-in under `src/plugins/`,
nested folders allowed). Disk is the catalogue; this table is enable,
settings, and schema bookkeeping.

| Column                    | Meaning                                                                                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                      | Plugin id. Equals the leaf folder name. Bundled ids start with `tuucho-`. Primary key.                                                                                  |
| `enabled`                 | Whether the host should load `back/register.ts` and front chunks. Complements also need every `dependsOn` parent on (`isPluginEffectivelyEnabled`).                     |
| `settings`                | Public JSONB from `defaultSettings` then admin Configure. Stays plaintext.                                                                                              |
| `secrets`                 | Server-only JSONB. Sealed at rest with `encryptJsonPii` (AES-256-GCM, kernel `pii.encryptionKey`, `v1:` prefix). Empty is `{}`. Admin Configure returns key names only. |
| `schema_version`          | Plugin package version after its `back/migrations/` files have been applied. Null until the host has run that pass. Disable keeps it. Uninstall deletes the row.        |
| `config_files_hash`       | Canonical hash of last loaded/imported plugin JSON (public + private as applied). Detects drift. Never used to overwrite Admin on boot.                                 |
| `config_files_applied_at` | When files were last written into this row (first launch, Update from files, or Import). Null until then.                                                               |
| `updated_at`              | Last enable, settings, or schema write.                                                                                                                                 |

Retention: the row lives until uninstall. Scan inserts missing ids. A row
whose folder is gone stays until uninstall (`missingFromDisk`).

## `plugins_schema_migrations`

Host record of which plugin migration files have run. Named `plugins_…` so it
cannot collide with plugin-owned `plugin_<id>_…` tables.

| Column       | Meaning                                                                                 |
| ------------ | --------------------------------------------------------------------------------------- |
| `plugin_id`  | FK `plugins(id)` `ON DELETE CASCADE`. Left column of the primary key, so it is indexed. |
| `name`       | Filename under `back/migrations/` (`001_notes.js`).                                     |
| `applied_at` | When `up` committed.                                                                    |

Invariants:

- Files match `^\d{3,}[_-][a-z0-9][a-z0-9_-]*\.js$`. Each exports `up(client)`
  and `down(client)`.
- The host wraps `client.query` and rejects SQL that creates, drops, or
  mutates a table not named `plugin_<id>_…`.
- Kernel data is reached through owning-module `application/` APIs, not
  ad-hoc kernel SQL from a plugin router.

## `github_repository_access`

Fine-grained GitHub tokens for private core and plugin updates. Admin, Core
writes the rows. Check and Apply read them. They are not in `config.json`
and not in the core config export.

| Column       | Meaning                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| `repository` | Canonical `https://github.com/owner/name`, owner and name lowercased. Primary key.                         |
| `token_enc`  | Fine-grained personal access token, AES-256-GCM via `encryptPii` (`v1:`). The admin list never selects it. |
| `updated_at` | Last save.                                                                                                 |
| `updated_by` | FK `users(id)` on delete set null. Indexed.                                                                |

The application stores at most 40 rows. A missing row means that repository
is fetched with no token. Removing a plugin does not delete the row, so a
later install of the same repository still authenticates. An admin removes
the row from Core.

## `seo_redirects`

Kernel 301/410 table. The SEO engine stores rows here; Settings → SEO edits
them; `tuucho-seo-redirects` being on is what applies them (plus
`seo.redirects.rules`). Created before plugin-owned `plugin_<id>_…` naming.
New plugins must not add another kernel table like this: use
`back/migrations/` and `plugin_<id>_…` instead.

| Column       | Meaning                                  |
| ------------ | ---------------------------------------- |
| `id`         | Row uuid                                 |
| `from_path`  | Incoming path, unique                    |
| `to_path`    | Target path (empty when `status` is 410) |
| `status`     | `301` or `410`                           |
| `created_at` | When the row was inserted                |

Disable `tuucho-seo-redirects` and stored rows stop applying; the table stays.
Uninstall of that plugin does not drop this table (it is not named
`plugin_seo_redirects_…`).
