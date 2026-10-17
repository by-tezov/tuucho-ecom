import { preferredLanguage } from '../assets/i18n/languagePreference';
import { ApiError } from './errors';
import { apiFetch } from './http';
import {
  announceCheckoutPrivacySessionAudienceChanged,
  announceCheckoutPrivacySessionRejected,
  getCheckoutPrivacyToken,
} from './session/checkoutPrivacyToken';

interface ApiEnvelope {
  success?: boolean;
  message?: string;
  error?: {
    code?: string;
    message?: string;
    violations?: string[];
    max?: number;
    min?: number;
    field?: string;
    retryAfterSec?: number;
    retryAt?: string;
    throttled?: boolean;
    reason?: string;
  };
}

/** Shared JSON transport for every API domain.
 *
 * It owns cookies, locale headers and the documented response envelope;
 * feature modules own paths and request/response types only.
 */
export async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const checkoutPrivacyToken = getCheckoutPrivacyToken();
  const response = await apiFetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      'Accept-Language': preferredLanguage(),
      ...(checkoutPrivacyToken ? { 'X-Checkout-Session': checkoutPrivacyToken } : {}),
      ...(init.headers ?? {}),
    },
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  const envelope = (body ?? {}) as ApiEnvelope;
  if (!response.ok || envelope.success === false) {
    const code = envelope.error?.code ?? 'unknown_error';
    const serverMessage =
      (typeof envelope.message === 'string' && envelope.message) ||
      (typeof envelope.error?.message === 'string' && envelope.error.message) ||
      undefined;
    if (code === 'checkout_session_expired') {
      announceCheckoutPrivacySessionRejected();
    } else if (code === 'checkout_session_required' || code === 'checkout_session_audience_mismatch') {
      announceCheckoutPrivacySessionAudienceChanged();
    }
    const extras = {
      ...(typeof envelope.error?.max === 'number' ? { max: envelope.error.max } : {}),
      ...(typeof envelope.error?.min === 'number' ? { min: envelope.error.min } : {}),
      ...(typeof envelope.error?.field === 'string' ? { field: envelope.error.field } : {}),
      ...(typeof envelope.error?.retryAfterSec === 'number'
        ? { retryAfterSec: envelope.error.retryAfterSec }
        : {}),
      ...(typeof envelope.error?.retryAt === 'string' ? { retryAt: envelope.error.retryAt } : {}),
      ...(envelope.error?.throttled === true ? { throttled: true } : {}),
      ...(typeof envelope.error?.reason === 'string' ? { reason: envelope.error.reason } : {}),
    };
    throw new ApiError(
      code,
      response.status,
      envelope.error?.violations,
      serverMessage,
      Object.keys(extras).length > 0 ? extras : undefined,
    );
  }
  return body as T;
}

export function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}
