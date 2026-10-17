export const PRIVATE_IMAGE_MAX_COUNT = 3;
export const PRIVATE_IMAGE_MAX_EDGE = 1600;
/** Edge length for session-gated chat vignettes served to the browser. */
export const CHAT_IMAGE_THUMB_EDGE = 240;
/** Reject pathological images before Sharp allocates large pixel buffers. */
export const PRIVATE_IMAGE_MAX_PIXELS = 25_000_000;
export const PRIVATE_IMAGE_ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type PrivateUploadErrorCode = 'invalid_type' | 'too_large' | 'too_many' | 'processing_failed';

export class PrivateUploadError extends Error {
  code: PrivateUploadErrorCode;

  constructor(code: PrivateUploadErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

export interface SavedPrivateImage {
  /** On-disk file name under the private media dir (never web-served). */
  fileName: string;
  /** Visitor-facing name for UI / email labels. */
  originalName: string;
  absolutePath: string;
  bytes: number;
  contentType: 'image/jpeg';
}

export interface MulterLikeFile {
  buffer?: Buffer;
  path?: string;
  mimetype: string;
  originalname?: string;
  size?: number;
}
