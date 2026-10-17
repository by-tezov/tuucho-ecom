import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadTestEnv } from './env.js';
import { opsRequest } from './ops.js';
import { assertActionTimeout, MAX_ACTION_TIMEOUT_MS } from './timeouts.js';

export type MailKind = 'user' | 'spy';

export interface DevMail {
  path: string;
  to: string;
  subject: string;
  html: string;
  mtimeMs: number;
}

function mailDir(kind: MailKind): string {
  const env = loadTestEnv();
  return kind === 'spy' ? env.emailSpyDir : env.emailUserDir;
}

function parseMeta(html: string): { to: string; subject: string } {
  const block = html.match(/<!--([\s\S]*?)-->/);
  const meta = block?.[1] ?? '';
  const to = meta.match(/^To:\s*(.+)$/m)?.[1]?.trim() ?? '';
  const subject = meta.match(/^Subject:\s*(.+)$/m)?.[1]?.trim() ?? '';
  return { to, subject };
}

function fileStampMs(name: string): number | null {
  const stamp = Number(name.slice(0, 13));
  return Number.isFinite(stamp) && stamp > 1_000_000_000_000 ? stamp : null;
}

function listLocalMails(kind: MailKind, sinceMs?: number): DevMail[] {
  const dir = mailDir(kind);
  let names: string[];
  try {
    names = readdirSync(dir).filter((n) => n.endsWith('.html'));
  } catch {
    return [];
  }
  return names
    .flatMap((name) => {
      // Dumps are named `${Date.now()}-…`. A long suite leaves hundreds of
      // HTML files; reading each one on every poll burns the 15s mail wait
      // before the new message is opened.
      const stamped = fileStampMs(name);
      if (sinceMs != null && stamped != null && stamped < sinceMs - 2_000) return [];
      const path = join(dir, name);
      const mtimeMs = statSync(path).mtimeMs;
      if (sinceMs != null && mtimeMs < sinceMs) return [];
      const html = readFileSync(path, 'utf-8');
      const { to, subject } = parseMeta(html);
      return [{ path, to, subject, html, mtimeMs }];
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

async function listPreprodMails(
  kind: MailKind,
  toIncludes: string | undefined,
  sinceMs: number,
): Promise<DevMail[]> {
  const params = new URLSearchParams({ kind });
  if (toIncludes) params.set('to', toIncludes);
  params.set('sinceMs', String(sinceMs));
  const { status, json } = await opsRequest('GET', `/operation/email-folder/mails?${params.toString()}`);
  if (status !== 200) {
    throw new Error(`[mail] preprod email-folder list failed: HTTP ${status} ${JSON.stringify(json)}`);
  }
  const data = json.data as { mails?: Array<{ to?: string; subject?: string; html?: string; mtimeMs?: number }> } | undefined;
  return (data?.mails ?? []).map((mail) => ({
    path: `preprod:${kind}:${mail.mtimeMs ?? 0}:${mail.to ?? ''}`,
    to: mail.to ?? '',
    subject: mail.subject ?? '',
    html: mail.html ?? '',
    mtimeMs: mail.mtimeMs ?? 0,
  }));
}

export function listMails(kind: MailKind): DevMail[] {
  if (loadTestEnv().mode === 'preprod') {
    throw new Error('listMails is local-only; preprod tests must waitForMail');
  }
  return listLocalMails(kind);
}

export interface WaitMailOptions {
  kind: MailKind;
  /** Case-insensitive substring match on Subject. */
  subjectIncludes?: string;
  /** Case-insensitive exact/substring match on To. */
  toIncludes?: string;
  sinceMs?: number;
  timeoutMs?: number;
  pollMs?: number;
}

/** Poll DEV email dump dirs until a matching HTML preview appears.
 * On `--preprod`, polls `GET /operation/email-folder/mails` over `--ftp`. */
export async function waitForMail(options: WaitMailOptions): Promise<DevMail> {
  const {
    kind,
    subjectIncludes,
    toIncludes,
    sinceMs = Date.now() - 2_000,
    timeoutMs = MAX_ACTION_TIMEOUT_MS,
    pollMs = 400,
  } = options;
  const deadline = Date.now() + assertActionTimeout(timeoutMs, 'mail delivery');
  const preprod = loadTestEnv().mode === 'preprod';
  while (Date.now() < deadline) {
    const listed = preprod
      ? await listPreprodMails(kind, toIncludes, sinceMs)
      : listLocalMails(kind, sinceMs);
    const hit = listed.find((mail) => {
      if (mail.mtimeMs < sinceMs) return false;
      if (
        subjectIncludes &&
        !mail.subject.toLowerCase().includes(subjectIncludes.toLowerCase())
      ) {
        return false;
      }
      if (toIncludes && !mail.to.toLowerCase().includes(toIncludes.toLowerCase())) {
        return false;
      }
      return true;
    });
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(
    `Timed out waiting for ${kind} mail` +
      (subjectIncludes ? ` subject~=${subjectIncludes}` : '') +
      (toIncludes ? ` to~=${toIncludes}` : ''),
  );
}

const TOKEN_RE =
  /(?:confirm-email|reset-password)\?token(?:=|&#x3D;|&#61;)([A-Za-z0-9._~-]+)/i;

const GUEST_MANAGE_TOKEN_RE =
  /account\/manage-order\?token(?:=|&#x3D;|&#61;)([A-Za-z0-9._~-]+)/i;

/** Extract frontend token from confirmation / reset link in the HTML dump. */
export function extractTokenFromMail(mail: DevMail): string {
  const decoded = mail.html
    .replaceAll('&#x3D;', '=')
    .replaceAll('&#61;', '=')
    .replaceAll('&amp;', '&');
  const match =
    decoded.match(TOKEN_RE) ??
    decoded.match(/token=([A-Za-z0-9._~-]+)/i);
  if (!match?.[1]) throw new Error(`No token found in mail ${mail.path}`);
  return match[1];
}

/** Extract the one-click guest-order ownership token from an order email. */
export function extractGuestManageToken(mail: DevMail): string {
  const decoded = mail.html
    .replaceAll('&#x3D;', '=')
    .replaceAll('&#61;', '=')
    .replaceAll('&amp;', '&');
  const match = decoded.match(GUEST_MANAGE_TOKEN_RE);
  if (!match?.[1]) throw new Error(`No guest manage-order token found in mail ${mail.path}`);
  return match[1];
}

const OTP_RE = /\b(\d{6})\b/;

export function extractOtpFromMail(mail: DevMail): string {
  // Strip the meta comment first: To: embeds timestamps / random local-parts
  // that can look like a 6-digit OTP before the real code in the body.
  const body = mail.html.replace(/<!--([\s\S]*?)-->/, '');
  const match = body.match(OTP_RE) ?? mail.html.match(OTP_RE);
  if (!match?.[1]) throw new Error(`No OTP found in mail ${mail.path}`);
  return match[1];
}
