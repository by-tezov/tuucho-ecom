import type pg from 'pg';
import { decryptJsonPii } from '../../../platform/security/piiCrypto.js';
import { isLanguage, type Language } from '../../../utils/language.js';

/** Decrypted `orders.gift_snapshot` for fulfilment and mail. */
export interface OrderGiftSnapshot {
  offerId: string;
  giverDisplayName: string;
  receiverName: string;
  giverEmail: string;
  receiverEmail: string | null;
  hideReceiverPrices: boolean;
}

/** Decrypt `orders.gift_snapshot`. Null when absent or unreadable.
 * Older snapshots may omit giverEmail / receiverEmail. */
export function readOrderGiftSnapshot(raw: unknown): OrderGiftSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const enc = (raw as { enc?: unknown }).enc;
  if (typeof enc !== 'string') return null;
  try {
    const snap = decryptJsonPii<{
      offerId: string;
      giverDisplayName: string;
      receiverName: string;
      giverEmail?: string;
      receiverEmail?: string | null;
      hideReceiverPrices?: boolean;
    }>(enc);
    if (!snap?.offerId) return null;
    return {
      offerId: snap.offerId,
      giverDisplayName: snap.giverDisplayName,
      receiverName: snap.receiverName,
      giverEmail: typeof snap.giverEmail === 'string' ? snap.giverEmail : '',
      receiverEmail:
        typeof snap.receiverEmail === 'string' && snap.receiverEmail.trim()
          ? snap.receiverEmail.trim()
          : null,
      hideReceiverPrices: snap.hideReceiverPrices !== false,
    };
  } catch {
    return null;
  }
}

export interface GiftReceiverMailTarget {
  email: string;
  language: Language;
}

export interface GiftMailOrder {
  gift_offer_id: string | null;
  gift_snapshot: unknown;
  language: string | null;
}

/** Recipient address from the frozen gift snapshot, if any. */
export async function giftReceiverMailTarget(
  pool: pg.Pool | pg.PoolClient,
  order: GiftMailOrder,
): Promise<GiftReceiverMailTarget | null> {
  const snap = readOrderGiftSnapshot(order.gift_snapshot);
  const email = snap?.receiverEmail?.trim();
  if (!email || !snap) return null;
  let language: Language = order.language && isLanguage(order.language) ? order.language : 'en';
  if (order.gift_offer_id) {
    const { rows } = await pool.query<{ language: string }>(
      `select language from gift_offers where id = $1`,
      [order.gift_offer_id],
    );
    const offerLanguage = rows[0]?.language;
    if (offerLanguage && isLanguage(offerLanguage)) language = offerLanguage;
  }
  return { email, language };
}

/** True when giver and receiver share the same address: one mail is enough. */
export function sameGiftMailAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
