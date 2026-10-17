/** Public and authenticated contact/product-request API. */
import { preferredLanguage } from '../assets/i18n/languagePreference';
import { authHeaders, requestJson as request } from './client';
import { ApiError } from './errors';

/** Payload shapes come from the backend contract (`npm run sync:contract`
 * in pamsurin-back). Do not redeclare them here. */
import type { AnonymousContactMessage, CompositionSizeRequest, ProductRequest } from './contract/contact';

export type { AnonymousContactMessage, CompositionSizeRequest, ProductRequest };

export function submitAnonymousContactMessage(
  message: AnonymousContactMessage,
  onProgress?: (ratio: number) => void,
): Promise<{ success: true }> {
  const form = new FormData();
  form.append('email', message.email);
  form.append('identity', message.identity);
  form.append('message', message.message);
  for (const image of message.images ?? []) form.append('images', image);
  return uploadContactForm('/contact', form, undefined, onProgress);
}

async function uploadContactForm(
  path: string,
  form: FormData,
  headers: HeadersInit | undefined,
  onProgress?: (ratio: number) => void,
): Promise<{ success: true }> {
  const { apiUploadFormData } = await import('./http');
  const headerRecord: Record<string, string> = {
    'Accept-Language': preferredLanguage(),
  };
  if (headers) {
    const normalized = new Headers(headers);
    normalized.forEach((value, key) => {
      headerRecord[key] = value;
    });
  }
  const { status, body } = await apiUploadFormData(path, form, {
    headers: headerRecord,
    ...(onProgress ? { onProgress } : {}),
  });
  const parsed = (body ?? {}) as { success?: boolean; error?: { code?: string } };
  if (status < 200 || status >= 300 || parsed.success === false) {
    throw new ApiError(parsed.error?.code ?? 'unknown_error', status);
  }
  return { success: true };
}
export function submitAnonymousProductRequest(
  productRequest: ProductRequest & { email: string },
): Promise<{ success: true }> {
  return request('/contact/product-request', {
    method: 'POST',
    body: JSON.stringify(productRequest),
  });
}

/** Signed-in variant — the account's own address and id are read from the
 * token server-side, never sent from here. */
export function submitAuthenticatedProductRequest(
  accessToken: string,
  productRequest: ProductRequest,
): Promise<{ success: true }> {
  return request('/contact/product-request', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(productRequest),
  });
}

export function submitAnonymousCompositionSizeRequest(
  body: CompositionSizeRequest & { email: string },
): Promise<{ success: true }> {
  return request('/contact/composition-size-request', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function submitAuthenticatedCompositionSizeRequest(
  accessToken: string,
  body: CompositionSizeRequest,
): Promise<{ success: true }> {
  return request('/contact/composition-size-request', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
  });
}
