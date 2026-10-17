import { config } from '../../../config/env.js';
import { writeDevEmail } from '../../../utils/devEmailWriter.js';
import { noteSentEmail } from './emailJournal.js';
import { getChatTransporter, getTransporter } from './smtpTransport.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  /** Which dev-mode output/emails/ subfolder this lands in. See
   * utils/devEmailWriter.ts. Defaults to 'user' (the customer's own inbox:
   * order confirmation, shipped, password reset, etc.) so only the two
   * builders that aren't a plain user-facing send (the spy copy, the
   * contact-form notification) need to set this explicitly. Chat uses
   * sendChatMail instead. */
  kind?: 'user' | 'spy' | 'contact';
  /** `path` (not `content`); CID images: temp file + `cid` (no `data:` URIs). */
  attachments?: {
    filename: string;
    path: string;
    cid?: string;
    contentType?: string;
    contentDisposition?: 'inline' | 'attachment';
  }[];
  headers?: Record<string, string>;
}

export interface ChatMailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  from?: string;
  headers?: Record<string, string>;
  attachments?: MailMessage['attachments'];
}

function prefixedSubject(subject: string): string {
  return config.smtp.fromNamePrefix ? `${config.smtp.fromNamePrefix} ${subject}` : subject;
}

/** Folder routing (local dev, and preprod when `ROUTE_EMAIL_FOLDER=true` or
 * the ops override is on) writes under DEV_DIR instead of SMTP. The subject
 * prefix is applied here, once, so builders never learn the target. */
export async function sendMail(message: MailMessage): Promise<void> {
  const subject = prefixedSubject(message.subject);
  const channel = config.routeEmailFolder ? 'folder' : 'smtp';
  const kind = message.kind ?? 'user';
  try {
    if (config.routeEmailFolder) {
      writeDevEmail({ ...message, subject, kind });
    } else {
      const client = getTransporter();
      if (!client) {
        throw new Error(
          'SMTP is not configured (SMTP_HOST / EMAIL_NO_REPLY_FROM required outside folder routing).',
        );
      }
      await client.sendMail({
        from: config.smtp.fromEmail,
        to: message.to,
        replyTo: message.replyTo,
        subject,
        text: message.text,
        html: message.html,
        attachments: message.attachments,
        headers: message.headers,
      });
    }
    noteSentEmail(message, subject, config.smtp.fromEmail, channel, 'sent', kind);
  } catch (error) {
    noteSentEmail(message, subject, config.smtp.fromEmail, channel, 'failed', kind, error);
    throw error;
  }
}

/** Dedicated transporter / From for contact chat. Reply-To must stay the
 * piped mailbox (EMAIL_CHAT_FROM), never the visitor. */
export async function sendChatMail(message: ChatMailMessage): Promise<void> {
  const subject = prefixedSubject(message.subject);
  const from = message.from ?? config.chatSmtp.fromEmail ?? 'chat@localhost';
  const channel = config.routeEmailFolder ? 'folder' : 'smtp';
  const noted = { ...message, replyTo: message.replyTo ?? from };
  try {
    if (config.routeEmailFolder) {
      writeDevEmail({ ...message, from, subject, kind: 'chat' });
    } else {
      const client = getChatTransporter();
      if (!client) {
        throw new Error(
          'Chat SMTP is not configured (SMTP_CHAT_HOST / EMAIL_CHAT_FROM / EMAIL_CHAT_RECIPIENT required outside folder routing).',
        );
      }
      await client.sendMail({
        from,
        to: message.to,
        replyTo: message.replyTo ?? from,
        subject,
        text: message.text,
        html: message.html,
        headers: message.headers,
        attachments: message.attachments,
      });
    }
    noteSentEmail(noted, subject, from, channel, 'sent', 'chat');
  } catch (error) {
    noteSentEmail(noted, subject, from, channel, 'failed', 'chat', error);
    throw error;
  }
}
