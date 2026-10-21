---
name: tuucho-plugin-shipping
description: >-
  Registers a tuucho-ecom shipping method into the kernel courier shell. Use
  when adding couriers, packet prices, or expedition-cron complements. Never
  edits the courier shell.
---

# Shipping method

## Invariants

- Do not modify `kernel/`, `@tuucho/plugin-sdk` contracts, or kernel migrations.
- If the needed opening does not exist, stop. Tell the user. Do not invent a kernel patch from this skill.
- Match existing bundled plugins of the same kind (copy structure, not kernel code).
- Current branch only; no extra git branch; no PR unless asked.

## Recipe (moved from the router)

Copy `tuucho/plugins/shipping/home/tuucho-shipping-home/` or `tuucho/plugins/shipping/mondial-relay/tuucho-shipping-mondial-relay/`.

```ts
api.registerShippingMethod({
  id: api.pluginId,
  courierCodes: api.manifest.courierCodes ?? ['your-courier-code'],
});
```

Carrier credentials and widget brand belong in this plugin’s
`settingsSchema` / secret store, never kernel JSON. Manifest: `kind: "shipping"`, `courierCodes`. Packet prices live in kernel
`courier_packets`. Staff edit them on the kernel Couriers page (JSON groups:
texts, times, prices, parcels) via `/admin/courier-catalog`, not Plugin
Configure. Disable the plugin to toggle those courier rows. Plugins
`application/` must not import delivery.

Complement cron (tracking) is a **separate** plugin with `dependsOn`, see
`tuucho-shipping-expedition-cron` (`addAction('cron.process-shipment-tracking', …)`).
Do not hide cron in core.

Cart contribution of methods uses `cart.shipping.methods`
(**tuucho-plugin-opening**). French → `*-locale-fr`.

If you need a courier table column the kernel does not have, **stop**.
