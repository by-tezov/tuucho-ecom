# Drop-in plugins

Each subdirectory is one plugin. The folder name is the plugin id and must
match `plugin.json`'s `"id"`.

```
back/plugins/<id>/plugin.json
```

Core already ships theme, pages, Stripe, shipping, vouchers, cart rules,
reviews, product requests, loyalty, gifts, journals, expedition cron, and
the in-admin Documentation guide. Add another plugin by copying a folder
(start from `page-studio-note/`), then open Admin, Plugins and click Scan
for new plugins (a refresh of that page also discovers disk manifests).

Authoring guide: [`docs/plugins.md`](../../docs/plugins.md) and Admin,
Documentation.
