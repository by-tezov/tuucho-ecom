import { test, expect } from 'patchright/test';
import { apiJson, uniqueEmail } from '../../support/api.js';
import { testPassword } from '../../support/env.js';
import { extractOtpFromMail, waitForMail } from '../../support/mail.js';

test.describe('API passwordless OTP auth', () => {
  test('signup OTP: creates a passwordless account, then signup form connects that account', async ({ request }) => {
    const email = uniqueEmail('otp-signup');
    const signupSentAt = Date.now() - 500;

    await apiJson(request, 'POST', '/auth/request-otp', {
      data: {
        email,
        purpose: 'signup',
        gdprConsent: { accepted: true },
        language: 'fr',
      },
      expectedStatus: 200,
    });
    const signupOtp = extractOtpFromMail(await waitForMail({
      kind: 'user',
      toIncludes: email,
      sinceMs: signupSentAt,
      timeoutMs: 15_000,
    }));

    const { body: created } = await apiJson(request, 'POST', '/auth/verify-otp', {
      data: { email, code: signupOtp, purpose: 'signup', rememberMe: true },
      expectedStatus: 201,
    });
    expect(created.success).toBe(true);
    expect((created as { created?: boolean }).created).toBe(true);
    expect((created as { accessToken?: string }).accessToken).toBeTruthy();
    const user = (created as { user?: { email?: string; hasPassword?: boolean; emailVerified?: boolean } }).user;
    expect(user?.email).toBe(email);
    expect(user?.hasPassword).toBe(false);
    expect(user?.emailVerified).toBe(true);

    // Password login must remain unavailable for an OTP-only account.
    await apiJson(request, 'POST', '/auth/login', {
      data: { email, password: testPassword, rememberMe: false },
      expectedStatus: 401,
    });

    // The signup form is anti-enumerating for existing users: it issues a
    // login OTP and verify-otp/signup connects instead of creating a second
    // account or returning email_already_used.
    const loginSentAt = Date.now() - 500;
    await apiJson(request, 'POST', '/auth/request-otp', {
      data: {
        email,
        purpose: 'signup',
        gdprConsent: { accepted: true },
        language: 'fr',
      },
      expectedStatus: 200,
    });
    const loginOtp = extractOtpFromMail(await waitForMail({
      kind: 'user',
      toIncludes: email,
      sinceMs: loginSentAt,
      timeoutMs: 15_000,
    }));
    const { body: connected } = await apiJson(request, 'POST', '/auth/verify-otp', {
      data: { email, code: loginOtp, purpose: 'signup', rememberMe: false },
      expectedStatus: 200,
    });
    expect((connected as { created?: boolean }).created).not.toBe(true);
    expect((connected as { accessToken?: string }).accessToken).toBeTruthy();
  });

  test('login OTP: remains non-enumerating for an unknown email', async ({ request }) => {
    const unknownEmail = uniqueEmail('otp-unknown');
    const { body } = await apiJson(request, 'POST', '/auth/request-otp', {
      data: { email: unknownEmail, purpose: 'login' },
      expectedStatus: 200,
    });
    expect(body).toEqual({ success: true });

    // A normal password account can still use its explicit login-OTP flow.
    const { email } = await (async () => {
      const registered = uniqueEmail('otp-login');
      await apiJson(request, 'POST', '/auth/register', {
        data: {
          email: registered,
          password: testPassword,
          gdprConsent: { accepted: true },
          language: 'fr',
        },
        expectedStatus: 201,
      });
      return { email: registered };
    })();
    const sentAt = Date.now() - 500;
    await apiJson(request, 'POST', '/auth/request-otp', {
      data: { email, purpose: 'login' },
      expectedStatus: 200,
    });
    const otp = extractOtpFromMail(await waitForMail({
      kind: 'user', toIncludes: email, sinceMs: sentAt, timeoutMs: 15_000,
    }));
    const { body: connected } = await apiJson(request, 'POST', '/auth/verify-otp', {
      data: { email, code: otp, purpose: 'login', rememberMe: false },
      expectedStatus: 200,
    });
    expect((connected as { accessToken?: string }).accessToken).toBeTruthy();

    // The email was never verified, so this OTP sign-in is the first proof of
    // inbox control: the password chosen at registration (possibly by someone
    // else) is cancelled, and typing it again says so explicitly.
    const { body: cancelled } = await apiJson<{ error?: { code?: string; reason?: string } }>(
      request,
      'POST',
      '/auth/login',
      { data: { email, password: testPassword, rememberMe: false }, expectedStatus: 401 },
    );
    expect(cancelled.error).toEqual({ code: 'password_cancelled', reason: 'email_verification' });
  });

  test('auth OTP: honors the configured consecutive-attempt threshold', async ({ request }) => {
    const configuredMaxAttempts = Number(process.env.AUTH_OTP_MAX_ATTEMPTS);
    expect(Number.isSafeInteger(configuredMaxAttempts)).toBe(true);
    expect(configuredMaxAttempts).toBeGreaterThan(0);

    const email = uniqueEmail('otp-attempts');
    const sentAt = Date.now() - 500;

    await apiJson(request, 'POST', '/auth/request-otp', {
      data: {
        email,
        purpose: 'signup',
        gdprConsent: { accepted: true },
        language: 'fr',
      },
      expectedStatus: 200,
    });
    const otp = extractOtpFromMail(await waitForMail({
      kind: 'user',
      toIncludes: email,
      sinceMs: sentAt,
      timeoutMs: 15_000,
    }));
    const wrongOtp = otp === '000000' ? '000001' : '000000';

    const attemptsToMake = configuredMaxAttempts;
    for (let attempt = 0; attempt < attemptsToMake; attempt += 1) {
      const { body } = await apiJson<{ error?: { code?: string } }>(request, 'POST', '/auth/verify-otp', {
        data: { email, code: wrongOtp, purpose: 'signup' },
        expectedStatus: 400,
      });
      expect(body.error?.code).toBe('invalid_or_expired_token');
    }

    await apiJson(request, 'POST', '/auth/verify-otp', {
      data: { email, code: otp, purpose: 'signup' },
      expectedStatus: 400,
    });
  });
});
