import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readCachedShopSignInMethods,
  writeCachedShopSignInMethods,
} from '../../../src/api/signInMethodsCache';
import type { ShopSignInMethods } from '../../../src/api/contract/checkout';

const KEY = 'pamsurin-sign-in-methods';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sign-in methods cache', () => {
  it('round-trips the last answer', () => {
    const methods = { google: true, apple: false, facebook: true } as ShopSignInMethods;
    writeCachedShopSignInMethods(methods);
    expect(readCachedShopSignInMethods()).toEqual(methods);
  });

  it('keeps an entry written by an older build that lacks the newer fields', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ google: true, apple: true, facebook: false }));
    expect(readCachedShopSignInMethods()).toEqual({ google: true, apple: true, facebook: false });
  });

  it('discards corrupt or wrongly shaped entries instead of throwing', () => {
    window.localStorage.setItem(KEY, '{not json');
    expect(readCachedShopSignInMethods()).toBeUndefined();
    window.localStorage.setItem(KEY, JSON.stringify({ google: 'yes', apple: true, facebook: true }));
    expect(readCachedShopSignInMethods()).toBeUndefined();
    window.localStorage.setItem(KEY, 'null');
    expect(readCachedShopSignInMethods()).toBeUndefined();
  });

  it('never lets an unavailable storage break sign-in', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(readCachedShopSignInMethods()).toBeUndefined();
    expect(() =>
      writeCachedShopSignInMethods({ google: true, apple: true, facebook: true } as ShopSignInMethods),
    ).not.toThrow();
  });
});
