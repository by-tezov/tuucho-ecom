import type pg from 'pg';
import { withTransaction } from '../../../platform/db/transaction.js';
import {
  SUPER_ADMIN_ROLE,
  createsInheritanceCycle,
  isSystemRole,
  permissionsAllow,
  primaryRole,
  resolveAssignable,
  resolveTargetable,
  canTargetAccount,
  changedRoles,
  CORE_PERMISSIONS,
  PERMISSIONS,
  resolvePermissions,
  roleCodeFromLabel,
  withAncestors,
  type PermissionCode,
  type PermissionGrant,
} from '../domain/staffPermissions.js';
import { enabledPluginPermissionCodes } from '../../plugins/application/pluginStore.js';
import {
  deleteRoleEverywhere,
  insertRole,
  lockRoleGraph,
  replaceAccountRoles,
  replaceRoleAssignable,
  replaceRoleTargetable,
  replaceRoleGrants,
  replaceRoleParents,
  roleExists,
  selectAccountGrants,
  selectAccountRoleCodes,
  selectParentsGraph,
  selectRoleLabels,
  selectRoles,
  selectStaffRoleCodes,
  updateRoleLabel,
  type RoleRecord,
} from '../infrastructure/rolesStore.js';

export type StaffRole = {
  code: string;
  label: string;
  system: boolean;
  /** The role's own grants (on, or dominant), not what it inherits. */
  grants: PermissionGrant[];
  /** Roles it inherits from directly. */
  parents: string[];
  /** Effective permissions: its own grants merged with every ancestor's. */
  permissions: PermissionCode[];
  assignable: string[];
  assignableDominant: boolean;
  /** Its assignable list merged with every ancestor's (resolveAssignable). */
  assignableResolved: string[];
  /** Roles whose holders this role's holders may edit; `user` = customers. */
  targetable: string[];
  targetableDominant: boolean;
  /** Its targetable list merged with every ancestor's (resolveTargetable). */
  targetableResolved: string[];
  userCount: number;
  createdAt: string;
  updatedAt: string;
};

export type RoleWriteError =
  | 'not_found'
  | 'system_role'
  | 'role_exists'
  | 'invalid_label'
  | 'invalid_parent'
  | 'invalid_assignable'
  | 'invalid_targetable'
  | 'role_cycle';

export async function grantablePermissionCodes(db: pg.Pool | pg.PoolClient): Promise<PermissionCode[]> {
  const extra = await enabledPluginPermissionCodes(db);
  const known = new Set<string>(CORE_PERMISSIONS);
  const out: PermissionCode[] = [...CORE_PERMISSIONS];
  for (const code of extra) {
    if (known.has(code)) continue;
    if (!(PERMISSIONS as readonly string[]).includes(code)) continue;
    known.add(code);
    out.push(code as PermissionCode);
  }
  return out;
}

type RoleWrite = {
  label?: string;
  grants?: readonly PermissionGrant[];
  parents?: readonly string[];
  assignable?: { roles: readonly string[]; dominant: boolean };
  targetable?: { roles: readonly string[]; dominant: boolean };
};

async function toStaffRoles(db: pg.Pool | pg.PoolClient, records: RoleRecord[]): Promise<StaffRole[]> {
  const graph = await selectParentsGraph(db);
  const catalogue = await grantablePermissionCodes(db);
  const byCode = new Map(records.map((record) => [record.code, record]));
  return records.map((record) => {
    const lineage = withAncestors([record.code], graph);
    const inherited = lineage.flatMap((code) => byCode.get(code)?.grants ?? []);
    const entries = lineage.flatMap((code) => byCode.get(code) ?? []);
    const contributing = (list: { roles: string[]; dominant: boolean }) => list.dominant || list.roles.length > 0;
    const lists = entries.map((entry) => ({ roles: entry.assignable, dominant: entry.assignable_dominant }));
    const targetLists = entries.map((entry) => ({ roles: entry.targetable, dominant: entry.targetable_dominant }));
    return {
      code: record.code,
      label: record.label,
      system: record.system,
      grants: record.grants as PermissionGrant[],
      parents: record.parents,
      permissions: record.code === 'user' ? [] : resolvePermissions(lineage, inherited, catalogue),
      assignable: record.assignable,
      assignableDominant: record.assignable_dominant,
      assignableResolved: resolveAssignable(lists.filter(contributing)),
      targetable: record.targetable,
      targetableDominant: record.targetable_dominant,
      targetableResolved: resolveTargetable(targetLists.filter(contributing)),
      userCount: record.user_count,
      createdAt: new Date(record.created_at).toISOString(),
      updatedAt: new Date(record.updated_at).toISOString(),
    };
  });
}

export async function listStaffRoles(pool: pg.Pool): Promise<StaffRole[]> {
  return toStaffRoles(pool, await selectRoles(pool));
}

export async function findStaffRole(pool: pg.Pool, code: string): Promise<StaffRole | undefined> {
  return (await listStaffRoles(pool)).find((role) => role.code === code);
}

/** What an account may open right now: its staff roles, everything they
 * inherit, merged by the dominance rules. Read on every gated request, so a
 * change applies immediately. */
export async function permissionsForAccount(
  pool: pg.Pool,
  account: { id: string; role: string },
): Promise<PermissionCode[]> {
  // `users.role` is `super-admin` exactly when the account holds the super-admin role.
  const catalogue = await grantablePermissionCodes(pool);
  if (account.role === SUPER_ADMIN_ROLE) return resolvePermissions([SUPER_ADMIN_ROLE], [], catalogue);
  if (account.role === 'user') return [];
  const { roles, grants } = await selectAccountGrants(pool, account.id);
  return resolvePermissions(roles, grants, catalogue);
}

export type AccountDelegation =
  | { all: true }
  | { all: false; roles: string[]; targetable: string[] };

/** What an account may do on other accounts' roles. A super-admin: anything.
 * Any other role: give or take its resolved assignable roles (`roles`, never
 * super-admin) on accounts whose every role is in its resolved targetable
 * list (`targetable`, `user` = no role). Both lists must resolve to at least
 * one role; otherwise it may do nothing. */
export async function assignableRolesForAccount(
  pool: pg.Pool,
  account: { id: string; role: string },
): Promise<AccountDelegation> {
  return (await resolveAccountAccess(pool, account)).delegation;
}

/** Permissions and delegation of an account in one database round trip:
 * what `GET /admin/access` needs, and what role assignment checks. */
export async function resolveAccountAccess(
  pool: pg.Pool,
  account: { id: string; role: string },
): Promise<{ permissions: PermissionCode[]; delegation: AccountDelegation }> {
  const none = { all: false as const, roles: [], targetable: [] };
  const catalogue = await grantablePermissionCodes(pool);
  if (account.role === SUPER_ADMIN_ROLE) {
    return { permissions: resolvePermissions([SUPER_ADMIN_ROLE], [], catalogue), delegation: { all: true } };
  }
  if (account.role === 'user') return { permissions: [], delegation: none };
  const { roles, grants, assignable, targetable } = await selectAccountGrants(pool, account.id, true);
  const permissions = resolvePermissions(roles, grants, catalogue);
  const assignableRoles = resolveAssignable(assignable);
  const targetableRoles = resolveTargetable(targetable);
  // The two lists are the right itself: nothing to give, or no one to give it
  // to, means no role assignment at all.
  if (assignableRoles.length === 0 || targetableRoles.length === 0) return { permissions, delegation: none };
  return { permissions, delegation: { all: false, roles: assignableRoles, targetable: targetableRoles } };
}

/** Whether `actor` may act on another account (lock, unlock) under the same
 * hierarchy as role assignment: a super-admin always (super-admin targets are
 * guarded by the caller); anyone on a customer (no staff role); on a staff
 * account, only when every role it holds is in the actor's resolved
 * targetable list. */
export async function canActOnAccount(
  pool: pg.Pool,
  actor: { id: string; role: string },
  targetUserId: string,
): Promise<boolean> {
  if (actor.role === SUPER_ADMIN_ROLE) return true;
  const held = await selectAccountRoleCodes(pool, targetUserId);
  if (held.length === 0) return true;
  const { delegation } = await resolveAccountAccess(pool, actor);
  return !delegation.all && canTargetAccount(held, delegation.targetable);
}

/** Code and label of every role, for labelling only. */
export async function roleLabels(pool: pg.Pool): Promise<{ code: string; label: string }[]> {
  return selectRoleLabels(pool);
}

export async function accountHasPermission(
  pool: pg.Pool,
  account: { id: string; role: string },
  required: readonly PermissionCode[],
): Promise<boolean> {
  return permissionsAllow(await permissionsForAccount(pool, account), required);
}

export async function isKnownRole(pool: pg.Pool, code: string): Promise<boolean> {
  return roleExists(pool, code);
}

/** Assignable entries must be existing staff roles, never `user` or
 * `super-admin` (the database refuses those too). */
async function checkAssignable(client: pg.PoolClient, roles: readonly string[]): Promise<RoleWriteError | null> {
  if (roles.some(isSystemRole)) return 'invalid_assignable';
  const existing = await selectStaffRoleCodes(client, roles);
  return existing.length === roles.length ? null : 'invalid_assignable';
}

/** Targetable entries must be existing roles, never `super-admin` (the
 * database refuses it too); `user` stands for accounts with no staff role. */
async function checkTargetable(client: pg.PoolClient, roles: readonly string[]): Promise<RoleWriteError | null> {
  if (roles.includes(SUPER_ADMIN_ROLE)) return 'invalid_targetable';
  const staff = roles.filter((code) => code !== 'user');
  const existing = await selectStaffRoleCodes(client, staff);
  return existing.length === staff.length ? null : 'invalid_targetable';
}

/** Parents must be existing staff roles (never `user` or `super-admin`) and must not
 * make the role its own ancestor. Runs under the graph lock. */
async function checkParents(
  client: pg.PoolClient,
  code: string,
  parents: readonly string[],
): Promise<RoleWriteError | null> {
  if (parents.some(isSystemRole)) return 'invalid_parent';
  const existing = await selectStaffRoleCodes(client, parents);
  if (existing.length !== parents.length) return 'invalid_parent';
  if (createsInheritanceCycle(code, parents, await selectParentsGraph(client))) return 'role_cycle';
  return null;
}

export async function createStaffRole(
  pool: pg.Pool,
  label: string,
  write: {
    grants: readonly PermissionGrant[];
    parents: readonly string[];
    /** Default: no assignable role, not dominant. */
    assignable?: { roles: readonly string[]; dominant: boolean };
    /** Default: no targetable account, not dominant. */
    targetable?: { roles: readonly string[]; dominant: boolean };
  },
): Promise<{ ok: true; role: StaffRole } | { ok: false; error: RoleWriteError }> {
  const assignable = write.assignable ?? { roles: [], dominant: false };
  const targetable = write.targetable ?? { roles: [], dominant: false };
  const code = roleCodeFromLabel(label);
  if (!code) return { ok: false, error: 'invalid_label' };
  if (isSystemRole(code)) return { ok: false, error: 'role_exists' };
  const error = await withTransaction(pool, async (client): Promise<RoleWriteError | null> => {
    await lockRoleGraph(client);
    if (!(await insertRole(client, code, label))) return 'role_exists';
    const parentError = await checkParents(client, code, write.parents);
    if (parentError) throw new RoleRollback(parentError);
    const assignableError = await checkAssignable(client, assignable.roles);
    if (assignableError) throw new RoleRollback(assignableError);
    await replaceRoleGrants(client, code, write.grants);
    await replaceRoleParents(client, code, write.parents);
    await replaceRoleAssignable(client, code, assignable.roles, assignable.dominant);
    const targetableError = await checkTargetable(client, targetable.roles);
    if (targetableError) throw new RoleRollback(targetableError);
    await replaceRoleTargetable(client, code, targetable.roles, targetable.dominant);
    return null;
  }).catch((err: unknown) => {
    if (err instanceof RoleRollback) return err.code;
    throw err;
  });
  if (error) return { ok: false, error };
  const role = await findStaffRole(pool, code);
  return role ? { ok: true, role } : { ok: false, error: 'not_found' };
}

/** Thrown inside a transaction to roll it back with a business error. */
class RoleRollback extends Error {
  readonly code: RoleWriteError;
  constructor(code: RoleWriteError) {
    super(code);
    this.code = code;
  }
}

/** Renames a staff role and/or replaces its grants or parents. Returns the
 * state before and after so the caller can journal the exact difference. */
export async function updateStaffRole(
  pool: pg.Pool,
  code: string,
  write: RoleWrite,
): Promise<{ ok: true; before: StaffRole; after: StaffRole } | { ok: false; error: RoleWriteError }> {
  const before = await findStaffRole(pool, code);
  if (!before) return { ok: false, error: 'not_found' };
  if (before.system) return { ok: false, error: 'system_role' };
  const error = await withTransaction(pool, async (client): Promise<RoleWriteError | null> => {
    await lockRoleGraph(client);
    if (write.parents !== undefined) {
      const parentError = await checkParents(client, code, write.parents);
      if (parentError) return parentError;
      await replaceRoleParents(client, code, write.parents);
    }
    if (write.label !== undefined && write.label !== before.label) await updateRoleLabel(client, code, write.label);
    if (write.assignable !== undefined) {
      const assignableError = await checkAssignable(client, write.assignable.roles);
      if (assignableError) throw new RoleRollback(assignableError);
      await replaceRoleAssignable(client, code, write.assignable.roles, write.assignable.dominant);
    }
    if (write.targetable !== undefined) {
      const targetableError = await checkTargetable(client, write.targetable.roles);
      if (targetableError) throw new RoleRollback(targetableError);
      await replaceRoleTargetable(client, code, write.targetable.roles, write.targetable.dominant);
    }
    if (write.grants !== undefined) await replaceRoleGrants(client, code, write.grants);
    return null;
  }).catch((err: unknown) => {
    if (err instanceof RoleRollback) return err.code;
    throw err;
  });
  if (error) return { ok: false, error };
  const after = await findStaffRole(pool, code);
  return after ? { ok: true, before, after } : { ok: false, error: 'not_found' };
}

/** Deletes a staff role: it is first removed from every account holding it
 * and from every role inheriting from it, in one transaction. Returns what
 * was detached so the caller can journal it. */
export async function deleteStaffRole(
  pool: pg.Pool,
  code: string,
): Promise<
  { ok: true; role: StaffRole; accountIds: string[]; childRoles: string[] } | { ok: false; error: RoleWriteError }
> {
  const role = await findStaffRole(pool, code);
  if (!role) return { ok: false, error: 'not_found' };
  if (role.system) return { ok: false, error: 'system_role' };
  const detached = await withTransaction(pool, async (client) => {
    await lockRoleGraph(client);
    return deleteRoleEverywhere(client, code);
  });
  if (!detached) return { ok: false, error: 'not_found' };
  return { ok: true, role, ...detached };
}

export async function accountRoleCodes(pool: pg.Pool, userId: string): Promise<string[]> {
  return selectAccountRoleCodes(pool, userId);
}

export type DelegatedAssignError =
  | 'not_found'
  | 'invalid_request'
  | 'protected_account'
  | 'account_not_targetable'
  | 'role_not_assignable';

/** Role assignment by a staff account with a delegation (both its resolved
 * assignable and targetable lists non-empty, see resolveAccountAccess): the account
 * must be targetable (every role it holds in `targetable`, or `user` listed
 * when it holds none), only roles in `assignable` may be added or removed,
 * an account holding `super-admin` is never touched and `super-admin` never
 * granted. Checked and written in one transaction against the account's
 * current roles, so two concurrent edits cannot widen each other. */
export async function assignAccountRolesDelegated(
  pool: pg.Pool,
  userId: string,
  requested: readonly string[],
  assignable: readonly string[],
  targetable: readonly string[],
): Promise<{ ok: true; before: string[]; after: string[] } | { ok: false; error: DelegatedAssignError }> {
  try {
    return await withTransaction(pool, async (client) => {
      const known = await selectStaffRoleCodes(client, requested);
      if (known.length !== requested.length) throw new DelegatedRollback('invalid_request');
      const before = await selectAccountRoleCodes(client, userId, true);
      if (before.includes(SUPER_ADMIN_ROLE) || known.includes(SUPER_ADMIN_ROLE)) {
        throw new DelegatedRollback('protected_account');
      }
      if (!canTargetAccount(before, targetable)) throw new DelegatedRollback('account_not_targetable');
      if (!changedRoles(before, known).every((code) => assignable.includes(code))) {
        throw new DelegatedRollback('role_not_assignable');
      }
      if (!(await replaceAccountRoles(client, userId, known, primaryRole(known, known)))) {
        throw new DelegatedRollback('not_found');
      }
      return { ok: true as const, before, after: known };
    });
  } catch (error) {
    if (error instanceof DelegatedRollback) return { ok: false, error: error.code };
    if ((error as { code?: string }).code === '23503') return { ok: false, error: 'invalid_request' };
    throw error;
  }
}

class DelegatedRollback extends Error {
  readonly code: DelegatedAssignError;
  constructor(code: DelegatedAssignError) {
    super(code);
    this.code = code;
  }
}

/** Replaces an account's staff roles (empty = customer). Null when a code is
 * unknown or the account is gone; otherwise the roles before and after. */
export async function assignAccountRoles(
  pool: pg.Pool,
  userId: string,
  codes: readonly string[],
): Promise<{ before: string[]; after: string[] } | null> {
  try {
    return await withTransaction(pool, async (client) => {
      const known = await selectStaffRoleCodes(client, codes);
      if (known.length !== codes.length) throw new RoleRollback('invalid_parent');
      // Same row lock as the delegated path, so their reads never interleave.
      const before = await selectAccountRoleCodes(client, userId, true);
      if (!(await replaceAccountRoles(client, userId, known, primaryRole(known, known)))) {
        throw new RoleRollback('not_found');
      }
      return { before, after: known };
    });
  } catch (error) {
    // A role deleted concurrently fails the foreign key.
    if (error instanceof RoleRollback || (error as { code?: string }).code === '23503') return null;
    throw error;
  }
}

