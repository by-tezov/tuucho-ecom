# Plugin folder structure

Scan roots (nested plugin `package.json` with a `tuucho` block, leaf folder = `id`):

1. `plugins/tuucho/` — bundled first-party. Id **must** start with `tuucho-`.
2. `plugins/user/` — shop / demo / zip upload. Id **must not** start with `tuucho-`.

There is **no** live `extensions/` root. A leftover `extensions/` folder is
only a migrate note.

The SDK is **not** a plugin. It lives at `plugin-sdk/` next to `kernel/`
(npm name `@tuucho/plugin-sdk`). There is no `packages/` directory.

## Trees

```
plugin-sdk/                                # @tuucho/plugin-sdk
kernel/back  kernel/front
plugins/tuucho/<group>/<feature>/<id>/     # bundled
plugins/tuucho/<group>/<feature>/<id>-locale-fr/
plugins/tuucho/kernel-locale/tuucho-kernel-locale-fr/    # standalone locale pack
plugins/user/<group>/<feature>/<id>/       # user / demo / upload
```

`installPath` is the repo-relative posix path of that leaf folder.

- Tuucho: `plugins/tuucho/…/<id>`
- User: `plugins/user/…/<id>`

Zip unpack uses `installPath`. Path guards reject the wrong tree, `..`,
overlap, and kernel overwrite. Archive **members** still cannot be named
`plugins/…` or `kernel/…`; the dest folder comes from `installPath`.

Front globs `plugins/**/front/index.tsx` (and catalog / adminCatalog). Backend
`import()` of `back/register.ts` follows disk under those two scan roots.

## Demos vs product

| Id | Path | Notes |
| --- | --- | --- |
| `page-guides` | `plugins/user/demo/guides/page-guides` | Demo Guides. Nav key `guide`. |
| `page-guides-locale-fr` | `plugins/user/demo/guides/page-guides-locale-fr` | Complement next to parent. |
| `page-legal` | `plugins/user/legal/pages/page-legal` | Footer only. Not in Info. |
| `page-legal-locale-fr` | `plugins/user/legal/pages/page-legal-locale-fr` | Complement next to parent. |
| `page-accessibility` | `plugins/user/legal/pages/page-accessibility` | Footer only. Not in Info. |
| `page-accessibility-locale-fr` | `plugins/user/legal/pages/page-accessibility-locale-fr` | Complement next to parent. |
| `footer-identity` | `plugins/user/footer/identity/footer-identity` | `slot.footer.identity`. Operator copy. |
| `tuucho-contact` | `plugins/tuucho/messaging/contact/tuucho-contact` | Info menu while enabled. |

Removed (do not restore): `tuucho-page-studio-note`, `demo-checkout-profile`.
