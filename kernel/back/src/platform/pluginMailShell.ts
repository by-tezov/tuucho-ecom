import { setMailSender, type PluginMailMessage } from '@tuucho/plugin-sdk';
import { pool } from '../db/pool.js';
import { sendMail, type MailMessage } from '../modules/messaging/application/email.js';
import { sendTemplatedMail } from '../modules/messaging/application/mailer.js';
import { enqueueMailJob } from '../modules/messaging/application/mailJobs.js';

/** Bind kernel SMTP / mail_jobs onto the plugin SDK. Plugins never own SMTP. */
export function bindPluginMailShell(): void {
  setMailSender({
    sendMail: (message: PluginMailMessage) => sendMail(message as MailMessage),
    sendTemplatedMail,
    enqueueMailJob: (kind, payload) => enqueueMailJob(pool, kind, payload),
  });
}
