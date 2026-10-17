import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  document.head.innerHTML = '';
  delete window.google;
  delete window.AppleID;
  delete window.FB;
  delete window.fbAsyncInit;
});

describe('OAuth script loaders', () => {
  it('loadGoogleIdentityScript is a no-op when GIS is already present', async () => {
    window.google = { accounts: { id: { initialize: vi.fn(), renderButton: vi.fn() } } } as never;
    const { loadGoogleIdentityScript } = await import('@/utils/loadGoogleIdentityScript');
    await expect(loadGoogleIdentityScript()).resolves.toBeUndefined();
    expect(document.querySelector('script[src*="accounts.google.com"]')).toBeNull();
  });

  it('loadGoogleIdentityScript injects once and shares the same promise', async () => {
    const { loadGoogleIdentityScript } = await import('@/utils/loadGoogleIdentityScript');
    const first = loadGoogleIdentityScript();
    const second = loadGoogleIdentityScript();
    expect(first).toBe(second);
    const script = document.querySelector('script[src*="accounts.google.com"]') as HTMLScriptElement;
    expect(script).toBeTruthy();
    script.onload?.(new Event('load'));
    await expect(first).resolves.toBeUndefined();
  });

  it('loadAppleAuthScript rejects when the script fails', async () => {
    const { loadAppleAuthScript } = await import('@/utils/loadAppleAuthScript');
    const pending = loadAppleAuthScript();
    const script = document.querySelector('script[src*="appleid.cdn-apple.com"]') as HTMLScriptElement;
    script.onerror?.(new Event('error'));
    await expect(pending).rejects.toThrow('apple_auth_load_failed');
  });

  it('loadFacebookSdk initializes through fbAsyncInit', async () => {
    const { loadFacebookSdk } = await import('@/utils/loadFacebookSdk');
    const pending = loadFacebookSdk('app-123');
    expect(document.getElementById('facebook-jssdk')).toBeTruthy();
    window.FB = { init: vi.fn(), login: vi.fn() };
    window.fbAsyncInit?.();
    await expect(pending).resolves.toBeUndefined();
    expect(window.FB.init).toHaveBeenCalledWith(
      expect.objectContaining({ appId: 'app-123', version: 'v26.0' }),
    );
  });
});
