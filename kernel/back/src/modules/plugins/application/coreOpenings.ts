import { applyFilters, CORE_OPENING_FILTERS, type CoreOpeningEntry } from '@tuucho/plugin-sdk';

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
    preferences: uniqueOpeningEntries(preferences),
    profile: uniqueOpeningEntries(profile),
    signInMethods: uniqueOpeningEntries(signInMethods),
    notifications: uniqueOpeningEntries(notifications),
    cartShipping: uniqueOpeningEntries(cartShipping),
    cartLines: uniqueOpeningEntries(cartLines),
    orderHistory: uniqueOpeningEntries(orderHistory),
  };
}
