/**
 * Staff roles against a real Postgres: inheritance resolution, cycles,
 * system-role refusal, delete detach, and assignment summary.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pool, resetDatabase } from './support/stack.js';
import { promoteToAdmin, registerUser } from './support/fixtures.js';
import {
  assignAccountRoles,
  createStaffRole,
  deleteStaffRole,
  findStaffRole,
  listStaffRoles,
  permissionsForAccount,
  updateStaffRole,
} from '../../src/modules/identity/application/staffRoles.js';
import { PERMISSIONS } from '../../src/modules/identity/domain/staffPermissions.js';

/** resetDatabase() keeps the tables migrations seed, `roles` included, so
 * roles created by a previous run would survive and make the next run's
 * creates fail with `role_exists`. Drop every non-system role the migrations
 * did not seed (their grants and assignable lists cascade). */
async function setup(): Promise<void> {
  await resetDatabase();
  // role_parents and user_roles are seeded too, so they are not truncated:
  // clear the links to those roles before the roles themselves.
  const created = `select code from roles where system = false and code not in ('preparator', 'manager')`;
  await pool.query(`delete from role_parents where role_code in (${created}) or parent_code in (${created})`);
  await pool.query(`delete from user_roles where role_code in (${created})`);
  await pool.query(`delete from roles where code in (${created})`);
}

test('seeded manager inherits preparator orders permission', async () => {
  await setup();
  const account = await registerUser();
  const assigned = await assignAccountRoles(pool, account.id, ['manager']);
  assert.ok(assigned);
  assert.deepEqual(assigned.after, ['manager']);

  const perms = await permissionsForAccount(pool, { id: account.id, role: 'manager' });
  assert.ok(perms.includes('orders'), `expected orders in ${perms.join(',')}`);
  assert.ok(perms.includes('library_stock'));
  assert.ok(perms.includes('catalogue_edit'));

  const preparator = await registerUser();
  const assignedPrep = await assignAccountRoles(pool, preparator.id, ['preparator']);
  assert.ok(assignedPrep);
  const prepPerms = await permissionsForAccount(pool, { id: preparator.id, role: 'preparator' });
  assert.ok(!prepPerms.includes('catalogue_edit'));

  const manager = await findStaffRole(pool, 'manager');
  assert.ok(manager);
  assert.deepEqual(manager.parents, ['preparator']);
  assert.ok(manager.permissions.includes('orders'));
});

test('diamond: parent dominant off beats child on', async () => {
  await setup();
  const parentOn = await createStaffRole(pool, 'Parent On', {
    grants: [{ permission: 'messages', granted: true, dominant: false }],
    parents: [],
  });
  assert.equal(parentOn.ok, true);
  const parentOff = await createStaffRole(pool, 'Parent Off', {
    grants: [{ permission: 'messages', granted: false, dominant: true }],
    parents: [],
  });
  assert.equal(parentOff.ok, true);
  if (!parentOn.ok || !parentOff.ok) return;

  const child = await createStaffRole(pool, 'Child Diamond', {
    grants: [{ permission: 'messages', granted: true, dominant: false }],
    parents: [parentOn.role.code, parentOff.role.code],
  });
  assert.equal(child.ok, true);
  if (!child.ok) return;
  assert.ok(!child.role.permissions.includes('messages'));

  const softOff = await createStaffRole(pool, 'Parent Soft Off', {
    grants: [{ permission: 'messages', granted: false, dominant: false }],
    parents: [],
  });
  assert.equal(softOff.ok, true);
  if (!softOff.ok) return;
  const childSoft = await createStaffRole(pool, 'Child Soft', {
    grants: [{ permission: 'messages', granted: true, dominant: false }],
    parents: [parentOn.role.code, softOff.role.code],
  });
  assert.equal(childSoft.ok, true);
  if (!childSoft.ok) return;
  assert.ok(childSoft.role.permissions.includes('messages'));
});

test('multi-role account unions permissions', async () => {
  await setup();
  const a = await createStaffRole(pool, 'Only Orders', {
    grants: [{ permission: 'orders', granted: true, dominant: false }],
    parents: [],
  });
  const b = await createStaffRole(pool, 'Only Messages', {
    grants: [{ permission: 'messages', granted: true, dominant: false }],
    parents: [],
  });
  assert.ok(a.ok && b.ok);
  if (!a.ok || !b.ok) return;
  const account = await registerUser();
  await assignAccountRoles(pool, account.id, [a.role.code, b.role.code]);
  const summary = a.role.code;
  const perms = await permissionsForAccount(pool, { id: account.id, role: summary });
  assert.ok(perms.includes('orders'));
  assert.ok(perms.includes('messages'));
});

test('inheritance cycles and system parents are refused', async () => {
  await setup();
  const first = await createStaffRole(pool, 'Cycle A', { grants: [], parents: [] });
  const second = await createStaffRole(pool, 'Cycle B', { grants: [], parents: [] });
  assert.ok(first.ok && second.ok);
  if (!first.ok || !second.ok) return;

  const link = await updateStaffRole(pool, second.role.code, { parents: [first.role.code] });
  assert.equal(link.ok, true);

  const cycle = await updateStaffRole(pool, first.role.code, { parents: [second.role.code] });
  assert.equal(cycle.ok, false);
  if (!cycle.ok) assert.equal(cycle.error, 'role_cycle');

  const selfParent = await updateStaffRole(pool, first.role.code, { parents: [first.role.code] });
  assert.equal(selfParent.ok, false);
  if (!selfParent.ok) assert.equal(selfParent.error, 'role_cycle');

  for (const parent of ['user', 'super-admin'] as const) {
    const bad = await updateStaffRole(pool, first.role.code, { parents: [parent] });
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.error, 'invalid_parent');
  }
});

test('system roles cannot be edited or deleted; create collision is role_exists', async () => {
  await setup();
  for (const code of ['user', 'super-admin'] as const) {
    const updated = await updateStaffRole(pool, code, { label: 'Nope' });
    assert.equal(updated.ok, false);
    if (!updated.ok) assert.equal(updated.error, 'system_role');
    const deleted = await deleteStaffRole(pool, code);
    assert.equal(deleted.ok, false);
    if (!deleted.ok) assert.equal(deleted.error, 'system_role');
  }
  const collide = await createStaffRole(pool, 'User', { grants: [], parents: [] });
  assert.equal(collide.ok, false);
  if (!collide.ok) assert.ok(collide.error === 'role_exists' || collide.error === 'invalid_label');
});

test('deleting a parent detaches children and recomputes holders', async () => {
  await setup();
  const parent = await createStaffRole(pool, 'Temp Parent', {
    grants: [{ permission: 'orders', granted: true, dominant: false }],
    parents: [],
  });
  assert.ok(parent.ok);
  if (!parent.ok) return;
  const child = await createStaffRole(pool, 'Temp Child', {
    grants: [{ permission: 'messages', granted: true, dominant: false }],
    parents: [parent.role.code],
  });
  assert.ok(child.ok);
  if (!child.ok) return;

  const holder = await registerUser();
  await assignAccountRoles(pool, holder.id, [parent.role.code, child.role.code]);

  const deleted = await deleteStaffRole(pool, parent.role.code);
  assert.ok(deleted.ok);
  if (!deleted.ok) return;
  assert.ok(deleted.accountIds.includes(holder.id));
  assert.ok(deleted.childRoles.includes(child.role.code));

  const afterChild = await findStaffRole(pool, child.role.code);
  assert.ok(afterChild);
  assert.deepEqual(afterChild.parents, []);
  assert.ok(afterChild.permissions.includes('messages'));
  assert.ok(!afterChild.permissions.includes('orders'));

  const remaining = await assignAccountRoles(pool, holder.id, [child.role.code]);
  assert.ok(remaining);
  assert.deepEqual(remaining.after, [child.role.code]);
});

test('empty assignment returns the account to user; super-admin short-circuits', async () => {
  await setup();
  const account = await registerUser();
  await assignAccountRoles(pool, account.id, ['preparator']);
  const cleared = await assignAccountRoles(pool, account.id, []);
  assert.ok(cleared);
  assert.deepEqual(cleared.after, []);
  const asCustomer = await permissionsForAccount(pool, { id: account.id, role: 'user' });
  assert.deepEqual(asCustomer, []);

  const admin = await registerUser();
  await promoteToAdmin(admin.id);
  const all = await permissionsForAccount(pool, { id: admin.id, role: 'super-admin' });
  assert.deepEqual(all, [...PERMISSIONS]);

  const unknown = await assignAccountRoles(pool, account.id, ['no_such_role']);
  assert.equal(unknown, null);

  const roles = await listStaffRoles(pool);
  assert.ok(roles.some((role) => role.code === 'preparator'));
  assert.ok(roles.some((role) => role.code === 'manager'));
});
