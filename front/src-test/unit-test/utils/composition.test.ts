import { describe, expect, it } from 'vitest';
import {
  COMPOSITION_DISPLAY_ORDER,
  COMPOSITION_FINGERS,
  COMPOSITION_MAX_NAILS,
  compositionFingerHand,
  compositionIsAvailable,
  compositionUnitPrice,
  firstFreeDisplayFinger,
  moveCompositionFinger,
  paidNailSetQuantity,
  sortByDisplayFinger,
  validateComposition,
  type CompositionNailInput,
} from '../../../src/utils/composition';

function nail(overrides: Partial<CompositionNailInput> & { finger: string }): CompositionNailInput {
  return {
    productId: 'p1',
    shapeKey: 'almond',
    lengthKey: 'medium',
    unitPrice: 3.5,
    available: true,
    ...overrides,
  };
}

describe('composition hands order', () => {
  it('runs left pinky to left thumb, then right thumb to right pinky', () => {
    expect(COMPOSITION_DISPLAY_ORDER[0]).toBe('left-pinky');
    expect(COMPOSITION_DISPLAY_ORDER[4]).toBe('left-thumb');
    expect(COMPOSITION_DISPLAY_ORDER[5]).toBe('right-thumb');
    expect(COMPOSITION_DISPLAY_ORDER[9]).toBe('right-pinky');
  });

  it('sorts nails the way the hands are drawn', () => {
    const sorted = sortByDisplayFinger([
      { finger: 'right-pinky' },
      { finger: 'left-thumb' },
      { finger: 'right-thumb' },
      { finger: 'left-pinky' },
    ]);
    expect(sorted.map((entry) => entry.finger)).toEqual([
      'left-pinky',
      'left-thumb',
      'right-thumb',
      'right-pinky',
    ]);
  });

  it('offers the first empty finger, or null when all ten are taken', () => {
    expect(firstFreeDisplayFinger([])).toBe('left-pinky');
    expect(firstFreeDisplayFinger(['left-pinky', 'left-ring'])).toBe('left-middle');
    expect(firstFreeDisplayFinger(COMPOSITION_DISPLAY_ORDER)).toBeNull();
  });

  it('maps a finger to its hand', () => {
    expect(compositionFingerHand('left-thumb')).toBe('left');
    expect(compositionFingerHand('right-index')).toBe('right');
  });
});

describe('moveCompositionFinger', () => {
  const nails = [
    { key: 'a', finger: 'left-thumb' },
    { key: 'b', finger: 'right-index' },
  ];

  it('moves a nail onto an empty finger', () => {
    expect(moveCompositionFinger(nails, 'left-thumb', 'left-ring')).toEqual([
      { key: 'a', finger: 'left-ring' },
      { key: 'b', finger: 'right-index' },
    ]);
  });

  it('swaps two nails when the target finger is taken', () => {
    expect(moveCompositionFinger(nails, 'left-thumb', 'right-index')).toEqual([
      { key: 'a', finger: 'right-index' },
      { key: 'b', finger: 'left-thumb' },
    ]);
  });

  it('leaves the set unchanged when dropped on its own finger', () => {
    expect(moveCompositionFinger(nails, 'left-thumb', 'left-thumb')).toEqual(nails);
  });
});

describe('composition pricing and availability', () => {
  it('sums nail unit prices rounded to cents', () => {
    expect(compositionUnitPrice([{ unitPrice: 3.33 }, { unitPrice: 2.67 }, { unitPrice: 1.1 }])).toBe(7.1);
    expect(compositionUnitPrice([])).toBe(0);
  });

  it('is unavailable when empty or any nail is false', () => {
    expect(compositionIsAvailable([{ available: true }, { available: true }])).toBe(true);
    expect(compositionIsAvailable([{ available: true }, { available: false }])).toBe(false);
    expect(compositionIsAvailable([])).toBe(false);
  });
});

describe('validateComposition', () => {
  it('accepts a partial hand and reports missing fingers', () => {
    const result = validateComposition('M', [
      nail({ finger: 'left-thumb' }),
      nail({ finger: 'right-thumb', productId: 'p2' }),
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.missingFingers).toHaveLength(8);
  });

  it('reports a repeated finger even when that nail is also unavailable', () => {
    const result = validateComposition('M', [
      nail({ finger: 'left-thumb' }),
      nail({ finger: 'left-thumb', productId: 'p2', available: false }),
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('duplicate_finger');
  });

  it('blocks empty, duplicate finger, and unavailable', () => {
    expect(validateComposition('M', []).ok).toBe(false);
    if (!validateComposition('M', []).ok) {
      expect(validateComposition('M', []).code).toBe('empty');
    }

    const dup = validateComposition('M', [
      nail({ finger: 'left-thumb' }),
      nail({ finger: 'left-thumb', productId: 'p2' }),
    ]);
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.code).toBe('duplicate_finger');

    const bad = validateComposition('M', [nail({ finger: 'left-thumb', available: false })]);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe('unavailable');
  });

  it('blocks invalid size and finger assignment', () => {
    const size = validateComposition('XL', [nail({ finger: 'left-thumb' })]);
    expect(size.ok).toBe(false);
    if (!size.ok) expect(size.code).toBe('invalid_size');

    const missing = validateComposition('M', [nail({ finger: '' })]);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe('missing_finger');

    const invalid = validateComposition('M', [nail({ finger: 'thumb' })]);
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.code).toBe('invalid_finger');
  });

  it('blocks more than ten nails', () => {
    expect(COMPOSITION_MAX_NAILS).toBe(10);
    const eleven = [
      ...COMPOSITION_FINGERS.map((finger) => nail({ finger })),
      nail({ finger: 'left-thumb', productId: 'extra' }),
    ];
    const result = validateComposition('M', eleven);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('too_many');
  });

  it('blocks negative or non-finite prices', () => {
    const negative = validateComposition('M', [nail({ finger: 'left-thumb', unitPrice: -0.01 })]);
    expect(negative.ok).toBe(false);
    if (!negative.ok) expect(negative.code).toBe('invalid_price');

    const infinite = validateComposition('M', [
      nail({ finger: 'left-thumb', unitPrice: Number.POSITIVE_INFINITY }),
    ]);
    expect(infinite.ok).toBe(false);
    if (!infinite.ok) expect(infinite.code).toBe('invalid_price');
  });
});

describe('paidNailSetQuantity', () => {
  it('counts set lines and compositions, never rule gifts or accessories', () => {
    expect(
      paidNailSetQuantity(
        [
          { origin: 'user', size: 'M', quantity: 2 },
          { origin: 'rule', size: 'M', quantity: 3 },
          { origin: 'user', size: '', quantity: 9 },
        ],
        [{ quantity: 1 }, { quantity: 2 }],
      ),
    ).toBe(5);
  });
});
