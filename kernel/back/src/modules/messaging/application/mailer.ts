import { applyFilters } from '../../plugins/application/hooks.js';
import {
  CORE_OPENING_FILTERS,
  getMailTemplate,
  type MailTemplateMessage,
} from '@tuucho/plugin-sdk';
import { sendMail, spyTo, type MailMessage } from './email.js';

export interface MailerSendInput {
  template: string;
  to: string;
  data?: Record<string, unknown>;
  language?: string;
  bccStaff?: boolean;
}

export async function renderMailTemplate(
  template: string,
  data: Record<string, unknown> = {},
  language?: string,
): Promise<MailTemplateMessage | null> {
  const fromFilter = await applyFilters<MailTemplateMessage | null>(
    CORE_OPENING_FILTERS.mailTemplates,
    null,
    { template, data, language },
  );
  if (fromFilter?.subject && fromFilter.text) return fromFilter;
  const builtin = getMailTemplate(template);
  return builtin ? builtin(data, language) : null;
}

/** Kernel mailer. Plugins register templates or alter the message with mail.send. */
export async function sendTemplatedMail(input: MailerSendInput): Promise<void> {
  const rendered = await renderMailTemplate(input.template, input.data ?? {}, input.language);
  if (!rendered) {
    throw new Error(`Unknown mail template: ${input.template}`);
  }
  let message: MailMessage = {
    to: input.to,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
    kind: 'user',
  };
  message = await applyFilters(CORE_OPENING_FILTERS.mailSend, message, input);
  const recipients = await applyFilters<{ to: string; cc: string[]; bcc: string[] }>(
    CORE_OPENING_FILTERS.mailRecipients,
    { to: message.to, cc: [], bcc: [] },
    { ...input, message },
  );
  const bcc = [...(recipients.bcc ?? [])];
  if (input.bccStaff) {
    const staff = await spyTo('order_confirmation');
    if (staff && staff !== recipients.to && !bcc.includes(staff)) bcc.push(staff);
  }
  await sendMail({
    ...message,
    to: recipients.to || message.to,
    cc: recipients.cc?.length ? recipients.cc : message.cc,
    bcc: bcc.length ? bcc : message.bcc,
  });
}
