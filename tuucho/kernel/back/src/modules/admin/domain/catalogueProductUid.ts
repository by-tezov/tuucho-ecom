/** Shop product-uid generator, same alphabet as catalog source prepare-library.
 *
 * Output is LL-LL-DDD, a subset of the stored rule (A-Z, 0-9, single dashes,
 * 1-20 characters). Letters drop French look-alikes and O/I. Digits drop 0 and 1.
 * A blank uid on create is filled here; a uid already on a product is skipped. */
import { CatalogueDocumentError } from './catalogueDocumentTypes.js';

const LETTERS = 'ACEGHJKLMQRSTUWXYZ';
const DIGITS = '23456789';
const UID = /^[ACEGHJKLMQRSTUWXYZ]{2}-[ACEGHJKLMQRSTUWXYZ]{2}-[23456789]{3}$/;

export function isBlankProductUid(value: unknown): boolean {
  return typeof value !== 'string' || value.trim() === '';
}

function group(alphabet: string, length: number, random: () => number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(random() * alphabet.length)] ?? '';
  }
  return out;
}

export function randomProductUid(random: () => number = Math.random): string {
  return `${group(LETTERS, 2, random)}-${group(LETTERS, 2, random)}-${group(DIGITS, 3, random)}`;
}

/** First generated code that `taken` rejects. `taken` is true when that
 * product-uid is already on a shop product. */
export async function pickUnusedProductUid(
  taken: (uid: string) => boolean | Promise<boolean>,
  random?: () => number,
): Promise<string> {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const uid = randomProductUid(random);
    if (!UID.test(uid)) continue;
    if (!(await taken(uid))) return uid;
  }
  throw new CatalogueDocumentError('Could not allocate a product-uid.');
}
