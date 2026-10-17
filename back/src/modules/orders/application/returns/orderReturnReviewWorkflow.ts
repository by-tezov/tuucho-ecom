import type pg from 'pg';
import { sendMail } from '../../../messaging/application/email.js';
import { maybeIssueGuestOrderManageUrl, orderCheckoutLanguage } from '../guestOrderManage.js';
import { findUserById } from '../../../identity/application/users.js';
import { getUserPreference } from '../../../identity/application/userPreferences.js';
import { languageFromPreference } from '../../../../utils/language.js';
import type { OrderRow } from '../../domain/order.js';
import { decryptOrderRow } from '../../infrastructure/orderRows.js';
import { orderReturnResolvedEmail } from './orderReturnEmail.js';
import { type OrderReturnCaseRow, latestReturnCase, returnOrderById } from './orderReturnReviewStore.js';

export type DismissOrderReturnResult =
  { ok: true; order: OrderRow } | { ok: false; reason: 'not_found' | 'invalid_status' | 'invalid_request' };

export async function dismissOrderReturnReview(
  pool: pg.Pool,
  orderId: string,
  actorUserId: string,
  reason: string,
): Promise<DismissOrderReturnResult> {
  const cleaned = reason.trim();
  if (!cleaned || cleaned.length > 2_000) return { ok: false, reason: 'invalid_request' };
  const client = await pool.connect();
  try {
    await client.query('begin');
    const order = await returnOrderById(client, orderId, true);
    const review = await latestReturnCase(client, orderId, true);
    if (!order || !review) {
      await client.query('rollback');
      return { ok: false, reason: 'not_found' };
    }
    if (order.status !== 'return_review' || review.resolution_state !== 'open') {
      await client.query('rollback');
      return { ok: false, reason: 'invalid_status' };
    }
    await client.query(
      `update order_return_cases
          set resolution_state = 'dismissed', dismissed_by = $2,
              dismissed_at = now(), dismissed_reason = $3, updated_at = now()
        where id = $1`,
      [review.id, actorUserId, cleaned],
    );
    const { rows } = await client.query<OrderRow>(
      `update orders
          set status = $2, status_reason = null,
              status_updated_at = now(), updated_at = now()
        where id = $1
        returning *`,
      [order.id, review.previous_status],
    );
    await client.query('commit');
    return { ok: true, order: decryptOrderRow(rows[0]!) };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function sendOrderReturnResolutionEmail(
  pool: pg.Pool,
  orderId: string,
): Promise<'sent' | 'failed' | 'skipped'> {
  const review = await latestReturnCase(pool, orderId);
  if (!review || review.resolution_state !== 'resolved') return 'skipped';
  const claimed = await pool.query<OrderReturnCaseRow>(
    `update order_return_cases
        set email_status = 'sending', email_attempted_at = now(), email_error = null,
            updated_at = now()
      where id = $1
        and (email_status in ('not_sent', 'failed')
          or (email_status = 'sending' and email_attempted_at < now() - interval '10 minutes'))
      returning *`,
    [review.id],
  );
  if (!claimed.rows[0]) return review.email_status === 'sent' ? 'sent' : 'skipped';
  const order = await returnOrderById(pool, orderId);
  try {
    if (!order) throw new Error('The resolved order no longer exists.');
    const user = order.user_id ? await findUserById(pool, order.user_id) : null;
    const recipient = user?.email ?? order.guest_email;
    if (!recipient) throw new Error('No customer email is available.');
    const language = user
      ? languageFromPreference(await getUserPreference(pool, user.id, 'language'))
      : orderCheckoutLanguage(order.language);
    const manageOrderUrl = await maybeIssueGuestOrderManageUrl(pool, order, recipient, language);
    await sendMail({
      to: recipient,
      ...orderReturnResolvedEmail(
        order.order_number,
        review.refund_amount_cents ?? 0,
        review.courier_retained_cents ?? 0,
        language,
        manageOrderUrl,
      ),
    });
    await pool.query(
      `update order_return_cases
          set email_status = 'sent', email_sent_at = now(), email_error = null, updated_at = now()
        where id = $1`,
      [review.id],
    );
    return 'sent';
  } catch (error) {
    const message = (error instanceof Error ? error.message : 'Unknown email error').slice(0, 500);
    await pool.query(
      `update order_return_cases
          set email_status = 'failed', email_error = $2, updated_at = now()
        where id = $1`,
      [review.id, message],
    );
    console.error(`[orderReturnReview] final email failed for ${order?.order_number ?? orderId}`, error);
    return 'failed';
  }
}
