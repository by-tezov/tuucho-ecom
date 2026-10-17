import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import { hardDeleteAccount } from '../application/accountDeletion.js';
import {
  findUserByIdOrEmail,
  listUsersForOps,
  markEmailVerified,
  type UserListSort,
} from '../../identity/application/users.js';
import {
  unlockAccount,
  lockAccountByOperator,
  normalizeLockReason,
  OPS_DEFAULT_LOCK_REASON,
} from '../../identity/application/accountSecurityLock.js';
import { getStripe } from '../../../platform/stripe/stripeClient.js';
import { assignAccountRoles, isKnownRole } from '../../identity/application/staffRoles.js';
import { recordOperatorActivityBestEffort } from '../../activity/application/recordOperatorActivity.js';

export const operationAccountsRouter = Router();

/** Operator-initiated lock — `npm run user -- lock <id-or-email>`. See
 * accountSecurityLock.service.ts's lockAccountByOperator; same effect as the
 * customer's own "this wasn't me" link (locks + revokes every session), just
 * triggered by the site owner instead (e.g. after spotting something odd in
 * a spy email). Accepts either a UUID or an email — see findUserByIdOrEmail. */
operationAccountsRouter.post('/accounts/:idOrEmail/lock', async (req, res) => {
  const { idOrEmail } = req.params as { idOrEmail: string };
  const user = await findUserByIdOrEmail(pool, decodeURIComponent(idOrEmail));
  if (!user) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  const reason =
    req.body?.reason === undefined || req.body?.reason === null || req.body?.reason === ''
      ? OPS_DEFAULT_LOCK_REASON
      : normalizeLockReason(req.body.reason);
  if (!reason) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  await lockAccountByOperator(pool, user.id, { reason, source: 'ops' });
  await recordOperatorActivityBestEffort(pool, {
    category: 'accounts',
    action: 'account.lock',
    summary: `Verrouillage compte ${user.email}`,
    targetType: 'user',
    targetId: user.id,
    detail: { email: user.email, reason, source: 'ops' },
  });
  res.json({ success: true });
});

/** Reverses either lock path above — deliberately no customer-facing
 * equivalent, only this ops-token-gated route (see `npm run user -- unlock
 * <id-or-email>`, since there's no admin backoffice). */
operationAccountsRouter.post('/accounts/:idOrEmail/unlock', async (req, res) => {
  const { idOrEmail } = req.params as { idOrEmail: string };
  const user = await findUserByIdOrEmail(pool, decodeURIComponent(idOrEmail));
  if (!user) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  const ok = await unlockAccount(pool, user.id);
  if (!ok) {
    res.status(409).json({ success: false, error: { code: 'not_locked' } });
    return;
  }
  await recordOperatorActivityBestEffort(pool, {
    category: 'accounts',
    action: 'account.unlock',
    summary: `Deverrouillage compte ${user.email}`,
    targetType: 'user',
    targetId: user.id,
    detail: { email: user.email, source: 'ops' },
  });
  res.json({ success: true });
});

/** Gives the account exactly one role (`super-admin` or a staff role from the
 * administration Roles page), or none with `user`. Several roles at once are
 * assigned from the Users page. */
operationAccountsRouter.put('/accounts/:idOrEmail/role', async (req, res) => {
  const { idOrEmail } = req.params as { idOrEmail: string };
  const role = req.body?.role;
  if (typeof role !== 'string' || !(await isKnownRole(pool, role))) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const user = await findUserByIdOrEmail(pool, decodeURIComponent(idOrEmail));
  if (!user) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  // A single role replaces the account's whole role set; `user` clears it.
  const updated = await assignAccountRoles(pool, user.id, role === 'user' ? [] : [role]);
  await recordOperatorActivityBestEffort(pool, {
    category: 'accounts',
    action: 'account.set_role',
    summary: `Role ${role} pour ${user.email}`,
    targetType: 'user',
    targetId: user.id,
    detail: { email: user.email, role, previousRoles: updated?.before ?? [user.role] },
  });
  res.json({
    success: true,
    user: updated ? { id: user.id, email: user.email, role } : undefined,
  });
});

/** Marks the account's current email verified without the confirmation
 * email round-trip — backs `npm run faker -- account … --verified`. */
operationAccountsRouter.post('/accounts/:idOrEmail/verify-email', async (req, res) => {
  const { idOrEmail } = req.params as { idOrEmail: string };
  const user = await findUserByIdOrEmail(pool, decodeURIComponent(idOrEmail));
  if (!user) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  await markEmailVerified(pool, user.id);
  res.json({ success: true });
});

/** Immediate hard-delete — backs `npm run user -- delete`. Skips the grace
 * period. By default orphans orders (same as the GDPR cron); pass
 * `deleteOrders: true` to wipe them. Stripe customer delete is best-effort
 * and never blocks the DB delete. */
operationAccountsRouter.delete('/accounts/:idOrEmail', async (req, res) => {
  const { idOrEmail } = req.params as { idOrEmail: string };
  const deleteOrders = req.body?.deleteOrders === true;
  const user = await findUserByIdOrEmail(pool, decodeURIComponent(idOrEmail));
  if (!user) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }

  const stripeCustomerId = user.stripe_customer_id;
  try {
    const result = await hardDeleteAccount(pool, user.id, { deleteOrders });
    if (stripeCustomerId) {
      const stripe = getStripe();
      if (stripe) {
        try {
          await stripe.customers.del(stripeCustomerId);
        } catch (error) {
          console.error('[operation] account delete: Stripe customer delete failed', stripeCustomerId, error);
        }
      }
    }
    await recordOperatorActivityBestEffort(pool, {
      category: 'accounts',
      action: 'account.delete',
      summary: `Suppression compte ${user.email}`,
      targetType: 'user',
      targetId: user.id,
      detail: {
        email: user.email,
        deleteOrders,
        orphanedOrders: result.orphanedOrders,
        deletedOrders: result.deletedOrders,
      },
    });
    res.json({
      success: true,
      userId: user.id,
      email: user.email,
      orphanedOrders: result.orphanedOrders,
      deletedOrders: result.deletedOrders,
      orderNumbers: result.orderNumbers,
    });
  } catch (error) {
    console.error('[operation] account delete failed', user.id, error);
    res.status(500).json({ success: false, error: { code: 'internal_error' } });
  }
});

const USER_SORTS: readonly UserListSort[] = [
  'last-connected',
  'most-connected',
  'least-connected',
  'order-value',
];

function isUserSort(value: unknown): value is UserListSort {
  return typeof value === 'string' && (USER_SORTS as readonly string[]).includes(value);
}

/** Backs `npm run user -- list`. offset/limit rather than page numbers,
 * since the CLI itself exposes --from/--to (an explicit index range) as an
 * alternative to --limit — see scripts/user.ts. */
function parseOpsDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function nonEmptyQueryString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/** offset/limit rather than page numbers — limit is genuinely optional (no
 * artificial default cap): scripts/user.ts's own CLI documents "--limit
 * absent = no limit", appropriate for this site's actual user-base size. */
operationAccountsRouter.get('/users', async (req, res) => {
  const offset = Number(req.query.offset ?? 0);
  const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
  if (!Number.isSafeInteger(offset) || offset < 0) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit <= 0 || limit > 2000)) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const sort = isUserSort(req.query.sort) ? req.query.sort : 'last-connected';
  const locked = req.query.locked === 'true';
  const withOrders = req.query.withOrders === 'true';
  const neverOrdered = req.query.neverOrdered === 'true';
  if (withOrders && neverOrdered) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const search = nonEmptyQueryString(req.query.search);
  const ip = nonEmptyQueryString(req.query.ip);
  const createdAfter = parseOpsDate(req.query.createdAfter);
  const createdBefore = parseOpsDate(req.query.createdBefore);
  const lastConnectedAfter = parseOpsDate(req.query.lastConnectedAfter);
  const lastConnectedBefore = parseOpsDate(req.query.lastConnectedBefore);

  const { total, users } = await listUsersForOps(pool, {
    offset,
    limit,
    sort,
    locked,
    withOrders,
    neverOrdered,
    search,
    ip,
    createdAfter,
    createdBefore,
    lastConnectedAfter,
    lastConnectedBefore,
  });
  res.json({
    success: true,
    total,
    users: users.map((user) => ({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      status: user.status,
      role: user.role,
      emailVerified: user.email_verified_at !== null,
      createdAt: user.created_at,
      lastConnectedAt: user.last_connected_at,
      connectionCount: user.connection_count,
      orderCount: user.order_count,
      orderValueSum: Number(user.order_value_sum),
    })),
  });
});
