import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../src/api/errors';
import { requestJson } from '../../../src/api/client';
import {
  CHECKOUT_PRIVACY_SESSION_AUDIENCE_CHANGED_EVENT,
  CHECKOUT_PRIVACY_SESSION_REJECTED_EVENT,
  setCheckoutPrivacyToken,
} from '../../../src/api/session/checkoutPrivacyToken';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('../../../src/api/http', () => ({ apiFetch }));
vi.mock('../../../src/assets/i18n/languagePreference', () => ({ preferredLanguage: () => 'th' }));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error('expected requestJson to reject');
}

afterEach(() => {
  apiFetch.mockReset();
});

describe('requestJson transport', () => {
  it('sends cookies, JSON content type, locale and the checkout privacy token', async () => {
    setCheckoutPrivacyToken('privacy-token');
    apiFetch.mockResolvedValue(jsonResponse(200, { ok: 1 }));

    await expect(
      requestJson('/cart', { method: 'POST', body: '{}', headers: { Authorization: 'Bearer x' } }),
    ).resolves.toEqual({ ok: 1 });

    const [path, init] = apiFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/cart');
    expect(init.credentials).toBe('include');
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'Accept-Language': 'th',
      'X-Checkout-Session': 'privacy-token',
      Authorization: 'Bearer x',
    });
  });

  it('lets the browser set the multipart boundary for FormData bodies', async () => {
    apiFetch.mockResolvedValue(jsonResponse(200, {}));
    await requestJson('/upload', { method: 'POST', body: new FormData() });
    const [, init] = apiFetch.mock.calls[0] as [string, RequestInit];
    expect(init.headers).not.toHaveProperty('Content-Type');
    expect(init.headers).not.toHaveProperty('X-Checkout-Session');
  });

  it('maps the error envelope, including typed extras, to ApiError', async () => {
    apiFetch.mockResolvedValue(
      jsonResponse(429, {
        success: false,
        error: {
          code: 'gift_pin_throttled',
          message: '  Too many tries  ',
          violations: ['pin'],
          retryAfterSec: 30,
          retryAt: '2026-01-01T00:00:00Z',
          throttled: true,
          max: 'not-a-number',
        },
      }),
    );
    const error = await rejection(requestJson('/gift/pin'));
    expect(error.code).toBe('gift_pin_throttled');
    expect(error.status).toBe(429);
    expect(error.violations).toEqual(['pin']);
    expect(error.serverMessage).toBe('Too many tries');
    expect(error.message).toBe('Too many tries');
    expect(error.retryAfterSec).toBe(30);
    expect(error.retryAt).toBe('2026-01-01T00:00:00Z');
    expect(error.throttled).toBe(true);
    expect(error.max).toBeUndefined();
  });

  it('treats success:false on a 200 as a failure', async () => {
    apiFetch.mockResolvedValue(jsonResponse(200, { success: false, error: { code: 'voucher_invalid' } }));
    const error = await rejection(requestJson('/voucher'));
    expect(error.code).toBe('voucher_invalid');
    expect(error.status).toBe(200);
  });

  it('falls back to unknown_error when the body is not JSON', async () => {
    apiFetch.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }));
    const error = await rejection(requestJson('/x'));
    expect(error.code).toBe('unknown_error');
    expect(error.status).toBe(502);
    expect(error.message).toBe('unknown_error');
  });

  it('announces checkout privacy session expiry separately from an audience change', async () => {
    const rejected = vi.fn();
    const audienceChanged = vi.fn();
    window.addEventListener(CHECKOUT_PRIVACY_SESSION_REJECTED_EVENT, rejected);
    window.addEventListener(CHECKOUT_PRIVACY_SESSION_AUDIENCE_CHANGED_EVENT, audienceChanged);
    try {
      apiFetch.mockResolvedValueOnce(jsonResponse(401, { error: { code: 'checkout_session_expired' } }));
      await rejection(requestJson('/checkout'));
      expect(rejected).toHaveBeenCalledTimes(1);
      expect(audienceChanged).not.toHaveBeenCalled();

      for (const code of ['checkout_session_required', 'checkout_session_audience_mismatch']) {
        apiFetch.mockResolvedValueOnce(jsonResponse(401, { error: { code } }));
        await rejection(requestJson('/checkout'));
      }
      expect(rejected).toHaveBeenCalledTimes(1);
      expect(audienceChanged).toHaveBeenCalledTimes(2);
    } finally {
      window.removeEventListener(CHECKOUT_PRIVACY_SESSION_REJECTED_EVENT, rejected);
      window.removeEventListener(CHECKOUT_PRIVACY_SESSION_AUDIENCE_CHANGED_EVENT, audienceChanged);
    }
  });
});
