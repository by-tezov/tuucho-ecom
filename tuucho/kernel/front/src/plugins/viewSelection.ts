/** Pure view-resolution rule for `PluginView`, kept out of PluginHost.tsx so
 * it is unit-testable without the eager plugin glob. Unlike routes (last
 * enabled candidate wins), a view has a single provider: the first loaded
 * module declaring it. Disabling that module falls back to the kernel's own
 * surface, not to a later declaration — replacing a view is a deliberate
 * single-owner act, not a shadow chain. */
export function findViewCandidate<
  M extends { pluginId: string; views?: Partial<Record<string, unknown>>; cartSurface?: unknown },
>(mods: M[], name: string, cartViewName: string): M | undefined {
  return mods.find((mod) => mod.views?.[name] || (name === cartViewName && mod.cartSurface));
}
