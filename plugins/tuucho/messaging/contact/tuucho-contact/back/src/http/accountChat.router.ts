import { readFile } from 'node:fs/promises';
import { Router, type Request, type Response } from 'express';
import { config } from '@kernel/back/config/env';
import { pool } from '@kernel/back/db/pool';
import { requireAuth } from '@kernel/back/middleware/requireAuth';
import { optionalImageUploads, uploadedImageFiles } from '@kernel/back/middleware/optionalImageUploads';
import { contactRateLimiter } from '@kernel/back/middleware/rateLimiters';
import {
  chatImageFileName,
  cachedChatImagePreview,
  chatMediaAbsolutePath,
  PrivateUploadError,
  removeSavedPrivateImages,
  savePrivateImages,
} from '@kernel/back/media/privateUploads';
import {
  ChatServiceError,
  closeSession,
  createSession,
  findSessionAttachment,
  findSessionByPublicId,
  listMessages,
  listMessagesBefore,
  listRecentMessages,
  listUserSessions,
  markSessionRead,
  postUserMessage,
  toPublicMessage,
  toPublicSession,
  unreadOwnerCount,
} from '../application/chat.js';
import { setChatActiveReader, subscribeChatSession } from '../application/chatSse.js';
import { findUserById } from '@kernel/back/modules/identity/application/users';
import { boundedPrintable } from '@kernel/back/utils/fieldLimits';

export const accountChatRouter = Router();
accountChatRouter.use(requireAuth);

function mapError(res: Response, error: unknown): void {
  if (error instanceof ChatServiceError) {
    const status = error.code === 'not_found' ? 404 : error.code === 'email_delivery_failed' ? 502 : 409;
    res.status(status).json({ success: false, error: { code: error.code } });
    return;
  }
  if (error instanceof PrivateUploadError) {
    res.status(400).json({ success: false, error: { code: error.code } });
    return;
  }
  throw error;
}

async function ownedSession(req: Request, res: Response) {
  const publicId = String(req.params.publicId ?? '').toUpperCase();
  const session = await findSessionByPublicId(pool, publicId);
  if (!session || session.user_id !== req.user!.id) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return undefined;
  }
  return session;
}

function parseMessageLimit(raw: unknown): number {
  const n = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
  if (!Number.isFinite(n)) return 50;
  return Math.min(200, Math.max(1, Math.trunc(n)));
}

async function sessionPayload(
  session: NonNullable<Awaited<ReturnType<typeof findSessionByPublicId>>>,
  opts: { limit?: number; before?: number | null; after?: number | null } = {},
) {
  const limit = parseMessageLimit(opts.limit);
  let page: Awaited<ReturnType<typeof listRecentMessages>>;
  if (opts.after != null && opts.after > 0) {
    const messages = await listMessages(pool, session.id, opts.after, limit + 1);
    const hasMore = messages.length > limit;
    const sliced = hasMore ? messages.slice(0, limit) : messages;
    page = {
      messages: sliced,
      hasMore,
      oldestId: sliced[0] ? Number(sliced[0].id) : null,
    };
  } else if (opts.before != null && opts.before > 0) {
    page = await listMessagesBefore(pool, session.id, opts.before, limit);
  } else {
    page = await listRecentMessages(pool, session.id, limit);
  }
  return {
    session: toPublicSession(session, page.messages),
    unreadOwnerCount: await unreadOwnerCount(pool, session.id),
    pagination: {
      limit,
      hasMore: page.hasMore,
      oldestId: page.oldestId,
      newestId: page.messages[page.messages.length - 1]
        ? Number(page.messages[page.messages.length - 1]!.id)
        : null,
    },
  };
}

accountChatRouter.get('/sessions', async (req, res) => {
  const sessions = await listUserSessions(pool, req.user!.id);
  const data = sessions.map((session) => ({
    publicId: session.public_id,
    status: session.status,
    createdAt: session.created_at,
    closedAt: session.closed_at,
    firstMessageAt: session.first_message_at,
    lastMessageAt: session.last_message_at ?? session.first_message_at,
    preview: session.last_message_body?.slice(0, 160) ?? '',
    messageCount: Number(session.message_count) || 0,
    unreadOwnerCount: Number(session.unread_owner_count) || 0,
  }));
  res.json({ success: true, data: { sessions: data } });
});

accountChatRouter.get('/sessions/:publicId', async (req, res) => {
  const session = await ownedSession(req, res);
  if (!session) return;
  const beforeRaw = typeof req.query.before === 'string' ? Number(req.query.before) : NaN;
  const afterRaw = typeof req.query.after === 'string' ? Number(req.query.after) : NaN;
  const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : NaN;
  res.json({
    success: true,
    data: await sessionPayload(session, {
      limit: Number.isFinite(limitRaw) ? limitRaw : undefined,
      before: Number.isFinite(beforeRaw) ? beforeRaw : null,
      after: Number.isFinite(afterRaw) ? afterRaw : null,
    }),
  });
});

accountChatRouter.post(
  '/sessions/:publicId/messages',
  contactRateLimiter,
  optionalImageUploads(),
  async (req, res) => {
    let savedAttachments: Awaited<ReturnType<typeof savePrivateImages>> = [];
    try {
      let session = await ownedSession(req, res);
      if (!session) return;
      const body = boundedPrintable(req.body?.body, config.fieldLimits.contactMessageMax);
      if (!body) {
        res.status(400).json({ success: false, error: { code: 'invalid_request' } });
        return;
      }
      const clientMessageId = boundedPrintable(req.body?.clientMessageId, 80);
      const files = uploadedImageFiles(req);
      if (files.length) {
        savedAttachments = await savePrivateImages({
          files,
          targetDir: config.chatMediaDir,
          maxBytes: config.chatImageMaxBytes,
          fileNameFor: () => chatImageFileName(session!.public_id),
        });
      }
      const result = await postUserMessage(
        pool,
        session,
        body,
        savedAttachments,
        clientMessageId ?? undefined,
      );
      res.status(201).json({ success: true, data: { message: toPublicMessage(result.message) } });
    } catch (error) {
      await removeSavedPrivateImages(savedAttachments);
      mapError(res, error);
    }
  },
);

/** The first message creates the single active session; no empty shells exist. */
accountChatRouter.post('/sessions', contactRateLimiter, optionalImageUploads(), async (req, res) => {
  let savedAttachments: Awaited<ReturnType<typeof savePrivateImages>> = [];
  try {
    const body = boundedPrintable(req.body?.body, config.fieldLimits.contactMessageMax);
    if (!body) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const user = await findUserById(pool, req.user!.id);
    if (!user) {
      res.status(404).json({ success: false, error: { code: 'not_found' } });
      return;
    }
    const { session } = await createSession(pool, {
      userId: user.id,
      visitorEmail: user.email,
      visitorIdentity: [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || null,
    });
    const files = uploadedImageFiles(req);
    if (files.length) {
      savedAttachments = await savePrivateImages({
        files,
        targetDir: config.chatMediaDir,
        maxBytes: config.chatImageMaxBytes,
        fileNameFor: () => chatImageFileName(session.public_id),
      });
    }
    const message = await postUserMessage(
      pool,
      session,
      body,
      savedAttachments,
      boundedPrintable(req.body?.clientMessageId, 80) ?? undefined,
    );
    res.status(201).json({
      success: true,
      data: { ...(await sessionPayload(session)), message: toPublicMessage(message.message) },
    });
  } catch (error) {
    await removeSavedPrivateImages(savedAttachments);
    mapError(res, error);
  }
});

accountChatRouter.post('/sessions/:publicId/read', async (req, res) => {
  const session = await ownedSession(req, res);
  if (!session) return;
  const messageId = Number(req.body?.messageId);
  if (!Number.isSafeInteger(messageId) || messageId <= 0) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  res.json({ success: true, data: await markSessionRead(pool, session, messageId) });
});

accountChatRouter.post('/sessions/:publicId/presence', async (req, res) => {
  const session = await ownedSession(req, res);
  if (!session) return;
  if (typeof req.body?.active !== 'boolean') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  setChatActiveReader(session.id, req.user!.id, req.body.active);
  await pool.query(
    `update chat_sessions set last_user_active_at = case when $2 then now() else null end where id = $1`,
    [session.id, req.body.active],
  );
  res.json({ success: true });
});

accountChatRouter.post('/sessions/:publicId/close', async (req, res) => {
  const session = await ownedSession(req, res);
  if (!session) return;
  const result = await closeSession(pool, session);
  res.json({ success: true, data: await sessionPayload(result.session) });
});

accountChatRouter.get('/sessions/:publicId/attachments/:attachmentId', async (req, res) => {
  try {
    const session = await ownedSession(req, res);
    if (!session) return;
    const attachmentId = Number(req.params.attachmentId);
    const attachment = await findSessionAttachment(pool, session.id, attachmentId);
    if (!attachment) {
      res.status(404).json({ success: false, error: { code: 'not_found' } });
      return;
    }
    const absolutePath = chatMediaAbsolutePath(attachment.fileName);
    const body =
      String(req.query.variant) === 'full'
        ? await readFile(absolutePath)
        : await cachedChatImagePreview(absolutePath);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(body);
  } catch {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
  }
});

/** Bearer-authenticated SSE for fetch-stream clients; EventSource cannot send Authorization. */
accountChatRouter.get('/sessions/:publicId/events', async (req, res) => {
  const session = await ownedSession(req, res);
  if (!session) return;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  const write = async (type: string, messageId: number) => {
    if (type === 'message') {
      // Just that message, still scoped to this session (an unbounded read
      // fetched every later message too on each event).
      const messages = await listMessages(pool, session.id, messageId - 1, 1);
      const message = messages.find((item) => Number(item.id) === messageId);
      if (message)
        res.write(`event: message\ndata: ${JSON.stringify({ message: toPublicMessage(message) })}\n\n`);
      return;
    }
    res.write(`event: ${type}\ndata: {}\n\n`);
  };
  const unsubscribe = subscribeChatSession(
    session.id,
    (event) => {
      void write(event.type, event.messageId);
    },
    'visitor',
  );
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);
  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});
