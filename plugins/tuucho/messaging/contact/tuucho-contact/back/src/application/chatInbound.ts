import { simpleParser, type ParsedMail } from 'mailparser';
import type { Pool } from 'pg';
import {
  appendOwnerMessage,
  findSessionByOutboundMessageId,
  findSessionByPublicIdLoose,
  normalizeMessageId,
  recordDeadLetter,
  type ChatSessionRow,
} from './chat.js';

const SUBJECT_RE = /\[Shop Chat #([A-F0-9]{8})\]/i;
const HEADER_SESSION = 'x-tuucho-chat-session';
const HEADER_MESSAGE = 'x-tuucho-chat-message';

export type InboundResult =
  | { outcome: 'ignored'; reason: string }
  | { outcome: 'accepted'; sessionPublicId: string; messageId: number }
  | { outcome: 'duplicate'; emailMessageId: string }
  | { outcome: 'dead_letter'; reason: string };

function headerValue(parsed: ParsedMail, name: string): string | undefined {
  const value = parsed.headers.get(name);
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

function collectReferenceIds(parsed: ParsedMail): string[] {
  const ids: string[] = [];
  if (parsed.inReplyTo) ids.push(parsed.inReplyTo);
  if (Array.isArray(parsed.references)) ids.push(...parsed.references);
  else if (typeof parsed.references === 'string') ids.push(parsed.references);
  return ids.map(normalizeMessageId);
}

function looksLikeChatEmail(parsed: ParsedMail): boolean {
  if (headerValue(parsed, HEADER_SESSION) || headerValue(parsed, HEADER_MESSAGE)) return true;
  if (SUBJECT_RE.test(parsed.subject ?? '')) return true;
  // References alone are not enough to classify as chat without a DB hit;
  // classify true if any reference contains our tuucho-chat marker.
  return collectReferenceIds(parsed).some((id) => id.includes('tuucho-chat.'));
}

/** True when this MIME is the outbound owner-notify itself (not a reply). */
function isOurOutboundNotify(parsed: ParsedMail): boolean {
  const mid = parsed.messageId ? normalizeMessageId(parsed.messageId) : '';
  if (mid.includes('tuucho-chat.')) return true;

  // A real owner reply normally quotes the original notification, so its
  // parsed text also contains the notification wording. References to one of
  // our outbound chat messages take precedence over that quoted text.
  if (collectReferenceIds(parsed).some((id) => id.includes('tuucho-chat.'))) return false;

  const text = `${parsed.text ?? ''}\n${typeof parsed.html === 'string' ? parsed.html : ''}`;
  return (
    /Nouveau message chat boutique/i.test(text) &&
    /Répondez à cet email pour envoyer votre réponse/i.test(text)
  );
}

/** Strip quoted reply / common signatures best-effort. */
export function extractNewReplyText(raw: string): string {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const kept: string[] = [];
  for (const line of lines) {
    if (/^On .+wrote:$/i.test(line.trim())) break;
    if (/^Le .+ a écrit :$/i.test(line.trim())) break;
    if (/^-+ ?Original Message ?-+$/i.test(line.trim())) break;
    if (/^_{2,}$/.test(line.trim())) break;
    if (line.startsWith('>')) break;
    if (/^--\s*$/.test(line)) break;
    if (/^Envoyé depuis mon /i.test(line.trim())) break;
    if (/^Sent from my /i.test(line.trim())) break;
    kept.push(line);
  }
  return kept.join('\n').trim();
}

async function resolveSession(
  db: Pool,
  parsed: ParsedMail,
): Promise<{ session: ChatSessionRow; via: string } | undefined> {
  const headerSession = headerValue(parsed, HEADER_SESSION);
  if (headerSession) {
    const session = await findSessionByPublicIdLoose(db, headerSession.trim());
    if (session) return { session, via: 'header' };
  }

  for (const ref of collectReferenceIds(parsed)) {
    const hit = await findSessionByOutboundMessageId(db, ref);
    if (hit) return { session: hit.session, via: 'references' };
  }

  const subjectMatch = SUBJECT_RE.exec(parsed.subject ?? '');
  if (subjectMatch?.[1]) {
    const session = await findSessionByPublicIdLoose(db, subjectMatch[1]);
    if (session) return { session, via: 'subject' };
  }

  return undefined;
}

export async function processInboundRawEmail(db: Pool, raw: string | Buffer): Promise<InboundResult> {
  let parsed: ParsedMail;
  try {
    parsed = await simpleParser(raw);
  } catch {
    await recordDeadLetter(db, { reason: 'parse_failed', snippet: String(raw).slice(0, 500) });
    return { outcome: 'dead_letter', reason: 'parse_failed' };
  }

  if (!looksLikeChatEmail(parsed)) {
    return { outcome: 'ignored', reason: 'not_chat' };
  }

  // Reject our own owner-notify messages if someone pipes the outbound
  // .eml (common on dev). Real replies have a different Message-ID and
  // In-Reply-To pointing at ours.
  if (isOurOutboundNotify(parsed)) {
    return { outcome: 'ignored', reason: 'outbound_notify' };
  }

  const emailMessageId = parsed.messageId ? normalizeMessageId(parsed.messageId) : null;
  if (emailMessageId) {
    const existing = await db.query(`select id from chat_messages where email_message_id = $1 limit 1`, [
      emailMessageId,
    ]);
    if (existing.rows[0]) {
      return { outcome: 'duplicate', emailMessageId };
    }
  }

  const resolved = await resolveSession(db, parsed);
  if (!resolved) {
    await recordDeadLetter(db, {
      reason: 'session_not_found',
      emailMessageId,
      subject: parsed.subject ?? null,
      snippet: (parsed.text ?? '').slice(0, 500),
    });
    return { outcome: 'dead_letter', reason: 'session_not_found' };
  }

  const bodySource =
    parsed.text?.trim() ||
    (typeof parsed.html === 'string'
      ? parsed.html
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      : '');
  const body = extractNewReplyText(bodySource);
  if (!body) {
    await recordDeadLetter(db, {
      reason: 'empty_body',
      emailMessageId,
      subject: parsed.subject ?? null,
    });
    return { outcome: 'dead_letter', reason: 'empty_body' };
  }

  const { session } = resolved;
  try {
    const message = await appendOwnerMessage(db, session, body, emailMessageId);
    return {
      outcome: 'accepted',
      sessionPublicId: session.public_id,
      messageId: Number(message.id),
    };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === '23505' && emailMessageId) {
      return { outcome: 'duplicate', emailMessageId };
    }
    throw error;
  }
}
