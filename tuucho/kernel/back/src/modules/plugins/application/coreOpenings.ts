import { applyFilters, CORE_OPENING_FILTERS, type CoreOpeningEntry } from '@tuucho/plugin-sdk';
import { isRuntimePluginEnabled } from './runtimeEnabledPlugins.js';

export { CORE_OPENING_FILTERS };
export type { CoreOpeningEntry };

export type CoreOpenings = {
  preferences: CoreOpeningEntry[];
  profile: CoreOpeningEntry[];
  signInMethods: CoreOpeningEntry[];
  notifications: CoreOpeningEntry[];
  cartShipping: CoreOpeningEntry[];
  cartLines: CoreOpeningEntry[];
  orderHistory: CoreOpeningEntry[];
};

export function uniqueOpeningEntries(entries: CoreOpeningEntry[]): CoreOpeningEntry[] {
  const seen = new Set<string>();
  const out: CoreOpeningEntry[] = [];
  for (const entry of entries) {
    const key = entry.id?.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

/** Drop contributions whose plugin is not in the runtime-enabled set, even if
 * a filter is still registered. Preferences and other openings follow the
 * parent plugin, not a leftover opening. */
export function enabledOpeningEntries(entries: CoreOpeningEntry[]): CoreOpeningEntry[] {
  return uniqueOpeningEntries(entries).filter((entry) => isRuntimePluginEnabled(entry.pluginId));
}

export async function buildCoreOpenings(): Promise<CoreOpenings> {
  const [preferences, profile, signInMethods, notifications, cartShipping, cartLines, orderHistory] =
    await Promise.all([
      applyFilters<CoreOpeningEntry[]>(CORE_OPENING_FILTERS.preferences, []),
      applyFilters<CoreOpeningEntry[]>(CORE_OPENING_FILTERS.profile, []),
      applyFilters<CoreOpeningEntry[]>(CORE_OPENING_FILTERS.signIn, []),
      applyFilters<CoreOpeningEntry[]>(CORE_OPENING_FILTERS.notifications, []),
      applyFilters<CoreOpeningEntry[]>(CORE_OPENING_FILTERS.cartShipping, []),
      applyFilters<CoreOpeningEntry[]>(CORE_OPENING_FILTERS.cartLines, []),
      applyFilters<CoreOpeningEntry[]>(CORE_OPENING_FILTERS.orderHistory, []),
    ]);
  return {
    preferences: enabledOpeningEntries(preferences),
    profile: enabledOpeningEntries(profile),
    signInMethods: enabledOpeningEntries(signInMethods),
    notifications: enabledOpeningEntries(notifications),
    cartShipping: enabledOpeningEntries(cartShipping),
    cartLines: enabledOpeningEntries(cartLines),
    orderHistory: enabledOpeningEntries(orderHistory),
  };
}
