/** Staff roles, their permission grants, and the signed-in staff access. */
import { authHeaders, requestJson as request } from '../client';

/** Payload shapes come from the backend contract (`npm run sync:contract`
 * in pamsurin-back). Do not redeclare them here. */
import type {
  AdminAccess,
  AdminPermissionCode,
  AdminPermissionGrant,
  AdminRole,
  AdminRoleAccount,
  AdminRoleRef,
} from '../contract/admin/roles';

export type {
  AdminAccess,
  AdminPermissionCode,
  AdminPermissionGrant,
  AdminRole,
  AdminRoleAccount,
  AdminRoleRef,
};

/** Body of a role create/update: own grants and the roles it inherits from. */
export interface AdminRoleWrite {
  label: string;
  grants: AdminPermissionGrant[];
  parents: string[];
  /** Roles its holders may assign, with the list's dominance (sent together). */
  assignable: string[];
  assignableDominant: boolean;
  /** Roles whose holders its holders may edit (`user` = customers), with
   * the list's dominance (sent together). */
  targetable: string[];
  targetableDominant: boolean;
}

export function getAdminAccess(accessToken: string): Promise<{ success: true; access: AdminAccess }> {
  return request('/admin/access', { headers: authHeaders(accessToken) });
}

export function listAdminRoles(
  accessToken: string,
): Promise<{ success: true; roles: AdminRole[]; permissions: AdminPermissionCode[] }> {
  return request('/admin/roles', { headers: authHeaders(accessToken) });
}

export function createAdminRole(
  accessToken: string,
  input: AdminRoleWrite,
): Promise<{ success: true; role: AdminRole }> {
  return request('/admin/roles', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });
}

export function updateAdminRole(
  accessToken: string,
  code: string,
  patch: Partial<AdminRoleWrite>,
): Promise<{ success: true; role: AdminRole }> {
  return request(`/admin/roles/${encodeURIComponent(code)}`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify(patch),
  });
}

export function deleteAdminRole(accessToken: string, code: string): Promise<{ success: true }> {
  return request(`/admin/roles/${encodeURIComponent(code)}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
}

/** Replaces the account's whole set of staff roles (`[]` = customer). */
export function setAdminUserRoles(
  accessToken: string,
  userId: string,
  roles: string[],
): Promise<{ success: true; user: { id: string; role: string; roles: AdminRoleRef[] } }> {
  return request(`/admin/users/${encodeURIComponent(userId)}/roles`, {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ roles }),
  });
}

/** Accounts whose roles the signed-in account may change, by exact e-mail or
 * `*` glob (Roles page, "Rôles des comptes"). At most 15, with the match count. */
export function searchRoleAccounts(
  accessToken: string,
  query: string,
): Promise<{ success: true; accounts: AdminRoleAccount[]; total: number }> {
  return request(`/admin/role-accounts?${new URLSearchParams({ q: query })}`, {
    headers: authHeaders(accessToken),
  });
}
