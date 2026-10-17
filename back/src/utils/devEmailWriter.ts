import { randomBytes } from 'node:crypto';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { config } from '../config/env.js';

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
    .slice(0, 60);
  return slug || 'email';
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface DevEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  from?: string;
  headers?: Record<string, string>;
  kind: 'user' | 'spy' | 'contact' | 'chat';
  attachments?: {
    filename: string;
    path: string;
    cid?: string;
    contentType?: string;
    contentDisposition?: 'inline' | 'attachment';
  }[];
}

/** When SMTP is unused (see email.service.ts's routeEmailFolder path) —
 * instead of a console.log easy to miss and drowned by a busy checkout flow,
 * every email that would have gone out is written as a standalone .html
 * file under DEV_DIR, ready to open in a browser. `spy` emails (the site
 * owner's own copy — new order, new account, login, ...) land under
 * DEV_EMAIL_SPY_DIR; `chat` owner-notify / transcript previews under
 * DEV_EMAIL_CHAT_DIR (also writes a sibling .eml for inbound round-trips);
 * customer/contact previews land directly under DEV_EMAIL_USER_DIR so those
 * streams can be watched/emptied independently.
 * Any attachment is also copied alongside it under the same base name (just
 * the extension differs) — the meta comment's `Attachments:` line names the
 * source path, but having the actual file sitting right next to the .html
 * preview makes it trivial to open and check the real attached content, not
 * just trust the path. Only called when `config.routeEmailFolder` (see
 * sendMail / sendChatMail). */
export function writeDevEmail(message: DevEmail): void {
  const dir =
    message.kind === 'spy'
      ? config.devEmailSpyDir
      : message.kind === 'chat'
        ? config.devEmailChatDir
        : config.devEmailDir;
  if (!dir) {
    throw new Error(
      'Dev email output dirs are not configured (DEV_DIR / DEV_EMAIL_USER_DIR / DEV_EMAIL_SPY_DIR / DEV_EMAIL_CHAT_DIR).',
    );
  }
  mkdirSync(dir, { recursive: true });
  // Date.now() alone collides under concurrent OTP/reset sends in the same
  // millisecond (load tests): the second writeFileSync silently overwrites
  // the first dump and the waiter never finds its mail. A short random
  // segment keeps the timestamp prefix for mtime/name filters.
  const baseName = `${Date.now()}-${randomBytes(4).toString('hex')}-${slugify(message.subject)}`;
  const headerLines = message.headers
    ? Object.entries(message.headers).map(([key, value]) => `${key}: ${value}`)
    : [];
  const attachmentNotes: string[] = [];
  let body =
    message.html ??
    `<pre style="white-space:pre-wrap;font-family:monospace;">${escapeHtml(message.text)}</pre>`;
  message.attachments?.forEach((attachment, index) => {
    const ext = extname(attachment.filename) || '.bin';
    const sameExtCount = message.attachments!.filter(
      (item) => (extname(item.filename) || '.bin') === ext,
    ).length;
    const suffix = sameExtCount > 1 ? `-${index + 1}` : '';
    const destName = `${baseName}${suffix}${ext}`;
    copyFileSync(attachment.path, resolve(dir, destName));
    attachmentNotes.push(`${attachment.filename} (${attachment.path})`);
    if (attachment.cid) {
      body = body.replaceAll(`cid:${attachment.cid}`, destName);
    }
  });
  const meta = [
    message.from ? `From: ${message.from}` : undefined,
    `To: ${message.to}`,
    message.replyTo ? `Reply-To: ${message.replyTo}` : undefined,
    `Subject: ${message.subject}`,
    ...headerLines,
    attachmentNotes.length ? `Attachments: ${attachmentNotes.join(', ')}` : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');
  writeFileSync(resolve(dir, `${baseName}.html`), `<!--\n${meta}\n-->\n${body}`, 'utf-8');

  if (message.kind === 'chat') {
    const emlHeaders = [
      message.from ? `From: ${message.from}` : 'From: chat@localhost',
      `To: ${message.to}`,
      message.replyTo ? `Reply-To: ${message.replyTo}` : undefined,
      `Subject: ${message.subject}`,
      ...headerLines,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      message.text,
    ]
      .filter((line): line is string => line !== undefined)
      .join('\r\n');
    writeFileSync(resolve(dir, `${baseName}.eml`), emlHeaders, 'utf-8');
  }
}
