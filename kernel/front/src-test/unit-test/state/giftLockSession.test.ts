import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/config/env', () => ({
  shopConfig: {
    enabledLanguages: ['en', 'fr'],
    routerBasename: '',
  },
}));

import {
  clearGiftLockSession,
  GIFT_LOCK_SESSION_STORAGE_KEY,
  GIFT_LOCK_STORAGE_KEY,
  giftReceiverVisibleHref,
  giftRouterPathFromHistoryState,
  GIFT_HISTORY_ROUTER_PATH_KEY,
  isGiftGiverPath,
  isGiftReceiverBlockedPath,
  isGiftShopResumePath,
  preservedShopPathForToken,
  readGiftLockSession,
  readGiftOriginBlock,
  rememberGiftShopPath,
  releaseReceiverLockIfGiverPath,
  restoreRealUrlFromGiftHistory,
  shouldBindGiftUrlToken,
  subscribeGiftLock,
  withGiftRouterPath,
  writeGiftLockSession,
  syncGiftLockFollowLocked,
} from '@/state/giftLockSession';

afterEach(() => {
  window.sessionStorage.removeItem('psn-gift-receiver-isolated');
  clearGiftLockSession();
  vi.useRealTimers();
});

describe('gift lock session', () => {
  it('uses the origin-wide psn-gift-lock-v1 key without tokens', () => {
    expect(GIFT_LOCK_STORAGE_KEY).toBe('psn-gift-lock-v1');
    expect(GIFT_LOCK_SESSION_STORAGE_KEY).toBe('psn-gift-lock-session-v1');
  });

  it('stores capability tokens in sessionStorage and only expiry origin-wide', () => {
    writeGiftLockSession({
      receiverToken: 'abc',
      lockToken: 'lock',
      expiresAtMs: Date.now() + 7_200_000,
    });
    expect(window.localStorage.getItem(GIFT_LOCK_SESSION_STORAGE_KEY)).toBeNull();
    expect(readGiftLockSession()?.receiverToken).toBe('abc');
    expect(
      JSON.parse(window.sessionStorage.getItem(GIFT_LOCK_SESSION_STORAGE_KEY) ?? '{}').receiverToken,
    ).toBe('abc');
    expect(
      typeof JSON.parse(window.sessionStorage.getItem(GIFT_LOCK_SESSION_STORAGE_KEY) ?? '{}').lastAliveAtMs,
    ).toBe('number');
    const origin = JSON.parse(window.localStorage.getItem(GIFT_LOCK_STORAGE_KEY) ?? '{}') as {
      receiverToken?: string;
      lockToken?: string;
      expiresAtMs?: number;
    };
    expect(origin.receiverToken).toBeUndefined();
    expect(origin.lockToken).toBeUndefined();
    expect(typeof origin.expiresAtMs).toBe('number');
    expect(readGiftOriginBlock()?.expiresAtMs).toBe(origin.expiresAtMs);
  });

  it('does not publish the origin-wide block from a tab opened in administration', () => {
    window.localStorage.setItem(GIFT_LOCK_STORAGE_KEY, JSON.stringify({ expiresAtMs: Date.now() + 60_000 }));
    window.sessionStorage.setItem('psn-gift-receiver-isolated', '1');
    writeGiftLockSession({
      receiverToken: 'abc',
      lockToken: 'lock',
      expiresAtMs: Date.now() + 7_200_000,
    });
    expect(window.localStorage.getItem(GIFT_LOCK_STORAGE_KEY)).toBeNull();
    expect(readGiftOriginBlock()).toBeNull();
    expect(readGiftLockSession()?.receiverToken).toBe('abc');
    window.sessionStorage.removeItem('psn-gift-receiver-isolated');
  });

  it('does not set the origin-wide block when the gifter left prices visible', () => {
    writeGiftLockSession({
      receiverToken: 'abc',
      lockToken: 'lock',
      expiresAtMs: Date.now() + 7_200_000,
      hidePrices: false,
    });
    expect(window.localStorage.getItem(GIFT_LOCK_STORAGE_KEY)).toBeNull();
    expect(readGiftOriginBlock()).toBeNull();
    expect(readGiftLockSession()?.receiverToken).toBe('abc');
  });

  it('does not resume a restored tab session; origin block stays', () => {
    const expiresAtMs = Date.now() + 7_200_000;
    window.localStorage.setItem(GIFT_LOCK_STORAGE_KEY, JSON.stringify({ expiresAtMs }));
    window.sessionStorage.setItem(
      GIFT_LOCK_SESSION_STORAGE_KEY,
      JSON.stringify({
        receiverToken: 'abc',
        lockToken: 'lock',
        expiresAtMs,
        shopPath: '/fr/cart',
        lastAliveAtMs: Date.now() - 60_000,
      }),
    );
    expect(readGiftLockSession()).toBeNull();
    expect(readGiftOriginBlock()).not.toBeNull();
    expect(shouldBindGiftUrlToken('abc')).toBe(false);
  });

  it('keeps an unexpired tab session across a same-tab navigate even if lastAlive is stale', () => {
    const expiresAtMs = Date.now() + 7_200_000;
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{ type: 'navigate' }] as never);
    window.localStorage.setItem(GIFT_LOCK_STORAGE_KEY, JSON.stringify({ expiresAtMs }));
    window.sessionStorage.setItem(
      GIFT_LOCK_SESSION_STORAGE_KEY,
      JSON.stringify({
        receiverToken: 'abc',
        lockToken: 'lock',
        expiresAtMs,
        shopPath: '/fr/cart',
        lastAliveAtMs: Date.now() - 60_000,
      }),
    );
    expect(readGiftLockSession()?.receiverToken).toBe('abc');
    expect(shouldBindGiftUrlToken('abc')).toBe(true);
    vi.restoreAllMocks();
  });

  it('treats a tab session without lastAlive as restored', () => {
    const expiresAtMs = Date.now() + 7_200_000;
    window.localStorage.setItem(GIFT_LOCK_STORAGE_KEY, JSON.stringify({ expiresAtMs }));
    window.sessionStorage.setItem(
      GIFT_LOCK_SESSION_STORAGE_KEY,
      JSON.stringify({
        receiverToken: 'abc',
        lockToken: 'lock',
        expiresAtMs,
        shopPath: '/fr/cart',
      }),
    );
    expect(readGiftLockSession()).toBeNull();
    expect(shouldBindGiftUrlToken('abc')).toBe(false);
  });

  it('keeps a tab session that was alive through refresh', () => {
    writeGiftLockSession({
      receiverToken: 'abc',
      lockToken: 'lock',
      expiresAtMs: Date.now() + 7_200_000,
      shopPath: '/fr/cart',
    });
    expect(readGiftLockSession()?.receiverToken).toBe('abc');
    expect(shouldBindGiftUrlToken('abc')).toBe(true);
  });

  it('does not resume a gift from origin storage alone', () => {
    writeGiftLockSession({
      receiverToken: 'abc',
      lockToken: 'lock',
      expiresAtMs: Date.now() + 7_200_000,
      shopPath: '/fr/cart',
    });
    window.sessionStorage.removeItem(GIFT_LOCK_SESSION_STORAGE_KEY);
    expect(readGiftLockSession()).toBeNull();
    expect(readGiftOriginBlock()).not.toBeNull();
  });

  it('strips legacy tokens from origin storage', () => {
    window.localStorage.setItem(
      GIFT_LOCK_STORAGE_KEY,
      JSON.stringify({
        receiverToken: 'abc',
        lockToken: 'lock',
        expiresAtMs: Date.now() + 7_200_000,
        shopPath: '/fr/cart',
      }),
    );
    expect(readGiftLockSession()).toBeNull();
    expect(readGiftOriginBlock()).not.toBeNull();
    const origin = JSON.parse(window.localStorage.getItem(GIFT_LOCK_STORAGE_KEY) ?? '{}') as {
      receiverToken?: string;
      lockToken?: string;
    };
    expect(origin.receiverToken).toBeUndefined();
    expect(origin.lockToken).toBeUndefined();
  });

  it('wipes the lock at expiry', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-03T10:00:00Z'));
    writeGiftLockSession({
      receiverToken: 'abc',
      lockToken: 'lock',
      expiresAtMs: Date.now() + 7_200_000,
    });
    vi.setSystemTime(new Date('2026-09-03T12:00:01Z'));
    expect(readGiftLockSession()).toBeNull();
    expect(readGiftOriginBlock()).toBeNull();
    expect(window.localStorage.getItem(GIFT_LOCK_STORAGE_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(GIFT_LOCK_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('treats giver URLs as exempt from the receiver lock', () => {
    expect(isGiftGiverPath('/fr/gift/giver/token')).toBe(true);
    expect(isGiftGiverPath('/fr/gift/giver/token/cart')).toBe(true);
    expect(isGiftGiverPath('/fr/gift/token')).toBe(false);
    expect(isGiftGiverPath('/fr/gallery')).toBe(false);
  });

  it('clears a leftover receiver lock when the giver path is opened', () => {
    writeGiftLockSession({
      receiverToken: 'abc',
      lockToken: 'lock',
      expiresAtMs: Date.now() + 7_200_000,
    });
    releaseReceiverLockIfGiverPath('/fr/gallery');
    expect(readGiftOriginBlock()).not.toBeNull();
    expect(readGiftLockSession()?.receiverToken).toBe('abc');
    releaseReceiverLockIfGiverPath('/fr/gift/giver/xyz');
    expect(readGiftOriginBlock()).toBeNull();
    expect(readGiftLockSession()).toBeNull();
    expect(window.localStorage.getItem(GIFT_LOCK_STORAGE_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(GIFT_LOCK_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('drops this tab session when another tab clears the origin block', () => {
    writeGiftLockSession({
      receiverToken: 'abc',
      lockToken: 'lock',
      expiresAtMs: Date.now() + 7_200_000,
    });
    const unsub = subscribeGiftLock(() => undefined);
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: GIFT_LOCK_STORAGE_KEY,
        newValue: null,
        oldValue: JSON.stringify({ expiresAtMs: Date.now() + 7_200_000 }),
      }),
    );
    expect(readGiftLockSession()).toBeNull();
    expect(window.sessionStorage.getItem(GIFT_LOCK_SESSION_STORAGE_KEY)).toBeNull();
    unsub();
  });

  it('remembers a real shop path and ignores gift, account, and splash URLs', () => {
    writeGiftLockSession({
      receiverToken: 'abc',
      lockToken: 'lock',
      expiresAtMs: Date.now() + 7_200_000,
    });
    rememberGiftShopPath('/fr/cart');
    expect(readGiftLockSession()?.shopPath).toBe('/fr/cart');
    rememberGiftShopPath('/fr/gift/abc');
    rememberGiftShopPath('/fr/account');
    rememberGiftShopPath('/fr');
    rememberGiftShopPath('/gift');
    expect(readGiftLockSession()?.shopPath).toBe('/fr/cart');
    expect(isGiftShopResumePath('/fr/gallery')).toBe(true);
    expect(isGiftShopResumePath('/fr/gift/abc')).toBe(false);
    expect(isGiftShopResumePath('/fr/login')).toBe(false);
    expect(isGiftReceiverBlockedPath('/fr/account')).toBe(true);
    expect(isGiftReceiverBlockedPath('/fr/gift')).toBe(true);
    expect(isGiftReceiverBlockedPath('/fr/account/addresses/mondial-relay')).toBe(false);
    expect(isGiftShopResumePath('/fr/account/addresses/mondial-relay')).toBe(true);
  });

  it('keeps shopPath only when reminting the same receiver token', () => {
    writeGiftLockSession({
      receiverToken: 'abc',
      lockToken: 'lock',
      expiresAtMs: Date.now() + 7_200_000,
      shopPath: '/fr/cart',
    });
    expect(preservedShopPathForToken('abc')).toBe('/fr/cart');
    expect(preservedShopPathForToken('other')).toBeUndefined();
  });

  it('records followLocked on the tab session after confirm', () => {
    writeGiftLockSession({
      receiverToken: 'abc',
      lockToken: 'lock',
      expiresAtMs: Date.now() + 7_200_000,
      shopPath: '/fr/gallery',
    });
    syncGiftLockFollowLocked(true);
    expect(readGiftLockSession()?.followLocked).toBe(true);
    syncGiftLockFollowLocked(true);
    expect(readGiftLockSession()?.followLocked).toBe(true);
    syncGiftLockFollowLocked(false);
    expect(readGiftLockSession()?.followLocked).toBe(false);
  });

  it('builds the visible gift-token href', () => {
    expect(giftReceiverVisibleHref('abc', 'fr')).toBe('/fr/gift/abc');
  });

  it('stamps the real router path without dropping overlay or router fields', () => {
    const next = withGiftRouterPath(
      {
        idx: 2,
        key: 'abc',
        usr: { from: 'cart' },
        pamOverlayId: 'overlay-1',
        galleryLightboxProductUid: 'set-1',
      },
      '/fr/gallery?tab=new',
    );
    expect(next.idx).toBe(2);
    expect(next.key).toBe('abc');
    expect(next.usr).toEqual({ from: 'cart' });
    expect(next.pamOverlayId).toBe('overlay-1');
    expect(next.galleryLightboxProductUid).toBe('set-1');
    expect(next[GIFT_HISTORY_ROUTER_PATH_KEY]).toBe('/fr/gallery?tab=new');
    expect(next.masked).toEqual({ pathname: '/fr/gallery', search: '?tab=new', hash: '' });
    expect(giftRouterPathFromHistoryState(next)).toBe('/fr/gallery?tab=new');
  });

  it('leaves a correctly masked gift-token URL alone on pop', () => {
    window.history.replaceState(withGiftRouterPath({ idx: 1, key: 'k' }, '/fr/gallery'), '', '/fr/gift/abc');
    expect(restoreRealUrlFromGiftHistory()).toBe(false);
    expect(window.location.pathname).toBe('/fr/gift/abc');
  });

  it('restores the real URL when the gift-token entry has a stamp but no mask', () => {
    window.history.replaceState(
      { idx: 1, key: 'k', [GIFT_HISTORY_ROUTER_PATH_KEY]: '/fr/sizes' },
      '',
      '/fr/gift/abc',
    );
    expect(restoreRealUrlFromGiftHistory()).toBe(true);
    expect(`${window.location.pathname}${window.location.search}`).toBe('/fr/sizes');
    expect(giftRouterPathFromHistoryState(window.history.state)).toBe('/fr/sizes');
  });

  it('does not restore when the stamped path is the gift route itself', () => {
    window.history.replaceState(
      { idx: 0, [GIFT_HISTORY_ROUTER_PATH_KEY]: '/fr/gift/abc' },
      '',
      '/fr/gift/abc',
    );
    expect(restoreRealUrlFromGiftHistory()).toBe(false);
    expect(window.location.pathname).toBe('/fr/gift/abc');
  });
});
