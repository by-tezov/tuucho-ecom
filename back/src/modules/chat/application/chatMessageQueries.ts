import type { Pool, PoolClient } from 'pg';
import type { ChatAttachmentMeta, ChatMessageRow, ChatMessageWithAttachments } from '../domain/chatTypes.js';

async function attachAttachments(
  db: Pool | PoolClient,
  rows: ChatMessageRow[],
): Promise<ChatMessageWithAttachments[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => Number(row.id));
  const { rows: attachmentRows } = await db.query<{
    id: string;
    message_id: string;
    file_name: string;
    original_name: string;
    byte_size: number;
    content_type: string;
  }>(
    `select id, message_id, file_name, original_name, byte_size, content_type
     from chat_message_attachments
     where message_id = any($1::bigint[])
     order by id asc`,
    [ids],
  );
  const byMessage = new Map<number, ChatAttachmentMeta[]>();
  for (const row of attachmentRows) {
    const messageId = Number(row.message_id);
    const list = byMessage.get(messageId) ?? [];
    list.push({
      id: Number(row.id),
      fileName: row.file_name,
      originalName: row.original_name,
      byteSize: row.byte_size,
      contentType: row.content_type,
    });
    byMessage.set(messageId, list);
  }
  return rows.map((row) => ({
    ...row,
    attachments: byMessage.get(Number(row.id)) ?? [],
  }));
}

export async function listMessages(
  db: Pool | PoolClient,
  sessionId: string,
  afterId = 0,
  limit?: number,
): Promise<ChatMessageWithAttachments[]> {
  const capped = limit == null ? null : Math.min(200, Math.max(1, Math.trunc(limit)));
  const { rows } = await db.query<ChatMessageRow>(
    capped == null
      ? `select * from chat_messages
         where session_id = $1 and id > $2
         order by id asc`
      : `select * from chat_messages
         where session_id = $1 and id > $2
         order by id asc
         limit $3`,
    capped == null ? [sessionId, afterId] : [sessionId, afterId, capped],
  );
  return attachAttachments(db, rows);
}

/** Newest page for initial session load: last `limit` messages (ascending). */
export async function listRecentMessages(
  db: Pool | PoolClient,
  sessionId: string,
  limit = 50,
): Promise<{ messages: ChatMessageWithAttachments[]; hasMore: boolean; oldestId: number | null }> {
  const capped = Math.min(200, Math.max(1, Math.trunc(limit)));
  const { rows } = await db.query<ChatMessageRow>(
    `select * from (
       select * from chat_messages
       where session_id = $1
       order by id desc
       limit $2
     ) recent
     order by id asc`,
    [sessionId, capped + 1],
  );
  const hasMore = rows.length > capped;
  const page = hasMore ? rows.slice(rows.length - capped) : rows;
  const messages = await attachAttachments(db, page);
  return {
    messages,
    hasMore,
    oldestId: messages[0] ? Number(messages[0].id) : null,
  };
}

/** Older page: messages with id < beforeId, newest-first select then ascending. */
export async function listMessagesBefore(
  db: Pool | PoolClient,
  sessionId: string,
  beforeId: number,
  limit = 50,
): Promise<{ messages: ChatMessageWithAttachments[]; hasMore: boolean; oldestId: number | null }> {
  const capped = Math.min(200, Math.max(1, Math.trunc(limit)));
  const { rows } = await db.query<ChatMessageRow>(
    `select * from (
       select * from chat_messages
       where session_id = $1 and id < $2
       order by id desc
       limit $3
     ) older
     order by id asc`,
    [sessionId, beforeId, capped + 1],
  );
  const hasMore = rows.length > capped;
  const page = hasMore ? rows.slice(rows.length - capped) : rows;
  const messages = await attachAttachments(db, page);
  return {
    messages,
    hasMore,
    oldestId: messages[0] ? Number(messages[0].id) : null,
  };
}

export async function getMessageById(
  db: Pool | PoolClient,
  messageId: number,
): Promise<ChatMessageWithAttachments | undefined> {
  const { rows } = await db.query<ChatMessageRow>(`select * from chat_messages where id = $1`, [messageId]);
  const row = rows[0];
  if (!row) return undefined;
  const [withAttachments] = await attachAttachments(db, [row]);
  return withAttachments;
}
