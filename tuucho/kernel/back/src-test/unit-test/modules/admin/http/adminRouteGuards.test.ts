import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type RouteEntry = {
  method: string;
  path: string;
  middleware: string[];
};

const inventoryPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../../../docs/api/routes.json',
);
const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8')) as { publicSurface: RouteEntry[] };

const adminRoutes = inventory.publicSurface.filter((route) => route.path.startsWith('/admin'));

function hasStaffGate(middleware: string[]): boolean {
  return (
    middleware.includes('requireAdmin') ||
    middleware.includes('requireStaff') ||
    middleware.some((name) => name.startsWith('requirePermission('))
  );
}

test('every /admin route requires auth and a staff gate', () => {
  assert.ok(adminRoutes.length > 0, 'expected admin routes in routes.json');
  for (const route of adminRoutes) {
    assert.ok(
      route.middleware.includes('requireAuth'),
      `${route.method} ${route.path} missing requireAuth`,
    );
    assert.ok(
      hasStaffGate(route.middleware),
      `${route.method} ${route.path} missing requireAdmin|requireStaff|requirePermission`,
    );
  }
});

test('role management is requireAdmin, access and delegated assignment are requireStaff', () => {
  const rolesRoutes = adminRoutes.filter(
    (route) => route.path === '/admin/roles' || route.path.startsWith('/admin/roles/'),
  );
  assert.ok(rolesRoutes.length >= 4);
  for (const route of rolesRoutes) {
    assert.ok(route.middleware.includes('requireAdmin'), `${route.method} ${route.path}`);
    assert.ok(!route.middleware.some((name) => name.startsWith('requirePermission(')));
  }

  const assign = adminRoutes.find(
    (route) => route.method === 'PUT' && route.path === '/admin/users/:id/roles',
  );
  assert.ok(assign);
  // Open to any staff account: the handler lets a super-admin assign any role
  // and limits everyone else to their resolved assignable and targetable
  // lists (assignAccountRolesDelegated). It must never be a plain section grant.
  assert.ok(assign!.middleware.includes('requireStaff'));
  assert.ok(!assign!.middleware.some((name) => name.startsWith('requirePermission(')));

  // The Roles page account search: open to staff, filtered by delegation inside.
  const roleAccounts = adminRoutes.find((route) => route.method === 'GET' && route.path === '/admin/role-accounts');
  assert.ok(roleAccounts);
  assert.ok(roleAccounts!.middleware.includes('requireStaff'));

  const access = adminRoutes.find((route) => route.method === 'GET' && route.path === '/admin/access');
  assert.ok(access);
  assert.ok(access!.middleware.includes('requireStaff'));
});

test('user library stock requires user_library_stock', () => {
  const routes = adminRoutes.filter((route) => route.path.startsWith('/admin/user-library-stock'));
  assert.ok(routes.length >= 3, `got ${routes.map((route) => route.path).join(', ')}`);
  for (const route of routes) {
    assert.ok(
      route.middleware.includes('requirePermission(user_library_stock)'),
      `${route.method} ${route.path} got ${route.middleware.join(',')}`,
    );
  }
});

test('shared reads use requirePermission with both codes', () => {
  const orderDetail = adminRoutes.find(
    (route) => route.method === 'GET' && route.path === '/admin/orders/:id',
  );
  assert.ok(orderDetail);
  assert.ok(
    orderDetail!.middleware.includes('requirePermission(orders/users)'),
    `got ${orderDetail!.middleware.join(',')}`,
  );

  const usersList = adminRoutes.find((route) => route.method === 'GET' && route.path === '/admin/users');
  assert.ok(usersList);
  assert.ok(
    usersList!.middleware.includes('requirePermission(users)'),
    `got ${usersList!.middleware.join(',')}`,
  );
});
