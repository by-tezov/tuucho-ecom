import { Router } from 'express';
import { readFile } from 'node:fs/promises';
import { pool } from '@kernel/back/db/pool';
import { requirePermission } from '@kernel/back/middleware/requirePermission';
import { requireAuth } from '@kernel/back/middleware/requireAuth';
import { optionalImageUploads, uploadedImageFiles } from '@kernel/back/middleware/optionalImageUploads';
import { boundedPrintable } from '@kernel/back/utils/fieldLimits';
import {
  adminChatOwnerEmailSuppressionTimeoutMs,
  chatImageMaxBytes,
  chatMediaAbsolutePath,
  chatMediaDir,
  contactMessageMax,
} from '../infrastructure/contactSettings.js';
import {
  appendOwnerMessage,
  findSessionAttachment,
  getAdminChatAttentionCounts,
  listMessages,
  listRecentMessages,
  sendAdminChatReplyNotification,
  toPublicMessage,
  toPublicSession,
  closeSession,
  findSessionByPublicId,
} from '../application/chat.js';
import { subscribeChatSession } from '../application/chatSse.js';
import { listAdminSessionsPage } from '../application/adminChatList.js';
import { parseInboxListFilter } from '@kernel/back/platform/listing/inboxListFilter';
import {
  chatImageFileName,
  cachedChatImagePreview,
  PrivateUploadError,
  removeSavedPrivateImages,
  savePrivateImages,
} from '@kernel/back/media/privateUploads';

import { recordAdminActivityBestEffort } from '@kernel/back/modules/activity/application/recordAdminActivity';
import { activityChangeDetail } from '@kernel/back/modules/activity/application/changeDetail';
import { ADMIN_CHAT_PAGE_SIZE, requestedPage } from '@kernel/back/modules/admin/http/adminPagination';

function isChatStatus(value: unknown): value is 'open' | 'closed' {
  return value === 'open' || value === 'closed';
}

async function adminChatFromParam(value: unknown) {
  return findSessionByPublicId(pool, String(value ?? '').toUpperCase());
}

export const adminChatsRouter = Router();

adminChatsRouter.get('/chats/attention-counts', requireAuth, requirePermission('messages'), async (_req, res) => {
  const counts = await getAdminChatAttentionCounts(pool);
  res.json({ success: true, counts });
});

adminChatsRouter.get('/chats', requireAuth, requirePermission('messages'), async (req, res) => {
  const status = isChatStatus(req.query.status) ? req.query.status : undefined;
  if (!status) return void res.status(400).json({ success: false, error: { code: 'invalid_request' } });
  const page = requestedPage(req.query.page);
  const filter = parseInboxListFilter(req.query as { q?: unknown; period?: unknown; sort?: unknown });
  const result = await listAdminSessionsPage(pool, status, filter, page, ADMIN_CHAT_PAGE_SIZE);
  res.json({
    success: true,
    chats: result.sessions.map((session) => ({
      publicId: session.public_id,
      status: session.status,
      email: session.visitor_email,
      identity: session.visitor_identity,
      createdAt: session.created_at,
      lastMessageAt: session.last_message_at,
      messageCount: Number(session.message_count),
      preview: session.last_message_body?.slice(0, 160) ?? '',
    })),
    pagination: {
      page,
      pageSize: ADMIN_CHAT_PAGE_SIZE,
      total: result.total,
      totalPages: Math.ceil(result.total / ADMIN_CHAT_PAGE_SIZE),
    },
    ownerEmailSuppressionTimeoutMs: adminChatOwnerEmailSuppressionTimeoutMs(),
  });
});

adminChatsRouter.get('/chats/:publicId', requireAuth, requirePermission('messages'), async (req, res) => {
  const session = await adminChatFromParam(req.params.publicId);
  if (!session) return void res.status(404).json({ success: false, error: { code: 'not_found' } });
  const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : 100;
  const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, Math.trunc(limitRaw))) : 100;
  const afterRaw = typeof req.query.after === 'string' ? Number(req.query.after) : NaN;
  const page =
    Number.isFinite(afterRaw) && afterRaw > 0
      ? {
          messages: await listMessages(pool, session.id, afterRaw, limit),
          hasMore: false,
          oldestId: null as number | null,
        }
      : await listRecentMessages(pool, session.id, limit);
  res.json({
    success: true,
    chat: {
      ...toPublicSession(session, page.messages),
      ownerEmailSuppressedUntil: session.owner_email_suppressed_until,
    },
    pagination: {
      limit,
      hasMore: page.hasMore,
      oldestId: page.oldestId,
      newestId: page.messages[page.messages.length - 1]?.id ?? null,
    },
  });
});

/** Bearer-authenticated SSE for the open admin conversation. Fetch streaming
 * is used by the browser client because EventSource cannot attach its bearer
 * token. */
adminChatsRouter.get('/chats/:publicId/events', requireAuth, requirePermission('messages'), async (req, res) => {
  const session = await adminChatFromParam(req.params.publicId);
  if (!session) return void res.status(404).json({ success: false, error: { code: 'not_found' } });
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  const write = (type: string) => res.write(`event: ${type}\ndata: {}\n\n`);
  const unsubscribe = subscribeChatSession(session.id, (event) => write(event.type), 'operator');
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);
  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

adminChatsRouter.post(
  '/chats/:publicId/messages',
  requireAuth,
  requirePermission('messages'),
  optionalImageUploads(),
  async (req, res) => {
    let attachments: Awaited<ReturnType<typeof savePrivateImages>> = [];
    try {
      const session = await adminChatFromParam(req.params.publicId);
      const body = boundedPrintable(req.body?.body, contactMessageMax());
      if (!session) return void res.status(404).json({ success: false, error: { code: 'not_found' } });
      if (!body) return void res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      const files = uploadedImageFiles(req);
      if (files.length) {
        attachments = await savePrivateImages({
          files,
          targetDir: chatMediaDir(),
          maxBytes: chatImageMaxBytes(),
          fileNameFor: () => chatImageFileName(session.public_id),
        });
      }
      // Admin replies never notify the customer automatically. The explicit
      // notification action below is the only admin-page email to the customer.
      const message = await appendOwnerMessage(pool, session, body, null, 'web', false, attachments);
      await recordAdminActivityBestEffort(pool, req.user!, {
        category: 'messaging',
        action: 'messaging.chat.message',
        summary: `Reponse admin au chat ${session.public_id}`,
        targetType: 'chat',
        targetId: session.public_id,
        detail: {
          publicId: session.public_id,
          attachmentCount: attachments.length,
          bodyLength: body.length,
        },
      });
      res.status(201).json({ success: true, message: toPublicMessage(message) });
    } catch (error) {
      await removeSavedPrivateImages(attachments);
      if (error instanceof PrivateUploadError)
        return void res.status(400).json({ success: false, error: { code: error.code } });
      throw error;
    }
  },
);

adminChatsRouter.patch(
  '/chats/:publicId/owner-email-notification',
  requireAuth,
  requirePermission('messages'),
  async (req, res) => {
    const session = await adminChatFromParam(req.params.publicId);
    if (!session || typeof req.body?.suppressed !== 'boolean') {
      return void res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    }
    const beforeSuppressed = Boolean(session.owner_email_suppressed_until);
    const suppressedUntil = req.body.suppressed
      ? ((
          await pool.query<{ owner_email_suppressed_until: string }>(
            `update chat_sessions set owner_email_suppressed_until = now() + ($2 * interval '1 millisecond')
         where id = $1 returning owner_email_suppressed_until`,
            [session.id, adminChatOwnerEmailSuppressionTimeoutMs()],
          )
        ).rows[0]?.owner_email_suppressed_until ?? null)
      : ((
          await pool.query<{ owner_email_suppressed_until: string | null }>(
            `update chat_sessions set owner_email_suppressed_until = null where id = $1 returning owner_email_suppressed_until`,
            [session.id],
          )
        ).rows[0]?.owner_email_suppressed_until ?? null);
    const { changes, changeSummary, detail } = activityChangeDetail(
      { publicId: session.public_id },
      { suppressed: beforeSuppressed },
      { suppressed: req.body.suppressed },
    );
    await recordAdminActivityBestEffort(pool, req.user!, {
      category: 'messaging',
      action: req.body.suppressed
        ? 'messaging.chat.owner_email.suppress'
        : 'messaging.chat.owner_email.resume',
      summary:
        changes.length === 0
          ? `E-mails proprio chat ${session.public_id}: aucun changement`
          : `E-mails proprio chat ${session.public_id}: ${changeSummary}`,
      targetType: 'chat',
      targetId: session.public_id,
      detail,
    });
    res.json({
      success: true,
      ownerEmailSuppressedUntil: suppressedUntil,
      ownerEmailSuppressionTimeoutMs: adminChatOwnerEmailSuppressionTimeoutMs(),
    });
  },
);

adminChatsRouter.post('/chats/:publicId/notify', requireAuth, requirePermission('messages'), async (req, res) => {
  const session = await adminChatFromParam(req.params.publicId);
  if (!session) return void res.status(404).json({ success: false, error: { code: 'not_found' } });
  try {
    const notifyResult = await sendAdminChatReplyNotification(pool, session);
    await recordAdminActivityBestEffort(pool, req.user!, {
      category: 'messaging',
      action: 'messaging.chat.notify',
      summary: `Notification client pour le chat ${session.public_id}`,
      targetType: 'chat',
      targetId: session.public_id,
      detail: { publicId: session.public_id },
    });
    res.json({ success: true, ...notifyResult });
  } catch {
    res.status(502).json({ success: false, error: { code: 'email_delivery_failed' } });
  }
});

/** Close an open conversation from the admin UI — same effect as the
 * customer's own close (transcript read-only for them). Idempotent when
 * already closed. */
adminChatsRouter.post('/chats/:publicId/close', requireAuth, requirePermission('messages'), async (req, res) => {
  const session = await adminChatFromParam(req.params.publicId);
  if (!session) return void res.status(404).json({ success: false, error: { code: 'not_found' } });
  const result = await closeSession(pool, session);
  const { changes, changeSummary, detail } = activityChangeDetail(
    { publicId: session.public_id },
    { status: session.status },
    { status: result.session.status },
  );
  await recordAdminActivityBestEffort(pool, req.user!, {
    category: 'messaging',
    action: 'messaging.chat.close',
    summary:
      changes.length === 0
        ? `Chat ${session.public_id}: aucun changement`
        : `Chat ${session.public_id}: ${changeSummary}`,
    targetType: 'chat',
    targetId: session.public_id,
    detail,
  });
  res.json({
    success: true,
    chat: {
      ...toPublicSession(result.session, await listMessages(pool, result.session.id)),
    },
  });
});

/** Anonymous contact-form messages, kept separately from account chat. */

adminChatsRouter.get(
  '/chats/:publicId/attachments/:attachmentId',
  requireAuth,
  requirePermission('messages'),
  async (req, res) => {
    try {
      const session = await adminChatFromParam(req.params.publicId);
      const attachmentId = Number(req.params.attachmentId);
      if (!session || !Number.isSafeInteger(attachmentId)) throw new Error('not_found');
      const attachment = await findSessionAttachment(pool, session.id, attachmentId);
      if (!attachment) throw new Error('not_found');
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
  },
);
