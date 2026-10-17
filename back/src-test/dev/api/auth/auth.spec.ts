import { test, expect } from 'patchright/test';
import {
  apiJson,
  apiJsonRetryRateLimit,
  confirmEmailWithToken,
  loginUser,
  registerUser,
  uniqueEmail,
} from '../../support/api.js';
import { testPassword } from '../../support/env.js';
import { extractTokenFromMail, waitForMail } from '../../support/mail.js';

test.describe('API auth', () => {
  test('register, email confirmation, login, and logout: each step succeeds', async ({ request }) => {
    const sinceMs = Date.now() - 1_000;
    const { email, accessToken } = await registerUser(request);

    const mail = await waitForMail({
      kind: 'user',
      toIncludes: email,
      subjectIncludes: 'Confirmez votre adresse email',
      sinceMs,
      timeoutMs: 15_000,
    });
    const token = extractTokenFromMail(mail);
    await confirmEmailWithToken(request, token);

    const loginToken = await loginUser(request, email, testPassword);
    expect(loginToken).toBeTruthy();

    await apiJson(request, 'POST', '/auth/logout', {
      token: accessToken,
      expectedStatus: 200,
    });
  });

  test('weak password: the route rejects it', async ({ request }) => {
    const { status, body } = await apiJsonRetryRateLimit<{
      success: boolean;
      error?: { code?: string; violations?: string[] };
    }>(request, 'POST', '/auth/register', {
      data: {
        email: uniqueEmail('weak'),
        password: 'short',
        gdprConsent: { accepted: true },
        language: 'fr',
      },
    });
    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('weak_password');
    expect(body.error?.violations).toEqual(expect.arrayContaining([
      'tooShort',
      'missingUppercase',
      'missingDigit',
      'missingSpecial',
    ]));
  });

  test('password reset: it completes through the email token', async ({ request }) => {
    const { email } = await registerUser(request);
    const sinceMs = Date.now() - 500;

    await apiJsonRetryRateLimit(request, 'POST', '/auth/request-password-reset', {
      data: { email },
      expectedStatus: 200,
    });

    // The reset mail is sent after the 200 (no timing oracle), so the
    // registration confirmation can still sit inside this window.
    const mail = await waitForMail({
      kind: 'user',
      toIncludes: email,
      subjectIncludes: 'Réinitialisation de votre mot de passe',
      sinceMs,
      timeoutMs: 15_000,
    });

    const token = extractTokenFromMail(mail);
    const newPassword = 'E2eReset9!';
    await apiJsonRetryRateLimit(request, 'POST', '/auth/confirm-password-reset', {
      data: { token, newPassword },
      expectedStatus: 200,
    });

    await loginUser(request, email, newPassword);
  });
});
