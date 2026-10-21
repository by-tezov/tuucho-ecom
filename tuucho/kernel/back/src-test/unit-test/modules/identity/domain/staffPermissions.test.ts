import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CORE_PERMISSIONS,
  PERMISSIONS,
  createsInheritanceCycle,
  isStaffRole,
  isSystemRole,
  normalizeGrantList,
  normalizeRoleCodeList,
  normalizeRoleLabel,
  permissionsAllow,
  primaryRole,
  resolvePermissions,
  roleCodeFromLabel,
  resolveAssignable,
  resolveTargetable,
  canTargetAccount,
  changedRoles,
  withAncestors,
} from '../../../../../src/modules/identity/domain/staffPermissions.js';

const on = (permission: string, dominant = false) => ({ permission, granted: true, dominant });
const off = (permission: string, dominant = false) => ({ permission, granted: false, dominant });

test('kernel permissions stay core; commerce plugins are not in CORE_PERMISSIONS', () => {
  for (const code of [
    'orders',
    'users',
    'impersonate',
    'library_stock',
    'accessory_stock',
    'catalogue_edit',
    'courier_edit',
    'preferences',
    'plugin_config_import',
    'plugin_config_export',
  ] as const) {
    assert.ok((CORE_PERMISSIONS as readonly string[]).includes(code), code);
  }
  for (const code of [
    'messages',
    'product_requests',
    'loyalty',
    'gift',
    'reviews',
    'cart_rules',
    'vouchers',
    'cron_logs',
    'api_log',
    'email_log',
  ] as const) {
    assert.equal((CORE_PERMISSIONS as readonly string[]).includes(code), false, code);
  }
});

test('super-admin holds every permission, an empty role set none', () => {
  assert.deepEqual(resolvePermissions(['super-admin'], [off('orders', true)]), [...PERMISSIONS]);
  assert.deepEqual(resolvePermissions([], []), []);
});

test('plugin config import/export stay off until granted; super-admin has both', () => {
  const staff = resolvePermissions(['preparator'], [on('preferences')]);
  assert.equal(staff.includes('preferences'), true);
  assert.equal(staff.includes('plugin_config_import'), false);
  assert.equal(staff.includes('plugin_config_export'), false);
  const admin = resolvePermissions(['super-admin'], []);
  assert.equal(admin.includes('plugin_config_import'), true);
  assert.equal(admin.includes('plugin_config_export'), true);
});

test('a non-dominant "on" wins over a non-dominant "off"', () => {
  assert.deepEqual(resolvePermissions(['a', 'b'], [on('orders'), off('orders')]), ['orders']);
});

test('a dominant "off" wins over a non-dominant "on"', () => {
  assert.deepEqual(resolvePermissions(['a', 'b'], [on('orders'), off('orders', true)]), []);
});

test('when both are dominant, "off" wins', () => {
  assert.deepEqual(resolvePermissions(['a', 'b'], [on('orders', true), off('orders', true)]), []);
});

test('with no grant a permission is off; results keep catalogue order', () => {
  assert.deepEqual(resolvePermissions(['a'], [on('library_stock'), on('orders')]), ['orders', 'library_stock']);
  assert.equal(permissionsAllow(['orders'], ['users', 'orders']), true);
  assert.equal(permissionsAllow(['orders'], ['vouchers']), false);
});

test('ancestors are collected transitively and survive a loop', () => {
  const parents = new Map([
    ['manager', ['preparator']],
    ['preparator', ['base']],
    ['loop', ['loop2']],
    ['loop2', ['loop']],
  ]);
  assert.deepEqual(withAncestors(['manager'], parents).sort(), ['base', 'manager', 'preparator']);
  assert.deepEqual(withAncestors(['loop'], parents).sort(), ['loop', 'loop2']);
});

test('an inheritance that would close a loop is detected', () => {
  const parents = new Map([['manager', ['preparator']]]);
  assert.equal(createsInheritanceCycle('preparator', ['manager'], parents), true);
  assert.equal(createsInheritanceCycle('preparator', ['preparator'], parents), true);
  assert.equal(createsInheritanceCycle('support', ['manager'], parents), false);
});

test('a grant list keeps only what differs from no grant, and rejects bad entries', () => {
  assert.deepEqual(
    normalizeGrantList([on('stats'), off('orders'), off('users', true), { permission: 'vouchers', granted: true }]),
    [on('stats'), off('users', true), on('vouchers')],
  );
  assert.deepEqual(normalizeGrantList([on('root')]), [on('root')]);
  assert.equal(normalizeGrantList([on('orders'), off('orders')]), null);
  assert.equal(normalizeGrantList([{ permission: 'orders' }]), null);
  assert.equal(normalizeGrantList('orders'), null);
});

test('a role code list is de-duplicated and must be well formed', () => {
  assert.deepEqual(normalizeRoleCodeList(['manager', 'manager', 'preparator']), ['manager', 'preparator']);
  assert.equal(normalizeRoleCodeList(['Manager']), null);
  assert.deepEqual(normalizeRoleCodeList(['super-admin']), ['super-admin']);
  assert.equal(normalizeRoleCodeList('manager'), null);
});

test('the users.role summary prefers super-admin, then the first staff role, else customer', () => {
  assert.equal(primaryRole(['manager', 'super-admin'], ['preparator', 'manager']), 'super-admin');
  assert.equal(primaryRole(['manager', 'preparator'], ['preparator', 'manager']), 'preparator');
  assert.equal(primaryRole([], ['preparator']), 'user');
});

test('only user and super-admin are system roles; every non-customer role is staff', () => {
  assert.equal(isSystemRole('user'), true);
  assert.equal(isSystemRole('super-admin'), true);
  assert.equal(isSystemRole('preparator'), false);
  assert.equal(isStaffRole('preparator'), true);
  assert.equal(isStaffRole('user'), false);
});

test('a role label is trimmed, single-spaced and bounded', () => {
  assert.equal(normalizeRoleLabel('  Service   client '), 'Service client');
  assert.equal(normalizeRoleLabel('a'), null);
  assert.equal(normalizeRoleLabel('x'.repeat(61)), null);
  assert.equal(normalizeRoleLabel(42), null);
});

test('a role code is the ASCII slug of its label', () => {
  assert.equal(roleCodeFromLabel('Préparateur'), 'preparateur');
  assert.equal(roleCodeFromLabel('Service client (SAV)'), 'service_client_sav');
  assert.equal(roleCodeFromLabel('2 relecteurs'), null);
});

test('assignable lists: non-dominant lists add up', () => {
  assert.deepEqual(
    resolveAssignable([
      { roles: ['a', 'b'], dominant: false },
      { roles: ['b', 'c'], dominant: false },
    ]).sort(),
    ['a', 'b', 'c'],
  );
});

test('assignable lists: a dominant list excludes what it lacks', () => {
  assert.deepEqual(
    resolveAssignable([
      { roles: ['a', 'b'], dominant: true },
      { roles: ['b', 'c'], dominant: false },
    ]).sort(),
    ['a', 'b'],
  );
});

test('assignable lists: an empty dominant list leaves nothing', () => {
  assert.deepEqual(
    resolveAssignable([
      { roles: [], dominant: true },
      { roles: ['b', 'c'], dominant: true },
    ]),
    [],
  );
});

test('assignable lists: two dominant lists keep only what both allow', () => {
  assert.deepEqual(
    resolveAssignable([
      { roles: ['a', 'b'], dominant: true },
      { roles: ['b', 'c'], dominant: true },
    ]),
    ['b'],
  );
});

test('assignable lists never yield the super-admin or customer role', () => {
  assert.deepEqual(resolveAssignable([{ roles: ['super-admin', 'user', 'a'], dominant: false }]), ['a']);
});

test('changed roles are the ones added or removed', () => {
  assert.deepEqual(changedRoles(['a', 'b'], ['b', 'c']).sort(), ['a', 'c']);
  assert.deepEqual(changedRoles(['a'], ['a']), []);
});

test('targetable lists merge like assignable ones, keep customer, never super-admin', () => {
  assert.deepEqual(
    resolveTargetable([
      { roles: ['user', 'preparator', 'super-admin'], dominant: false },
      { roles: ['manager'], dominant: false },
    ]).sort(),
    ['manager', 'preparator', 'user'],
  );
  assert.deepEqual(
    resolveTargetable([
      { roles: ['user', 'preparator'], dominant: true },
      { roles: ['manager', 'preparator'], dominant: false },
    ]).sort(),
    ['preparator', 'user'],
  );
});

test('an account is targetable only when every role it holds is listed', () => {
  const targetable = ['user', 'preparator', 'manager'];
  assert.equal(canTargetAccount([], targetable), true);
  assert.equal(canTargetAccount([], ['preparator']), false);
  assert.equal(canTargetAccount(['preparator', 'manager'], targetable), true);
  assert.equal(canTargetAccount(['preparator', 'admin_shop'], targetable), false);
  assert.equal(canTargetAccount(['super-admin'], [...targetable, 'super-admin']), false);
});
