---
name: tuucho-plugin-slot
description: >-
  Fills or replaces a tuucho-ecom front slot or view (home FAQ, onboarding,
  featured, admin dashboard, cart surface). Use when contributing UI into a
  named slot. Never edits the kernel.
---

# Front slot / view

## Invariants

- Do not modify `kernel/`, `@tuucho/plugin-sdk` contracts, or kernel migrations.
- If the needed opening does not exist, stop. Tell the user. Do not invent a kernel patch from this skill.
- Match existing bundled plugins of the same kind (copy structure, not kernel code).
- Current branch only; no extra git branch; no PR unless asked.
- Plugin keys go on that plugin’s `settingsSchema` (public) or `type: "secret"` (secret store), never kernel JSON.

## Contract

Import slot/view **ids** from `kernel/front/src/plugins/frontSlots.ts` (or
`@tuucho/plugin-sdk` `CORE_FRONT_SLOTS` / `CORE_FRONT_VIEWS`). Do **not**
value-import them from `PluginHost.tsx` (eager glob + TDZ). `import type {
PluginFrontModule }` from PluginHost is fine.

Read `frontSlots.ts` for the canonical names. If the slot you need is not
there, **stop**.

## Recipe (moved from the router)

`front/index.tsx`:

```tsx
import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';
import { CORE_FRONT_SLOTS } from '@kernel/front/plugins/frontSlots';

export const pluginFront: PluginFrontModule = {
  pluginId: 'your-id',
  slots: { [CORE_FRONT_SLOTS.homeFaq]: <YourBlock /> },
};
```

| Name | Example |
| --- | --- |
| `slot.home.faq` | `tuucho-home-faq` |
| `slot.home.onboarding` | `tuucho-onboarding` |
| `slot.home.featured` | `tuucho-home-featured` |
| `slot.footer.identity` | `footer-identity` (user plugin) |
| `slot.admin.dashboard` | `tuucho-commerce-loyalty` `AdminDashboardCard` |
| `slot.account.profile` | onboarding replay settings |
| `view.cart` / `cartSurface` | `tuucho-commerce-gift` receiver cart |

CSS `composes` of kernel classes must use `@kernel/front/components/...`,
not a leftover `../ui/` or `../../../../../../kernel/front/...` path.

Admin Home is kernel chrome. Add cards on `slot.admin.dashboard`, do not
replace Accueil.

## Follow-up

Menu URL rather than a home block → `tuucho-plugin-page`. Checkout amounts →
`tuucho-plugin-opening` (`extraLines`).
