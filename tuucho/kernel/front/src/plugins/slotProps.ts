import { createContext, useContext } from 'react';

/** Contextual data a kernel surface hands to plugin content. `PluginSlot`
 * publishes the record its caller passed (`<PluginSlot name={…} props={…} />`)
 * and `PluginView` does the same for replaceable views, so a plugin's static
 * `slots[name]` / `views[name]` ReactNode still receives per-render context
 * without changing the module contract. Modules that do not care simply never
 * call the hook and keep working unchanged.
 *
 * Front plugin code imports this hook as
 * `@kernel/front/plugins/slotProps` (the SDK is backend-only: it has no React
 * surface, same reason `PluginFrontModule` types come from
 * `@kernel/front/plugins/PluginHost`). */
export const SlotPropsContext = createContext<Record<string, unknown>>({});

/** Read the props the hosting kernel surface passed to this slot/view.
 * Returns `{}` outside any provided surface. Generic `T` is the caller's
 * claim about the shape; each slot documents its own keys in
 * `tuucho/docs/plugins.md`. */
export function useSlotProps<T extends Record<string, unknown> = Record<string, unknown>>(): T {
  return useContext(SlotPropsContext) as T;
}
