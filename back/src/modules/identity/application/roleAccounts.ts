import type pg from 'pg';
import { decryptPii, emailLookupHash } from '../../../platform/security/piiCrypto.js';
import { selectRoleAccounts } from '../infrastructure/roleAccountsStore.js';
import type { AccountDelegation } from './staffRoles.js';
import type { AdminRoleAccount } from '../../../contract/admin/roles.js';

/** E-mail, name and roles of one account the caller may change. */
export type RoleAccount = AdminRoleAccount;

/** Newest accounts scanned for a `*` search. E-mails are encrypted at rest,
 * so a partial search decrypts this bounded window in memory (same approach
 * as the Users page); an exact e-mail uses the HMAC lookup over all accounts. */
const GLOB_WINDOW = 2000;

/** Accounts matching `query` (an exact e-mail, or a `*` glob such as
 * `*@gmail.com`) whose roles `delegation` may change: every account for a
 * super-admin, otherwise only targetable ones (never a super-admin). At most
 * `limit` are returned, with the full match count. */
export async function searchRoleAccounts(
  pool: pg.Pool,
  delegation: AccountDelegation,
  query: string,
  limit: number,
): Promise<{ accounts: RoleAccount[]; total: number }> {
  const needle = query.trim().toLowerCase();
  if (!needle) return { accounts: [], total: 0 };
  const glob = needle.includes('*');
  const rows = await selectRoleAccounts(pool, {
    all: delegation.all,
    targetable: delegation.all ? [] : delegation.targetable,
    emailLookup: glob ? null : emailLookupHash(needle),
    limit: glob ? GLOB_WINDOW : limit,
  });
  const pattern = glob
    ? new RegExp(
        `^${needle
          .split('*')
          .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('.*')}$`,
        'i',
      )
    : null;
  const matches = rows
    .map((row) => ({
      id: row.id,
      email: decryptPii(row.email) ?? '',
      firstName: decryptPii(row.first_name),
      lastName: decryptPii(row.last_name),
      role: row.role,
      roles: row.roles,
    }))
    .filter((account) => !pattern || pattern.test(account.email));
  return { accounts: matches.slice(0, limit), total: matches.length };
}
