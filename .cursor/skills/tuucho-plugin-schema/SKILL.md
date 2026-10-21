---
name: tuucho-plugin-schema
description: >-
  Adds tuucho-ecom plugin-owned tables, up/down migrations, and uninstall
  behaviour. Use when a plugin needs storage, zip/tgz install, or disable vs
  uninstall. Never ALTERs kernel tables.
---

# Schema and uninstall

## Invariants

- Do not modify `kernel/`, `@tuucho/plugin-sdk` contracts, or kernel migrations.
- If the needed opening does not exist, stop. Tell the user. Do not invent a kernel patch from this skill.
- Match existing bundled plugins of the same kind (copy structure, not kernel code).
- Current branch only; no extra git branch; no PR unless asked.
- Plugin keys go on that plugin’s `settingsSchema` (public) or `type: "secret"` (secret store), never kernel JSON.

## Recipe (moved from the router)

A plugin **must not ALTER kernel tables**. Extra storage is
`plugin_<id with underscores>_…` from `back/migrations/*.js`.

```js
/** @param {import('pg').PoolClient} client */
exports.up = async (client) => {
  await client.query(`
    create table plugin_your_id_notes (
      id uuid primary key,
      user_id uuid not null references users(id) on delete cascade,
      body text not null,
      created_at timestamptz not null default now()
    )
  `);
};

/** @param {import('pg').PoolClient} client */
exports.down = async (client) => {
  await client.query(`drop table if exists plugin_your_id_notes`);
};
```

Rules:

- Filename: `001_notes.js` matching `^\d{3,}[_-][a-z0-9][a-z0-9_-]*\.js$`.
  Today each plugin that has SQL has **one** baseline file (no 001-then-002
  chain). New work after this reset is a new numbered file again.
- Export both `up` and `down`. Uninstall cannot complete without `down`.
- The host wraps `client.query` and rejects mutation of a table that is not
  `plugin_<id>_…`.
- Enable, scan (when enabled), and boot of an enabled plugin apply pending
  files, then set `plugins.schema_version` to the package `version`.
- Foreign keys to kernel rows are allowed. Do not add columns to kernel tables.
- Example: `tuucho/plugins/messaging/mail-spy/tuucho-mail-spy/back/migrations/001_spy_mail.js`.

## Lifecycle

Scan is **install** (inserts the row, runs `up` when enabled). Disable unloads
code and **keeps** tables. Uninstall (`POST /admin/plugins/:id/uninstall` with
`{ confirm: true }`) runs `down`, flushes that plugin's namespaced cache, and
deletes the row. Required plugins cannot uninstall. A folder deleted without
uninstall shows **Folder missing**.

`POST /admin/plugins/upload` accepts `.zip` / `.tgz` into `src/plugins/`
(zip-slip blocked, `engines.core` enforced). That is a kernel API you call as
an operator, not something to reimplement. After install, Admin, Plugins
**Check for updates** / **Apply** can walk git tags when `tuucho.repo` (or npm `repository`)
on that plugin `package.json` is an HTTPS GitHub repo root (user plugins only). Optional `tuucho.branch` / `tuucho.folder` locate the package inside that repo. Tags are
`MAJOR.MINOR.PATCH` with no `v` prefix. Plugins “Core” is the root
`package.json` version. Check / Apply walks gitignored shop-instance `tuucho-versioning.lock.json` (missing lock = never applied) vs tag
`tuucho/tuucho-versioning.json` (historical tags still named `release.json`). Kernel/all Apply copies root `package.json`. Tuucho Apply never writes `src/plugins/` or `tuucho-config/`.
Plugin `version` lives on that leaf `package.json`.

## Reading kernel data

Never reach around the kernel. Use owning-module `application/` functions or
the public JSON API. Do not `SELECT` plaintext encrypted columns. Do not query
kernel tables from a plugin HTTP router as a shortcut.
