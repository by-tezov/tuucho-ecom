import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/config/env', () => ({
  shopConfig: {
    enabledLanguages: ['en', 'fr'],
    routerBasename: '',
  },
}));

async function loadGate() {
  vi.resetModules();
  return import('@/state/splashEntryGate');
}

afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('prepareSplashColdEntry', () => {
  it('keeps a giver claim URL and skips splash so the visit is not sent to gallery', async () => {
    window.history.replaceState({}, '', '/fr/gift/giver/abc123');
    const { prepareSplashColdEntry, shouldPlaySplashEntry } = await loadGate();
    prepareSplashColdEntry();
    expect(window.location.pathname).toBe('/fr/gift/giver/abc123');
    expect(shouldPlaySplashEntry()).toBe(false);
  });

  it('keeps a giver cart URL and skips splash', async () => {
    window.history.replaceState({}, '', '/fr/gift/giver/abc123/cart');
    const { prepareSplashColdEntry, shouldPlaySplashEntry } = await loadGate();
    prepareSplashColdEntry();
    expect(window.location.pathname).toBe('/fr/gift/giver/abc123/cart');
    expect(shouldPlaySplashEntry()).toBe(false);
  });

  it('clears a leftover receiver origin lock when the giver URL is opened', async () => {
    const { writeGiftLockSession, readGiftLockSession, readGiftOriginBlock } =
      await import('@/state/giftLockSession');
    writeGiftLockSession({
      receiverToken: 'abc',
      lockToken: 'lock',
      expiresAtMs: Date.now() + 7_200_000,
    });
    window.history.replaceState({}, '', '/fr/gift/giver/abc123');
    const { prepareSplashColdEntry } = await loadGate();
    prepareSplashColdEntry();
    expect(window.location.pathname).toBe('/fr/gift/giver/abc123');
    expect(readGiftLockSession()).toBeNull();
    expect(readGiftOriginBlock()).toBeNull();
  });

  it('resumes the gallery when a phone-sized cold load of /home comes from a search engine', async () => {
    const matchMedia = vi.mocked(window.matchMedia);
    const previous = matchMedia.getMockImplementation();
    matchMedia.mockImplementation((query: string) => ({
      matches: query === '(max-width: 1023px)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }));
    Object.defineProperty(document, 'referrer', {
      configurable: true,
      get: () => 'https://www.google.fr/',
    });
    try {
      window.history.replaceState({}, '', '/home');
      const { prepareSplashColdEntry, shouldPlaySplashEntry, getSplashResumePath } = await loadGate();
      prepareSplashColdEntry();
      expect(window.location.pathname).toBe('/');
      expect(shouldPlaySplashEntry()).toBe(true);
      expect(getSplashResumePath()).toBe('/gallery');
    } finally {
      if (previous) matchMedia.mockImplementation(previous);
      else matchMedia.mockReset();
      Reflect.deleteProperty(document, 'referrer');
    }
  });

  it('keeps /home when the same phone-sized load has no search referrer', async () => {
    const matchMedia = vi.mocked(window.matchMedia);
    const previous = matchMedia.getMockImplementation();
    matchMedia.mockImplementation((query: string) => ({
      matches: query === '(max-width: 1023px)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }));
    try {
      window.history.replaceState({}, '', '/fr/home');
      const { prepareSplashColdEntry, getSplashResumePath } = await loadGate();
      prepareSplashColdEntry();
      expect(getSplashResumePath()).toBe('/fr/home');
    } finally {
      if (previous) matchMedia.mockImplementation(previous);
      else matchMedia.mockReset();
    }
  });

  it('still rewrites a shop deep link to `/` for splash resume', async () => {
    window.history.replaceState({}, '', '/fr/cart');
    const { prepareSplashColdEntry, shouldPlaySplashEntry, getSplashResumePath } = await loadGate();
    prepareSplashColdEntry();
    expect(window.location.pathname).toBe('/');
    expect(shouldPlaySplashEntry()).toBe(true);
    expect(getSplashResumePath()).toBe('/fr/cart');
  });

  it('resumes the gallery instead of the create-offer page while a receiver lock is live', async () => {
    const { writeGiftLockSession } = await import('@/state/giftLockSession');
    writeGiftLockSession({
      receiverToken: 'abc',
      lockToken: 'lock',
      expiresAtMs: Date.now() + 7_200_000,
    });
    window.history.replaceState({}, '', '/fr/gift');
    const { prepareSplashColdEntry, shouldPlaySplashEntry, getSplashResumePath } = await loadGate();
    prepareSplashColdEntry();
    expect(window.location.pathname).toBe('/');
    expect(shouldPlaySplashEntry()).toBe(true);
    expect(getSplashResumePath()).toBe('/fr/gallery');
  });
});
