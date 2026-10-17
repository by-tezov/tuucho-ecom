import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  availableQuantityFor,
  availableSizesFor,
  preferredAvailableSize,
  quantityAvailableToLine,
} from '@/utils/availability';
import { checkoutFacingError } from '@/utils/checkoutFacingError';
import { FIELD_CART_NAME_MAX, FIELD_EMAIL_MAX } from '@/utils/fieldLimits';
import { seoKeywords } from '@/utils/seoKeywords';
import { takeLocalKey, takeSessionKey } from '@/utils/storageMigrate';
import { withMinDuration, withTimeout } from '@/utils/withMinDuration';
import { peekGiftCartFocus, setGiftCartFocus, takeGiftCartFocus } from '@/state/giftCartFocus';
import { SIZE_SELECTION_PRIORITY, SIZES } from '@/data/sizes';

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.useRealTimers();
});

describe('availability', () => {
  const available = { almond: { medium: { M: 2, S: 0 } } };

  it('reads stock and prefers in-stock sizes', () => {
    expect(availableQuantityFor(available, 'almond', 'medium', 'M')).toBe(2);
    expect(availableQuantityFor(available, 'almond', 'medium', 'L')).toBe(0);
    expect(availableSizesFor(available, 'almond', 'medium', SIZES)).toEqual(['M']);
    expect(preferredAvailableSize(available, 'almond', 'medium', SIZE_SELECTION_PRIORITY, ['S'])).toBe('M');
    expect(quantityAvailableToLine(1, 2, true)).toBe(3);
    expect(quantityAvailableToLine(1, 2, false)).toBe(1);
  });
});

describe('checkoutFacingError', () => {
  it('returns the generic message in the current vitest target', () => {
    // Vitest define uses a non-prod target, so a trimmed detail surfaces.
    expect(checkoutFacingError('generic', '  detail  ')).toBe('detail');
    expect(checkoutFacingError('generic', '   ')).toBe('generic');
  });
});

describe('fieldLimits and seoKeywords', () => {
  it('exposes stable ceilings and joins keyword lists', () => {
    expect(FIELD_EMAIL_MAX).toBe(254);
    expect(FIELD_CART_NAME_MAX).toBe(50);
    expect(seoKeywords('en')).toContain('handmade objects');
  });
});

describe('storageMigrate', () => {
  it('moves session and local keys once', () => {
    sessionStorage.setItem('old-s', 'a');
    expect(takeSessionKey('new-s', 'old-s')).toBe('a');
    expect(sessionStorage.getItem('new-s')).toBe('a');
    expect(sessionStorage.getItem('old-s')).toBeNull();
    expect(takeSessionKey('new-s', 'old-s')).toBe('a');

    localStorage.setItem('old-l', 'b');
    expect(takeLocalKey('new-l', 'old-l')).toBe('b');
    expect(localStorage.getItem('old-l')).toBeNull();
  });
});

describe('withMinDuration / withTimeout', () => {
  it('waits for the minimum duration before resolving', async () => {
    vi.useFakeTimers();
    const pending = withMinDuration(Promise.resolve('ok'), 100);
    await vi.advanceTimersByTimeAsync(99);
    let done = false;
    void pending.then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBe('ok');
  });

  it('rejects when the timeout elapses first', async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise<string>(() => undefined), 50);
    const assertion = expect(pending).rejects.toThrow(/Timed out after 50ms/);
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });
});

describe('giftCartFocus', () => {
  it('sets peeks and consumes the session key', () => {
    setGiftCartFocus('cart-1');
    expect(peekGiftCartFocus()).toBe('cart-1');
    expect(takeGiftCartFocus()).toBe('cart-1');
    expect(peekGiftCartFocus()).toBeNull();
  });
});
