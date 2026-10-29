# tuucho-ecom deltas still required by pamsurin (against 0.0.10)

PamSurin vendors stock `0.0.10` under `tuucho/` with no committed kernel
forks. The five gaps below were requested for the next product release; they
are implemented in the product tree as agnostic openings / contract fixes
(see `tuucho/docs/plugins.md` "What 0.0.10 changes for plugin authors").

## Closed in product (pending tag)

- §1 Plugin `environments` meta key: `PLUGIN_CONFIG_META_KEYS` skipped in
  `pickKnown` / `pickSchemaValues`.
- §2 Front Vite applies `TUUCHO_TEST_VALUE_OVERLAYS` after `front.json` with
  `forceValues`.
- §3 Storefront first-visit policy: shop config `i18n.firstVisit`
  (`navigator` | `default`, stock default `navigator`). Set `"default"` in
  `tuucho-config` to prefer `i18n.default` over navigator when nothing is
  stored.
- §4 `LanguageContext` restores when `lang !== preferredLanguage()` and
  re-runs after bootstrap i18n lands.
- §5 `priceAuthenticatedCheckout` uses `runCheckoutPrepare` with `phase`
  (`price` / `afterPrice`); loyalty guards `ctx?.phase`.

## Observed, not patched

(none)

## Not a kernel opening

(none)
