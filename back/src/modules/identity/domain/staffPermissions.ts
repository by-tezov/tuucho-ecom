/** Staff roles and the administration sections they may open.
 *
 * `super-admin` holds every permission implicitly and `user` (a customer) holds
 * none: neither is stored in `role_permissions`, and neither can be edited or
 * deleted. Any other role is a staff role whose grants live in
 * `role_permissions`. The codes below mirror the `permissions` vocabulary
 * table; adding one means a migration row and a label in the admin copy. */

/** The highest role: every permission, and the only one that manages roles
 * and assigns them (other super-admins included, never itself). */
export const SUPER_ADMIN_ROLE = 'super-admin';
const CUSTOMER_ROLE = 'user';

const SYSTEM_ROLES: readonly string[] = [CUSTOMER_ROLE, SUPER_ADMIN_ROLE];

/** Kernel sections. Plugin-owned codes live on plugin manifests and join
 * the grantable catalogue only while that plugin (and its dependsOn
 * parents) is on. */
export const CORE_PERMISSIONS = [
  'stats',
  'orders',
  'messages',
  'users',
  'impersonate',
  'library_stock',
  'accessory_stock',
  'user_library_stock',
  'nail_availability',
  'catalogue_edit',
  'preferences',
  'activity',
] as const;

export const PERMISSIONS = [
  ...CORE_PERMISSIONS,
  'product_requests',
  'loyalty',
  'gift',
  'reviews',
  'cart_rules',
  'vouchers',
  'cron_logs',
  'api_log',
  'email_log',
] as const;

export type PermissionCode = (typeof PERMISSIONS)[number];

const ROLE_LABEL_MIN = 2;
const ROLE_LABEL_MAX = 60;
const ROLE_CODE_MAX = 40;

function isPermissionCode(value: unknown): value is PermissionCode {
  return typeof value === 'string' && (PERMISSIONS as readonly string[]).includes(value);
}

export function isSystemRole(role: string): boolean {
  return SYSTEM_ROLES.includes(role);
}

/** Any role other than the customer role opens the administration area. */
export function isStaffRole(role: string): boolean {
  return role !== CUSTOMER_ROLE;
}

/** One stored grant: on or off, and dominant or not. A grant that is off and
 * not dominant is the same as no grant at all. */
export type PermissionGrant = { permission: PermissionCode; granted: boolean; dominant: boolean };

/** Merges every grant reachable from a set of roles (the account's roles and
 * all their ancestors) into the permissions it effectively holds:
 * - a dominant "off" anywhere wins over everything, dominant "on" included;
 * - otherwise any "on" (dominant or not) wins over a non-dominant "off";
 * - with no grant at all, the permission is off.
 * `super-admin` in the set holds every permission; an empty set (customer) none. */
export function resolvePermissions(
  roles: readonly string[],
  grants: readonly { permission: string; granted: boolean; dominant: boolean }[],
  catalogue: readonly PermissionCode[] = PERMISSIONS,
): PermissionCode[] {
  if (roles.includes(SUPER_ADMIN_ROLE)) return [...catalogue];
  return catalogue.filter((code) => {
    const forCode = grants.filter((grant) => grant.permission === code);
    if (forCode.some((grant) => grant.dominant && !grant.granted)) return false;
    return forCode.some((grant) => grant.granted);
  });
}

/** True when the resolved set holds at least one of `required`. */
export function permissionsAllow(held: readonly string[], required: readonly PermissionCode[]): boolean {
  return required.some((code) => held.includes(code));
}

/** Trimmed, single-spaced display name, or null when out of bounds. */
export function normalizeRoleLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const label = value.replace(/\s+/g, ' ').trim();
  if (label.length < ROLE_LABEL_MIN || label.length > ROLE_LABEL_MAX) return null;
  return label;
}

/** Stable natural key derived from the display name: lower-case ASCII,
 * words joined by `_`. Null when nothing usable remains. */
export function roleCodeFromLabel(label: string): string | null {
  const code = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, ROLE_CODE_MAX)
    .replace(/_+$/g, '');
  return /^[a-z][a-z0-9_]{1,}$/.test(code) ? code : null;
}

/** Validated grant list in catalogue order, keeping only what differs from
 * "no grant" (on, or dominant). Null when an entry is malformed, names an
 * unknown permission, or repeats one. */
export function normalizeGrantList(value: unknown): PermissionGrant[] | null {
  if (!Array.isArray(value) || value.length > PERMISSIONS.length) return null;
  const byCode = new Map<PermissionCode, PermissionGrant>();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return null;
    const { permission, granted, dominant } = entry as Record<string, unknown>;
    if (!isPermissionCode(permission) || typeof granted !== 'boolean') return null;
    if (dominant !== undefined && typeof dominant !== 'boolean') return null;
    if (byCode.has(permission)) return null;
    byCode.set(permission, { permission, granted, dominant: dominant === true });
  }
  return PERMISSIONS.flatMap((code) => {
    const grant = byCode.get(code);
    return grant && (grant.granted || grant.dominant) ? [grant] : [];
  });
}

const ROLE_CODE_PATTERN = /^[a-z][a-z0-9_-]{1,63}$/;
const ROLE_LIST_MAX = 50;

/** De-duplicated list of well-formed role codes; null when malformed. */
export function normalizeRoleCodeList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > ROLE_LIST_MAX) return null;
  if (!value.every((code) => typeof code === 'string' && ROLE_CODE_PATTERN.test(code))) return null;
  return [...new Set(value as string[])];
}

/** True when giving `role` the parents `parents` would close a loop, i.e.
 * `role` is already an ancestor of one of them. `parentsOf` is the current
 * inheritance graph (role -> its parents). */
export function createsInheritanceCycle(
  role: string,
  parents: readonly string[],
  parentsOf: ReadonlyMap<string, readonly string[]>,
): boolean {
  const seen = new Set<string>();
  const stack = [...parents];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === role) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(parentsOf.get(current) ?? []));
  }
  return false;
}

/** Every ancestor of `roles` (the roles themselves included). */
export function withAncestors(roles: readonly string[], parentsOf: ReadonlyMap<string, readonly string[]>): string[] {
  const seen = new Set<string>();
  const stack = [...roles];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(parentsOf.get(current) ?? []));
  }
  return [...seen];
}

/** The `users.role` summary of a role set, kept for code that reads a single
 * role: `super-admin` when held, else the first staff role in `ordered`, else
 * `user` (customer). */
export function primaryRole(roles: readonly string[], ordered: readonly string[]): string {
  if (roles.includes(SUPER_ADMIN_ROLE)) return SUPER_ADMIN_ROLE;
  return ordered.find((code) => roles.includes(code)) ?? CUSTOMER_ROLE;
}

/** One role's list of assignable roles, as it contributes to an account. */
export type AssignableList = { roles: readonly string[]; dominant: boolean };

/** Union of every list, narrowed to each dominant list (the shared merge of
 * assignable and targetable lists across an account's roles and ancestors). */
function mergeRoleLists(lists: readonly AssignableList[]): string[] {
  const union = [...new Set(lists.flatMap((list) => list.roles))];
  return union.filter((code) => lists.every((list) => !list.dominant || list.roles.includes(code)));
}

/** The roles an account may give or take away, from every list reachable
 * through its roles and their ancestors: the union of all lists, narrowed to
 * each dominant list. `{a,b}`+`{b,c}` gives a,b,c; `{a,b}` dominant +
 * `{b,c}` gives a,b; an empty dominant list gives nothing; `{a,b}` and
 * `{b,c}` both dominant give b. Never the super-admin or customer role. */
export function resolveAssignable(lists: readonly AssignableList[]): string[] {
  return mergeRoleLists(lists).filter((code) => !isSystemRole(code));
}

/** The roles an account's holders must be limited to for it to change their
 * roles, merged like resolveAssignable. `user` stands for an account holding
 * no staff role (a customer); `super-admin` is never targetable. */
export function resolveTargetable(lists: readonly AssignableList[]): string[] {
  return mergeRoleLists(lists).filter((code) => code !== SUPER_ADMIN_ROLE);
}

/** Whether an account holding `held` may have its roles changed by someone
 * whose resolved targetable list is `targetable`: every role it holds must be
 * listed, and an account holding none needs `user` (customer) listed. */
export function canTargetAccount(held: readonly string[], targetable: readonly string[]): boolean {
  if (held.length === 0) return targetable.includes(CUSTOMER_ROLE);
  return held.every((code) => code !== SUPER_ADMIN_ROLE && targetable.includes(code));
}

/** The roles changed between two role sets (added or removed). */
export function changedRoles(before: readonly string[], after: readonly string[]): string[] {
  return [
    ...after.filter((code) => !before.includes(code)),
    ...before.filter((code) => !after.includes(code)),
  ];
}
