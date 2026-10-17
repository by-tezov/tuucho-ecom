import { Router, type Request, type Response } from 'express';
import { config } from '@kernel/back/config/env';
import { pool } from '@kernel/back/db/pool';
import { optionalImageUploads, uploadedImageFiles } from '@kernel/back/middleware/optionalImageUploads';
import { contactRateLimiter } from '@kernel/back/middleware/rateLimiters';
import {
  contactImageFileName,
  PrivateUploadError,
  removeSavedPrivateImages,
  savePrivateImages,
  type SavedPrivateImage,
} from '@kernel/back/media/privateUploads';
import { enqueueContactFormMail } from '../application/contactMailJob.js';
import { isContactEmailGuestEnabled } from '@kernel/back/modules/settings/application/appPreferences';
import { createUnconnectedContact } from '../application/unconnectedContact.js';
import { boundedEmail, boundedPrintable } from '@kernel/back/utils/fieldLimits';
import { requestLanguage } from '@kernel/back/utils/language';

export const contactFormRouter = Router();

async function processContactImages(
  req: Request,
): Promise<{ ok: true; images: SavedPrivateImage[] } | { ok: false; code: string }> {
  const files = uploadedImageFiles(req);
  if (files.length === 0) return { ok: true, images: [] };
  try {
    const saved = await savePrivateImages({
      files,
      targetDir: config.contactMediaDir,
      maxBytes: config.contactImageMaxBytes,
      fileNameFor: () => contactImageFileName(),
    });
    return {
      ok: true,
      images: saved,
    };
  } catch (error) {
    if (error instanceof PrivateUploadError) {
      return { ok: false, code: error.code };
    }
    throw error;
  }
}

async function deliver(
  res: Response,
  data: {
    email: string;
    identity: string | null;
    userId: string | null;
    firstName: string | null;
    lastName: string | null;
    message: string;
    attachments?: { filename: string; path: string }[];
    attachmentNames?: string[];
    retainAttachments?: boolean;
  },
): Promise<void> {
  // Folder routing deliberately has no recipient requirement: sendMail
  // itself writes under DEV_DIR instead of actually sending (see
  // email.service.ts), so the same successful form flow works without SMTP.
  try {
    if (!isContactEmailGuestEnabled()) {
      // Message already persisted; skip owner mail when the admin preference is off.
      res.status(201).json({ success: true });
      return;
    }

    await enqueueContactFormMail(pool, {
      email: data.email,
      identity: data.identity,
      userId: data.userId,
      firstName: data.firstName,
      lastName: data.lastName,
      message: data.message,
      attachmentNames: data.attachmentNames,
      attachments: data.attachments,
    });
  } catch (error) {
    // Do not log the contact text or address: mail transport diagnostics are
    // sufficient for operators and avoid unnecessarily retaining customer data.
    console.error('[contact] enqueue failed', error);
    res.status(502).json({ success: false, error: { code: 'email_delivery_failed' } });
    return;
  } finally {
    // Anonymous contacts now retain their files for the authenticated admin
    // inbox. The legacy transient cleanup remains for any other caller.
    if (!data.retainAttachments) {
      await removeSavedPrivateImages(
        (data.attachments ?? []).map((attachment) => ({ absolutePath: attachment.path })),
      );
    }
  }

  res.status(201).json({ success: true });
}

/** Anonymous messages must include an email and one free-form identity
 * field. The website never accepts a user id from an anonymous browser.
 * Optional images: multipart field `images` (0–3), private disk + email. */
contactFormRouter.post(
  '/',
  contactRateLimiter,
  optionalImageUploads(),
  async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const email = boundedEmail(body.email);
    const identity = boundedPrintable(body.identity, config.fieldLimits.contactIdentityMax);
    const message = boundedPrintable(body.message, config.fieldLimits.contactMessageMax);
    if (!email || !identity || !message) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }

    const images = await processContactImages(req);
    if (!images.ok) {
      res.status(400).json({ success: false, error: { code: images.code } });
      return;
    }

    try {
      await createUnconnectedContact(pool, {
        email,
        identity,
        message,
        attachments: images.images.map((image) => ({
          fileName: image.fileName,
          originalName: image.originalName,
        })),
        language: requestLanguage(req),
      });
    } catch (error) {
      await removeSavedPrivateImages(images.images);
      console.error('[contact] persistence failed', error);
      res.status(503).json({ success: false, error: { code: 'contact_unavailable' } });
      return;
    }

    await deliver(res, {
      email,
      identity,
      userId: null,
      firstName: null,
      lastName: null,
      message,
      attachments: images.images.map((image) => ({ filename: image.originalName, path: image.absolutePath })),
      attachmentNames: images.images.map((image) => image.originalName),
      retainAttachments: true,
    });
  },
);
