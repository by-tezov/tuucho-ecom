# Kernel offer → child skill

Names only. Recipes live in the named skill (or `plugin-sdk/src/contracts.ts`
/ `@kernel/front/plugins/frontSlots`). If this table names an offer with
no recipe, that is a docs bug — add a reference file; do not edit the kernel.

Sources: `CORE_OPENING_FILTERS` and shells in `plugin-sdk`,
`CORE_FRONT_SLOTS` / `CORE_FRONT_VIEWS` in `frontSlots.ts`, plus kernel
`applyFilters` / `doAction` call sites not yet aliased on the SDK enum.

| Offer | Kind | Skill |
| --- | --- | --- |
| `core.preferences.entries` | opening | tuucho-plugin-opening |
| `core.profile.entries` | opening | tuucho-plugin-opening |
| `core.signIn.methods` | opening | tuucho-plugin-opening |
| `core.notifications.entries` | opening | tuucho-plugin-opening |
| `cart.shipping.methods` | opening | tuucho-plugin-opening |
| `cart.lines` | opening | tuucho-plugin-opening |
| `orders.history.entries` | opening | tuucho-plugin-opening |
| `orders.snapshot` | opening | tuucho-plugin-opening |
| `checkout.quote` | opening | tuucho-plugin-opening |
| `checkout.lines` | opening | tuucho-plugin-opening |
| `checkout.totals` | opening | tuucho-plugin-opening |
| `checkout.confirm` | opening | tuucho-plugin-opening |
| `checkout.prepare` | opening | tuucho-plugin-opening |
| `checkout.release` | opening | tuucho-plugin-opening |
| `checkout.reserve` | opening | tuucho-plugin-opening |
| `invoice.render` | opening | tuucho-plugin-opening |
| `invoice.document` | opening | tuucho-plugin-opening |
| `mail.send` | opening | tuucho-plugin-opening |
| `mail.templates` | opening | tuucho-plugin-opening |
| `mail.recipients` | opening | tuucho-plugin-opening |
| `mail.spy.channels` | opening | tuucho-plugin-spy |
| `mail.spy.resolve` | opening | tuucho-plugin-spy |
| `seo.meta` | opening | tuucho-plugin-seo |
| `seo.jsonld.graph` | opening | tuucho-plugin-seo |
| `seo.sitemap.entries` | opening | tuucho-plugin-seo |
| `seo.robots.rules` | opening | tuucho-plugin-seo |
| `seo.redirects.rules` | opening | tuucho-plugin-seo |
| `storefront.bootstrap` | opening | tuucho-plugin-opening |
| `checkout.merchandise` | opening (kernel, not on SDK enum) | tuucho-plugin-opening |
| `checkout.confirm.items` | opening (kernel, not on SDK enum) | tuucho-plugin-opening |
| `cart.view` | opening (kernel, not on SDK enum) | tuucho-plugin-opening |
| `cart.summaries` | opening (kernel, not on SDK enum) | tuucho-plugin-opening |
| `cart.guestImport` | opening (kernel, not on SDK enum) | tuucho-plugin-opening |
| `cart.rebuy` | opening (kernel, not on SDK enum) | tuucho-plugin-opening |
| `cart.rebuy.snapshot` | opening (kernel, not on SDK enum) | tuucho-plugin-opening |
| `cart.isEmpty` | opening (kernel, not on SDK enum) | tuucho-plugin-opening |
| `orders.hydrate` | opening (kernel, not on SDK enum) | tuucho-plugin-opening |
| `catalog.offerSql` | opening (kernel, not on SDK enum) | tuucho-plugin-opening |
| `seo.sitemap.productRows` | opening (kernel, not on SDK enum) | tuucho-plugin-seo |
| `plugin.enabled.changed` | action | tuucho-plugin-opening |
| `cart.afterOrder` | action | tuucho-plugin-opening |
| `cart.cleared` | action | tuucho-plugin-opening |
| `cart.merged` | action | tuucho-plugin-opening |
| `cart.rebuy.restore` | action | tuucho-plugin-opening |
| `cron.process-shipment-tracking` | action | tuucho-plugin-opening |
| `api.cache` / `pluginCacheNamespace` | cache | tuucho-plugin-opening |
| `registerMailTemplate` | mail | tuucho-plugin-opening |
| `registerHttpMount` | HTTP shell | tuucho-plugin-opening |
| `registerPluginService` | services | tuucho-plugin-opening |
| `slot.cart.summary` | slot | tuucho-plugin-slot |
| `slot.cart.line` | slot | tuucho-plugin-slot |
| `slot.checkout.payment` | slot | tuucho-plugin-slot |
| `slot.product.actions` | slot | tuucho-plugin-slot |
| `slot.account.profile` | slot | tuucho-plugin-slot |
| `slot.account.notifications` | slot | tuucho-plugin-slot |
| `slot.order.detail` | slot | tuucho-plugin-slot |
| `slot.order.history.row` | slot | tuucho-plugin-slot |
| `slot.home.faq` | slot | tuucho-plugin-slot |
| `slot.home.onboarding` | slot | tuucho-plugin-slot |
| `slot.home.featured` | slot | tuucho-plugin-slot |
| `slot.admin.dashboard` | slot | tuucho-plugin-slot |
| `slot.footer.identity` | slot | tuucho-plugin-slot |
| `view.cart` | view | tuucho-plugin-slot |
| `view.product` | view | tuucho-plugin-slot |
| `view.invoice.preview` | view | tuucho-plugin-slot |
| `registerPaymentGateway` / payment-method shell | shell | tuucho-plugin-payment |
| `registerShippingMethod` / courier shell / `courierCodes` | shell | tuucho-plugin-shipping |
| `registerEmailCatalog` / `locales[]` overlay | locale | tuucho-plugin-locale |
| `plugin.json` `route` + `nav` | page | tuucho-plugin-page |
| `provides: ["AdminPage"]` / `adminNav` / `settingsSchema` | admin | tuucho-plugin-admin |
| Theme tokens / `ThemeContract` / `tuucho-theme-default` Configure | admin | tuucho-plugin-admin |
| `KERNEL_UI` / `pluginFront.ui` use, extend, override | ui | tuucho-plugin-ui |
| `manifest.permissions[]` / `requirePermission` | permission | tuucho-plugin-permission |
| `back/migrations` / `plugin_<id>_…` / uninstall / zip upload | schema | tuucho-plugin-schema |
