/** Client mirror of pamsurin-back cart/domain/composition.ts (preview + validation). */

import type { CompositionFinger, Size } from '../api/cart';

export const COMPOSITION_MAX_NAILS = 10;

export const COMPOSITION_FINGERS: CompositionFinger[] = [
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
];

/** Fingers as the hands picture draws them, back of both hands facing you:
 * left pinky to left thumb, then right thumb to right pinky. The carousel
 * follows the same order so a card always sits where its finger does. */
export const COMPOSITION_HAND_FINGERS: Record<'left' | 'right', CompositionFinger[]> = {
  left: ['left-pinky', 'left-ring', 'left-middle', 'left-index', 'left-thumb'],
  right: ['right-thumb', 'right-index', 'right-middle', 'right-ring', 'right-pinky'],
};

export const COMPOSITION_DISPLAY_ORDER: CompositionFinger[] = [
  ...COMPOSITION_HAND_FINGERS.left,
  ...COMPOSITION_HAND_FINGERS.right,
];

export function compositionFingerHand(finger: string): 'left' | 'right' {
  return finger.startsWith('right-') ? 'right' : 'left';
}

/** Sorts nails into hands-picture order; unknown fingers go last. */
export function sortByDisplayFinger<T extends { finger: string }>(nails: ReadonlyArray<T>): T[] {
  const rank = (finger: string) => {
    const index = (COMPOSITION_DISPLAY_ORDER as readonly string[]).indexOf(finger);
    return index === -1 ? COMPOSITION_DISPLAY_ORDER.length : index;
  };
  return [...nails].sort((a, b) => rank(a.finger) - rank(b.finger));
}

/** First empty finger in hands-picture order, or null when all ten are taken. */
export function firstFreeDisplayFinger(taken: ReadonlyArray<string>): CompositionFinger | null {
  return COMPOSITION_DISPLAY_ORDER.find((finger) => !taken.includes(finger)) ?? null;
}

/** Moves the nail on `from` to `to`; a nail already on `to` takes `from`. */
export function moveCompositionFinger<T extends { finger: string }>(
  nails: ReadonlyArray<T>,
  from: string,
  to: string,
): T[] {
  if (from === to) return [...nails];
  return nails.map((nail) => {
    if (nail.finger === from) return { ...nail, finger: to };
    if (nail.finger === to) return { ...nail, finger: from };
    return nail;
  });
}

export type CompositionValidationCode =
  | 'empty'
  | 'too_many'
  | 'missing_finger'
  | 'duplicate_finger'
  | 'invalid_finger'
  | 'invalid_size'
  | 'unavailable'
  | 'invalid_price';

export type CompositionNailInput = {
  productId: string;
  shapeKey: string;
  lengthKey: string;
  finger: string;
  unitPrice: number;
  available: boolean;
};

export function isCompositionFinger(value: string): value is CompositionFinger {
  return (COMPOSITION_FINGERS as readonly string[]).includes(value);
}

export function isCompositionSize(value: string): value is Size {
  return value === 'XS' || value === 'S' || value === 'M' || value === 'L';
}

export function missingCompositionFingers(nails: ReadonlyArray<{ finger: string }>): CompositionFinger[] {
  const used = new Set(nails.map((nail) => nail.finger));
  return COMPOSITION_FINGERS.filter((finger) => !used.has(finger));
}

export function compositionUnitPrice(nails: ReadonlyArray<{ unitPrice: number }>): number {
  const sum = nails.reduce((total, nail) => total + nail.unitPrice, 0);
  return Math.round(sum * 100) / 100;
}

export function compositionIsAvailable(nails: ReadonlyArray<{ available: boolean }>): boolean {
  return nails.length > 0 && nails.every((nail) => nail.available);
}

export function validateComposition(
  size: string,
  nails: ReadonlyArray<CompositionNailInput>,
):
  | { ok: true; missingFingers: CompositionFinger[] }
  | { ok: false; code: CompositionValidationCode; missingFingers: CompositionFinger[] } {
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

/**
 * Paid nail-set quantity: set lines + composed sets (accessories and rule
 * gifts count 0). A composition being edited still sits in the cart and
 * still counts — `editing` blocks checkout, it does not empty the basket.
 */
export function paidNailSetQuantity(
  items: ReadonlyArray<{ origin?: string; size: string; quantity: number }>,
  compositions: ReadonlyArray<{ quantity: number }>,
): number {
  const fromLines = items
    .filter((item) => item.origin !== 'rule' && item.size !== '')
    .reduce((sum, item) => sum + item.quantity, 0);
  return fromLines + compositions.reduce((sum, entry) => sum + entry.quantity, 0);
}
