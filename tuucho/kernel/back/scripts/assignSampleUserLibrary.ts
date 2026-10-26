/** Attach unowned sample user-library products to the sole super-admin.
 *
 * The sample files ship with `"users": []` because the admin account does not
 * exist until install bootstrap. First install and `npm run seed -- --dev`
 * call this afterwards. It does nothing when there is not exactly one
 * super-admin, and it never replaces an owner list that is already set.
 */
import { pool } from '../src/db/pool.js';

const owners = await pool.query<{ user_id: string }>(
  `select user_id from user_roles where role_code = 'super-admin'`,
);
if (owners.rows.length !== 1) {
  console.log(
    `[assign-sample-user-library] skipped: expected one super-admin, found ${owners.rows.length}.`,
  );
  await pool.end();
  process.exit(0);
}

const attached = await pool.query(
  `insert into product_user_library_users (product_id, user_id)
   select p.id, $1::uuid
   from products p
   where p.audience = 'user-library'
     and not exists (
       select 1 from product_user_library_users existing
       where existing.product_id = p.id
     )
   on conflict do nothing`,
  [owners.rows[0]!.user_id],
);
console.log(`[assign-sample-user-library] attached ${attached.rowCount ?? 0} product(s).`);
await pool.end();
