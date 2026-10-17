# User plugins

Shop-owned and demo packages. Nested like Tuucho:

`plugins/user/<group>/…/<id>/`

The leaf folder name is the plugin id. It must not start with `tuucho-`.
Zip upload unpacks here (`installPath` under `plugins/user/`). Scan does
not walk a top-level `extensions/` folder.

Shipped here:

- `demo/guides/demo-page-guides` (+ `demo-page-guides-locale-fr`)
- `legal/pages/page-legal` (+ `page-legal-locale-fr`) — footer only, never the info menu.
- `legal/pages/page-accessibility` (+ `page-accessibility-locale-fr`) — footer only, never the info menu.
- `footer/identity/footer-identity` — footer identity slot (shop name, tagline, copyright).
