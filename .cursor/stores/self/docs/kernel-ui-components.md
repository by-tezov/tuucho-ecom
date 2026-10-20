# Kernel UI component library

Checkout: `/home/tezov/Local/tuucho-ecom` on `dev/refactor-split`. Git is read-only. Preferences.md was not found. `/cursor/stores/self` is not assumed writable.

Chosen without waiting: **kernel-owned registry** in `kernel/front/src/ui/`. Not a UI plugin. Kernel screens and SSR must render when every plugin is off. The theme plugin owns CSS tokens and may **replace** registered components for structure. A `tuucho-ui` plugin would hide the shop when disabled, which is the wrong split.

Slots (`CORE_FRONT_SLOTS`) fill **regions**. This registry is **controls**. Do not replace `Button` with a slot.

## Modes

| Mode | Who | How |
| --- | --- | --- |
| **Use** | Kernel and any plugin | Import the wrapped export (`Button` from `components/ui/Button` or the `src/ui` barrel). Existing call sites keep working. New names: `useUiComponent('ui.StarRating')`. |
| **Extend** | A plugin | `pluginFront.ui: [{ name: 'ui.StarRating', component }]`. New `ui.PascalCase` name only. Cannot silently occupy a kernel name. |
| **Override** | Theme, or a look plugin | `pluginFront.ui: [{ name: KERNEL_UI.Button, component, replace: true }]`. Applies only while that plugin is enabled. |

Names are `ui.<PascalCase>`. Versioning is kernel `CORE_VERSION` / plugin `engines.core`. No second semver for Button.

### Precedence (resolve)

1. Enabled **theme** `replace: true` for that name (last registered among enabled themes).
2. Else enabled non-theme `replace: true` (last registered).
3. Else the kernel default from `withKernelUi` / `provideKernelUi`.
4. Else an enabled **extend** (last registered) for a name the kernel does not own.

Eager glob still loads disabled plugins' modules. Resolve consults `storefront/bootstrap` enablement. Empty plugin list (SSR / before bootstrap) uses kernel defaults.

## Public API

- `KERNEL_UI` — stable ids for kernel primitives.
- `withKernelUi(name, Default)` — kernel uses this at the component module. Call sites stay `import { Button } from '.../Button'`.
- `pluginFront.ui` — PluginHost calls `registerPluginUi` after the glob.
- `resolveUiComponent(name, plugins)` / `useUiComponent(name)` — look up current implementation.
- Barrel `kernel/front/src/ui` re-exports wrapped primitives plus the registry.

Do not value-import `PluginHost.tsx` from a plugin (eager glob + TDZ). `import type { PluginFrontModule }` is fine. Import `KERNEL_UI` from `@kernel/front/ui`.

## Wrapped kernel defaults

Button, ConfirmModal, LoadingModal, ToggleSwitch, Chip, AccordionItem, QuantityControl, PageHero, SectionHeading, IntroSurface, Figure, BottomSheet, SegmentedSwitch, StatusModal, Skeleton, RequiredMark, RequiredFieldsNote, DocsCallout, DocsCards, DocsSteps, DocsTable, DocsDefList, DocsCode, DocsOutline, DocsPager, Field, FormSection, TextField, TextareaField, SecretField, SelectField, ColorField.

Form kit: `Field` is label + help text under the label + control slot. `FormSection` is a compact admin group (not storefront `SectionHeading`). `TextField` / `TextareaField` / `SecretField` (set/not-set Chip + replace, never shows the stored value) / `SelectField` (`SegmentedSwitch` or Chip group — never native `<select>`) / `ColorField`. New field types land here first; Configure consumes them. Do not invent one-off markup on a plugin page.

Not wrapped (refs, icons, or chrome that is not a restyle target): ModalBackdrop (`forwardRef`), Toast (ToastProvider only), CloseIcon, FlagIcon, CourierLogo, ThemeSwitch, ContrastControl, Lightbox internals.

A plugin that needs to replace an unwrapped file adds `withKernelUi` in kernel through a product change, not from the plugin skill.

## Theme

Colour stays CSS variables (`theme.css` / Configure hexes). Replace a kernel component when the **structure** must change (different Button markup). Identity `replace` that clones the default is wasted.

## Skill

`.cursor/skills/tuucho-plugin-ui/SKILL.md`, dispatched from `tuucho-create-plugin`.
