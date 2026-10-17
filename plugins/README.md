# Drop-in plugins

Bundled Tuucho plugins live under `plugins/tuucho/<group>/<feature>/<id>/`.
A plugin and its `*-locale-*` complements share that feature folder. The
standalone locale pack stays at `plugins/tuucho/locale/tuucho-locale-fr/`.
User plugins live under `plugins/user/<group>/…/<id>/`, with optional grouping
folders (and a feature folder when they have locale complements). Ids must
not start with `tuucho-`. The **leaf** folder name is the plugin id and must
match `plugin.json`'s `"id"`.

```
plugins/tuucho/<group>/<feature>/<id>/plugin.json   # id starts with tuucho-
plugins/tuucho/<group>/<feature>/<id>-locale-fr/
plugins/user/<group>/<feature>/<id>/plugin.json     # id must not use tuucho-
```

Scan walks `plugins/tuucho/` then `plugins/user/`. Bundled ids use the
`tuucho-` prefix so they cannot clash with a user plugin. Copy
`plugins/user/demo/guides/demo-page-guides/` into
`plugins/user/<group>/your-id/` (choose an id that does not start with
`tuucho-`), then open Admin, Plugins and click Scan. Guides is a demo user
plugin, not a bundled Tuucho product plugin.

Authoring guide: [`docs/plugins.md`](../docs/plugins.md) and Admin,
Documentation.
