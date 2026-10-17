import { randomUUID } from 'node:crypto';
import type pg from 'pg';

export type InvoiceSendChannel = 'download' | 'email';

/** Per-action audit log (order_invoice_sends) for the "Ma Facture" modal's
 * two actions — rate limiting itself is `invoiceDownloadRateLimiter`/
 * `invoiceEmailRateLimiter` (per-IP window+max, see middleware/rateLimiters.ts),
 * not a per-user check against this table. */
export async function recordInvoiceAction(
  pool: pg.Pool,
  userId: string,
  orderId: string,
  channel: InvoiceSendChannel,
): Promise<void> {
  await pool.query(
    `insert into order_invoice_sends (id, user_id, order_id, channel) values ($1, $2, $3, $4)`,
    [randomUUID(), userId, orderId, channel],
  );
}
