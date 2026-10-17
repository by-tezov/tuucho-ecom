/**
 * Delegated role assignment against a real Postgres: the resolved
 * assignable and targetable lists, and the guards around them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pool, resetDatabase } from './support/stack.js';
import { registerUser } from './support/fixtures.js';
import {
  assignAccountRoles,
  assignAccountRolesDelegated,
  assignableRolesForAccount,
  canActOnAccount,
  createStaffRole,
} from '../../src/modules/identity/application/staffRoles.js';
import { searchRoleAccounts } from '../../src/modules/identity/application/roleAccounts.js';

const TARGETABLE = ['user', 'preparator', 'manager'];

/** Same cleanup as staffRoles.int.test.ts: roles and their links are seeded
 * tables, which resetDatabase() keeps. */
async function setup(): Promise<void> {
  await resetDatabase();
  const created = `select code from roles where system = false and code not in ('preparator', 'manager')`;
  await pool.query(`delete from role_parents where role_code in (${created}) or parent_code in (${created})`);
  await pool.query(`delete from user_roles where role_code in (${created})`);
  await pool.query(`delete from roles where code in (${created})`);
}

/** A "Chef" role allowed to assign `preparator`, on customers and on accounts
 * holding only preparator/manager: both lists resolve, so it may delegate. */
async function delegate(): Promise<{ id: string; role: string }> {
  const chef = await createStaffRole(pool, 'Chef', {
    grants: [],
    parents: [],
    assignable: { roles: ['preparator'], dominant: false },
    targetable: { roles: ['user', 'preparator', 'manager'], dominant: false },
  });
  assert.equal(chef.ok, true);
  const account = await registerUser();
  assert.ok(await assignAccountRoles(pool, account.id, ['chef']));
  return { id: account.id, role: 'chef' };
}

test('a delegate needs both an assignable and a targetable list', async () => {
  await setup();
  const actor = await delegate();
  const delegation = await assignableRolesForAccount(pool, actor);
  assert.equal(delegation.all, false);
  assert.ok(!delegation.all);
  assert.deepEqual(delegation.roles, ['preparator']);
  assert.deepEqual([...delegation.targetable].sort(), ['manager', 'preparator', 'user']);

  // Something to give but no one to give it to: no delegation at all.
  const noPermission = await createStaffRole(pool, 'Sans droit', {
    grants: [],
    parents: [],
    assignable: { roles: ['preparator'], dominant: false },
  });
  assert.equal(noPermission.ok, true);
  const plain = await registerUser();
  assert.ok(await assignAccountRoles(pool, plain.id, ['sans_droit']));
  assert.deepEqual(await assignableRolesForAccount(pool, { id: plain.id, role: 'sans_droit' }), {
    all: false,
    roles: [],
    targetable: [],
  });
});

test('a delegate may give or take only listed roles, and keeps the others', async () => {
  await setup();
  await delegate();
  const target = await registerUser();

  const given = await assignAccountRolesDelegated(pool, target.id, ['preparator'], ['preparator'], TARGETABLE);
  assert.deepEqual(given, { ok: true, before: [], after: ['preparator'] });

  const outside = await assignAccountRolesDelegated(pool, target.id, ['preparator', 'manager'], ['preparator'], TARGETABLE);
  assert.deepEqual(outside, { ok: false, error: 'role_not_assignable' });

  assert.ok(await assignAccountRoles(pool, target.id, ['preparator', 'manager']));
  const keepsManager = await assignAccountRolesDelegated(pool, target.id, ['manager'], ['preparator'], TARGETABLE);
  assert.equal(keepsManager.ok, true);
  const dropsManager = await assignAccountRolesDelegated(pool, target.id, [], ['preparator'], TARGETABLE);
  assert.deepEqual(dropsManager, { ok: false, error: 'role_not_assignable' });
});

test('a delegate never touches a super-admin account nor grants super-admin', async () => {
  await setup();
  await delegate();
  const boss = await registerUser();
  assert.ok(await assignAccountRoles(pool, boss.id, ['super-admin']));
  assert.deepEqual(await assignAccountRolesDelegated(pool, boss.id, ['super-admin', 'preparator'], ['preparator'], TARGETABLE), {
    ok: false,
    error: 'protected_account',
  });

  const target = await registerUser();
  assert.deepEqual(await assignAccountRolesDelegated(pool, target.id, ['super-admin'], ['preparator'], TARGETABLE), {
    ok: false,
    error: 'protected_account',
  });
});

test('a delegate cannot edit an account holding a role outside its targetable list', async () => {
  await setup();
  await delegate();
  const above = await createStaffRole(pool, 'Admin boutique', { grants: [], parents: [] });
  assert.equal(above.ok, true);
  const target = await registerUser();
  assert.ok(await assignAccountRoles(pool, target.id, ['admin_boutique']));
  assert.deepEqual(
    await assignAccountRolesDelegated(pool, target.id, ['admin_boutique', 'preparator'], ['preparator'], TARGETABLE),
    { ok: false, error: 'account_not_targetable' },
  );

  const customer = await registerUser();
  assert.deepEqual(await assignAccountRolesDelegated(pool, customer.id, ['preparator'], ['preparator'], ['preparator']), {
    ok: false,
    error: 'account_not_targetable',
  });
});

test('locking follows the same hierarchy: customers always, staff only within the targetable list', async () => {
  await setup();
  const actor = await delegate();
  const customer = await registerUser();
  const preparator = await registerUser();
  assert.ok(await assignAccountRoles(pool, preparator.id, ['preparator']));
  const above = await createStaffRole(pool, 'Admin boutique', { grants: [], parents: [] });
  assert.equal(above.ok, true);
  const boss = await registerUser();
  assert.ok(await assignAccountRoles(pool, boss.id, ['admin_boutique']));

  assert.equal(await canActOnAccount(pool, actor, customer.id), true);
  assert.equal(await canActOnAccount(pool, actor, preparator.id), true);
  assert.equal(await canActOnAccount(pool, actor, boss.id), false);

  // Staff without a delegation (only the Users section) act on customers only.
  const clerkRole = await createStaffRole(pool, 'Accueil', {
    grants: [{ permission: 'users', granted: true, dominant: false }],
    parents: [],
  });
  assert.equal(clerkRole.ok, true);
  const clerk = await registerUser();
  assert.ok(await assignAccountRoles(pool, clerk.id, ['accueil']));
  assert.equal(await canActOnAccount(pool, { id: clerk.id, role: 'accueil' }, customer.id), true);
  assert.equal(await canActOnAccount(pool, { id: clerk.id, role: 'accueil' }, preparator.id), false);
});

test('the Roles page search only returns accounts the caller may change', async () => {
  await setup();
  const actor = await delegate();
  const delegation = await assignableRolesForAccount(pool, actor);
  const customer = await registerUser();
  const above = await createStaffRole(pool, 'Admin boutique', { grants: [], parents: [] });
  assert.equal(above.ok, true);
  const boss = await registerUser();
  assert.ok(await assignAccountRoles(pool, boss.id, ['admin_boutique']));
  const superAdmin = await registerUser();
  assert.ok(await assignAccountRoles(pool, superAdmin.id, ['super-admin']));

  const found = await searchRoleAccounts(pool, delegation, customer.email, 15);
  assert.deepEqual(found.accounts.map((account) => account.id), [customer.id]);
  assert.equal((await searchRoleAccounts(pool, delegation, boss.email, 15)).total, 0);
  assert.equal((await searchRoleAccounts(pool, delegation, superAdmin.email, 15)).total, 0);
  assert.equal((await searchRoleAccounts(pool, { all: true }, boss.email, 15)).total, 1);

  const globbed = await searchRoleAccounts(pool, delegation, '*@*', 50);
  const ids = globbed.accounts.map((account) => account.id);
  assert.ok(ids.includes(customer.id));
  assert.ok(!ids.includes(boss.id));
  assert.ok(!ids.includes(superAdmin.id));
});
