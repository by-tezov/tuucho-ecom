import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import { requirePermission } from '../../../middleware/requirePermission.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { SUPER_ADMIN_ROLE } from '../../identity/domain/staffPermissions.js';
import { canActOnAccount } from '../../identity/application/staffRoles.js';
import { findAdminUserById, findUserById, listAdminUsers } from '../../identity/application/users.js';
import { listAdminIdentityHistoryPage } from '../../identity/application/identityHistory.js';
import { listAdminOrdersForUserPage } from '../../orders/application/ordersFacade.js';
import { emailLookupHash } from '../../../platform/security/piiCrypto.js';
import { config } from '../../../config/env.js';
import { callPluginMethod } from '../../plugins/application/pluginBridges.js';
import {
  lockAccountByOperator,
  normalizeLockReason,
  unlockAccount,
} from '../../identity/application/accountSecurityLock.js';
import { recordAdminActivityBestEffort } from '../../activity/application/recordAdminActivity.js';
import { activityChangeDetail } from '../../activity/application/changeDetail.js';

import { requestedAdminUserPageSize, requestedAdminUserRole, requestedPage } from './adminPagination.js';

function presentProductRequest<T extends { photoPath?: string | null }>(request: T): T {
  return {
    ...request,
    photoPath: request.photoPath ? `${config.publicMediaUrl}/${request.photoPath.replace(/^\/+/, '')}` : null,
  };
}

export const adminUsersRouter = Router();

adminUsersRouter.get('/users', requireAuth, requirePermission('users'), async (req, res) => {
  const page = requestedPage(req.query.page);
  const pageSize = requestedAdminUserPageSize(req.query.limit);
  const role = requestedAdminUserRole(req.query.role);
  const search = typeof req.query.q === 'string' ? req.query.q : '';
  const result = await listAdminUsers(pool, page, pageSize, role, search);
  res.json({
    success: true,
    users: result.users,
    pagination: {
      page,
      pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / pageSize),
    },
  });
});

/** Any account except an administrator. The admin page must never become a
 * way to lock an administrator, or to revive an account already pending
 * deletion. */
async function adminCustomerFromParam(value: unknown) {
  return findAdminUserById(pool, String(value ?? ''));
}

adminUsersRouter.post('/users/:id/lock', requireAuth, requirePermission('users'), async (req, res) => {
  const user = await adminCustomerFromParam(req.params.id);
  if (!user) return void res.status(404).json({ success: false, error: { code: 'not_found' } });
  // Not one's own account, and a staff account only within the caller's
  // hierarchy (canActOnAccount: same rule as role assignment).
  if (user.id === req.user!.id || !(await canActOnAccount(pool, req.user!, user.id))) {
    return void res.status(403).json({ success: false, error: { code: 'forbidden' } });
  }
  if (user.status === 'locked') {
    return void res.status(409).json({ success: false, error: { code: 'already_locked' } });
  }
  if (user.status !== 'active') {
    return void res.status(409).json({ success: false, error: { code: 'invalid_user_status' } });
  }
  const reason = normalizeLockReason((req.body as { reason?: unknown } | undefined)?.reason);
  if (!reason) {
    return void res.status(400).json({ success: false, error: { code: 'invalid_request' } });
  }
  await lockAccountByOperator(pool, user.id, {
    reason,
    source: 'admin',
    lockedByUserId: req.user!.id,
  });
  const locked = await findAdminUserById(pool, user.id);
  const { detail } = activityChangeDetail(
    { email: user.email, reason },
    { status: user.status },
    { status: 'locked' },
  );
  await recordAdminActivityBestEffort(pool, req.user!, {
    category: 'accounts',
    action: 'accounts.lock',
    summary: `Verrouillage du compte ${user.email}`,
    targetType: 'user',
    targetId: user.id,
    detail,
  });
  res.json({
    success: true,
    user: {
      id: user.id,
      status: 'locked' as const,
      lockedAt: locked?.locked_at ?? new Date().toISOString(),
      lockReason: reason,
      lockSource: 'admin' as const,
    },
  });
});

/** A super-admin can be locked (sign-in alert link, CLI) but never from this
 * page. Unlocking one is reserved to another super-admin; the CLI
 * (`npm run user -- unlock`) remains the fallback when none is left. */
async function unlockTargetFromParam(value: unknown, actorRole: string) {
  const target = await findUserById(pool, String(value ?? ''));
  if (target?.role !== SUPER_ADMIN_ROLE) return adminCustomerFromParam(value);
  return actorRole === SUPER_ADMIN_ROLE ? target : undefined;
}

adminUsersRouter.post('/users/:id/unlock', requireAuth, requirePermission('users'), async (req, res) => {
  const user = await unlockTargetFromParam(req.params.id, req.user!.role);
  if (!user) return void res.status(404).json({ success: false, error: { code: 'not_found' } });
  if (!(await canActOnAccount(pool, req.user!, user.id))) {
    return void res.status(403).json({ success: false, error: { code: 'forbidden' } });
  }
  if (user.status !== 'locked') {
    return void res.status(409).json({ success: false, error: { code: 'not_locked' } });
  }
  // Guarded above; `false` only remains a harmless concurrent unlock.
  const unlocked = await unlockAccount(pool, user.id);
  if (!unlocked) return void res.status(409).json({ success: false, error: { code: 'not_locked' } });
  const { detail } = activityChangeDetail(
    { email: user.email },
    { status: user.status },
    { status: 'active' },
  );
  await recordAdminActivityBestEffort(pool, req.user!, {
    category: 'accounts',
    action: 'accounts.unlock',
    summary: `Deverrouillage du compte ${user.email}`,
    targetType: 'user',
    targetId: user.id,
    detail,
  });
  res.json({
    success: true,
    user: {
      id: user.id,
      status: 'active' as const,
      lockedAt: null,
      lockReason: null,
      lockSource: null,
    },
  });
});

adminUsersRouter.get('/users/:id/orders', requireAuth, requirePermission('users'), async (req, res) => {
  const user = await adminCustomerFromParam(req.params.id);
  if (!user) return void res.status(404).json({ success: false, error: { code: 'not_found' } });
  const page = requestedPage(req.query.page);
  const pageSize = requestedAdminUserPageSize(req.query.limit);
  const result = await listAdminOrdersForUserPage(pool, user.id, page, pageSize);
  res.json({
    success: true,
    orders: result.orders,
    pagination: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) },
  });
});

adminUsersRouter.get('/users/:id/chats', requireAuth, requirePermission('users'), async (req, res) => {
  const user = await adminCustomerFromParam(req.params.id);
  if (!user) return void res.status(404).json({ success: false, error: { code: 'not_found' } });
  const page = requestedPage(req.query.page);
  const pageSize = requestedAdminUserPageSize(req.query.limit);
  const result = ((await callPluginMethod('listAdminUserSessionsPage', pool, user.id, page, pageSize)) as
    | { sessions: Array<{
        public_id: string;
        status: string;
        visitor_email: string;
        visitor_identity: string | null;
        created_at: string;
        last_message_at: string | null;
        message_count: string | number;
        last_message_body: string | null;
      }>;
      total: number }
    | undefined) ?? { sessions: [], total: 0 };
  res.json({
    success: true,
    chats: result.sessions.map((session) => ({
      publicId: session.public_id,
      status: session.status,
      email: session.visitor_email,
      identity: session.visitor_identity,
      createdAt: session.created_at,
      lastMessageAt: session.last_message_at,
      messageCount: Number(session.message_count),
      preview: session.last_message_body?.slice(0, 160) ?? '',
    })),
    pagination: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) },
  });
});

/** Anonymous contact forms are not account-owned. We show only durable
 * threads whose HMAC email is an exact match for this customer's current
 * address; chat and product-request relations use their direct user_id. */
adminUsersRouter.get('/users/:id/contacts', requireAuth, requirePermission('users'), async (req, res) => {
  const user = await adminCustomerFromParam(req.params.id);
  if (!user) return void res.status(404).json({ success: false, error: { code: 'not_found' } });
  const page = requestedPage(req.query.page);
  const pageSize = requestedAdminUserPageSize(req.query.limit);
  const result = ((await callPluginMethod(
    'listUnconnectedContactsForEmailLookupPage',
    pool,
    emailLookupHash(user.email),
    page,
    pageSize,
  )) as { contacts: unknown[]; total: number } | undefined) ?? { contacts: [], total: 0 };
  res.json({
    success: true,
    contacts: result.contacts,
    pagination: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) },
  });
});

adminUsersRouter.get('/users/:id/product-requests', requireAuth, requirePermission('users'), async (req, res) => {
  const user = await adminCustomerFromParam(req.params.id);
  if (!user) return void res.status(404).json({ success: false, error: { code: 'not_found' } });
  const page = requestedPage(req.query.page);
  const pageSize = requestedAdminUserPageSize(req.query.limit);
  const result = ((await callPluginMethod('listAdminUserProductRequestsPage', pool, user.id, page, pageSize)) as
    | { requests: Array<{ photoPath?: string | null }>; total: number }
    | undefined) ?? { requests: [], total: 0 };
  res.json({
    success: true,
    requests: result.requests.map((request) => presentProductRequest(request)),
    pagination: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) },
  });
});

/** Identity timeline for any live account card, whatever its role. */
adminUsersRouter.get('/users/:id/identity-history', requireAuth, requirePermission('users'), async (req, res) => {
  const user = await findUserById(pool, String(req.params.id ?? ''));
  if (!user) {
    return void res.status(404).json({ success: false, error: { code: 'not_found' } });
  }
  const page = requestedPage(req.query.page);
  const pageSize = requestedAdminUserPageSize(req.query.limit);
  const result = await listAdminIdentityHistoryPage(pool, user.id, page, pageSize);
  res.json({
    success: true,
    events: result.events,
    pagination: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) },
  });
});
