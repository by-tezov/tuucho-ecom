---
name: tuucho-plugin-ui
description: >-
  Registers tuucho-ecom kernel UI components (use, extend, or override Button
  and other KERNEL_UI primitives). Use when a plugin needs a shared control,
  adds a control others can import, or restyles a kernel default.
  Never edits the kernel UI registry or kernel component sources.
---

# Kernel UI (use / extend / override)

## Invariants

- Do not modify `kernel/`, `@tuucho/plugin-sdk` contracts, or kernel migrations.
- If the name you need is not in `KERNEL_UI` and you are not **extending** with
  a new `ui.PascalCase` id, stop. Do not invent a kernel patch from this skill.
- Match existing plugin fronts (`pluginFront.ui`). Copy structure, not kernel code.
- Current branch only; no extra git branch; no PR unless asked.
- Plugin keys go on that plugin’s `settingsSchema` (public) or `type: "secret"` (secret store), never kernel JSON.

## Who owns what

Kernel owns defaults in `kernel/front/src/components/ui/` wrapped with
`withKernelUi`. Plugins consume them. Theme tokens (`theme.css`, Configure hexes)
restyle colour. `pluginFront.ui` with `replace: true` restyles **structure**.

Slots (`CORE_FRONT_SLOTS`) fill regions. Do not replace `Button` with a slot.

Do **not** value-import `PluginHost.tsx` (eager glob + TDZ).
`import type { PluginFrontModule }` is fine.

## Use

Import a wrapped kernel export through `@kernel/front/ui`. Prefer the barrel
for new code:

```tsx
import { Button, KERNEL_UI } from '@kernel/front/ui';
```

Do not invent a plugin-local button, toggle, or confirm when `KERNEL_UI` already
names one.

A name another plugin **extended**:

```tsx
import { useUiComponent } from '@kernel/front/ui';

const StarRating = useUiComponent('ui.StarRating');
```

If that plugin is off, `useUiComponent` returns `undefined`. Render nothing or
your own fallback.

## Extend

New shared control. Name must match `ui.[A-Z][A-Za-z0-9]+`. Do not reuse a
kernel name without `replace: true`.

```tsx
import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';
import type { UiComponent } from '@kernel/front/ui';
import { StarRating } from './StarRating';

export const pluginFront: PluginFrontModule = {
  pluginId: 'your-id',
  ui: [{ name: 'ui.StarRating', component: StarRating as UiComponent }],
};
```

Document the name in `docs/handbook.json`. Others consume it with
`useUiComponent('ui.StarRating')` while this plugin is enabled.

## Override

Replace a kernel default. Theme kind wins over a generic replace. Last
registered enabled plugin of that class wins.

```tsx
import type { PluginFrontModule } from '@kernel/front/plugins/PluginHost';
import { KERNEL_UI, type UiComponent } from '@kernel/front/ui';
import { ThemedButton } from './ThemedButton';

export const pluginFront: PluginFrontModule = {
  pluginId: 'your-id',
  ui: [{ name: KERNEL_UI.Button, component: ThemedButton as UiComponent, replace: true }],
};
```

The replacement must accept the original props. Colour-only changes belong in
theme tokens, not a Button clone.

## Follow-up

Page + menu → `tuucho-plugin-page`. Home block → `tuucho-plugin-slot`.
Admin CRUD → `tuucho-plugin-admin`. Theme Configure hexes → admin skill, not this.
