import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { requireStaff } from '../../../middleware/requirePermission.js';
import { resolveAccountAccess } from '../../identity/application/staffRoles.js';
import { searchRoleAccounts } from '../../identity/application/roleAccounts.js';

export const adminRoleAccountsRouter = Router();

const RESULT_LIMIT = 15;
const QUERY_MAX = 254;

/** Account search of the Roles page ("Rôles des comptes"): only accounts
 * whose roles the caller may change. A super-admin sees every account; a
 * staff account whose assignable and targetable lists both resolve sees
 * those in its targetable list, never a super-admin; anyone else is refused. Deliberately not under
 * `/admin/roles`, which is super-admin only. */
adminRoleAccountsRouter.get('/role-accounts', requireAuth, requireStaff, async (req, res) => {
  const { delegation } = await resolveAccountAccess(pool, req.user!);
  if (!delegation.all && delegation.roles.length === 0) {
    return void res.status(403).json({ success: false, error: { code: 'forbidden' } });
  }
  const q = typeof req.query.q === 'string' ? req.query.q.slice(0, QUERY_MAX) : '';
  const result = await searchRoleAccounts(pool, delegation, q, RESULT_LIMIT);
  res.json({ success: true, accounts: result.accounts, total: result.total });
});
