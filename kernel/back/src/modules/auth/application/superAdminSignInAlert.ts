import type pg from 'pg';
import { config } from '../../../config/env.js';
import { resolveLoginLocation } from '../../../platform/network/geoLocation.js';
import { summarizeUserAgent } from '../../../utils/userAgent.js';
import { issueAccountLockToken } from '../../identity/application/accountSecurityLock.js';
import { getUserLanguage } from '../../identity/application/userPreferences.js';
import { SUPER_ADMIN_ROLE } from '../../identity/domain/staffPermissions.js';
import { sendMail } from '../../messaging/application/email.js';
import { superAdminSignInEmail } from '../../messaging/application/accountEmails.js';

/** Emails a super-admin each time a session of theirs starts: every sign-in
 * (`signin`) and every automatic resume of an idle session (`resume`, see
 * isIdleResume), with what the request revealed and a single-use lock link.
 * Any other role is ignored. Detached like the login spy: a mail failure is
 * logged and never affects the sign-in itself. */
export function notifySuperAdminSession(
  pool: pg.Pool,
  account: { id: string; email: string; role: string },
  meta: { ip: string | undefined; userAgent: string | undefined },
  kind: 'signin' | 'resume',
): void {
  if (account.role !== SUPER_ADMIN_ROLE) return;
  const at = new Date();
  void (async () => {
    const [lockToken, location, language] = await Promise.all([
      issueAccountLockToken(pool, account.id),
      resolveLoginLocation(meta.ip),
      getUserLanguage(pool, account.id),
    ]);
    await sendMail({
      to: account.email,
      ...superAdminSignInEmail({
        kind,
        at,
        ip: meta.ip ?? null,
        location,
        device: summarizeUserAgent(meta.userAgent ?? null),
        lockUrl: `${config.frontendBaseUrl}/account/security-lock?token=${lockToken}`,
        language,
      }),
    });
  })().catch((error) => {
    console.error('[auth] super-admin sign-in alert failed', error);
  });
}
