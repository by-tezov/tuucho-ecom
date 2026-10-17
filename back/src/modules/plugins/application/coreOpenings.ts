import { applyFilters } from './hooks.js';

/** Core openings: plugins contribute entries here instead of (or in addition
 * to) a dedicated Configure page. Filter names are stable. */

export const CORE_OPENING_FILTERS = {
  preferences: 'core.preferences.entries',
  profile: 'core.profile.entries',
  signIn: 'core.signIn.methods',
  notifications: 'core.notifications.entries',
  cartShipping: 'cart.shipping.methods',
  cartLoyalty: 'cart.loyalty.lines',
  cartVouchers: 'cart.vouchers',
  cartGifts: 'cart.gifts',
  orderHistory: 'orders.history.entries',
} as const;

export type CoreOpeningEntry = {
  id: string;
  pluginId: string;
  title: string;
  description?: string;
  href?: string;
};

export type CoreOpenings = {
  preferences: CoreOpeningEntry[];
  profile: CoreOpeningEntry[];
  signInMethods: CoreOpeningEntry[];
  notifications: CoreOpeningEntry[];
  cartShipping: CoreOpeningEntry[];
  cartLoyalty: CoreOpeningEntry[];
  cartVouchers: CoreOpeningEntry[];
  cartGifts: CoreOpeningEntry[];
  orderHistory: CoreOpeningEntry[];
};

export async function buildCoreOpenings(): Promise<CoreOpenings> {
  const [
    preferences,
    profile,
    signInMethods,
    notifications,
    cartShipping,
    cartLoyalty,
    cartVouchers,
    cartGifts,
    orderHistory,
  ] = await Promise.all([
    applyFilters<CoreOpeningEntry[]>(CORE_OPENING_FILTERS.preferences, []),
    applyFilters<CoreOpeningEntry[]>(CORE_OPENING_FILTERS.profile, []),
    applyFilters<CoreOpeningEntry[]>(CORE_OPENING_FILTERS.signIn, []),
    applyFilters<CoreOpeningEntry[]>(CORE_OPENING_FILTERS.notifications, []),
    applyFilters<CoreOpeningEntry[]>(CORE_OPENING_FILTERS.cartShipping, []),
    applyFilters<CoreOpeningEntry[]>(CORE_OPENING_FILTERS.cartLoyalty, []),
    applyFilters<CoreOpeningEntry[]>(CORE_OPENING_FILTERS.cartVouchers, []),
    applyFilters<CoreOpeningEntry[]>(CORE_OPENING_FILTERS.cartGifts, []),
    applyFilters<CoreOpeningEntry[]>(CORE_OPENING_FILTERS.orderHistory, []),
  ]);
  return {
    preferences,
    profile,
    signInMethods,
    notifications,
    cartShipping,
    cartLoyalty,
    cartVouchers,
    cartGifts,
    orderHistory,
  };
}
