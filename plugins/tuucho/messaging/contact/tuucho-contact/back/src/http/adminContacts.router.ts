import { Router } from 'express';
import { readFile } from 'node:fs/promises';
import { pool } from '@kernel/back/db/pool';
import { requirePermission } from '@kernel/back/middleware/requirePermission';
import { requireAuth } from '@kernel/back/middleware/requireAuth';
import { optionalImageUploads, uploadedImageFiles } from '@kernel/back/middleware/optionalImageUploads';
import { boundedPrintable } from '@kernel/back/utils/fieldLimits';
import { config } from '@kernel/back/config/env';
import { sendMail, unconnectedContactReplyEmail } from '@kernel/back/modules/messaging/application/email';
import {
  cachedChatImagePreview,
  contactImageFileName,
  contactMediaAbsolutePath,
  PrivateUploadError,
  removeSavedPrivateImages,
  savePrivateImages,
} from '@kernel/back/media/privateUploads';
import {
  appendUnconnectedContactAdminReply,
  findUnconnectedContactAttachment,
  getAdminUnconnectedContactAttentionCounts,
  getUnconnectedContactByPublicId,
  isUnconnectedContactStatus,
  setUnconnectedContactStatus,
  unconnectedContactReplyLanguage,
} from '../application/unconnectedContact.js';

import { recordAdminActivityBestEffort } from '@kernel/back/modules/activity/application/recordAdminActivity';
import { activityChangeDetail } from '@kernel/back/modules/activity/application/changeDetail';
import { ADMIN_UNCONNECTED_CONTACT_PAGE_SIZE, requestedPage } from '@kernel/back/modules/admin/http/adminPagination';
import { listAdminUnconnectedContactsPage } from '../application/adminContactList.js';

async function adminUnconnectedContactFromParam(value: unknown) {
  return getUnconnectedContactByPublicId(pool, String(value ?? '').toUpperCase());
}
import { parseInboxListFilter } from '@kernel/back/platform/listing/inboxListFilter';

export const adminContactsRouter = Router();

adminContactsRouter.get(
  '/unconnected-contacts/attention-counts',
  requireAuth,
  requirePermission('messages'),
  async (_req, res) => {
    const counts = await getAdminUnconnectedContactAttentionCounts(pool);
    res.json({ success: true, counts });
  },
);

adminContactsRouter.get('/unconnected-contacts', requireAuth, requirePermission('messages'), async (req, res) => {
  const status = isUnconnectedContactStatus(req.query.status) ? req.query.status : undefined;
  if (!status) return void res.status(400).json({ success: false, error: { code: 'invalid_request' } });
  const page = requestedPage(req.query.page);
  const filter = parseInboxListFilter(req.query as { q?: unknown; period?: unknown; sort?: unknown });
  const result = await listAdminUnconnectedContactsPage(
    pool,
    status,
    filter,
    page,
    ADMIN_UNCONNECTED_CONTACT_PAGE_SIZE,
  );
  res.json({
    success: true,
    contacts: result.contacts,
    pagination: {
      page,
      pageSize: ADMIN_UNCONNECTED_CONTACT_PAGE_SIZE,
      total: result.total,
      totalPages: Math.ceil(result.total / ADMIN_UNCONNECTED_CONTACT_PAGE_SIZE),
    },
  });
});

adminContactsRouter.get('/unconnected-contacts/:publicId', requireAuth, requirePermission('messages'), async (req, res) => {
  const contact = await adminUnconnectedContactFromParam(req.params.publicId);
  if (!contact) return void res.status(404).json({ success: false, error: { code: 'not_found' } });
  res.json({ success: true, contact });
});

adminContactsRouter.patch(
  '/unconnected-contacts/:publicId/status',
  requireAuth,
  requirePermission('messages'),
  async (req, res) => {
    const status = isUnconnectedContactStatus(req.body?.status) ? req.body.status : undefined;
    if (!status) return void res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    const before = await adminUnconnectedContactFromParam(req.params.publicId);
    if (!before) return void res.status(404).json({ success: false, error: { code: 'not_found' } });
    const contact = await setUnconnectedContactStatus(
      pool,
      String(req.params.publicId).toUpperCase(),
      status,
    );
    if (!contact) return void res.status(404).json({ success: false, error: { code: 'not_found' } });
    const { changes, changeSummary, detail } = activityChangeDetail(
      { publicId: contact.publicId },
      { status: before.status },
      { status },
    );
    await recordAdminActivityBestEffort(pool, req.user!, {
      category: 'messaging',
      action: 'messaging.contact.status',
      summary:
        changes.length === 0
          ? `Contact ${contact.publicId}: aucun changement`
          : `Contact ${contact.publicId}: ${changeSummary}`,
      targetType: 'contact',
      targetId: contact.publicId,
      detail,
    });
    res.json({
      success: true,
      contact: {
        publicId: contact.publicId,
        status: contact.status,
        statusUpdatedAt: contact.statusUpdatedAt,
      },
    });
  },
);

adminContactsRouter.post(
  '/unconnected-contacts/:publicId/replies',
  requireAuth,
  requirePermission('messages'),
  optionalImageUploads(),
  async (req, res) => {
    let attachments: Awaited<ReturnType<typeof savePrivateImages>> = [];
    try {
      const contact = await adminUnconnectedContactFromParam(req.params.publicId);
      const body = boundedPrintable(req.body?.body, config.fieldLimits.contactMessageMax);
      if (!contact) return void res.status(404).json({ success: false, error: { code: 'not_found' } });
      if (!body) return void res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      const files = uploadedImageFiles(req);
      if (files.length) {
        attachments = await savePrivateImages({
          files,
          targetDir: config.contactMediaDir,
          maxBytes: config.contactImageMaxBytes,
          fileNameFor: () => contactImageFileName(),
        });
      }
      await sendMail({
        to: contact.email,
        replyTo: config.contactRecipientEmail ?? config.smtp.user,
        ...unconnectedContactReplyEmail(body, await unconnectedContactReplyLanguage(pool, contact.id)),
        attachments: attachments.map((file) => ({ filename: file.originalName, path: file.absolutePath })),
      });
      const message = await appendUnconnectedContactAdminReply(pool, contact.id, body, attachments);
      await recordAdminActivityBestEffort(pool, req.user!, {
        category: 'messaging',
        action: 'messaging.contact.reply',
        summary: `Reponse admin au contact ${contact.publicId}`,
        targetType: 'contact',
        targetId: contact.publicId,
        detail: {
          publicId: contact.publicId,
          attachmentCount: attachments.length,
          bodyLength: body.length,
        },
      });
      res.status(201).json({ success: true, message });
    } catch (error) {
      await removeSavedPrivateImages(attachments);
      if (error instanceof PrivateUploadError)
        return void res.status(400).json({ success: false, error: { code: error.code } });
      console.error('[admin-contact] reply delivery failed', error);
      res.status(502).json({ success: false, error: { code: 'email_delivery_failed' } });
    }
  },
);

adminContactsRouter.get(
  '/unconnected-contacts/:publicId/attachments/:attachmentId',
  requireAuth,
  requirePermission('messages'),
  async (req, res) => {
    try {
      const contact = await adminUnconnectedContactFromParam(req.params.publicId);
      const attachmentId = Number(req.params.attachmentId);
      if (!contact || !Number.isSafeInteger(attachmentId)) throw new Error('not_found');
      const attachment = await findUnconnectedContactAttachment(pool, contact.id, attachmentId);
      if (!attachment) throw new Error('not_found');
      const absolutePath = contactMediaAbsolutePath(attachment.fileName);
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
