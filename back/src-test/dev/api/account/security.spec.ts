import { test, expect } from 'patchright/test';
import { apiJson, apiJsonRetryRateLimit, loginUser, registerUser, uniqueEmail } from '../../support/api.js';
import { testPassword } from '../../support/env.js';
import { extractOtpFromMail, extractTokenFromMail, waitForMail } from '../../support/mail.js';
import { unlockAccountViaOps } from '../../support/ops.js';

type UnlockBody = { unlockToken?: string; action?: string; expiresAt?: string; error?: { code?: string } };
type UserBody = {
  user?: {
    email?: string;
    pendingEmail?: string | null;
    status?: string;
    hasPassword?: boolean;
    hasGoogle?: boolean;
    hasFacebook?: boolean;
    deletionScheduledFor?: string | null;
  };
};

async function unlock(
  request: Parameters<typeof apiJson>[0],
  token: string,
  action: string,
  password = testPassword,
): Promise<string> {
  const { body } = await apiJsonRetryRateLimit<UnlockBody>(request, 'POST', '/account/unlock', {
    token,
    data: { action, currentPassword: password },
    expectedStatus: 200,
  });
  if (!body.unlockToken) throw new Error(`unlock(${action}) returned no token`);
  return body.unlockToken;
}

test.describe('API account security', () => {
  test('step-up: unlock is credential-checked, action-scoped and single-use', async ({ request }) => {
    const { accessToken } = await registerUser(request);

    const { body: noCredential } = await apiJsonRetryRateLimit<UnlockBody>(
      request,
      'POST',
      '/account/unlock',
      { token: accessToken, data: { action: 'email' }, expectedStatus: 400 },
    );
    expect(noCredential.error?.code).toBe('invalid_request');

    // Mixing both credential kinds is rejected rather than silently
    // preferring one of them.
    await apiJsonRetryRateLimit(request, 'POST', '/account/unlock', {
      token: accessToken,
      data: { action: 'email', currentPassword: testPassword, code: '123456' },
      expectedStatus: 400,
    });

    await apiJsonRetryRateLimit(request, 'POST', '/account/unlock', {
      token: accessToken,
      data: { action: 'nope', currentPassword: testPassword },
      expectedStatus: 400,
    });

    const { body: wrongPassword } = await apiJsonRetryRateLimit<UnlockBody>(
      request,
      'POST',
      '/account/unlock',
      {
        token: accessToken,
        data: { action: 'password', currentPassword: 'E2eWrong9!' },
        expectedStatus: 401,
      },
    );
    expect(wrongPassword.error?.code).toBe('invalid_credentials');

    const { body: issued } = await apiJsonRetryRateLimit<UnlockBody>(request, 'POST', '/account/unlock', {
      token: accessToken,
      data: { action: 'profile', currentPassword: testPassword },
      expectedStatus: 200,
    });
    expect(issued.unlockToken).toBeTruthy();
    expect(issued.action).toBe('profile');
    expect(issued.expiresAt).toBeTruthy();

    // A profile token must not open a different sensitive action.
    const { body: wrongAction } = await apiJsonRetryRateLimit<UnlockBody>(
      request,
      'POST',
      '/account/change-password',
      {
        token: accessToken,
        data: { unlockToken: issued.unlockToken, newPassword: 'E2eOther9!' },
        expectedStatus: 401,
      },
    );
    expect(wrongAction.error?.code).toBe('unlock_invalid');

    // An account that has a password cannot ask for the OTP variant.
    const { body: otpRefused } = await apiJsonRetryRateLimit<UnlockBody>(
      request,
      'POST',
      '/account/request-unlock-otp',
      { token: accessToken, data: { action: 'profile' }, expectedStatus: 400 },
    );
    expect(otpRefused.error?.code).toBe('invalid_request');
  });

  test('a passwordless account: unlocks with a mailed code instead of a password', async ({ request }) => {
    const email = uniqueEmail('unlock-otp');
    const { body: created } = await apiJsonRetryRateLimit<{ accessToken?: string }>(
      request,
      'POST',
      '/auth/register-otp-skip',
      {
        data: { email, gdprConsent: { accepted: true }, language: 'fr' },
        expectedStatus: 201,
      },
    );
    const accessToken = created.accessToken!;

    // The password branch is not merely wrong here, it is invalid input.
    await apiJsonRetryRateLimit(request, 'POST', '/account/unlock', {
      token: accessToken,
      data: { action: 'profile', currentPassword: testPassword },
      expectedStatus: 400,
    });

    const sinceMs = Date.now() - 500;
    await apiJsonRetryRateLimit(request, 'POST', '/account/request-unlock-otp', {
      token: accessToken,
      data: { action: 'profile' },
      expectedStatus: 200,
    });
    const code = extractOtpFromMail(
      await waitForMail({ kind: 'user', toIncludes: email, sinceMs, timeoutMs: 15_000 }),
    );

    const { body: unlocked } = await apiJsonRetryRateLimit<UnlockBody>(request, 'POST', '/account/unlock', {
      token: accessToken,
      data: { action: 'profile', code },
      expectedStatus: 200,
    });
    expect(unlocked.unlockToken).toBeTruthy();
    expect(unlocked.action).toBe('profile');

    // The code is burned by the successful unlock, so a replay cannot mint a
    // second token for the same action.
    await apiJsonRetryRateLimit(request, 'POST', '/account/unlock', {
      token: accessToken,
      data: { action: 'profile', code },
      expectedStatus: 401,
    });
  });

  test('passwordless OTP: unlock is issued for every documented action and stays action-scoped', async ({
    request,
  }) => {
    const email = uniqueEmail('unlock-otp-actions');
    const { body: created } = await apiJsonRetryRateLimit<{ accessToken?: string }>(
      request,
      'POST',
      '/auth/register-otp-skip',
      {
        data: { email, gdprConsent: { accepted: true }, language: 'fr' },
        expectedStatus: 201,
      },
    );
    const accessToken = created.accessToken!;

    async function mailedUnlockCode(action: string): Promise<string> {
      const sinceMs = Date.now() - 500;
      await apiJsonRetryRateLimit(request, 'POST', '/account/request-unlock-otp', {
        token: accessToken,
        data: { action },
        expectedStatus: 200,
      });
      return extractOtpFromMail(
        await waitForMail({
          kind: 'user',
          toIncludes: email,
          sinceMs,
          timeoutMs: 15_000,
          subjectIncludes: 'code de connexion',
        }),
      );
    }

    // A profile code must not mint an email token.
    const profileCode = await mailedUnlockCode('profile');
    await apiJsonRetryRateLimit(request, 'POST', '/account/unlock', {
      token: accessToken,
      data: { action: 'email', code: profileCode },
      expectedStatus: 401,
    });

    const unlockActions = [
      'profile',
      'email',
      'password',
      'deletion',
      'google',
      'facebook',
      'apple',
      'social',
    ] as const;
    for (const action of unlockActions) {
      const code = await mailedUnlockCode(action);
      const { body } = await apiJsonRetryRateLimit<UnlockBody>(request, 'POST', '/account/unlock', {
        token: accessToken,
        data: { action, code },
        expectedStatus: 200,
      });
      expect(body.unlockToken).toBeTruthy();
      expect(body.action).toBe(action);
    }
  });

  test('change-email: keeps the current address until the new one confirms', async ({ request }) => {
    const { email, accessToken } = await registerUser(request);
    const newEmail = uniqueEmail('changed');
    const sinceMs = Date.now() - 500;

    const unlockToken = await unlock(request, accessToken, 'email');
    const { body: requested } = await apiJsonRetryRateLimit<{ pendingEmail?: string }>(
      request,
      'POST',
      '/account/change-email',
      { token: accessToken, data: { newEmail, unlockToken }, expectedStatus: 200 },
    );
    expect(requested.pendingEmail).toBe(newEmail);

    const { body: pending } = await apiJson<UserBody>(request, 'GET', '/account/profile', {
      token: accessToken,
      expectedStatus: 200,
    });
    // The account keeps its address (and its verified state) until the new
    // address proves it is reachable.
    expect(pending.user?.email).toBe(email);
    expect(pending.user?.pendingEmail).toBe(newEmail);
    expect(await loginUser(request, email, testPassword)).toBeTruthy();

    const confirmation = await waitForMail({
      kind: 'user',
      toIncludes: newEmail,
      sinceMs,
      timeoutMs: 15_000,
    });
    const { body: confirmed } = await apiJsonRetryRateLimit<{ emailChanged?: boolean }>(
      request,
      'POST',
      '/auth/confirm-email',
      { data: { token: extractTokenFromMail(confirmation) }, expectedStatus: 200 },
    );
    expect(confirmed.emailChanged).toBe(true);

    const { body: after } = await apiJson<UserBody>(request, 'GET', '/account/profile', {
      token: accessToken,
      expectedStatus: 200,
    });
    expect(after.user?.email).toBe(newEmail);
    expect(after.user?.pendingEmail).toBeNull();
    expect(await loginUser(request, newEmail, testPassword)).toBeTruthy();

    // A second change to an address another account already owns is refused
    // after the unlock is spent, so the caller must step up again.
    const otherAccount = await registerUser(request);
    const secondUnlock = await unlock(request, accessToken, 'email');
    const { body: taken } = await apiJsonRetryRateLimit<{ error?: { code?: string } }>(
      request,
      'POST',
      '/account/change-email',
      {
        token: accessToken,
        data: { newEmail: otherAccount.email, unlockToken: secondUnlock },
        expectedStatus: 409,
      },
    );
    expect(taken.error?.code).toBe('email_already_used');

    const { body: replayed } = await apiJsonRetryRateLimit<{ error?: { code?: string } }>(
      request,
      'POST',
      '/account/change-email',
      {
        token: accessToken,
        data: { newEmail: uniqueEmail('changed-again'), unlockToken },
        expectedStatus: 401,
      },
    );
    expect(replayed.error?.code).toBe('unlock_invalid');
  });

  test('old-address "this wasn\'t me" notice: it locks the account', async ({ request }) => {
    const { email, accessToken } = await registerUser(request);
    const sinceMs = Date.now() - 500;
    const unlockToken = await unlock(request, accessToken, 'email');
    await apiJsonRetryRateLimit(request, 'POST', '/account/change-email', {
      token: accessToken,
      data: { newEmail: uniqueEmail('hijacked'), unlockToken },
      expectedStatus: 200,
    });

    // Two mails leave on a change: the confirmation to the new address, and
    // this security notice to the current one.
    const notice = await waitForMail({ kind: 'user', toIncludes: email, sinceMs, timeoutMs: 15_000 });
    const lockToken = extractTokenFromMail(notice);
    await apiJsonRetryRateLimit(request, 'POST', '/auth/lock-account', {
      data: { token: lockToken },
      expectedStatus: 200,
    });

    // Locking revokes every session and blocks a new one; only an operator
    // can reverse it.
    const { body: rejected } = await apiJson<{ error?: { code?: string } }>(
      request,
      'GET',
      '/account/profile',
      { token: accessToken, expectedStatus: 401 },
    );
    expect(rejected.error?.code).toBe('unauthorized');
    // A security lock is not the temporary failed-attempt lockout (423): it
    // is permanent until an operator reverses it.
    const { body: locked } = await apiJsonRetryRateLimit<{ error?: { code?: string } }>(
      request,
      'POST',
      '/auth/login',
      { data: { email, password: testPassword, rememberMe: false }, expectedStatus: 403 },
    );
    expect(locked.error?.code).toBe('account_security_locked');

    // The token is single-use.
    const { body: replayed } = await apiJsonRetryRateLimit<{ error?: { code?: string } }>(
      request,
      'POST',
      '/auth/lock-account',
      { data: { token: lockToken }, expectedStatus: 400 },
    );
    expect(replayed.error?.code).toBe('invalid_or_expired_token');

    // Leave the disposable account usable again through the operator path.
    await unlockAccountViaOps(email);
    expect(await loginUser(request, email, testPassword)).toBeTruthy();
  });

  test('recent-logins: reports real sign-ins and the checkout-session key is stable', async ({ request }) => {
    const { email, accessToken } = await registerUser(request);
    await loginUser(request, email, testPassword);

    const { body } = await apiJson<{
      logins?: Array<{
        createdAt?: string;
        ip?: string | null;
        location?: string | null;
        device?: string | null;
      }>;
    }>(request, 'GET', '/account/recent-logins', { token: accessToken, expectedStatus: 200 });
    const logins = body.logins ?? [];
    // Register + login are both real sign-ins; a refresh rotation is not.
    expect(logins.length).toBeGreaterThanOrEqual(2);
    for (const login of logins) expect(login.createdAt).toBeTruthy();

    const { body: first } = await apiJson<{ token?: string; vaultKey?: string }>(
      request,
      'POST',
      '/checkout/session/start',
      { token: accessToken, checkoutSession: false, expectedStatus: 200 },
    );
    expect(first.token).toBeTruthy();
    expect(first.vaultKey).toBeTruthy();
    expect(Buffer.from(first.vaultKey!, 'base64')).toHaveLength(32);

    // Reloading the tab must decrypt the same sessionStorage blob, so the
    // key is created once and then returned unchanged.
    const { body: second } = await apiJson<{ vaultKey?: string; resumed?: boolean }>(
      request,
      'POST',
      '/checkout/session/start',
      { token: accessToken, checkoutSession: first.token!, expectedStatus: 200 },
    );
    expect(second.vaultKey).toBe(first.vaultKey);
    expect(second.resumed).toBe(true);
  });

  test('deletion: is scheduled behind a step-up unlock and can be cancelled in session', async ({
    request,
  }) => {
    const { accessToken } = await registerUser(request);

    const { body: noToken } = await apiJson<{ error?: { code?: string } }>(
      request,
      'POST',
      '/account/request-deletion',
      { token: accessToken, data: {}, expectedStatus: 400 },
    );
    expect(noToken.error?.code).toBe('invalid_request');

    const profileToken = await unlock(request, accessToken, 'profile');
    const { body: wrongAction } = await apiJson<{ error?: { code?: string } }>(
      request,
      'POST',
      '/account/request-deletion',
      { token: accessToken, data: { unlockToken: profileToken }, expectedStatus: 401 },
    );
    expect(wrongAction.error?.code).toBe('unlock_invalid');

    const deletionToken = await unlock(request, accessToken, 'deletion');
    const { body: scheduled } = await apiJson<{ deletionScheduledFor?: string }>(
      request,
      'POST',
      '/account/request-deletion',
      { token: accessToken, data: { unlockToken: deletionToken }, expectedStatus: 200 },
    );
    expect(scheduled.deletionScheduledFor).toBeTruthy();
    expect(Number.isNaN(Date.parse(scheduled.deletionScheduledFor!))).toBe(false);

    const { body: pending } = await apiJson<UserBody>(request, 'GET', '/account/profile', {
      token: accessToken,
      expectedStatus: 200,
    });
    expect(pending.user?.status).toBe('pending_deletion');
    expect(pending.user?.deletionScheduledFor).toBeTruthy();

    const { body: cancelled } = await apiJson<{ reactivated?: boolean }>(
      request,
      'POST',
      '/account/cancel-deletion',
      { token: accessToken, expectedStatus: 200 },
    );
    expect(cancelled.reactivated).toBe(true);

    const { body: active } = await apiJson<UserBody>(request, 'GET', '/account/profile', {
      token: accessToken,
      expectedStatus: 200,
    });
    expect(active.user?.status).toBe('active');
    expect(active.user?.deletionScheduledFor).toBeNull();

    // Nothing left to back out of — still a success, but nothing changed.
    const { body: again } = await apiJson<{ reactivated?: boolean }>(
      request,
      'POST',
      '/account/cancel-deletion',
      { token: accessToken, expectedStatus: 200 },
    );
    expect(again.reactivated).toBe(false);
  });

  test('social unlink: is unlock-gated and idempotent when nothing is linked', async ({ request }) => {
    const { accessToken } = await registerUser(request);

    for (const provider of ['google', 'facebook'] as const) {
      const { body: noToken } = await apiJsonRetryRateLimit<UnlockBody>(
        request,
        'POST',
        `/account/unlink-${provider}`,
        { token: accessToken, data: {}, expectedStatus: 400 },
      );
      expect(noToken.error?.code).toBe('invalid_request');

      // A token minted for another action must not unlink an identity.
      const passwordToken = await unlock(request, accessToken, 'password');
      const { body: wrongAction } = await apiJsonRetryRateLimit<UnlockBody>(
        request,
        'POST',
        `/account/unlink-${provider}`,
        { token: accessToken, data: { unlockToken: passwordToken }, expectedStatus: 401 },
      );
      expect(wrongAction.error?.code).toBe('unlock_invalid');

      const unlockToken = await unlock(request, accessToken, provider);
      const { body: unlinked } = await apiJsonRetryRateLimit<UserBody>(
        request,
        'POST',
        `/account/unlink-${provider}`,
        { token: accessToken, data: { unlockToken }, expectedStatus: 200 },
      );
      // Unlinking never touches the main credential pair.
      expect(unlinked.user?.hasPassword ?? true).toBe(true);
      expect(provider === 'google' ? unlinked.user?.hasGoogle : unlinked.user?.hasFacebook).toBe(false);
    }
  });

  test('social link: refuses a credential the provider cannot vouch for', async ({ request }) => {
    const { accessToken } = await registerUser(request);

    const googleUnlock = await unlock(request, accessToken, 'google');
    const { status: googleStatus, body: google } = await apiJsonRetryRateLimit<{
      error?: { code?: string };
    }>(request, 'POST', '/account/link-google', {
      token: accessToken,
      data: { idToken: 'not-a-google-id-token', unlockToken: googleUnlock },
      expectedStatus: [400, 503],
    });
    // Either the environment has no Google client id, or verification runs
    // and rejects the forged credential — never a link.
    expect(google.error?.code).toBe(
      googleStatus === 503 ? 'google_sign_in_disabled' : 'invalid_google_token',
    );

    const facebookUnlock = await unlock(request, accessToken, 'facebook');
    const { status: facebookStatus, body: facebook } = await apiJsonRetryRateLimit<{
      error?: { code?: string };
    }>(request, 'POST', '/account/link-facebook', {
      token: accessToken,
      data: { accessToken: 'not-a-facebook-token', unlockToken: facebookUnlock },
      expectedStatus: [400, 503],
    });
    expect(
      facebookStatus === 503
        ? ['facebook_sign_in_disabled']
        : ['invalid_facebook_token', 'facebook_email_required'],
    ).toContain(facebook.error?.code);

    // The mismatch-resolution step is equally unusable without a pending
    // link token, so a crafted call can never finish a link on its own.
    for (const provider of ['google', 'facebook'] as const) {
      const linkUnlock = await unlock(request, accessToken, provider);
      const { status, body } = await apiJsonRetryRateLimit<{ error?: { code?: string } }>(
        request,
        'POST',
        `/account/link-${provider}/complete`,
        {
          token: accessToken,
          data: {
            [`${provider}LinkToken`]: 'not-a-real-link-token',
            choice: 'keep',
            unlockToken: linkUnlock,
          },
          expectedStatus: [400, 503],
        },
      );
      expect(body.error?.code).toBe(
        status === 503 ? `${provider}_sign_in_disabled` : 'invalid_or_expired_token',
      );
    }

    const { body: profile } = await apiJson<UserBody>(request, 'GET', '/account/profile', {
      token: accessToken,
      expectedStatus: 200,
    });
    expect(profile.user?.hasGoogle).toBe(false);
    expect(profile.user?.hasFacebook).toBe(false);
  });
});
