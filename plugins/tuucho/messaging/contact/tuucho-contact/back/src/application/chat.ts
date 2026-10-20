import { randomBytes, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { config } from '@kernel/back/config/env';
import { chatMaxSessionsPerUser, chatSmtpSettings } from '../infrastructure/contactSettings.js';
import { appVersion } from '@kernel/back/config/appVersion';
import {
  chatMediaAbsolutePath,
  removeSavedPrivateImages,
  type SavedPrivateImage,
  unlinkChatMedia,
} from '@kernel/back/media/privateUploads';
import { sendChatMail, sendMail, spyTo } from '@kernel/back/modules/messaging/application/email';
import { isContactEmailConnectedEnabled } from '@kernel/back/modules/settings/application/appPreferences';
import { shouldSendNotification } from '@kernel/back/modules/identity/application/notificationPreferences';
import { hasChatActiveReader, notifyChatMessage } from './chatSse.js';
import { findUserById } from '@kernel/back/modules/identity/application/users';
import {
  getMessageById,
  listMessages,
  listMessagesBefore,
  listRecentMessages,
} from './chatMessageQueries.js';
import type {
  ChatAttachmentMeta,
  ChatMessageRow,
  ChatMessageSource,
  ChatMessageWithAttachments,
  ChatSender,
  ChatSessionRow,
  ChatSessionStatus,
  OpsChatMessage,
  OpsChatSession,
  PublicChatMessage,
  PublicChatSession,
} from '../domain/chatTypes.js';

export { getMessageById, listMessages, listMessagesBefore, listRecentMessages };

export type {
  ChatAttachmentMeta,
  ChatMessageRow,
  ChatMessageSource,
  ChatMessageWithAttachments,
  ChatSender,
  ChatSessionRow,
  ChatSessionStatus,
  OpsChatMessage,
  OpsChatSession,
  PublicChatMessage,
  PublicChatSession,
};
/** Short opaque public id used in URLs and email subject `[Shop Chat #XXXXXX]`. */
function mintPublicId(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

function mintOutboundMessageId(publicId: string, messageId: number): string {
  // Stable across HTTP retries: mail systems can recognize the same logical
  // message even if the request died after SMTP accepted it.
  return `<tuucho-chat.${publicId}.${messageId}@shop.example>`;
}

export function toPublicMessage(message: ChatMessageWithAttachments): PublicChatMessage {
  return {
    id: Number(message.id),
    sender: message.sender,
    body: message.body,
    createdAt: message.created_at,
    // Public clients see attachment id + original name — never the disk key.
    attachments: message.attachments.map((item) => ({
      id: item.id,
      fileName: item.originalName,
    })),
  };
}

function toOpsMessage(message: ChatMessageWithAttachments): OpsChatMessage {
  return {
    id: Number(message.id),
    sender: message.sender,
    body: message.body,
    createdAt: message.created_at,
    attachments: message.attachments.map((item) => ({
      id: item.id,
      fileName: item.originalName,
      absolutePath: chatMediaAbsolutePath(item.fileName),
    })),
  };
}

export function toPublicSession(
  session: ChatSessionRow,
  messages: ChatMessageWithAttachments[],
): PublicChatSession {
  return {
    publicId: session.public_id,
    status: session.status,
    visitorEmail: session.visitor_email,
    visitorIdentity: session.visitor_identity,
    createdAt: session.created_at,
    closedAt: session.closed_at,
    messages: messages.map(toPublicMessage),
  };
}

export async function markSessionRead(
  db: Pool,
  session: ChatSessionRow,
  messageId: number,
): Promise<{ unreadOwnerCount: number }> {
  const client = await db.connect();
  try {
    await client.query('begin');
    await client.query(
      `update chat_sessions
       set last_user_read_message_id = greatest(coalesce(last_user_read_message_id, 0), $2),
           last_user_read_at = now(),
           last_user_active_at = now()
       where id = $1 and user_id is not null`,
      [session.id, messageId],
    );
    const { rows } = await client.query<{ count: string }>(
      `select count(*)::text from chat_messages
       where session_id = $1 and sender = 'owner' and id > coalesce(
         (select last_user_read_message_id from chat_sessions where id = $1), 0)`,
      [session.id],
    );
    await client.query('commit');
    return { unreadOwnerCount: Number(rows[0]?.count ?? 0) };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function unreadOwnerCount(db: Pool | PoolClient, sessionId: string): Promise<number> {
  const { rows } = await db.query<{ count: string }>(
    `select count(*)::text from chat_messages m
     where m.session_id = $1 and m.sender = 'owner' and m.id > coalesce(
       (select last_user_read_message_id from chat_sessions where id = $1), 0)`,
    [sessionId],
  );
  return Number(rows[0]?.count ?? 0);
}

export function toOpsSession(
  session: ChatSessionRow,
  messages: ChatMessageWithAttachments[],
): OpsChatSession {
  return {
    ...toPublicSession(session, messages),
    messages: messages.map(toOpsMessage),
  };
}


export async function findSessionByPublicId(
  db: Pool | PoolClient,
  publicId: string,
): Promise<ChatSessionRow | undefined> {
  const { rows } = await db.query<ChatSessionRow>(`select * from chat_sessions where public_id = $1`, [
    publicId,
  ]);
  return rows[0];
}

export class ChatServiceError extends Error {
  code:
    | 'chat_closed'
    | 'chat_unavailable'
    | 'invalid_request'
    | 'not_found'
    | 'forbidden'
    | 'session_closed'
    | 'session_active'
    | 'email_delivery_failed';

  constructor(
    code:
      | 'chat_closed'
      | 'chat_unavailable'
      | 'invalid_request'
      | 'not_found'
      | 'forbidden'
      | 'session_closed'
      | 'session_active'
      | 'email_delivery_failed',
  ) {
    super(code);
    this.name = 'ChatServiceError';
    this.code = code;
  }
}

export async function createSession(
  db: Pool,
  input: {
    visitorEmail: string;
    visitorIdentity: string | null;
    userId: string;
  },
): Promise<{ session: ChatSessionRow }> {
  const existing = await db.query<ChatSessionRow>(
    `select * from chat_sessions where user_id = $1 and status = 'open' limit 1`,
    [input.userId],
  );
  if (existing.rows[0]) throw new ChatServiceError('session_active');
  const id = randomUUID();
  let publicId = mintPublicId();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const { rows } = await db.query<ChatSessionRow>(
        `insert into chat_sessions (
           id, public_id, user_id, visitor_email, visitor_identity, status
         ) values ($1, $2, $3, $4, $5, 'open')
         returning *`,
        [id, publicId, input.userId, input.visitorEmail, input.visitorIdentity],
      );
      await trimUserSessions(db, input.userId);
      return { session: rows[0]! };
    } catch (error) {
      const code = (error as { code?: string }).code;
      // The partial unique index is a lifecycle conflict, not an id collision.
      if (
        code === '23505' &&
        (error as { constraint?: string }).constraint === 'chat_one_open_session_per_user_idx'
      ) {
        throw new ChatServiceError('session_active');
      }
      if (code === '23505') {
        publicId = mintPublicId();
        continue;
      }
      throw error;
    }
  }
  throw new Error('failed to mint unique chat public_id');
}

async function trimUserSessions(db: Pool, userId: string): Promise<number> {
  const client = await db.connect();
  let files: Array<{ file_name: string }> = [];
  let committed = false;
  try {
    await client.query('begin');
    const { rows: overflow } = await client.query<{ id: string }>(
      `select id from chat_sessions where user_id = $1
       order by coalesce(last_message_at, created_at) desc
       offset $2`,
      [userId, chatMaxSessionsPerUser()],
    );
    if (overflow.length === 0) {
      await client.query('commit');
      committed = true;
      return 0;
    }
    const ids = overflow.map((row) => row.id);
    const found = await client.query<{ file_name: string }>(
      `select a.file_name from chat_message_attachments a
       join chat_messages m on m.id = a.message_id
       where m.session_id = any($1::uuid[])`,
      [ids],
    );
    files = found.rows;
    await client.query(`delete from chat_sessions where id = any($1::uuid[])`, [ids]);
    await client.query('commit');
    committed = true;
    return ids.length;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
    if (committed)
      await Promise.all(
        files.map(async (file) => {
          try {
            await unlinkChatMedia(file.file_name);
          } catch {
            console.error('[chat retention] attachment unlink failed');
          }
        }),
      );
  }
}

async function insertMessageOnClient(
  db: Pool | PoolClient,
  input: {
    sessionId: string;
    sender: ChatSender;
    body: string;
    source: ChatMessageSource;
    emailMessageId?: string | null;
    outboundMessageId?: string | null;
    clientMessageId?: string | null;
    attachments?: SavedPrivateImage[];
  },
): Promise<ChatMessageWithAttachments> {
  const { rows } = await db.query<ChatMessageRow>(
    `insert into chat_messages (
       session_id, sender, body, source, email_message_id, outbound_message_id, client_message_id
     ) values ($1, $2, $3, $4, $5, $6, $7)
     returning *`,
    [
      input.sessionId,
      input.sender,
      input.body,
      input.source,
      input.emailMessageId ?? null,
      input.outboundMessageId ?? null,
      input.clientMessageId ?? null,
    ],
  );
  await db.query(`update chat_sessions set last_message_at = now() where id = $1`, [input.sessionId]);
  const message = rows[0]!;
  const attachments = input.attachments ?? [];
  const savedAttachments: ChatAttachmentMeta[] = [];
  if (attachments.length > 0) {
    for (const file of attachments) {
      const { rows: attachmentRows } = await db.query<{
        id: string;
        file_name: string;
        original_name: string;
        byte_size: number;
        content_type: string;
      }>(
        `insert into chat_message_attachments (message_id, file_name, original_name, byte_size, content_type)
         values ($1, $2, $3, $4, $5)
         returning id, file_name, original_name, byte_size, content_type`,
        [message.id, file.fileName, file.originalName, file.bytes, file.contentType],
      );
      const row = attachmentRows[0]!;
      savedAttachments.push({
        id: Number(row.id),
        fileName: row.file_name,
        originalName: row.original_name,
        byteSize: row.byte_size,
        contentType: row.content_type,
      });
    }
  }
  return {
    ...message,
    attachments: savedAttachments,
  };
}

/** Persist a message and all attachment rows atomically. */
/** Takes the Pool, never a caller's PoolClient — deliberately narrowed.
 * This owns a transaction and then notifies SSE subscribers after committing
 * it; handed someone else's open transaction it would instead wake them onto
 * a row still invisible to every other connection. Every caller already
 * passes the Pool, so this costs nothing and makes that the only option the
 * type system allows. A caller that genuinely needs to write inside its own
 * transaction must take the notify itself, after its own commit. */
async function insertMessage(
  db: Pool,
  input: Parameters<typeof insertMessageOnClient>[1],
): Promise<ChatMessageWithAttachments> {
  const client: PoolClient = await db.connect();
  try {
    await client.query('begin');
    const message = await insertMessageOnClient(client, input);
    await client.query('commit');
    // After the commit above, so subscribers cannot fetch a message that is
    // still invisible to other database connections. The narrowed `db: Pool`
    // is what guarantees that commit is ours to have made.
    await notifyChatMessage(db, input.sessionId, Number(message.id));
    return message;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      // Preserve the original database error.
    }
    throw error;
  } finally {
    client.release();
  }
}

async function discardMessageAfterDeliveryFailure(
  db: Pool,
  messageId: string,
  attachments: SavedPrivateImage[],
): Promise<void> {
  try {
    // The message is deliberately removed when owner notification fails. The
    // caller can retry without creating a duplicate transcript entry.
    await db.query(`delete from chat_messages where id = $1`, [messageId]);
  } finally {
    await removeSavedPrivateImages(attachments);
  }
}

/** Resolve a chat attachment that belongs to the given session (for gated media). */
export async function findSessionAttachment(
  db: Pool | PoolClient,
  sessionId: string,
  attachmentId: number,
): Promise<ChatAttachmentMeta | undefined> {
  const { rows } = await db.query<{
    id: string;
    file_name: string;
    original_name: string;
    byte_size: number;
    content_type: string;
  }>(
    `select a.id, a.file_name, a.original_name, a.byte_size, a.content_type
     from chat_message_attachments a
     join chat_messages m on m.id = a.message_id
     where a.id = $1 and m.session_id = $2`,
    [attachmentId, sessionId],
  );
  const row = rows[0];
  if (!row) return undefined;
  return {
    id: Number(row.id),
    fileName: row.file_name,
    originalName: row.original_name,
    byteSize: row.byte_size,
    contentType: row.content_type,
  };
}

function xmlText(value: string | null | undefined): string {
  const safe = Array.from(String(value ?? ''))
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return !(code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) && code !== 0x7f;
    })
    .join('');
  return safe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function chatVisitorRole(
  userId: string | null,
  emailVerified: boolean,
): 'guest' | 'user' | 'user-unverified' {
  if (!userId) return 'guest';
  return emailVerified ? 'user' : 'user-unverified';
}

async function notifyOwnerOfUserMessage(
  db: Pool | PoolClient,
  session: ChatSessionRow,
  message: ChatMessageWithAttachments,
  recent: ChatMessageWithAttachments[],
): Promise<string | null> {
  const outboundId = mintOutboundMessageId(session.public_id, Number(message.id));
  const folder = config.routeEmailFolder;
  const to = await spyTo('contact.chat');
  if (!to) return null;
  const from = chatSmtpSettings().fromEmail ?? (folder ? 'chat@localhost' : undefined);
  if (!from) throw new ChatServiceError('chat_unavailable');

  const user = session.user_id ? await findUserById(db, session.user_id) : undefined;
  const role = chatVisitorRole(session.user_id, user?.email_verified_at != null);
  // `recent` is ordered by message id ascending. Keep the complete transcript
  // in that order: prepending the notified message made a retried older
  // message appear first and truncating to six hid the conversation opening.
  // One pass by id (findIndex was quadratic); the first occurrence wins.
  const byId = new Map<number, ChatMessageWithAttachments>();
  for (const item of [...recent, message]) {
    if (!byId.has(Number(item.id))) byId.set(Number(item.id), item);
  }
  const transcript = [...byId.values()].sort((left, right) => Number(left.id) - Number(right.id));
  const xmlMessage = (
    item: ChatMessageWithAttachments,
    tag: 'guest' | 'user' | 'user-unverified' | 'tuucho',
  ) => {
    const files = item.attachments
      .map(
        (attachment) =>
          `\n    <attachment name="${xmlText(attachment.originalName)}" path="${xmlText(chatMediaAbsolutePath(attachment.fileName))}" />`,
      )
      .join('');
    return `  <${tag}>${xmlText(item.body)}${files}</${tag}>`;
  };
  const messagesXml = transcript
    .map((item) => xmlMessage(item, item.sender === 'owner' ? 'tuucho' : role))
    .join('\n');
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<tuucho-chat version="${xmlText(appVersion)}" session="${xmlText(session.public_id)}">
  <visitor role="${role}">
    <email>${xmlText(session.visitor_email)}</email>
    <identity>${xmlText(session.visitor_identity ?? '')}</identity>
    <account>${xmlText(session.user_id ?? '')}</account>
  </visitor>
  <messages>
${messagesXml}
  </messages>
</tuucho-chat>`;

  await sendChatMail({
    to,
    from,
    replyTo: from,
    subject: `[Shop Chat #${session.public_id} ${appVersion}] Nouveau message`,
    text,
    headers: {
      'Message-ID': outboundId,
      'X-Tuucho-Chat-Session': session.public_id,
      'X-Tuucho-Chat-Message': String(message.id),
      'X-Tuucho-Chat-Version': appVersion,
      ...(config.target === 'preprod' ? { 'X-Tuucho-Chat-Target': 'preprod' } : {}),
    },
    attachments: message.attachments.map((item) => ({
      filename: item.originalName,
      path: chatMediaAbsolutePath(item.fileName),
    })),
  });

  return outboundId;
}

export async function postUserMessage(
  db: Pool,
  session: ChatSessionRow,
  body: string,
  attachments: SavedPrivateImage[] = [],
  clientMessageId?: string,
): Promise<{
  message: ChatMessageWithAttachments;
}> {
  if (clientMessageId) {
    const { rows } = await db.query<ChatMessageRow>(
      `select * from chat_messages where session_id = $1 and client_message_id = $2`,
      [session.id, clientMessageId],
    );
    if (rows[0]) {
      const existing = await getMessageById(db, Number(rows[0].id));
      if (!existing) throw new ChatServiceError('email_delivery_failed');
      if (existing.outbound_message_id) {
        return { message: existing };
      }
      if (
        session.owner_email_suppressed_until &&
        new Date(session.owner_email_suppressed_until).getTime() > Date.now()
      ) {
        return { message: existing };
      }
      if (!isContactEmailConnectedEnabled()) {
        return { message: existing };
      }
      // A previous request may have reached SMTP before its HTTP response was
      // lost. Reuse its row and deterministic Message-ID instead of inserting
      // a second transcript message.
      try {
        const recent = await listMessages(db, session.id);
        const outboundId = await notifyOwnerOfUserMessage(db, session, existing, recent);
        if (outboundId) {
          await db.query(`update chat_messages set outbound_message_id = $1 where id = $2`, [
            outboundId,
            existing.id,
          ]);
          existing.outbound_message_id = outboundId;
        }
        return { message: existing };
      } catch {
        throw new ChatServiceError('email_delivery_failed');
      }
    }
  }
  if (session.status !== 'open') {
    throw new ChatServiceError('session_closed');
  }

  const message = await insertMessage(db, {
    sessionId: session.id,
    sender: 'user',
    body,
    source: 'web',
    clientMessageId: clientMessageId ?? null,
    attachments,
  });

  const ownerEmailSuppressed = Boolean(
    session.owner_email_suppressed_until &&
    new Date(session.owner_email_suppressed_until).getTime() > Date.now(),
  );
  if (ownerEmailSuppressed || !isContactEmailConnectedEnabled()) return { message };

  try {
    const recent = await listMessages(db, session.id);
    const outboundId = await notifyOwnerOfUserMessage(db, session, message, recent);
    if (outboundId) {
      await db.query(`update chat_messages set outbound_message_id = $1 where id = $2`, [
        outboundId,
        message.id,
      ]);
      message.outbound_message_id = outboundId;
    }
  } catch (error) {
    console.error('[chat] owner notify failed', error);
    await discardMessageAfterDeliveryFailure(db, message.id, attachments);
    throw new ChatServiceError('email_delivery_failed');
  }

  return { message };
}

export async function appendOwnerMessage(
  // Pool, not PoolClient: this writes a message and notifies SSE subscribers
  // through insertMessage, which owns its own transaction (see its doc).
  db: Pool,
  session: ChatSessionRow,
  body: string,
  emailMessageId: string | null,
  source: ChatMessageSource = 'email',
  notifyUser = true,
  attachments: SavedPrivateImage[] = [],
): Promise<ChatMessageWithAttachments> {
  const message = await insertMessage(db, {
    sessionId: session.id,
    sender: 'owner',
    body,
    source,
    emailMessageId,
    attachments,
  });
  if (notifyUser && session.user_id) await enqueueOwnerReplyNotification(db, session, message);
  return message;
}

/** Send an explicit reminder from the admin chat view. Pending automatic
 * notifications are cancelled first so the same answer is not emailed twice. */
export async function sendAdminChatReplyNotification(
  db: Pool,
  session: ChatSessionRow,
): Promise<{ sent: boolean; reason?: 'no_owner_reply' | 'notification_disabled' }> {
  if (!session.user_id || !(await shouldSendNotification(db, session.user_id, 'chat_reply'))) {
    return { sent: false, reason: 'notification_disabled' };
  }
  const { rows } = await db.query<{ id: string; body: string }>(
    `select id, body from chat_messages
     where session_id = $1 and sender = 'owner'
     order by id desc limit 1`,
    [session.id],
  );
  const latest = rows[0];
  if (!latest) return { sent: false, reason: 'no_owner_reply' };
  await db.query(
    `update chat_notification_outbox set status = 'cancelled', cancelled_at = now()
     where session_id = $1 and status in ('pending', 'failed')`,
    [session.id],
  );
  await sendChatMail({
    to: session.visitor_email,
    replyTo: chatSmtpSettings().fromEmail,
    subject: 'La boutique vous a répondu',
    text: `La boutique vous a répondu dans votre conversation.\n\n${latest.body.slice(0, 240)}\n\nConnectez-vous à la boutique pour lire et répondre.\n${config.frontendBaseUrl}/contact`,
    headers: {
      'Message-ID': `<tuucho-chat-admin-notification.${session.public_id}.${latest.id}@shop.example>`,
    },
  });
  return { sent: true };
}

async function enqueueOwnerReplyNotification(
  db: Pool | PoolClient,
  session: ChatSessionRow,
  message: ChatMessageWithAttachments,
): Promise<void> {
  if (!session.user_id) return;
  await db.query(
    `update chat_notification_outbox set through_message_id = $2
     where session_id = $1 and status = 'pending'
       and through_message_id > coalesce((select last_user_read_message_id from chat_sessions where id = $1), 0)`,
    [session.id, message.id],
  );
  await db.query(
    `insert into chat_notification_outbox (user_id, session_id, first_message_id, through_message_id)
     select $1, $2, $3, $3
     where not exists (
       select 1 from chat_notification_outbox n
       where n.session_id = $2 and n.status in ('pending', 'sending', 'sent')
         and n.through_message_id > coalesce((select last_user_read_message_id from chat_sessions where id = $2), 0)
     )`,
    [session.user_id, session.id, message.id],
  );
}

/** Durable worker entrypoint. It is safe to invoke repeatedly from cron. */
export async function processChatNotificationOutbox(
  db: Pool,
  limit = 25,
): Promise<{ sent: number; cancelled: number; failed: number }> {
  type NotificationRow = {
    id: string;
    user_id: string;
    session_id: string;
    through_message_id: string;
    visitor_email: string;
    body: string;
    public_id: string;
  };
  const result = { sent: 0, cancelled: 0, failed: 0 };
  for (let processed = 0; processed < limit; processed += 1) {
    const client = await db.connect();
    let row: NotificationRow | undefined;
    await client.query('begin');
    try {
      const { rows } = await client.query<NotificationRow>(
        `select o.id, o.user_id, o.session_id, o.through_message_id, s.visitor_email, s.public_id, m.body
       from chat_notification_outbox o
       join chat_sessions s on s.id = o.session_id
       join chat_messages m on m.id = o.through_message_id
       where (o.status in ('pending', 'failed') or (o.status = 'sending' and o.locked_at < now() - interval '10 minutes'))
         and o.attempts < 5
       order by o.created_at
       for update skip locked limit 1`,
      );
      row = rows[0];
      if (!row) {
        await client.query('commit');
        break;
      }
      const { rows: readRows } = await client.query<{
        last_user_read_message_id: string | null;
        last_user_active_at: string | null;
      }>(`select last_user_read_message_id, last_user_active_at from chat_sessions where id = $1`, [
        row.session_id,
      ]);
      const activeSince = readRows[0]?.last_user_active_at
        ? new Date(readRows[0].last_user_active_at).getTime()
        : 0;
      const isReadingNow = activeSince > Date.now() - 90_000 || hasChatActiveReader(row.session_id);
      if (
        Number(readRows[0]?.last_user_read_message_id ?? 0) >= Number(row.through_message_id) ||
        isReadingNow ||
        !(await shouldSendNotification(db, row.user_id, 'chat_reply'))
      ) {
        await client.query(
          `update chat_notification_outbox set status = 'cancelled', cancelled_at = now() where id = $1`,
          [row.id],
        );
        result.cancelled += 1;
        await client.query('commit');
        continue;
      }
      await client.query(
        `update chat_notification_outbox set status = 'sending', locked_at = now(), attempts = attempts + 1 where id = $1`,
        [row.id],
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
    if (!row) break;
    try {
      await sendMail({
        to: row.visitor_email,
        subject: 'La boutique vous a répondu',
        text: `La boutique vous a répondu dans votre conversation.\n\n${row.body.slice(0, 240)}\n\nConnectez-vous à la boutique pour lire et répondre.`,
        headers: { 'Message-ID': `<tuucho-chat-notification.${row.id}@shop.example>` },
      });
      await db.query(
        `update chat_notification_outbox set status = 'sent', sent_at = now(), locked_at = null where id = $1 and status = 'sending'`,
        [row.id],
      );
      result.sent += 1;
    } catch (error) {
      await db.query(
        `update chat_notification_outbox set status = 'failed', locked_at = null, last_error = $2 where id = $1 and status = 'sending'`,
        [row.id, error instanceof Error ? error.message.slice(0, 500) : 'send_failed'],
      );
      result.failed += 1;
    }
  }
  return result;
}

export async function listSessions(
  db: Pool | PoolClient,
  status: ChatSessionStatus | 'all' | 'active' = 'open',
  limit = 50,
): Promise<Array<ChatSessionRow & { message_count: number }>> {
  if (status === 'all') {
    const { rows } = await db.query<ChatSessionRow & { message_count: number }>(
      `select s.*,
              (select count(*)::int from chat_messages m where m.session_id = s.id) as message_count
       from chat_sessions s
       order by coalesce(s.last_message_at, s.created_at) desc
       limit $1`,
      [limit],
    );
    return rows;
  }
  if (status === 'active' || status === 'open') {
    const { rows } = await db.query<ChatSessionRow & { message_count: number }>(
      `select s.*,
              (select count(*)::int from chat_messages m where m.session_id = s.id) as message_count
       from chat_sessions s
       where s.status = 'open'
       order by coalesce(s.last_message_at, s.created_at) desc
       limit $1`,
      [limit],
    );
    return rows;
  }
  const { rows } = await db.query<ChatSessionRow & { message_count: number }>(
    `select s.*,
            (select count(*)::int from chat_messages m where m.session_id = s.id) as message_count
     from chat_sessions s
     where s.status = $1
     order by coalesce(s.last_message_at, s.created_at) desc
     limit $2`,
    [status, limit],
  );
  return rows;
}

/** All-status conversation history for a single browser-admin customer card. */
export async function listAdminUserSessionsPage(
  db: Pool | PoolClient,
  userId: string,
  page: number,
  pageSize: number,
): Promise<{
  sessions: Array<ChatSessionRow & { message_count: number; last_message_body: string | null }>;
  total: number;
}> {
  const offset = (page - 1) * pageSize;
  const [count, result] = await Promise.all([
    db.query<{ count: string }>(`select count(*)::text from chat_sessions where user_id = $1`, [userId]),
    db.query<ChatSessionRow & { message_count: number; last_message_body: string | null }>(
      `select s.*,
              (select count(*)::int from chat_messages m where m.session_id = s.id) as message_count,
              (select body from chat_messages m where m.session_id = s.id order by m.id desc limit 1) as last_message_body
       from chat_sessions s
       where s.user_id = $1
       order by coalesce(s.last_message_at, s.created_at) desc
       limit $2 offset $3`,
      [userId, pageSize, offset],
    ),
  ]);
  return { sessions: result.rows, total: Number(count.rows[0]?.count ?? 0) };
}

/** Count of open chats for the admin-hub Conversations tile badge. */
export async function getAdminChatAttentionCounts(db: Pool | PoolClient): Promise<{ open: number }> {
  const { rows } = await db.query<{ open: string }>(
    `select count(*)::text as open from chat_sessions where status = 'open'`,
  );
  return { open: Number(rows[0]?.open ?? 0) };
}

export async function listUserSessions(
  db: Pool | PoolClient,
  userId: string,
  limit = chatMaxSessionsPerUser(),
): Promise<
  Array<
    ChatSessionRow & {
      message_count: number;
      first_message_at: string | null;
      last_message_body: string | null;
      unread_owner_count: number;
    }
  >
> {
  const { rows } = await db.query<
    ChatSessionRow & {
      message_count: number;
      first_message_at: string | null;
      last_message_body: string | null;
      unread_owner_count: number;
    }
  >(
    `select s.*,
            message_stats.message_count,
            message_stats.first_message_at,
            latest_message.body as last_message_body,
            unread_stats.unread_owner_count
     from chat_sessions s
     left join lateral (
       select count(*)::int as message_count, min(m.created_at) as first_message_at
       from chat_messages m where m.session_id = s.id
     ) message_stats on true
     left join lateral (
       select m.body from chat_messages m
       where m.session_id = s.id order by m.id desc limit 1
     ) latest_message on true
     left join lateral (
       select count(*)::int as unread_owner_count
       from chat_messages m
       where m.session_id = s.id and m.sender = 'owner'
         and m.id > coalesce(s.last_user_read_message_id, 0)
     ) unread_stats on true
     where s.user_id = $1
     order by coalesce(s.last_message_at, s.created_at) desc
     limit $2`,
    [userId, limit],
  );
  return rows;
}

export async function closeSession(db: Pool, session: ChatSessionRow): Promise<{ session: ChatSessionRow }> {
  if (session.status !== 'open') {
    return { session };
  }

  const client = await db.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query<ChatSessionRow>(
      `update chat_sessions
       set status = 'closed',
           closed_at = coalesce(closed_at, now())
       where id = $1 and status = 'open'
       returning *`,
      [session.id],
    );
    const updated = rows[0];
    if (!updated) {
      await client.query('rollback');
      return { session };
    }
    await client.query('commit');
    // Notify only after commit: a subscriber must never fetch the old state.
    await notifyChatMessage(db, updated.id, 0, 'session_closed');
    return { session: updated };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function reopenSession(db: Pool, session: ChatSessionRow): Promise<{ session: ChatSessionRow }> {
  if (!session.user_id) return { session };
  const client = await db.connect();
  try {
    await client.query('begin');
    const closed = await client.query<{ id: string }>(
      `update chat_sessions set status = 'closed', closed_at = coalesce(closed_at, now())
       where user_id = $1 and status = 'open' and id <> $2`,
      [session.user_id, session.id],
    );
    const { rows } = await client.query<ChatSessionRow>(
      `update chat_sessions set status = 'open', closed_at = null
       where id = $1 and status = 'closed' returning *`,
      [session.id],
    );
    if (!rows[0]) {
      await client.query('rollback');
      return { session };
    }
    await client.query('commit');
    await Promise.all([
      ...closed.rows.map((item) => notifyChatMessage(db, item.id, 0, 'session_closed')),
      notifyChatMessage(db, session.id, 0, 'session_reopened'),
    ]);
    return { session: rows[0] };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function findSessionByOutboundMessageId(
  db: Pool | PoolClient,
  messageId: string,
): Promise<{ session: ChatSessionRow; message: ChatMessageRow } | undefined> {
  const normalized = normalizeMessageId(messageId);
  const { rows } = await db.query<ChatMessageRow>(
    `select * from chat_messages
     where outbound_message_id = $1 or outbound_message_id = $2
     limit 1`,
    [messageId, normalized],
  );
  const message = rows[0];
  if (!message) return undefined;
  const { rows: sessions } = await db.query<ChatSessionRow>(`select * from chat_sessions where id = $1`, [
    message.session_id,
  ]);
  const session = sessions[0];
  if (!session) return undefined;
  return { session, message };
}

export async function findSessionByPublicIdLoose(
  db: Pool | PoolClient,
  publicId: string,
): Promise<ChatSessionRow | undefined> {
  return findSessionByPublicId(db, publicId.toUpperCase());
}

export function normalizeMessageId(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) return trimmed;
  return `<${trimmed.replace(/^<|>$/g, '')}>`;
}

export async function recordDeadLetter(
  db: Pool | PoolClient,
  input: { reason: string; emailMessageId?: string | null; subject?: string | null; snippet?: string | null },
): Promise<void> {
  await db.query(
    `insert into chat_inbound_dead_letters (reason, email_message_id, subject, snippet)
     values ($1, $2, $3, $4)`,
    [input.reason, input.emailMessageId ?? null, input.subject ?? null, input.snippet ?? null],
  );
}
