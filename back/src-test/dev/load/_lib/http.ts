import http, { type RefinedResponse, type ResponseType } from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

/** Every 5xx a VU receives, whatever the scenario expected. A refusal (4xx)
 * can be the correct answer to a race; a 5xx never is. Thresholded at zero. */
export const serverErrors = new Counter('server_errors');

const JSON_HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

export function apiBaseUrl(): string {
  const raw = (__ENV.BASE_URL || __ENV.PAM_API_BASE_URL || '').replace(/\/$/, '');
  if (!raw) {
    throw new Error('BASE_URL (or PAM_API_BASE_URL) is required for load scripts');
  }
  return raw;
}

function parseJson(res: RefinedResponse<ResponseType | undefined>): unknown {
  // Counted per request; the request's own `name` tag already says which one.
  if (res.status >= 500) serverErrors.add(1);
  try {
    return res.json();
  } catch {
    return null;
  }
}

export interface HttpResult {
  ok: boolean;
  status: number;
  body: unknown;
}

function authHeaders(token?: string, extraHeaders?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...JSON_HEADERS, ...extraHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function vuTags(name: string): Record<string, string> {
  return { name, phase: 'vu' };
}

/** GET JSON and run named checks. */
export function getJson(
  baseUrl: string,
  path: string,
  tag: string,
  assertBody: (body: unknown) => boolean,
  token?: string,
  extraHeaders?: Record<string, string>,
): HttpResult {
  const res = http.get(`${baseUrl}${path}`, { headers: authHeaders(token, extraHeaders), tags: vuTags(tag) });
  const body = parseJson(res);
  const ok = check(res, {
    [`${tag} status 200`]: (r) => r.status === 200,
    [`${tag} body`]: () => assertBody(body),
  });
  return { ok, status: res.status, body };
}

export function postJson(
  baseUrl: string,
  path: string,
  tag: string,
  data: unknown,
  assert: { status: number | number[]; body?: (body: unknown) => boolean },
  token?: string,
  extraHeaders?: Record<string, string>,
): HttpResult {
  const res = http.post(`${baseUrl}${path}`, JSON.stringify(data ?? {}), {
    headers: authHeaders(token, extraHeaders),
    tags: vuTags(tag),
  });
  const body = parseJson(res);
  const allowed = Array.isArray(assert.status) ? assert.status : [assert.status];
  const ok = check(res, {
    [`${tag} status`]: (r) => allowed.includes(r.status),
    ...(assert.body ? { [`${tag} body`]: () => assert.body!(body) } : {}),
  });
  return { ok, status: res.status, body };
}

export function patchJson(
  baseUrl: string,
  path: string,
  tag: string,
  data: unknown,
  assert: { status: number | number[]; body?: (body: unknown) => boolean },
  token?: string,
  extraHeaders?: Record<string, string>,
): HttpResult {
  const res = http.patch(`${baseUrl}${path}`, JSON.stringify(data ?? {}), {
    headers: authHeaders(token, extraHeaders),
    tags: vuTags(tag),
  });
  const body = parseJson(res);
  const allowed = Array.isArray(assert.status) ? assert.status : [assert.status];
  const ok = check(res, {
    [`${tag} status`]: (r) => allowed.includes(r.status),
    ...(assert.body ? { [`${tag} body`]: () => assert.body!(body) } : {}),
  });
  return { ok, status: res.status, body };
}

export function putJson(
  baseUrl: string,
  path: string,
  tag: string,
  data: unknown,
  assert: { status: number | number[]; body?: (body: unknown) => boolean },
  token?: string,
  extraHeaders?: Record<string, string>,
): HttpResult {
  const res = http.put(`${baseUrl}${path}`, JSON.stringify(data ?? {}), {
    headers: authHeaders(token, extraHeaders),
    tags: vuTags(tag),
  });
  const body = parseJson(res);
  const allowed = Array.isArray(assert.status) ? assert.status : [assert.status];
  const ok = check(res, {
    [`${tag} status`]: (r) => allowed.includes(r.status),
    ...(assert.body ? { [`${tag} body`]: () => assert.body!(body) } : {}),
  });
  return { ok, status: res.status, body };
}

export function deleteJson(
  baseUrl: string,
  path: string,
  tag: string,
  assert: { status: number | number[]; body?: (body: unknown) => boolean },
  token?: string,
  extraHeaders?: Record<string, string>,
): HttpResult {
  const res = http.del(`${baseUrl}${path}`, null, {
    headers: authHeaders(token, extraHeaders),
    tags: vuTags(tag),
  });
  const body = parseJson(res);
  const allowed = Array.isArray(assert.status) ? assert.status : [assert.status];
  const ok = check(res, {
    [`${tag} status`]: (r) => allowed.includes(r.status),
    ...(assert.body ? { [`${tag} body`]: () => assert.body!(body) } : {}),
  });
  return { ok, status: res.status, body };
}

export function getHealthz(baseUrl: string): boolean {
  return getJson(baseUrl, '/healthz', 'healthz', (body) => (body as { ok?: boolean } | null)?.ok === true).ok;
}

export function successEnvelope(body: unknown): boolean {
  return (body as { success?: boolean } | null)?.success === true;
}

/** Header carrying the checkout privacy session bearer token, mirrored from
 * CHECKOUT_SESSION_HEADER in src/modules/commerce/application/checkoutPrivacySession.ts. */
export const CHECKOUT_SESSION_HEADER = 'x-checkout-session';

/** Opens the privacy session required by /account/checkout/voucher/validate
 * and /account/checkout/free (POST /checkout/session/start). */
export function startCheckoutSession(baseUrl: string, token?: string): string | undefined {
  const result = postJson(
    baseUrl,
    '/checkout/session/start',
    'checkout_session_start',
    {},
    { status: 200, body: successEnvelope },
    token,
  );
  return (result.body as { token?: string } | null)?.token;
}
