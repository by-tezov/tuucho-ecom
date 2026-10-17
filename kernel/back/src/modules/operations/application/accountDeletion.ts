import type pg from 'pg';
import { config } from '../../../config/env.js';
import { deletionReminderEmail, sendMail } from '../../messaging/application/email.js';
import { decryptPii } from '../../../platform/security/piiCrypto.js';
import { getUserLanguage } from '../../identity/application/userPreferences.js';
import { withTransaction } from '../../../platform/db/transaction.js';
import { runCheckoutRelease } from '../../orders/application/checkoutOpenings.js';
import { recordSystemActivityBestEffort } from '../../activity/application/recordSystemActivity.js';

interface PendingUserRow {
  id: string;
  email: string;
  deletion_scheduled_for: string;
}

/** Idempotent — safe to call repeatedly (e.g. once a day from an external
 * cron hitting POST /operation/process-account-deletions): only ever emails
 * a user once per pending-deletion cycle (deletion_reminder_sent_at gates
 * it), and reactivateIfPendingDeletion (users.service.ts) clears that flag
 * the moment someone logs back in, so a reactivated-then-re-requested
 * deletion gets its own fresh reminder. */
export async function processReminders(pool: pg.Pool): Promise<number> {
  const { rows } = await pool.query<PendingUserRow>(
    `select id, email, deletion_scheduled_for
     from users
     where status = 'pending_deletion'
       and deletion_reminder_sent_at is null
       and deletion_scheduled_for <= now() + make_interval(days => $1)`,
    [config.accountDeletion.reminderDaysBeforeDays],
  );

  for (const row of rows) {
    const email = decryptPii(row.email)!;
    const daysLeft = config.accountDeletion.reminderDaysBeforeDays;
    const scheduledForDate = row.deletion_scheduled_for.slice(0, 10);
    const language = await getUserLanguage(pool, row.id);
    await sendMail({ to: email, ...deletionReminderEmail(daysLeft, scheduledForDate, language) });
    await pool.query(`update users set deletion_reminder_sent_at = now() where id = $1`, [row.id]);
  }

  return rows.length;
}

export interface PermanentDeletionResult {
  /** Accounts actually removed from `users`. */
  deleted: number;
  /** Accounts that raised and were rolled back, leaving them due next run. */
  failed: number;
  /** Orders detached from a deleted account and kept as permanent orphans. */
  orphanedOrders: number;
}

export interface HardDeleteAccountOptions {
  /** When true, permanently remove the account's orders (and their
   * stock_reservations) instead of orphaning them. Plugin checkout.release
   * clears plugin rows that would otherwise block the delete. */
  deleteOrders: boolean;
}

export interface HardDeleteAccountResult {
  orphanedOrders: number;
  deletedOrders: number;
  /** Order numbers removed when `deleteOrders` was true — for local mirror cleanup. */
  orderNumbers: string[];
}

/** Hard-deletes one account in its own transaction.
 *
 * Default (`deleteOrders: false`) matches the GDPR cron path: orders are
 * deliberately *not* deleted. They carry invoice data that must be retained,
 * and 1787380000000 made them self-describing (`customer_email`,
 * `customer_first_name`, `customer_last_name` are snapshotted at insert), so
 * detaching one loses nothing about who bought what, when, where or how.
 *
 * Detaching sets `owner_deleted_at`, which moves the order into its third and
 * terminal ownership state. `guest_email` stays null, so neither claim path
 * can ever surface it again: an account re-created at the same address gets
 * nothing back. Only orders *placed* as guest are re-integrable, and only
 * inside the window in orders.service.ts's guestClaimCutoff.
 *
 * `deleteOrders: true` is the ops wipe path (`npm run user -- delete
 * --delete-orders`): same DB semantics as deleteByOrderNumber for each of
 * the account's orders, then the user row.
 *
 * Live stock holds are released first so a deleted account's abandoned
 * checkout stops withholding stock immediately rather than waiting out its
 * TTL. Plugin `checkout.release` (purpose `account.delete`) writes off and
 * clears plugin-owned rows that would otherwise block the user delete. */
export async function hardDeleteAccount(
  pool: pg.Pool,
  userId: string,
  options: HardDeleteAccountOptions,
): Promise<HardDeleteAccountResult> {
  return withTransaction(pool, async (client) => {
    await client.query(
      `update stock_reservations
          set state = 'released', updated_at = now()
        where user_id = $1 and state = 'held'`,
      [userId],
    );

    let orphanedOrders = 0;
    let deletedOrders = 0;
    let orderNumbers: string[] = [];
    let orderIds: string[] = [];

    if (options.deleteOrders) {
      const { rows: orders } = await client.query<{ id: string; order_number: string }>(
        `select id, order_number from orders where user_id = $1 for update`,
        [userId],
      );
      orderNumbers = orders.map((order) => order.order_number);
      orderIds = orders.map((order) => order.id);
    }

    await runCheckoutRelease({
      client,
      userId,
      purpose: 'account.delete',
      deleteOrders: options.deleteOrders,
      orderIds,
    });

    if (options.deleteOrders) {
      if (orderIds.length > 0) {
        await client.query(`delete from stock_reservations where order_id = any($1::uuid[])`, [orderIds]);
        await client.query(`delete from orders where id = any($1::uuid[])`, [orderIds]);
        deletedOrders = orderIds.length;
      }
    } else {
      const { rowCount } = await client.query(
        `update orders
            set user_id = null,
                owner_deleted_at = now(),
                updated_at = now()
          where user_id = $1`,
        [userId],
      );
      orphanedOrders = rowCount ?? 0;
    }

    await client.query(`delete from users where id = $1`, [userId]);

    return { orphanedOrders, deletedOrders, orderNumbers };
  });
}

/** Removes every account past its own `deletion_scheduled_for`, one
 * transaction each. Safe to call as often as the cron likes. */
export async function processPermanentDeletions(pool: pg.Pool): Promise<PermanentDeletionResult> {
  const { rows } = await pool.query<{ id: string }>(
    `select id from users
      where status = 'pending_deletion' and deletion_scheduled_for <= now()`,
  );

  let deleted = 0;
  let failed = 0;
  let orphanedOrders = 0;

  for (const row of rows) {
    try {
      const result = await hardDeleteAccount(pool, row.id, { deleteOrders: false });
      orphanedOrders += result.orphanedOrders;
      deleted += 1;
      await recordSystemActivityBestEffort(pool, {
        category: 'accounts',
        action: 'account.hard_delete',
        actorLabel: 'suppression de compte',
        summary: `Suppression planifiee du compte ${row.id}`,
        targetType: 'user',
        targetId: row.id,
        detail: {
          orphanedOrders: result.orphanedOrders,
          source: 'cron',
        },
      });
    } catch (error) {
      // Leave the account due for the next run rather than losing the batch.
      failed += 1;
      console.error('[account-deletion] failed to delete account', row.id, error);
    }
  }

  return { deleted, failed, orphanedOrders };
}
