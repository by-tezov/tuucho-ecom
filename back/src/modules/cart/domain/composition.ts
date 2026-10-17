/** Pure rules for a composed nail set: fingers, availability, price sum. */

export const COMPOSITION_MAX_NAILS = 10;

export const COMPOSITION_FINGERS = [
  'left-thumb',
  'left-index',
  'left-middle',
  'left-ring',
  'left-pinky',
  'right-thumb',
  'right-index',
  'right-middle',
  'right-ring',
  'right-pinky',
] as const;

export type CompositionFinger = (typeof COMPOSITION_FINGERS)[number];

export const COMPOSITION_SIZES = ['XS', 'S', 'M', 'L'] as const;
export type CompositionSize = (typeof COMPOSITION_SIZES)[number];

export type CompositionNailInput = {
  productId: string;
  shapeKey: string;
  lengthKey: string;
  finger: string;
  /** Unit TTC price for this nail design. */
  unitPrice: number;
  /** Live boolean for this nail's shape × length × composition size. */
  available: boolean;
};

export type CompositionValidationCode =
  | 'empty'
  | 'too_many'
  | 'missing_finger'
  | 'duplicate_finger'
  | 'invalid_finger'
  | 'invalid_size'
  | 'unavailable'
  | 'invalid_price';

export type CompositionValidation =
  | { ok: true; missingFingers: CompositionFinger[] }
  | { ok: false; code: CompositionValidationCode; missingFingers: CompositionFinger[] };

export function isCompositionFinger(value: string): value is CompositionFinger {
  return (COMPOSITION_FINGERS as readonly string[]).includes(value);
}

export function isCompositionSize(value: string): value is CompositionSize {
  return (COMPOSITION_SIZES as readonly string[]).includes(value);
}

export function missingCompositionFingers(
  nails: ReadonlyArray<{ finger: string }>,
): CompositionFinger[] {
  const used = new Set(nails.map((nail) => nail.finger));
  return COMPOSITION_FINGERS.filter((finger) => !used.has(finger));
}

/** Sum of nail unit prices, rounded to cents. Quantity is applied by the caller. */
export function compositionUnitPrice(nails: ReadonlyArray<{ unitPrice: number }>): number {
  const sum = nails.reduce((total, nail) => total + nail.unitPrice, 0);
  return Math.round(sum * 100) / 100;
}

export function compositionIsAvailable(nails: ReadonlyArray<{ available: boolean }>): boolean {
  return nails.length > 0 && nails.every((nail) => nail.available);
}

/**
 * Blocking validation for add/update cart. Missing fingers are reported but
 * never block: people can have lost a finger or a hand.
 */
export function validateComposition(
  size: string,
  nails: ReadonlyArray<CompositionNailInput>,
): CompositionValidation {
  const missingFingers = missingCompositionFingers(nails);

  if (!isCompositionSize(size)) {
    return { ok: false, code: 'invalid_size', missingFingers };
  }
  if (nails.length === 0) {
    return { ok: false, code: 'empty', missingFingers };
  }
  if (nails.length > COMPOSITION_MAX_NAILS) {
    return { ok: false, code: 'too_many', missingFingers };
  }

  const seen = new Set<string>();
  for (const nail of nails) {
    if (!nail.finger) {
      return { ok: false, code: 'missing_finger', missingFingers };
    }
    if (!isCompositionFinger(nail.finger)) {
      return { ok: false, code: 'invalid_finger', missingFingers };
    }
    if (seen.has(nail.finger)) {
      return { ok: false, code: 'duplicate_finger', missingFingers };
    }
    seen.add(nail.finger);
    if (!Number.isFinite(nail.unitPrice) || nail.unitPrice < 0) {
      return { ok: false, code: 'invalid_price', missingFingers };
    }
    if (!nail.available) {
      return { ok: false, code: 'unavailable', missingFingers };
    }
  }

  return { ok: true, missingFingers };
}

/** True when a product type counts as one nail set for packets, gifts, vouchers. */
export function countsAsNailSet(productType: string): boolean {
  return productType === 'nail' || productType === 'composition';
}
