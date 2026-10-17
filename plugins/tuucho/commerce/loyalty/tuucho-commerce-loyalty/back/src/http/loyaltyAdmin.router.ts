import { Router } from 'express';
import { pool } from '@kernel/back/db/pool';
import { requirePermission } from '@kernel/back/middleware/requirePermission';
import { requirePluginEnabled } from '@kernel/back/middleware/requirePluginEnabled';
import {
  getWalletSummary,
  listLedger,
  listManualAdjustments,
  manualCreditLot,
  manualUncredit,
} from '../application/loyalty.js';
import { findUserByEmailLower } from '@kernel/back/modules/identity/application/users';
import { boundedEmail } from '@kernel/back/utils/fieldLimits';

export const loyaltyAdminRouter = Router();
loyaltyAdminRouter.use(requirePluginEnabled('tuucho-commerce-loyalty'));

/** Manual credit/uncredit is the Fidelity section. A customer's wallet and
 * ledger are also read by the Users section's account card. */
const loyaltyOnly = requirePermission('loyalty');
const loyaltyOrUsers = requirePermission('loyalty', 'users');

loyaltyAdminRouter.get('/manual-ops', loyaltyOnly, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const result = await listManualAdjustments(pool, page, pageSize);
  res.json({
    success: true,
    entries: result.entries,
    pagination: {
      page,
      pageSize,
      total: result.total,
      totalPages: Math.max(1, Math.ceil(result.total / pageSize)),
    },
  });
});

async function resolveTargetUserId(body: unknown): Promise<string | null | 'invalid'> {
  const email = boundedEmail((body as { email?: unknown } | null)?.email);
  if (!email) return 'invalid';
  const user = await findUserByEmailLower(pool, email);
  if (!user || user.status === 'deleted') return null;
  return user.id;
}

/** Manual mint/debit bounds — numeric(10,2) ceiling and non-empty reason. */
const MANUAL_CREDIT_MAX = 99_999.99;
const MANUAL_REASON_MAX = 500;

function parseManualAdjustment(body: unknown): { amount: number; reason: string } | null {
  const amount = Number((body as { amount?: unknown } | null)?.amount);
  const reason =
    typeof (body as { reason?: unknown } | null)?.reason === 'string'
      ? (body as { reason: string }).reason.trim()
      : '';
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > MANUAL_CREDIT_MAX ||
    !reason ||
    reason.length > MANUAL_REASON_MAX
  ) {
    return null;
  }
  return { amount: Math.round(amount * 100) / 100, reason };
}

loyaltyAdminRouter.post('/credit', loyaltyOnly, async (req, res) => {
  const parsed = parseManualAdjustment(req.body);
  if (!parsed) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const { amount, reason } = parsed;
  const userId = await resolveTargetUserId(req.body);
  if (userId === 'invalid') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (!userId) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('begin');
    await manualCreditLot(client, userId, amount, reason, req.user!.id, req.user!.email);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  const wallet = await getWalletSummary(pool, userId);
  res.json({ success: true, wallet, userId });
});

loyaltyAdminRouter.post('/uncredit', loyaltyOnly, async (req, res) => {
  const parsed = parseManualAdjustment(req.body);
  if (!parsed) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const { amount, reason } = parsed;
  const userId = await resolveTargetUserId(req.body);
  if (userId === 'invalid') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (!userId) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('begin');
    await manualUncredit(client, userId, amount, reason, req.user!.id, req.user!.email);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    if ((error as Error).message === 'insufficient_loyalty_balance') {
      res.status(409).json({ success: false, error: { code: 'loyalty_insufficient' } });
      return;
    }
    throw error;
  } finally {
    client.release();
  }
  const wallet = await getWalletSummary(pool, userId);
  res.json({ success: true, wallet, userId });
});

loyaltyAdminRouter.get('/users/:userId/wallet', loyaltyOrUsers, async (req, res) => {
  const summary = await getWalletSummary(pool, String(req.params.userId));
  res.json({ success: true, wallet: summary });
});

loyaltyAdminRouter.get('/users/:userId/ledger', loyaltyOrUsers, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const result = await listLedger(pool, String(req.params.userId), page, pageSize);
  res.json({
    success: true,
    entries: result.entries,
    pagination: { page, pageSize, total: result.total },
  });
});

