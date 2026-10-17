import { describe, expect, it, vi } from 'vitest';
import { isCompletePostalCode, POSTAL_CODE_DIGIT_LENGTH } from '@/utils/postalCode';
import { formatPrice, roundPrice } from '@/utils/formatPrice';
import { capitalize } from '@/utils/capitalize';
import {
  isArrayOf,
  isBoolean,
  isFiniteNumber,
  isPlainObject,
  isRecordOf,
  isString,
} from '@/utils/typeGuards';
import { defaultLengthKey, defaultShapeKey } from '@/data/galleryShape';
import {
  canGoBackOnShop,
  isMobileBackPage,
  shouldReplaceMobileBackPage,
} from '@/utils/mobileBackNavigation';

describe('postalCode', () => {
  it('recognizes complete FR and NL shapes', () => {
    expect(isCompletePostalCode('75001', 'FR')).toBe(true);
    expect(isCompletePostalCode('7500', 'FR')).toBe(false);
    expect(isCompletePostalCode('1012 AB', 'NL')).toBe(true);
    expect(isCompletePostalCode('1012', 'NL')).toBe(true);
    expect(isCompletePostalCode('1000-001', 'PT')).toBe(true);
    expect(isCompletePostalCode('anywhere', 'XX')).toBe(false);
  });

  it('exposes digit lengths for numeric-only countries', () => {
    expect(POSTAL_CODE_DIGIT_LENGTH.FR).toBe(5);
    expect(POSTAL_CODE_DIGIT_LENGTH.NL).toBeUndefined();
  });
});

describe('formatPrice', () => {
  it('rounds before formatting euros', () => {
    expect(roundPrice(13 + 4.99 - 17.99)).toBe(0);
    expect(formatPrice(12.5)).toBe('12.50 €');
  });
});

describe('capitalize', () => {
  it('capitalizes hyphenated parts', () => {
    expect(capitalize('saint-valentin')).toBe('Saint-Valentin');
    expect(capitalize('déjà')).toBe('Déjà');
  });
});

describe('typeGuards', () => {
  it('validates primitives and collections', () => {
    expect(isString('a')).toBe(true);
    expect(isFiniteNumber(1)).toBe(true);
    expect(isFiniteNumber(Number.NaN)).toBe(false);
    expect(isBoolean(false)).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isArrayOf([1, 2], isFiniteNumber)).toBe(true);
    expect(isRecordOf({ a: 1 }, isFiniteNumber)).toBe(true);
  });
});

describe('galleryShape', () => {
  const item = {
    shape: { almond: 'Amande', square: 'Carrée' },
    lengthsByShape: { almond: { short: 'Court', medium: 'Moyen' }, square: { medium: 'Moyen' } },
    photosByShapeLength: {
      almond: { short: [{ src: 'a-s' }], medium: [{ src: 'a-m' }] },
      square: { medium: [{ src: 's-m' }] },
    },
  };

  it('defaults to first shape and length insertion order', () => {
    expect(defaultShapeKey(item)).toBe('almond');
    expect(defaultLengthKey(item, 'almond')).toBe('short');
    expect(defaultLengthKey(item, 'missing')).toBe('medium');
  });
});

describe('mobileBackNavigation', () => {
  it('knows mobile back pages', () => {
    expect(isMobileBackPage('/capsules')).toBe(true);
    expect(isMobileBackPage('/gallery')).toBe(false);
  });

  it('replaces only on mobile between back pages', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('max-width: 1023px'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    expect(shouldReplaceMobileBackPage('/home', '/sizes')).toBe(true);
    expect(shouldReplaceMobileBackPage('/gallery', '/sizes')).toBe(false);
    expect(canGoBackOnShop()).toBe(false);
  });
});
