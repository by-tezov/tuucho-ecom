import { Router, type Response } from 'express';
import { pool } from '../../../db/pool.js';
import { requireAdmin } from '../../../middleware/requireAdmin.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { requireStaff } from '../../../middleware/requirePermission.js';
import type { AdminAccess, AdminPermissionCode, AdminRole } from '../../../contract/admin/roles.js';
import {
  SUPER_ADMIN_ROLE,
  PERMISSIONS,
  normalizeGrantList,
  normalizeRoleCodeList,
  normalizeRoleLabel,
  type PermissionCode,
  type PermissionGrant,
} from '../../identity/domain/staffPermissions.js';
import {
  accountRoleCodes,
  assignAccountRoles,
  assignAccountRolesDelegated,
  assignableRolesForAccount,
  type DelegatedAssignError,
  createStaffRole,
  deleteStaffRole,
  grantablePermissionCodes,
  listStaffRoles,
  resolveAccountAccess,
  roleLabels,
  updateStaffRole,
  type RoleWriteError,
  type StaffRole,
} from '../../identity/application/staffRoles.js';
import { findUserById } from '../../identity/application/users.js';
import { recordAdminActivityBestEffort } from '../../activity/application/recordAdminActivity.js';
import { activityChangeDetail } from '../../activity/application/changeDetail.js';

/** The domain catalogue and the published contract must name the same codes:
 * each assignment below fails to compile if one side gains a code. */
const CATALOGUE: readonly AdminPermissionCode[] = PERMISSIONS;
type ContractCodesAreKnown = AdminPermissionCode extends PermissionCode ? true : never;
const contractCodesAreKnown: ContractCodesAreKnown = true;
void CATALOGUE;
void contractCodesAreKnown;

export const adminRolesRouter = Router();

const ROLE_ERROR_STATUS: Record<RoleWriteError, number> = {
  not_found: 404,
  invalid_label: 400,
  invalid_parent: 400,
  invalid_assignable: 400,
  invalid_targetable: 400,
  system_role: 409,
  role_exists: 409,
  role_cycle: 409,
};

function sendRoleError(res: Response, error: RoleWriteError): void {
  res.status(ROLE_ERROR_STATUS[error]).json({ success: false, error: { code: error } });
}

function toAdminRole(role: StaffRole): AdminRole {
  return { ...role };
}

/** Readable, stable form of a grant set for the journal. */
function journalGrants(grants: readonly PermissionGrant[]): string[] {
  return grants.map(
    (grant) => `${grant.permission}:${grant.granted ? 'on' : 'off'}${grant.dominant ? ':dominant' : ''}`,
  );
}

function roleSnapshot(role: StaffRole) {
  return {
    label: role.label,
    grants: journalGrants(role.grants),
    parents: role.parents,
    assignable: role.assignable,
    assignableDominant: role.assignableDominant,
    targetable: role.targetable,
    targetableDominant: role.targetableDominant,
  };
}

type RoleBody = {
  label?: unknown;
  grants?: unknown;
  parents?: unknown;
  assignable?: unknown;
  assignableDominant?: unknown;
  targetable?: unknown;
  targetableDominant?: unknown;
};

/** A role list with its dominance flag; undefined when both are absent,
 * null when malformed or when one travels without the other (ambiguous). */
function parseRoleList(rolesValue: unknown, dominant: unknown) {
  if (rolesValue === undefined && dominant === undefined) return undefined;
  const roles = normalizeRoleCodeList(rolesValue);
  if (!roles || typeof dominant !== 'boolean') return null;
  return { roles, dominant };
}

/** Optional `grants`, `parents`, `assignable` (+ `assignableDominant`) and
 * `targetable` (+ `targetableDominant`) of a create/update body; null when
 * one is present and malformed. */
function parseRoleBody(body: RoleBody) {
  const grants = body.grants === undefined ? undefined : normalizeGrantList(body.grants);
  const parents = body.parents === undefined ? undefined : normalizeRoleCodeList(body.parents);
  const assignable = parseRoleList(body.assignable, body.assignableDominant);
  const targetable = parseRoleList(body.targetable, body.targetableDominant);
  if (grants === null || parents === null || assignable === null || targetable === null) return null;
  return { grants, parents, assignable, targetable };
}

/** What the signed-in staff account may open: drives the admin navigation. */
adminRolesRouter.get('/access', requireAuth, requireStaff, async (req, res) => {
  // Runs on every admin page load: labels only, and one access resolution.
  const [{ permissions, delegation: assignable }, roles, held] = await Promise.all([
    resolveAccountAccess(pool, req.user!),
    roleLabels(pool),
    accountRoleCodes(pool, req.user!.id),
  ]);
  const ref = ({ code, label }: { code: string; label: string }) => ({ code, label });
  const access: AdminAccess = {
    roles: roles.filter((role) => held.includes(role.code)).map(ref),
    manageRoles: req.user!.role === SUPER_ADMIN_ROLE,
    permissions,
    assignableRoles: roles
      .filter((role) => role.code !== 'user' && (assignable.all || assignable.roles.includes(role.code)))
      .map(ref),
    targetableRoles: assignable.all ? { all: true, roles: [] } : { all: false, roles: assignable.targetable },
  };
  res.json({ success: true, access });
});

adminRolesRouter.get('/roles', requireAuth, requireAdmin, async (_req, res) => {
  const [roles, permissions] = await Promise.all([listStaffRoles(pool), grantablePermissionCodes(pool)]);
  res.json({ success: true, roles: roles.map(toAdminRole), permissions });
});

adminRolesRouter.post('/roles', requireAuth, requireAdmin, async (req, res) => {
  const body = (req.body ?? {}) as RoleBody;
  const label = normalizeRoleLabel(body.label);
  const parsed = parseRoleBody(body);
  if (!label || !parsed) {
    return void res.status(400).json({ success: false, error: { code: 'invalid_request' } });
  }
  const result = await createStaffRole(pool, label, {
    grants: parsed.grants ?? [],
    parents: parsed.parents ?? [],
    assignable: parsed.assignable ?? { roles: [], dominant: false },
    targetable: parsed.targetable ?? { roles: [], dominant: false },
  });
  if (!result.ok) return sendRoleError(res, result.error);
  await recordAdminActivityBestEffort(pool, req.user!, {
    category: 'settings',
    action: 'roles.create',
    summary: `Creation du role ${result.role.label}`,
    targetType: 'role',
    targetId: result.role.code,
    detail: { code: result.role.code, ...roleSnapshot(result.role) },
  });
  res.status(201).json({ success: true, role: toAdminRole(result.role) });
});

adminRolesRouter.patch('/roles/:code', requireAuth, requireAdmin, async (req, res) => {
  const body = (req.body ?? {}) as RoleBody;
  const label = body.label === undefined ? undefined : normalizeRoleLabel(body.label);
  const parsed = parseRoleBody(body);
  if (
    label === null ||
    !parsed ||
    (label === undefined &&
      parsed.grants === undefined &&
      parsed.parents === undefined &&
      parsed.assignable === undefined &&
      parsed.targetable === undefined)
  ) {
    return void res.status(400).json({ success: false, error: { code: 'invalid_request' } });
  }
  const result = await updateStaffRole(pool, String(req.params.code), {
    ...(label !== undefined ? { label } : {}),
    ...(parsed.grants !== undefined ? { grants: parsed.grants } : {}),
    ...(parsed.parents !== undefined ? { parents: parsed.parents } : {}),
    ...(parsed.assignable !== undefined ? { assignable: parsed.assignable } : {}),
    ...(parsed.targetable !== undefined ? { targetable: parsed.targetable } : {}),
  });
  if (!result.ok) return sendRoleError(res, result.error);
  const { before, after } = result;
  const { changes, detail } = activityChangeDetail({ code: after.code }, roleSnapshot(before), roleSnapshot(after), {
    label: 'Nom',
    grants: 'Permissions',
    parents: 'Herite de',
    assignable: 'Roles attribuables',
    assignableDominant: 'Liste attribuable dominante',
    targetable: 'Comptes modifiables',
    targetableDominant: 'Liste modifiable dominante',
  });
  if (changes.length > 0) {
    await recordAdminActivityBestEffort(pool, req.user!, {
      category: 'settings',
      action: 'roles.update',
      summary: `Modification du role ${after.label}`,
      targetType: 'role',
      targetId: after.code,
      detail,
    });
  }
  res.json({ success: true, role: toAdminRole(after) });
});

adminRolesRouter.delete('/roles/:code', requireAuth, requireAdmin, async (req, res) => {
  const result = await deleteStaffRole(pool, String(req.params.code));
  if (!result.ok) return sendRoleError(res, result.error);
  await recordAdminActivityBestEffort(pool, req.user!, {
    category: 'settings',
    action: 'roles.delete',
    summary: `Suppression du role ${result.role.label} (${result.accountIds.length} compte(s), ${result.childRoles.length} role(s) heritier(s))`,
    targetType: 'role',
    targetId: result.role.code,
    targets: result.accountIds,
    detail: {
      code: result.role.code,
      ...roleSnapshot(result.role),
      removedFromAccounts: result.accountIds.length,
      removedFromRoles: result.childRoles,
    },
  });
  res.json({
    success: true,
    removedFromAccounts: result.accountIds.length,
    removedFromRoles: result.childRoles,
  });
});

const DELEGATED_ERROR_STATUS: Record<DelegatedAssignError, number> = {
  not_found: 404,
  invalid_request: 400,
  protected_account: 403,
  account_not_targetable: 403,
  role_not_assignable: 403,
};

/** Replaces an account's staff roles. A super-admin may set any roles,
 * super-admin included. Any other staff account needs non-empty resolved
 * assignable and targetable lists, and may only add or remove roles from its
 * assignable list, never on an account holding super-admin
 * (assignAccountRolesDelegated).
 * The account must also be targetable: every role it holds is in the
 * caller's resolved targetable list (`user` listed when it holds none).
 * Nobody changes their own roles, so the acting super-admin always remains
 * one. Role creation and editing stay super-admin only (`/roles`). */
adminRolesRouter.put('/users/:id/roles', requireAuth, requireStaff, async (req, res) => {
  const codes = normalizeRoleCodeList((req.body as { roles?: unknown } | undefined)?.roles);
  if (!codes || codes.includes('user')) {
    return void res.status(400).json({ success: false, error: { code: 'invalid_request' } });
  }
  const user = await findUserById(pool, String(req.params.id ?? ''));
  if (!user || user.status === 'deleted') {
    return void res.status(404).json({ success: false, error: { code: 'not_found' } });
  }
  if (user.id === req.user!.id) {
    return void res.status(409).json({ success: false, error: { code: 'own_role' } });
  }
  const assignable = await assignableRolesForAccount(pool, req.user!);
  let result: { before: string[]; after: string[] };
  if (assignable.all) {
    const assigned = await assignAccountRoles(pool, user.id, codes);
    if (!assigned) return void res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    result = assigned;
  } else {
    if (assignable.roles.length === 0) {
      return void res.status(403).json({ success: false, error: { code: 'forbidden' } });
    }
    const delegated = await assignAccountRolesDelegated(
      pool,
      user.id,
      codes,
      assignable.roles,
      assignable.targetable,
    );
    if (!delegated.ok) {
      return void res
        .status(DELEGATED_ERROR_STATUS[delegated.error])
        .json({ success: false, error: { code: delegated.error } });
    }
    result = delegated;
  }
  const roles = (await roleLabels(pool)).filter((role) => result.after.includes(role.code));
  const { changes, detail } = activityChangeDetail(
    { email: user.email },
    { roles: result.before },
    { roles: result.after },
    { roles: 'Roles' },
  );
  if (changes.length > 0) {
    await recordAdminActivityBestEffort(pool, req.user!, {
      category: 'accounts',
      action: 'accounts.set_roles',
      summary: `Roles de ${user.email} : ${roles.map((role) => role.label).join(', ') || 'client'}`,
      targetType: 'user',
      targetId: user.id,
      detail,
    });
  }
  res.json({
    success: true,
    user: {
      id: user.id,
      role: result.after.includes(SUPER_ADMIN_ROLE) ? SUPER_ADMIN_ROLE : (result.after[0] ?? 'user'),
      roles: roles.map(({ code, label }) => ({ code, label })),
    },
  });
});
