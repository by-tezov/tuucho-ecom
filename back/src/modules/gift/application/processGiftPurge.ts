import type pg from 'pg';
import { getGiftSettings } from '../infrastructure/giftSettingsRepo.js';
import { deleteOfferById, findOfferById, findPurgeCandidateIds } from '../infrastructure/giftOfferRepo.js';
import { deleteGiftCart } from '../infrastructure/giftCart.js';

const BATCH = 100;
const ADVISORY = 87_217;

/** RGPD retention cron: hard-deletes `cancelled` / `expired` gift offers
 * (giver email/name/comment, receiver name and destination — all PII) once
 * they are older than Boutique `purge_after_days` (default 396, ~13
 * months). Offers that reached `ordered` are never touched: their data
 * lives on in `orders.gift_snapshot` under the order's own retention.
 * Idempotent and safe to run as often as the cron likes. */
export async function processGiftPurge(pool: pg.Pool): Promise<{ purged: number }> {
  const client = await pool.connect();
  let purged = 0;
  try {
    await client.query('begin');
    await client.query(`select pg_advisory_xact_lock($1)`, [ADVISORY]);
    const settings = await getGiftSettings(client);
    const ids = await findPurgeCandidateIds(client, settings.purgeAfterDays, BATCH);
    for (const id of ids) {
      const offer = await findOfferById(client, id);
      await deleteGiftCart(client, offer?.cartId ?? null);
      await deleteOfferById(client, id);
      purged += 1;
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  return { purged };
}
