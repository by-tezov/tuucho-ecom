# Kernel openings not on `CORE_OPENING_FILTERS`

These names exist as `applyFilters` / `doAction` in the kernel today. Use
them from `addFilter` / `addAction` with the string. Read the kernel call
site for payload shape. Do **not** add them to the SDK or kernel from this
skill. If the shape is wrong for your plugin, stop and tell the user.

| Name | Kind | Kernel call site (read-only) |
| --- | --- | --- |
| `checkout.merchandise` | filter | `priceGuestCheckout.ts`, `priceAuthenticatedCheckout.ts` |
| `checkout.confirm.items` | filter | `orderConfirmationSupport.ts` |
| `cart.view` | filter | `accountActiveCart.router.ts` |
| `cart.summaries` | filter | `cart.ts` |
| `cart.guestImport` | filter | `cartGuestImport.ts` |
| `cart.rebuy` | filter | `cartRebuy.ts` |
| `cart.rebuy.snapshot` | filter | `cartRebuy.ts` |
| `cart.isEmpty` | filter | `orderConfirmationSupport.ts` |
| `orders.hydrate` | filter | `orderRows.ts` |
| `catalog.offerSql` | filter | `productOfferSql.ts` |
| `seo.sitemap.productRows` | filter | `galleryPreview.router.ts` (catalogue relay; SEO skill) |
| `plugin.enabled.changed` | action | `pluginStore.ts` |
| `cart.afterOrder` | action | `orderConfirmationSupport.ts` |
| `cart.cleared` | action | `cart.ts` |
| `cart.merged` | action | `cart.ts` |
| `cart.rebuy.restore` | action | `cartRebuy.ts` |
| `cron.process-shipment-tracking` | action | registered by `tuucho-shipping-expedition-cron` |
