import type pg from 'pg';
import type { Rows } from '../../../db/rows.js';

export type RoleAccountRow = Pick<Rows['users'], 'id' | 'email' | 'first_name' | 'last_name' | 'role'> & {
  roles: { code: string; label: string }[];
};

/** Accounts whose roles the caller may change, newest first. `all` (a
 * super-admin) lifts the hierarchy filter; otherwise an account qualifies
 * when it holds no staff role and `user` is targetable, or when every role it
 * holds is targetable, and never when it is a super-admin. `emailLookup`
 * narrows to an exact e-mail (HMAC); without it the newest `limit` accounts
 * come back for the caller to filter. Deleted accounts never appear. */
export async function selectRoleAccounts(
  db: pg.Pool,
  filter: { all: boolean; targetable: readonly string[]; emailLookup: string | null; limit: number },
): Promise<RoleAccountRow[]> {
  const { rows } = await db.query<RoleAccountRow>(
    `select u.id, u.email, u.first_name, u.last_name, u.role,
            coalesce(
              (select json_agg(json_build_object('code', r.code, 'label', r.label) order by r.created_at)
                 from user_roles ur join roles r on r.code = ur.role_code where ur.user_id = u.id),
              '[]'::json
            ) as roles
       from users u
      where u.status <> 'deleted'
        and ($1::text is null or u.email_lookup = $1)
        and ($2::boolean or (
              u.role <> 'super-admin'
              and case
                    when exists (select 1 from user_roles x where x.user_id = u.id)
                      then not exists (select 1 from user_roles x
                                        where x.user_id = u.id and not (x.role_code = any($3::text[])))
                    else 'user' = any($3::text[])
                  end))
      order by u.created_at desc, u.id
      limit $4`,
    [filter.emailLookup, filter.all, filter.targetable, filter.limit],
  );
  return rows;
}
