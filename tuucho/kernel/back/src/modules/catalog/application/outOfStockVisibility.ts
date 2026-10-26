import { isOutOfStockEnabled, warmAppPreferences } from '../../settings/application/appPreferences.js';
import type { GalleryItem } from '../../../types.js';
import { galleryItemHasPurchasableStock } from '../domain/stock.js';

export async function outOfStockDisplayFlags(): Promise<{
  outOfStockEnabled: boolean;
  outOfStockSizeRequestEnabled: boolean;
}> {
  await warmAppPreferences();
  const { isPluginEffectivelyEnabled } = await import('../../plugins/application/pluginStore.js');
  const requestsOn = await isPluginEffectivelyEnabled('tuucho-commerce-product-requests');
  return {
    outOfStockEnabled: isOutOfStockEnabled(),
    outOfStockSizeRequestEnabled: requestsOn,
  };
}

export async function outOfStockProductsEnabled(): Promise<boolean> {
  return (await outOfStockDisplayFlags()).outOfStockEnabled;
}

/** Cart hydration sends `ids` with no `stock` param so a sold-out line still
 * resolves. Every other gallery feed call is coerced to in-stock when the
 * Boutique toggle is off. */
export function resolveGalleryFeedStock(
  queryStock: unknown,
  hasIds: boolean,
  enabled: boolean,
): 'all' | 'in' | 'out' {
  const requested = queryStock === 'in' ? 'in' : queryStock === 'out' ? 'out' : 'all';
  if (enabled) return requested;
  if (hasIds && queryStock !== 'in' && queryStock !== 'out') return 'all';
  return 'in';
}

export function isGalleryItemPubliclyAccessible(item: GalleryItem, enabled: boolean): boolean {
  // Every shape/length hidden (tuucho/docs/plans/variant-visibility.md): assembleItems
  // left no shape, and the product is as unreachable as a hidden one.
  if (Object.keys(item.shape).length === 0) return false;
  return enabled || galleryItemHasPurchasableStock(item.available);
}
