import { randomUUID } from 'node:crypto';
import multer from 'multer';
import type { NextFunction, Request, Response } from 'express';
import { PRIVATE_IMAGE_ALLOWED_MIME, PRIVATE_IMAGE_MAX_COUNT } from '../media/privateUploads.js';
import {
  prepareUploadTempDir,
  removeUploadedTempFiles,
  secureUploadedTempFiles,
  uploadTempDirectory,
  uploadedImageFiles,
} from './privateUploadTemp.js';
import { assertUploadedImageMagic } from '../media/imageMagic.js';

export { uploadedImageFiles } from './privateUploadTemp.js';

/** Raw upload ceiling before sharp — processed files are capped separately. */
const RAW_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;

const diskUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const directory = uploadTempDirectory(req);
      if (!directory) {
        cb(new Error('upload_temp_unavailable'), '');
        return;
      }
      cb(null, directory);
    },
    filename: (_req, _file, cb) => cb(null, `${randomUUID()}.upload`),
  }),
  limits: {
    fileSize: RAW_UPLOAD_MAX_BYTES,
    files: PRIVATE_IMAGE_MAX_COUNT,
  },
  fileFilter: (_req, file, cb) => {
    if (!PRIVATE_IMAGE_ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error('invalid_type'));
      return;
    }
    cb(null, true);
  },
});

function cleanupAfterResponse(req: Request, res: Response): void {
  // The route may reject before savePrivateImages() gets a chance to consume
  // the files (for example an invalid message body or an unknown session).
  // Cleanup on both normal completion and an aborted client response; unlink
  // is idempotent, so a file already consumed by savePrivateImages is safe.
  let started = false;
  const cleanup = () => {
    if (started) return;
    started = true;
    void removeUploadedTempFiles(req);
  };
  res.once('finish', cleanup);
  res.once('close', cleanup);
}

async function assertUploadedImagesMagic(req: Request): Promise<void> {
  for (const file of uploadedImageFiles(req)) {
    await assertUploadedImageMagic(file);
  }
}

/** Parse optional `images` multipart field (0–3). JSON requests pass through. */
export function optionalImageUploads(fieldName = 'images') {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.is('multipart/form-data')) {
      next();
      return;
    }
    void prepareUploadTempDir(req)
      .then(() => {
        diskUpload.array(fieldName, PRIVATE_IMAGE_MAX_COUNT)(req, res, async (err: unknown) => {
          if (!err) {
            try {
              await secureUploadedTempFiles(req);
              await assertUploadedImagesMagic(req);
            } catch (verifyError) {
              await removeUploadedTempFiles(req);
              const code =
                verifyError instanceof Error && verifyError.message === 'invalid_type'
                  ? 'invalid_type'
                  : 'internal_error';
              res.status(code === 'invalid_type' ? 400 : 500).json({
                success: false,
                error: { code },
              });
              return;
            }
            cleanupAfterResponse(req, res);
            next();
            return;
          }
          await removeUploadedTempFiles(req);
          const code =
            err instanceof Error && err.message === 'invalid_type'
              ? 'invalid_type'
              : err instanceof multer.MulterError && err.code === 'LIMIT_FILE_COUNT'
                ? 'too_many'
                : err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
                  ? 'too_large'
                  : err instanceof multer.MulterError && err.code === 'LIMIT_UNEXPECTED_FILE'
                    ? 'too_many'
                    : 'invalid_request';
          res.status(400).json({ success: false, error: { code } });
        });
      })
      .catch(async () => {
        await removeUploadedTempFiles(req);
        res.status(500).json({ success: false, error: { code: 'internal_error' } });
      });
  };
}
