import { postJson, successEnvelope, type HttpResult } from './http.ts';

const PASSWORD = __ENV.PAM_LOAD_PASSWORD || 'E2eTest1!';

export function uniqueEmail(prefix = 'load'): string {
  // Prefer VU/iter when present (VU code); setup() has neither, so fall back.
  const vu = typeof __VU === 'number' ? __VU : 0;
  const iter = typeof __ITER === 'number' ? __ITER : Math.floor(Math.random() * 1e9);
  return `${prefix}+${vu}-${iter}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@pamsurin.test`;
}

export function register(baseUrl: string, email: string): HttpResult {
  return postJson(
    baseUrl,
    '/auth/register',
    'auth_register',
    { email, password: PASSWORD, gdprConsent: { accepted: true }, language: 'fr' },
    {
      status: 201,
      body: (body) => successEnvelope(body) && Boolean((body as { accessToken?: string }).accessToken),
    },
  );
}

export function login(baseUrl: string, email: string): HttpResult {
  return postJson(
    baseUrl,
    '/auth/login',
    'auth_login',
    { email, password: PASSWORD },
    {
      status: 200,
      body: (body) => successEnvelope(body) && Boolean((body as { accessToken?: string }).accessToken),
    },
  );
}

export function accessTokenFrom(body: unknown): string {
  return String((body as { accessToken?: string } | null)?.accessToken ?? '');
}

export function loadPassword(): string {
  return PASSWORD;
}
