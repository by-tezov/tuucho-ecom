# Import aliases

Checkout: `/home/tezov/Local/tuucho-ecom`. Git is read-only.

TypeScript `compilerOptions.paths` plus Vite `resolve.alias` (and the same map
for CSS module `composes`) is the professional way to import across the
monorepo. Plugin files sit six-plus `../` hops from `kernel/`. Relative
`composes: … from '../components/admin/AdminList.module.css'` after a move
resolves inside the plugin tree and crashes PostCSS (`ENOENT`, then
`undefined instead of CSS string`).

## Inventory (before this change)

| Mechanism | State |
| --- | --- |
| `compilerOptions.paths` | None in any tsconfig |
| Vite `resolve.alias` | None |
| `package.json` `"imports"` / `#kernel` | Removed; plugins depend on `@tuucho/plugin-sdk` |
| Worst `../` chains | Plugin front → `../../../../../../kernel/front/src/…` (6); plugin back `src/http` → `../../../../../../../../kernel/back/src/…` (8); locale `front/strings` → 7 |
| CSS `composes` | Same 6-level kernel paths after the AdminList crash fix |

## Map

| Specifier | Resolves to | Who |
| --- | --- | --- |
| `@/*` | `kernel/front/src/*` | Kernel front `src/` and `src-test/` only |
| `@kernel/front/*` | `kernel/front/src/*` | Plugin/extension fronts, CSS `composes`, docs, skills |
| `@kernel/back/*` | `kernel/back/src/*` | Plugin/extension backs (Node loader + tsc paths) |
| `@tuucho/plugin-sdk` | `plugin-sdk/src/index.ts` | Unchanged package name |

`@/` must **not** be used from a plugin. It means “this Vite app’s `src`”.
Plugins always say `@kernel/front/…`.

`@kernel/front` / `@kernel/back` are listed **before** `@/` in Vite so
`@kernel/front/ui` is not rewritten as `@` + `kernel/front/ui`.

## Examples

```ts
import { Button, KERNEL_UI } from '@kernel/front/ui';
import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';
import { CORE_FRONT_SLOTS } from '@kernel/front/plugins/frontSlots';
```

```css
.empty {
  composes: empty from '@kernel/front/components/admin/AdminList.module.css';
}
```

```ts
import { pool } from '@kernel/back/db/pool';
import { requirePermission } from '@kernel/back/middleware/requirePermission';
```

Plugin **back** aliases drop the NodeNext `.js` suffix. The plugin import hook
maps `@kernel/back/db/pool` onto `pool.ts` in dev and `pool.js` in dist.
Kernel-back **internal** files keep relative `./foo.js` (tsc emit).

Kernel-front **new** code that would need two or more `../` may use `@/hooks/…`.
Existing one-hop relatives inside `kernel/front/src` stay.

## Wiring

- root `tsconfig.json` — plugin editor `paths` for `@kernel/front/*`, `@kernel/back/*`, `@tuucho/plugin-sdk` → `plugin-sdk/src/index.ts`
- `kernel/front/tsconfig.app.json` — `paths` for `@/*` and `@kernel/front/*` (no `baseUrl`; TypeScript 6/7 resolve `paths` from the tsconfig file)
- `kernel/front/importAliases.ts` — shared Vite/Vitest alias list (`@tuucho/plugin-sdk`, `@kernel/*`, `@/`) + CSS compose resolve
- `kernel/front/vite.config.ts` — `resolve.alias`; CSS plugin rewrites `composes` to absolute paths (relative **or** alias)
- `kernel/front/vitest.config.ts` — same `resolve.alias`
- `kernel/back/tsconfig.json` — `paths` `@kernel/back/*` → `./src/*` (editor + check; src emit still uses relatives)
- `kernel/back/src/modules/plugins/application/pluginImportHook.mjs` — runtime resolve of `@kernel/back/…`

## Must stay relative

- Same-folder and in-plugin siblings (`./ContactFaq`, `../application/productRequest.js`)
- Kernel-back internals (`./loadPluginRuntime.js`) so `tsc` emit stays valid Node ESM
- `import.meta.glob('../../../../plugins/**/front/index.tsx')` (and catalog globs) — Vite globs are filesystem paths from the importer
- CSS `composes` of a **sibling** plugin stylesheet (`./Local.module.css`)
- Node builtins (`node:fs`), packages (`express`, `@tuucho/plugin-sdk`)

## Skills / handbook

Plugin recipes import `@kernel/front/…` and `@kernel/back/…`. Do not teach
`../../../../../../kernel/front/src/…`. Disk locations in prose
(`kernel/front/src/plugins/frontSlots.ts`) stay as file paths, not specifiers.
