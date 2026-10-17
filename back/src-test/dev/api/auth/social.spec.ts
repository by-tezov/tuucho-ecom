import { test, expect } from 'patchright/test';
import { apiJson, apiJsonRetryRateLimit } from '../../support/api.js';

/** Google, Facebook, and Apple sign-in cannot be driven end to end from a test (all
 * need a live provider credential), so this pins the contract that matters
 * either way: a credential the API cannot verify never produces a session,
 * and the routes answer with the documented disabled/invalid codes. */
test.describe('API social sign-in', () => {
  test('unverifiable Google credential: it never opens a session', async ({ request }) => {
    const { status, body } = await apiJsonRetryRateLimit<{
      error?: { code?: string };
      accessToken?: string;
      needsConsent?: boolean;
    }>(request, 'POST', '/auth/google', {
      data: {
        idToken: 'not-a-google-id-token',
        gdprConsent: { accepted: true },
        language: 'fr',
        rememberMe: false,
      },
      expectedStatus: [400, 503],
    });
    expect(body.accessToken).toBeUndefined();
    expect(body.needsConsent).toBeUndefined();
    expect(body.error?.code).toBe(status === 503 ? 'google_sign_in_disabled' : 'invalid_google_token');

    // A missing credential is a malformed request, distinct from a rejected
    // one — unless the whole provider is switched off for this environment.
    const { status: emptyStatus, body: empty } = await apiJsonRetryRateLimit<{ error?: { code?: string } }>(
      request,
      'POST',
      '/auth/google',
      { data: { gdprConsent: { accepted: true } }, expectedStatus: [400, 503] },
    );
    expect(empty.error?.code).toBe(
      emptyStatus === 503 ? 'google_sign_in_disabled' : 'invalid_request',
    );

    // The consent-completion step cannot be reached without the pending
    // token the first call would have issued.
    const { status: completeStatus, body: complete } = await apiJsonRetryRateLimit<{
      error?: { code?: string };
    }>(request, 'POST', '/auth/google/complete', {
      data: { googleSignupToken: 'not-a-real-token', gdprConsent: { accepted: true }, rememberMe: false },
      expectedStatus: [400, 503],
    });
    expect(complete.error?.code).toBe(
      completeStatus === 503 ? 'google_sign_in_disabled' : 'invalid_or_expired_token',
    );
    const { status: noConsentStatus, body: noConsent } = await apiJsonRetryRateLimit<{
      error?: { code?: string };
    }>(request, 'POST', '/auth/google/complete', {
      data: { googleSignupToken: 'not-a-real-token' },
      expectedStatus: [400, 503],
    });
    expect(noConsent.error?.code).toBe(
      noConsentStatus === 503 ? 'google_sign_in_disabled' : 'invalid_request',
    );
  });

  test('unverifiable Facebook credential: it never opens a session', async ({ request }) => {
    const { status, body } = await apiJsonRetryRateLimit<{
      error?: { code?: string };
      accessToken?: string;
      needsConsent?: boolean;
    }>(request, 'POST', '/auth/facebook', {
      data: {
        accessToken: 'not-a-facebook-token',
        gdprConsent: { accepted: true },
        language: 'fr',
        rememberMe: false,
      },
      expectedStatus: [400, 503],
    });
    expect(body.accessToken).toBeUndefined();
    expect(body.needsConsent).toBeUndefined();
    expect(
      status === 503
        ? ['facebook_sign_in_disabled']
        : ['invalid_facebook_token', 'facebook_email_required'],
    ).toContain(body.error?.code);

    const { status: completeStatus, body: complete } = await apiJsonRetryRateLimit<{
      error?: { code?: string };
    }>(request, 'POST', '/auth/facebook/complete', {
      data: { facebookSignupToken: 'not-a-real-token', gdprConsent: { accepted: true }, rememberMe: false },
      expectedStatus: [400, 503],
    });
    expect(complete.error?.code).toBe(
      completeStatus === 503 ? 'facebook_sign_in_disabled' : 'invalid_or_expired_token',
    );
  });

  test('unverifiable Apple credential: it never opens a session', async ({ request }) => {
    const { status, body } = await apiJsonRetryRateLimit<{
      error?: { code?: string };
      accessToken?: string;
      needsConsent?: boolean;
    }>(request, 'POST', '/auth/apple', {
      data: {
        idToken: 'not-an-apple-id-token',
        nonce: '0123456789abcdef0123456789abcdef',
        gdprConsent: { accepted: true },
        language: 'fr',
        rememberMe: false,
      },
      expectedStatus: [400, 503],
    });
    expect(body.accessToken).toBeUndefined();
    expect(body.needsConsent).toBeUndefined();
    expect(body.error?.code).toBe(status === 503 ? 'apple_sign_in_disabled' : 'invalid_apple_token');

    const { status: completeStatus, body: complete } = await apiJsonRetryRateLimit<{
      error?: { code?: string };
    }>(request, 'POST', '/auth/apple/complete', {
      data: { appleSignupToken: 'not-a-real-token', gdprConsent: { accepted: true }, rememberMe: false },
      expectedStatus: [400, 503],
    });
    expect(complete.error?.code).toBe(
      completeStatus === 503 ? 'apple_sign_in_disabled' : 'invalid_or_expired_token',
    );
  });

  test('verbose social continuation routes: reject missing or expired pending tokens', async ({ request }) => {
    const { body: create } = await apiJson<{ error?: { code?: string } }>(
      request,
      'POST',
      '/auth/social/create',
      {
        data: { socialPendingToken: 'not-a-real-token', gdprConsent: { accepted: true }, rememberMe: false },
        expectedStatus: 400,
      },
    );
    expect(create.error?.code).toBe('invalid_or_expired_token');

    const { body: requestOtp } = await apiJson<{ error?: { code?: string } }>(
      request,
      'POST',
      '/auth/social/link/request-otp',
      { data: { socialPendingToken: 'not-a-real-token', email: 'nobody@pamsurin.test' }, expectedStatus: 400 },
    );
    expect(requestOtp.error?.code).toBe('invalid_or_expired_token');

    const { body: verify } = await apiJson<{ error?: { code?: string } }>(
      request,
      'POST',
      '/auth/social/link/verify',
      {
        data: {
          socialPendingToken: 'not-a-real-token',
          email: 'nobody@pamsurin.test',
          code: '123456',
          rememberMe: false,
        },
        expectedStatus: 400,
      },
    );
    expect(verify.error?.code).toBe('invalid_or_expired_token');

    // The social-link OTP happy path still needs a pending token issued by a
    // live Google/Apple/Facebook credential. Without that, the documented
    // contract is that a crafted pending token never mails a code or attaches
    // an identity.
  });

  test("Meta data-deletion callback: the signature is verified and a status page is published", async ({ request }) => {
    // The callback is form-encoded, not JSON — Meta's own contract.
    const missing = await request.post('/auth/facebook/data-deletion', { form: {} });
    expect([400, 503]).toContain(missing.status());
    const missingBody = (await missing.json()) as { error?: { code?: string } };
    expect(missingBody.error?.code).toBe(
      missing.status() === 503 ? 'facebook_sign_in_disabled' : 'invalid_request',
    );

    const forged = await request.post('/auth/facebook/data-deletion', {
      form: { signed_request: 'Zm9yZ2Vk.eyJ1c2VyX2lkIjoiMTIzIn0' },
    });
    expect([400, 503]).toContain(forged.status());
    const forgedBody = (await forged.json()) as { error?: { code?: string }; url?: string };
    // A request whose HMAC does not verify never returns Meta's success shape.
    expect(forgedBody.url).toBeUndefined();
    expect(forgedBody.error?.code).toBe(
      forged.status() === 503 ? 'facebook_sign_in_disabled' : 'invalid_facebook_token',
    );

    // The public confirmation page is a plain lookup by code.
    const { body: unknownCode } = await apiJsonRetryRateLimit<{ error?: { code?: string } }>(
      request,
      'GET',
      '/auth/facebook/data-deletion/0123456789abcdef0123456789abcdef',
      { expectedStatus: 404 },
    );
    expect(unknownCode.error?.code).toBe('not_found');
  });
});
