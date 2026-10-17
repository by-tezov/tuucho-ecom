import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CART_NAME_MAX_LENGTH,
  DEFAULT_CART_MAX_PER_USER,
  formatCartItemCount,
  isSystemCartKind,
  limitedCartCount,
  sortCartsByCreatedAtDesc,
  usesSingularItemCount,
} from '../../../src/utils/cartDisplayName';
import { courierCompatible, courierMatch, addressDeliveryNetworks } from '../../../src/utils/courierMatch';
import { groupOrderItemsByShape } from '../../../src/utils/groupOrderItems';
import { takeLocalKey, takeSessionKey } from '../../../src/utils/storageMigrate';
import { withMinDuration, withTimeout } from '../../../src/utils/withMinDuration';
import { peekGiftCartFocus, setGiftCartFocus, takeGiftCartFocus } from '../../../src/state/giftCartFocus';
import { SEO_KEYWORDS } from '../../../src/utils/seoKeywords';
import type { Strings } from '../../../src/assets/i18n/types';
import type { OrderItem } from '../../../src/api/orders';
import type { Courier } from '../../../src/api/account';

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.useRealTimers();
});

const strings = {
  cart: {
    cartItemCount: '{count} article',
    cartItemsCount: '{count} articles',
  },
} as Strings;

describe('cartDisplayName helpers', () => {
  it('handles singular rules and system carts', () => {
    expect(CART_NAME_MAX_LENGTH).toBeGreaterThan(0);
    expect(usesSingularItemCount(0, 'fr')).toBe(true);
    expect(usesSingularItemCount(0, 'en')).toBe(false);
    expect(formatCartItemCount(2, strings, 'fr')).toBe('2 articles');
    expect(isSystemCartKind('gift')).toBe(true);
    expect(isSystemCartKind('custom')).toBe(false);
    expect(limitedCartCount([{ kind: 'custom' }, { kind: 'default' }])).toBe(1);
    expect(DEFAULT_CART_MAX_PER_USER).toBe(10);
    expect(
      sortCartsByCreatedAtDesc([
        { createdAt: '2026-01-01T00:00:00.000Z' },
        { createdAt: '2026-02-01T00:00:00.000Z' },
      ]).map((c) => c.createdAt),
    ).toEqual(['2026-02-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z']);
  });
});

describe('courierMatch', () => {
  it('prefers pickup networks and requires country overlap', () => {
    const address = {
      countryCode: 'FR',
      networkCodes: ['home', 'pickup'],
      pickupPoints: { pickup: { id: 'MR1' } },
    };
    expect(addressDeliveryNetworks(address)).toEqual(['pickup']);
    const courier = {
      countries: ['FR'],
      networks: ['pickup'],
    } as Courier;
    expect(courierMatch(courier, address)).toEqual({ countryOk: true, networkOk: true });
    expect(courierCompatible({ ...courier, networks: ['home'] } as Courier, address)).toBe(false);
  });
});

describe('groupOrderItemsByShape', () => {
  it('groups paid lines and keeps packs separate', () => {
    const item = (partial: Partial<OrderItem>): OrderItem =>
      ({
        id: partial.id ?? '1',
        productId: 'p1',
        productUid: 'uid',
        title: 'Set',
        desc: null,
        shapeKey: 'almond',
        shapeLabel: 'Amande',
        lengthKey: 'medium',
        lengthLabel: 'Moyen',
        packKey: '',
        packLabel: '',
        photo: null,
        unitPrice: 10,
        size: 'M',
        quantity: 1,
        isRuleGift: false,
        ...partial,
      }) as OrderItem;
    const groups = groupOrderItemsByShape([
      item({ id: '1', size: 'M' }),
      item({ id: '2', size: 'S' }),
      item({ id: '3', packKey: 'x2', packLabel: 'x2', shapeKey: '', lengthKey: '' }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.variants).toHaveLength(2);
  });
});

describe('storageMigrate and giftCartFocus', () => {
  it('migrates old keys once and peeks focus', () => {
    sessionStorage.setItem('old-session', 'v1');
    expect(takeSessionKey('psn-session', 'old-session')).toBe('v1');
    expect(sessionStorage.getItem('old-session')).toBeNull();
    expect(takeSessionKey('psn-session', 'old-session')).toBe('v1');

    localStorage.setItem('old-local', 'L');
    expect(takeLocalKey('psn-local', 'old-local')).toBe('L');

    setGiftCartFocus('cart-1');
    expect(peekGiftCartFocus()).toBe('cart-1');
    expect(takeGiftCartFocus()).toBe('cart-1');
    expect(takeGiftCartFocus()).toBeNull();
  });
});

describe('withMinDuration / withTimeout', () => {
  it('waits for the minimum duration and times out', async () => {
    vi.useFakeTimers();
    const pending = withMinDuration(Promise.resolve('ok'), 50);
    await vi.advanceTimersByTimeAsync(50);
    await expect(pending).resolves.toBe('ok');

    const timed = withTimeout(new Promise(() => undefined), 30);
    const assertion = expect(timed).rejects.toThrow(/Timed out/);
    await vi.advanceTimersByTimeAsync(30);
    await assertion;
  });
});

describe('seoKeywords', () => {
  it('has entries for every shop language', () => {
    for (const lang of ['fr', 'en', 'th', 'es', 'it', 'nl', 'pt'] as const) {
      expect(SEO_KEYWORDS[lang].length).toBeGreaterThan(0);
    }
  });
});
