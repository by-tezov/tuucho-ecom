/**
 * Generated from the API contract. Do not edit here.
 *
 * Source of truth: kernel/back `src/contract/admin/roles.ts`.
 * Regenerate the front copy with `npm run sync:contract` in kernel/back.
 */

/** Administration sections a staff role can be granted. `super-admin` holds them
 * all; `user` (customer) holds none. */
export type AdminPermissionCode = string;

/** One grant of a role: on or off, and dominant or not. Absent means off and
 * not dominant. Across an account's roles and everything they inherit, a
 * dominant "off" wins over everything; otherwise any "on" wins. */
export interface AdminPermissionGrant {
  permission: AdminPermissionCode;
  granted: boolean;
  dominant: boolean;
}

export interface AdminRoleRef {
  code: string;
  label: string;
}

export interface AdminRole {
  code: string;
  label: string;
  /** `user` and `super-admin`: never edited or deleted. */
  system: boolean;
  /** The role's own grants (only those on, or dominant). */
  grants: AdminPermissionGrant[];
  /** Roles it inherits from directly. */
  parents: string[];
  /** Effective result: own grants merged with every ancestor's. Every code
   * for `super-admin`, none for `user`. */
  permissions: AdminPermissionCode[];
  /** Roles this role's holders may give or take away (its own list). */
  assignable: string[];
  /** Whether that list is dominant (narrows the merged result). */
  assignableDominant: boolean;
  /** Assignable roles once its ancestors' lists are merged in (union, then
   * narrowed to every dominant list). Meaningful only with `assign_roles`. */
  assignableResolved: string[];
  /** Roles whose holders this role's holders may edit (`user` = accounts with
   * no staff role); never `super-admin`. */
  targetable: string[];
  targetableDominant: boolean;
  /** Targetable roles once its ancestors' lists are merged in. An account is
   * editable when every role it holds is in it (`user` when it holds none). */
  targetableResolved: string[];
  /** Accounts holding the role (for `user`: accounts holding no staff role). */
  userCount: number;
  createdAt: string;
  updatedAt: string;
}

/** What the signed-in staff account may open, from `GET /admin/access`. */
export interface AdminAccess {
  /** The account's own staff roles. */
  roles: AdminRoleRef[];
  /** True only when the account holds `super-admin`: role creation and
   * editing, and assigning any role (super-admin included). */
  manageRoles: boolean;
  /** Roles this account may give or take away on other accounts: every role
   * for a super-admin; with `assign_roles`, the resolved assignable list
   * (never `super-admin`); otherwise none. */
  assignableRoles: AdminRoleRef[];
  /** Accounts this account may edit: every one for a super-admin (`all`),
   * else those whose roles are all in `roles` (`user` = no staff role). */
  targetableRoles: { all: boolean; roles: string[] };
  /** Effective permissions across all its roles and their ancestors. */
  permissions: AdminPermissionCode[];
}

/** One account of the Roles page search (`GET /admin/role-accounts`): only
 * accounts whose roles the caller may change. */
export interface AdminRoleAccount {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  /** `users.role` summary: `super-admin`, else the first staff role, else `user`. */
  role: string;
  roles: AdminRoleRef[];
}
