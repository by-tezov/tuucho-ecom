import type { Size } from '../api/cart';

/** Display order stays smallest-to-largest. */
export const SIZES: readonly Size[] = ['XS', 'S', 'M', 'L'];

/** Default selection order requested by the shop. */
export const SIZE_SELECTION_PRIORITY: readonly Size[] = ['M', 'S', 'XS', 'L'];
