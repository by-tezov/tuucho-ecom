# User plugins

Shop-owned and demo packages. Nested like Tuucho:

`src/plugins/<group>/…/<id>/`

The leaf folder name is the plugin id. It must not start with `tuucho-`.
Zip upload unpacks here. Scan does not walk a top-level `extensions/` folder.

Shipped here:

- `home/main/page-home` (+ locale packs) — example landing at `/home`
- `home/faq/home-faq` (+ locale packs) — `slot.home.faq`
- `home/featured/home-featured` (+ locale packs) — `slot.home.featured`
- `about/page-about` (+ locale packs) — example about page
- `onboarding/onboarding` (+ locale packs) — `slot.home.onboarding`
- `demo/guides/page-guides` (+ locale packs)
- `legal/legal/page-legal` (+ locale packs) — footer only, never the info menu
- `legal/accessibility/page-accessibility` (+ locale packs) — footer only, never the info menu
- `footer/identity/footer-identity` — footer identity slot (shop name, tagline, copyright)

Storefront page and home-slot examples are never under `tuucho/plugins/`.
