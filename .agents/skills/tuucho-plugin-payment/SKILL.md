---
name: tuucho-plugin-payment
description: >-
  Registers a tuucho-ecom payment gateway into the kernel payment-method
  shell. Use when adding Stripe-like methods, saved cards, or webhooks. Never
  edits the payment-method shell.
---

# Payment gateway

## Invariants

- Do not modify `kernel/`, `@tuucho/plugin-sdk` contracts, or kernel migrations.
- If the needed opening does not exist, stop. Tell the user. Do not invent a kernel patch from this skill.
- Match existing bundled plugins of the same kind (copy structure, not kernel code).
- Current branch only; no extra git branch; no PR unless asked.

## Recipe (moved from the router)

The **payment-method shell** (wallet / stored methods) stays in core.
Gateways are plugins. Copy `tuucho/plugins/payment/stripe/tuucho-payment-stripe/`.

Read `PaymentGateway` in `plugin-sdk/src/contracts.ts`. Register:

```ts
api.registerPaymentGateway({
  id: api.pluginId,
  methods: ['card'],
  capabilities: ['saved-methods', 'webhooks', 'manual-capture'],
  getClient: () => createFromEnv(),
  // …intent / customer / refund helpers the kernel calls by name
});
```

`kind: "payment"`. Keys belong in this plugin’s `settingsSchema` / secret
store (`api.getPluginSecret`), never kernel JSON. Checkout methods are toggled in **App Preferences** (the
payment-method shell), not a duplicate Configure of only those switches.
`pluginHasConfigure` is false unless this plugin has a real `settingsSchema`.
Checkout UI in `slot.checkout.payment` is **tuucho-plugin-slot**.

If the kernel does not call a method you need on `PaymentGateway`, **stop**.
Do not extend the shell from this skill.

French copy → `tuucho-payment-stripe-locale-fr` pattern (**tuucho-plugin-locale**).
