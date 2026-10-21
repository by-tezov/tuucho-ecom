import type pg from 'pg';
import type { Rows } from '../../../db/rows.js';

type Db = pg.Pool | pg.PoolClient;

export type StoredGrant = { permission: string; granted: boolean; dominant: boolean };

export type RoleRecord = Pick<
  Rows['roles'],
  'code' | 'label' | 'system' | 'created_at' | 'updated_at' | 'assignable_dominant' | 'targetable_dominant'
> & {
  grants: StoredGrant[];
  parents: string[];
  /** Roles this role's holders may give or take away (role_assignable_roles). */
  assignable: string[];
  /** Roles an account must be limited to for this role's holders to change
   * its roles; `user` = an account with no staff role (role_targetable_roles). */
  targetable: string[];
  user_count: number;
};

export type StoredAssignableList = { roles: string[]; dominant: boolean };

/** Grants and parents travel as JSON/arrays so one row describes a role. The
 * account count is how many accounts hold the role; for `user` (customer) it
 * is the accounts holding no staff role at all. */
const ROLE_SELECT = `
  select r.code, r.label, r.system, r.created_at, r.updated_at, r.assignable_dominant, r.targetable_dominant,
         coalesce(
           (select array_agg(tr.target_code order by tr.target_code)
              from role_targetable_roles tr where tr.role_code = r.code),
           '{}'
         ) as targetable,
         coalesce(
           (select array_agg(a.assignable_code order by a.assignable_code)
              from role_assignable_roles a where a.role_code = r.code),
           '{}'
         ) as assignable,
         coalesce(
           (select json_agg(json_build_object(
                     'permission', rp.permission_code, 'granted', rp.granted, 'dominant', rp.dominant)
                   order by p.sort_order)
              from role_permissions rp
              join permissions p on p.code = rp.permission_code
             where rp.role_code = r.code),
           '[]'::json
         ) as grants,
         coalesce(
           (select array_agg(pa.parent_code order by pa.parent_code) from role_parents pa where pa.role_code = r.code),
           '{}'
         ) as parents,
         (case when r.code = 'user' then c.customers else coalesce(ur.holders, 0) end)::text as user_count
    from roles r
    left join (select role_code, count(*) as holders from user_roles group by role_code) ur on ur.role_code = r.code
    cross join (select count(*) as customers from users u
                 where not exists (select 1 from user_roles x where x.user_id = u.id)) c`;

function toRecord(row: RoleRecord & { user_count: string }): RoleRecord {
  return { ...row, user_count: Number(row.user_count) };
}

/** Every role (a handful of rows), system roles first. */
export async function selectRoles(db: Db): Promise<RoleRecord[]> {
  const { rows } = await db.query<RoleRecord & { user_count: string }>(
    `${ROLE_SELECT} order by r.system desc, r.created_at, r.code limit 200`,
  );
  return rows.map(toRecord);
}

/** Serializes role writes: inheritance edits read the whole graph to refuse a
 * loop, so two concurrent edits must not each pass that check alone. */
export async function lockRoleGraph(db: pg.PoolClient): Promise<void> {
  await db.query(`lock table role_parents in share row exclusive mode`);
}

/** The whole inheritance graph, role -> parents. Bounded by the role count. */
export async function selectParentsGraph(db: Db): Promise<Map<string, string[]>> {
  const { rows } = await db.query<Pick<Rows['role_parents'], 'role_code' | 'parent_code'>>(
    `select role_code, parent_code from role_parents`,
  );
  const graph = new Map<string, string[]>();
  for (const row of rows) graph.set(row.role_code, [...(graph.get(row.role_code) ?? []), row.parent_code]);
  return graph;
}

const ACCOUNT_GRANTS_SQL = `
  with recursive held(code) as (
    select role_code from user_roles where user_id = $1
    union
    select pa.parent_code from role_parents pa join held h on pa.role_code = h.code
  )
  select (select array_agg(code) from held) as roles,
         (select json_agg(json_build_object(
                   'permission', rp.permission_code, 'granted', rp.granted, 'dominant', rp.dominant))
            from role_permissions rp where rp.role_code in (select code from held)) as grants`;

const ACCOUNT_GRANTS_AND_DELEGATION_SQL = `
  with recursive held(code) as (
    select role_code from user_roles where user_id = $1
    union
    select pa.parent_code from role_parents pa join held h on pa.role_code = h.code
  )
  select (select array_agg(code) from held) as roles,
         (select json_agg(json_build_object(
                   'permission', rp.permission_code, 'granted', rp.granted, 'dominant', rp.dominant))
            from role_permissions rp where rp.role_code in (select code from held)) as grants,
         (select json_agg(json_build_object('roles', l.roles, 'dominant', l.dominant))
            from (select r.assignable_dominant as dominant,
                         coalesce((select array_agg(a.assignable_code) from role_assignable_roles a
                                    where a.role_code = r.code), '{}') as roles
                    from roles r where r.code in (select code from held)) l
           where l.dominant or cardinality(l.roles) > 0) as assignable,
         (select json_agg(json_build_object('roles', l.roles, 'dominant', l.dominant))
            from (select r.targetable_dominant as dominant,
                         coalesce((select array_agg(tr.target_code) from role_targetable_roles tr
                                    where tr.role_code = r.code), '{}') as roles
                    from roles r where r.code in (select code from held)) l
           where l.dominant or cardinality(l.roles) > 0) as targetable`;

/** An account's own staff roles, plus every role they inherit from, and the
 * grants of all of them, in one round trip; `union` (not `union all`) stops
 * on a loop. This runs on every gated `/admin` request, so the delegation
 * lists (assignable and targetable, only needed to change someone's roles)
 * are aggregated only when `withDelegation` asks for them. A role whose list
 * is empty and not dominant contributes nothing and is left out. */
export async function selectAccountGrants(
  db: Db,
  userId: string,
  withDelegation = false,
): Promise<{
  roles: string[];
  grants: StoredGrant[];
  assignable: StoredAssignableList[];
  targetable: StoredAssignableList[];
}> {
  const { rows } = await db.query<{
    roles: string[] | null;
    grants: StoredGrant[] | null;
    assignable?: StoredAssignableList[] | null;
    targetable?: StoredAssignableList[] | null;
  }>(withDelegation ? ACCOUNT_GRANTS_AND_DELEGATION_SQL : ACCOUNT_GRANTS_SQL, [userId]);
  return {
    roles: rows[0]?.roles ?? [],
    grants: rows[0]?.grants ?? [],
    assignable: rows[0]?.assignable ?? [],
    targetable: rows[0]?.targetable ?? [],
  };
}

/** Code and label of every role: the light read for labelling (`/admin/access`
 * runs on every admin page load), without the per-role counts and lists. */
export async function selectRoleLabels(db: Db): Promise<Pick<Rows['roles'], 'code' | 'label'>[]> {
  const { rows } = await db.query<Pick<Rows['roles'], 'code' | 'label'>>(
    `select code, label from roles order by system desc, created_at, code limit 200`,
  );
  return rows;
}

/** False when the code already exists. */
export async function insertRole(db: Db, code: string, label: string): Promise<boolean> {
  const { rowCount } = await db.query(
    `insert into roles (code, label, system) values ($1, $2, false) on conflict (code) do nothing`,
    [code, label],
  );
  return (rowCount ?? 0) > 0;
}

export async function updateRoleLabel(db: Db, code: string, label: string): Promise<void> {
  await db.query(`update roles set label = $2, updated_at = now() where code = $1 and system = false`, [
    code,
    label,
  ]);
}

/** Replaces the role's grants with exactly `grants`. */
export async function replaceRoleGrants(db: Db, code: string, grants: readonly StoredGrant[]): Promise<void> {
  await db.query(`delete from role_permissions where role_code = $1`, [code]);
  if (grants.length > 0) {
    await db.query(
      `insert into role_permissions (role_code, permission_code, granted, dominant)
       select $1, g.permission, g.granted, g.dominant
         from jsonb_to_recordset($2::jsonb) as g(permission text, granted boolean, dominant boolean)`,
      [code, JSON.stringify(grants)],
    );
  }
  await db.query(`update roles set updated_at = now() where code = $1`, [code]);
}

/** Replaces the list of roles `code`'s holders may assign, and its dominance. */
export async function replaceRoleAssignable(
  db: Db,
  code: string,
  assignable: readonly string[],
  dominant: boolean,
): Promise<void> {
  await db.query(`delete from role_assignable_roles where role_code = $1`, [code]);
  if (assignable.length > 0) {
    await db.query(
      `insert into role_assignable_roles (role_code, assignable_code) select $1, unnest($2::text[])`,
      [code, assignable],
    );
  }
  await db.query(`update roles set assignable_dominant = $2, updated_at = now() where code = $1`, [
    code,
    dominant,
  ]);
}

/** Replaces the list of roles whose holders `code`'s holders may edit, and
 * its dominance. */
export async function replaceRoleTargetable(
  db: Db,
  code: string,
  targetable: readonly string[],
  dominant: boolean,
): Promise<void> {
  await db.query(`delete from role_targetable_roles where role_code = $1`, [code]);
  if (targetable.length > 0) {
    await db.query(
      `insert into role_targetable_roles (role_code, target_code) select $1, unnest($2::text[])`,
      [code, targetable],
    );
  }
  await db.query(`update roles set targetable_dominant = $2, updated_at = now() where code = $1`, [
    code,
    dominant,
  ]);
}

/** Replaces the roles `code` inherits from. */
export async function replaceRoleParents(db: Db, code: string, parents: readonly string[]): Promise<void> {
  await db.query(`delete from role_parents where role_code = $1`, [code]);
  if (parents.length > 0) {
    await db.query(`insert into role_parents (role_code, parent_code) select $1, unnest($2::text[])`, [
      code,
      parents,
    ]);
  }
  await db.query(`update roles set updated_at = now() where code = $1`, [code]);
}

/** Deletes a staff role and detaches it everywhere: removed from every
 * account holding it (their `users.role` summary recomputed from the roles
 * they keep), and from every role inheriting from it. Run inside the role
 * graph lock. Returns the accounts and roles it was detached from, or null
 * when the role is gone or built in. */
export async function deleteRoleEverywhere(
  db: pg.PoolClient,
  code: string,
): Promise<{ accountIds: string[]; childRoles: string[] } | null> {
  const { rows: found } = await db.query(
    `select 1 from roles where code = $1 and system = false for update`,
    [code],
  );
  if (found.length === 0) return null;
  const { rows: children } = await db.query<Pick<Rows['role_parents'], 'role_code'>>(
    `delete from role_parents where parent_code = $1 returning role_code`,
    [code],
  );
  const { rows: holders } = await db.query<Pick<Rows['user_roles'], 'user_id'>>(
    `delete from user_roles where role_code = $1 returning user_id`,
    [code],
  );
  // Summary as in primaryRole: super-admin when held, else the first staff
  // role by creation order, else customer. `u.role = $1` also catches an
  // account whose summary names the role without a user_roles row.
  const { rows: summarized } = await db.query<Pick<Rows['users'], 'id'>>(
    `update users u set role = coalesce(
         (select x.role_code from user_roles x where x.user_id = u.id and x.role_code = 'super-admin'),
         (select x.role_code from user_roles x join roles r on r.code = x.role_code
           where x.user_id = u.id order by r.created_at, r.code limit 1),
         'user'),
       updated_at = now()
     where u.id = any($2::uuid[]) or u.role = $1
     returning u.id`,
    [code, holders.map((row) => row.user_id)],
  );
  await db.query(`delete from roles where code = $1`, [code]);
  return {
    accountIds: [...new Set([...holders.map((row) => row.user_id), ...summarized.map((row) => row.id)])],
    childRoles: children.map((row) => row.role_code),
  };
}

/** Existing, non-customer role codes among `codes`, in creation order. */
export async function selectStaffRoleCodes(db: Db, codes: readonly string[]): Promise<string[]> {
  const { rows } = await db.query<Pick<Rows['roles'], 'code'>>(
    `select code from roles where code = any($1::text[]) and code <> 'user' order by created_at, code`,
    [codes],
  );
  return rows.map((row) => row.code);
}

/** An account's own staff roles in creation order. `lock` (inside a
 * transaction) holds the account row so a concurrent assignment waits. */
export async function selectAccountRoleCodes(db: Db, userId: string, lock = false): Promise<string[]> {
  if (lock) await db.query(`select 1 from users where id = $1 for update`, [userId]);
  const { rows } = await db.query<Pick<Rows['user_roles'], 'role_code'>>(
    `select ur.role_code from user_roles ur join roles r on r.code = ur.role_code
      where ur.user_id = $1 order by r.created_at, r.code`,
    [userId],
  );
  return rows.map((row) => row.role_code);
}

/** Replaces an account's staff roles and refreshes the `users.role` summary.
 * False when the account is gone. */
export async function replaceAccountRoles(
  db: Db,
  userId: string,
  roles: readonly string[],
  summary: string,
): Promise<boolean> {
  const { rowCount } = await db.query(`update users set role = $2, updated_at = now() where id = $1`, [
    userId,
    summary,
  ]);
  if ((rowCount ?? 0) === 0) return false;
  await db.query(`delete from user_roles where user_id = $1 and not (role_code = any($2::text[]))`, [
    userId,
    roles,
  ]);
  if (roles.length > 0) {
    await db.query(
      `insert into user_roles (user_id, role_code) select $1, unnest($2::text[]) on conflict do nothing`,
      [userId, roles],
    );
  }
  return true;
}

export async function roleExists(db: Db, code: string): Promise<boolean> {
  const { rows } = await db.query(`select 1 from roles where code = $1`, [code]);
  return rows.length > 0;
}
