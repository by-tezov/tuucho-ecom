import { createHash } from 'node:crypto';
import { test, expect } from 'patchright/test';
import { apiJson, registerUser, uniqueEmail } from '../../support/api.js';
import { issueEmailConfirmationToken } from '../../../../src/modules/identity/application/emailConfirmation.js';
import { decryptPii, emailLookupHash, encryptPii } from '../../../../src/platform/security/piiCrypto.js';
import { pool } from '../../../../src/db/pool.js';

test.describe('API email confirmation OTP hardening', () => {
  test('confirmation OTP: consecutive wrong codes burn it', async ({ request }) => {
    const email = uniqueEmail('email-confirmation-otp');
    const { user } = await registerUser(request, { email });
    const userId = String(user.id ?? '');
    expect(userId).toMatch(/^[0-9a-f-]{36}$/i);

    const issued = await issueEmailConfirmationToken(pool, userId, email);
    const stored = await pool.query<{ otp_hash: string }>(
      `select otp_hash from email_confirmation_tokens where user_id = $1 and used_at is null`,
      [userId],
    );
    expect(stored.rows[0]?.otp_hash).toBeTruthy();
    expect(stored.rows[0]?.otp_hash).not.toBe(createHash('sha256').update(issued.otp).digest('hex'));
    const wrongCode = issued.otp === '000000' ? '000001' : '000000';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { body } = await apiJson<{ error?: { code?: string } }>(request, 'POST', '/auth/confirm-email', {
        data: { email, code: wrongCode },
        expectedStatus: 400,
      });
      expect(body.error?.code).toBe('invalid_or_expired_token');
    }

    await apiJson(request, 'POST', '/auth/confirm-email', {
      data: { email, code: issued.otp },
      expectedStatus: 400,
    });
  });

  test('a superseded token: cannot apply a pending email change', async ({ request }) => {
    const currentEmail = uniqueEmail('email-confirmation-current');
    const pendingEmail = uniqueEmail('email-confirmation-pending');
    const { user } = await registerUser(request, { email: currentEmail });
    const userId = String(user.id ?? '');

    await pool.query(
      `update users
          set pending_email = $2,
              pending_email_lookup = $3,
              updated_at = now()
        where id = $1`,
      [userId, encryptPii(pendingEmail), emailLookupHash(pendingEmail)],
    );
    const superseded = await issueEmailConfirmationToken(pool, userId, pendingEmail);
    const current = await issueEmailConfirmationToken(pool, userId, pendingEmail);

    await apiJson(request, 'POST', '/auth/confirm-email', {
      data: { token: superseded.rawToken },
      expectedStatus: 400,
    });
    const beforeCurrent = await pool.query<{ email: string; pending_email: string | null }>(
      `select email, pending_email from users where id = $1`,
      [userId],
    );
    expect(decryptPii(beforeCurrent.rows[0]?.email)).toBe(currentEmail);
    expect(decryptPii(beforeCurrent.rows[0]?.pending_email)).toBe(pendingEmail);

    const { body } = await apiJson<{ emailChanged?: boolean }>(request, 'POST', '/auth/confirm-email', {
      data: { token: current.rawToken },
      expectedStatus: 200,
    });
    expect(body.emailChanged).toBe(true);
  });

  test('an expired used token: cannot be replayed', async ({ request }) => {
    const email = uniqueEmail('email-confirmation-expired-replay');
    const { user } = await registerUser(request, { email });
    const userId = String(user.id ?? '');
    const issued = await issueEmailConfirmationToken(pool, userId, email);

    await apiJson(request, 'POST', '/auth/confirm-email', {
      data: { token: issued.rawToken },
      expectedStatus: 200,
    });
    await pool.query(
      `update email_confirmation_tokens set expires_at = now() - interval '1 second' where user_id = $1`,
      [userId],
    );
    await apiJson(request, 'POST', '/auth/confirm-email', {
      data: { token: issued.rawToken },
      expectedStatus: 400,
    });
  });
});
