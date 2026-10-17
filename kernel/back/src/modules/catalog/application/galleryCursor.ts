import { isUuid } from '../../../utils/validate.js';

/** Keyset cursor of the gallery feed: the localized sort title and the id of
 * the last card, base64url JSON. A cursor that does not decode (or whose id is
 * not a UUID) reads as page 1. */
interface GalleryCursor {
  sortTitle: string;
  id: string;
}

export function encodeCursor(cursor: GalleryCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(value: string): GalleryCursor | undefined {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as GalleryCursor).sortTitle === 'string' &&
      isUuid((parsed as GalleryCursor).id)
    ) {
      return parsed as GalleryCursor;
    }
  } catch {
    // malformed cursor — treat as page 1 rather than erroring the request
  }
  return undefined;
}
