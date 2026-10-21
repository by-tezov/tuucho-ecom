import { pool } from '../../../db/pool.js';
import { CUSTOMER_ROLE } from '../domain/staffPermissions.js';
import { emailsByUserIds, findUserByEmailLower } from './users.js';
import { selectAccountRoleCodes } from '../infrastructure/rolesStore.js';

export { CUSTOMER_ROLE };

const ACTIVE = 'active';

/** Staff (non-customer) emails for the given role codes. Role `user` is ignored. */
export async function staffEmailsMatchingRoles(roles: readonly string[]): Promise<string[]> {
  const staffRoles = [...new Set(roles.map((role) => role.trim()).filter((role) => role && role !== CUSTOMER_ROLE))];
  if (staffRoles.length === 0) return [];
  const { rows } = await pool.query<{ id: string }>(
    `select distinct u.id
       from users u
       join user_roles ur on ur.user_id = u.id
      where ur.role_code = any($1::text[])
        and u.status = $2`,
    [staffRoles, ACTIVE],
  );
  const emails = await emailsByUserIds(
    pool,
    rows.map((row) => row.id),
  );
  return [...emails.values()];
}

/** The account's current email when it exists, is unlocked, and is staff. */
export async function staffEmailIfUnlocked(email: string): Promise<string | undefined> {
  const trimmed = email.trim();
  if (!trimmed) return undefined;
  const user = await findUserByEmailLower(pool, trimmed);
  if (!user || user.status !== ACTIVE) return undefined;
  const roles = await selectAccountRoleCodes(pool, user.id);
  if (roles.length === 0) return undefined;
  return user.email;
}
