import { config } from '../../../config/env.js';
import { pool } from '../../../db/pool.js';
import { issueAccountLockToken } from '../../identity/application/accountSecurityLock.js';
import { getUserLanguage } from '../../identity/application/userPreferences.js';
import {
  emailChangedSpyEmail,
  emailChangeSecurityNoticeEmail,
  sendMail,
  spyRecipient,
} from '../../messaging/application/email.js';

type SocialProvider = 'google' | 'apple' | 'facebook';

/** Security notifications shared by social-provider email switches. */
export async function notifySocialEmailSwitch(input: {
  provider: SocialProvider;
  userId: string;
  oldEmail: string;
  newEmail: string;
}): Promise<void> {
  if (input.oldEmail.toLowerCase() === input.newEmail.toLowerCase()) return;

  const lockToken = await issueAccountLockToken(pool, input.userId);
  await sendMail({
    to: input.oldEmail,
    ...emailChangeSecurityNoticeEmail(
      input.newEmail,
      `${config.frontendBaseUrl}/account/security-lock?token=${lockToken}`,
      await getUserLanguage(pool, input.userId),
    ),
  });

  const spyTo = spyRecipient('email_changed');
  if (!spyTo) return;
  void sendMail({
    to: spyTo,
    ...emailChangedSpyEmail({
      oldEmail: input.oldEmail,
      newEmail: input.newEmail,
      userId: input.userId,
    }),
  }).catch((error) => {
    console.error(`[account] ${input.provider}-link switch spy notification failed`, error);
  });
}
