/**
 * Contact's slot in the mail queue. See gift/application/giftMailJob.ts for why
 * the deliverer is registered from the feature side.
 */
import type pg from 'pg';
import { contactMessageEmail, sendMail, spyTo } from '@kernel/back/modules/messaging/application/email';
import { enqueueMailJob, registerMailJobDeliverer } from '@kernel/back/modules/messaging/application/mailJobs';

const CONTACT_FORM_MAIL = 'contact_form';

type ContactFormPayload = {
  email: string;
  identity: string | null;
  userId: string | null;
  firstName: string | null;
  lastName: string | null;
  message: string;
  attachmentNames?: string[];
  attachments?: { filename: string; path: string }[];
};

export async function enqueueContactFormMail(
  db: pg.Pool | pg.PoolClient,
  input: ContactFormPayload,
): Promise<string> {
  return enqueueMailJob(db, CONTACT_FORM_MAIL, input);
}

registerMailJobDeliverer(CONTACT_FORM_MAIL, async (raw) => {
  const payload = raw as ContactFormPayload;
  const to = await spyTo('contact.inbound');
  if (!to) return;
  await sendMail({
    to,
    ...contactMessageEmail({
      email: payload.email,
      identity: payload.identity,
      userId: payload.userId,
      firstName: payload.firstName,
      lastName: payload.lastName,
      message: payload.message,
      attachmentNames: payload.attachmentNames,
    }),
    attachments: payload.attachments,
  });
});
