import { test, expect } from 'patchright/test';
import { apiJson, registerAdmin, registerUser, uniqueEmail } from '../../support/api.js';
import { promoteToRole } from '../../support/ops.js';
import { PERMISSIONS } from '../../../../src/modules/identity/domain/staffPermissions.js';

type AccessBody = {
  access?: {
    roles: Array<{ code: string }>;
    manageRoles: boolean;
    permissions: string[];
    assignableRoles: Array<{ code: string }>;
    targetableRoles: { all: boolean; roles: string[] };
  };
};
type RoleBody = {
  role?: {
    code: string;
    label: string;
    parents: string[];
    permissions: string[];
    grants: Array<{ permission: string; granted: boolean; dominant: boolean }>;
    assignable: string[];
    assignableDominant: boolean;
    assignableResolved: string[];
    targetable: string[];
    targetableDominant: boolean;
    targetableResolved: string[];
  };
  roles?: Array<{ code: string; label: string; system: boolean }>;
  permissions?: string[];
};

const PERMISSION_PROBES: Array<{ permission: string; method: 'GET' | 'POST'; path: string }> = [
  { permission: 'stats', method: 'GET', path: '/admin/stats' },
  { permission: 'orders', method: 'GET', path: '/admin/orders?status=confirmed' },
  { permission: 'product_requests', method: 'GET', path: '/admin/product-requests?status=requested' },
  { permission: 'messages', method: 'GET', path: '/admin/chats?status=open' },
  { permission: 'users', method: 'GET', path: '/admin/users' },
  { permission: 'impersonate', method: 'POST', path: '/admin/impersonate' },
  { permission: 'reviews', method: 'GET', path: '/admin/vinted-reviews' },
  { permission: 'library_stock', method: 'GET', path: '/admin/library-stock' },
  { permission: 'accessory_stock', method: 'GET', path: '/admin/accessory-stock' },
  { permission: 'user_library_stock', method: 'GET', path: '/admin/user-library-stock' },
  { permission: 'nail_availability', method: 'GET', path: '/admin/nail-availability' },
  { permission: 'cart_rules', method: 'GET', path: '/admin/cart-rules' },
  { permission: 'vouchers', method: 'GET', path: '/admin/vouchers' },
  { permission: 'loyalty', method: 'GET', path: '/admin/loyalty/manual-ops' },
  { permission: 'gift', method: 'GET', path: '/admin/gift/offers' },
  { permission: 'preferences', method: 'GET', path: '/admin/preferences' },
  { permission: 'activity', method: 'GET', path: '/admin/activity' },
  { permission: 'cron_logs', method: 'GET', path: '/admin/cron-logs' },
  { permission: 'api_log', method: 'GET', path: '/admin/api-log' },
];

async function createSinglePermissionRole(
  request: import('patchright/test').APIRequestContext,
  adminToken: string,
  permission: string,
): Promise<string> {
  const label = `Probe ${permission} ${Date.now().toString(36).slice(-4)}`;
  const { body } = await apiJson<RoleBody>(request, 'POST', '/admin/roles', {
    token: adminToken,
    data: {
      label,
      grants: [{ permission, granted: true, dominant: false }],
      parents: [],
    },
    expectedStatus: 201,
  });
  if (!body.role?.code) throw new Error(`role create failed for ${permission}`);
  return body.role.code;
}

test.describe('API admin roles and permission gates', () => {
  test('access and roles: staff vs super-admin vs customer vs impersonation', async ({ request }) => {
    const admin = await registerAdmin(request);
    const customer = await registerUser(request);
    const preparator = await registerUser(request, { email: uniqueEmail('prep-api') });
    await promoteToRole(preparator.email, 'preparator');

    await apiJson(request, 'GET', '/admin/access', { expectedStatus: 401 });
    await apiJson(request, 'GET', '/admin/access', {
      token: customer.accessToken,
      expectedStatus: 403,
    });

    const { body: prepAccess } = await apiJson<AccessBody>(request, 'GET', '/admin/access', {
      token: preparator.accessToken,
      expectedStatus: 200,
    });
    expect(prepAccess.access?.manageRoles).toBe(false);
    expect(prepAccess.access?.permissions).toContain('orders');
    expect(prepAccess.access?.permissions).not.toContain('vouchers');
    expect(prepAccess.access?.assignableRoles).toEqual([]);
    expect(prepAccess.access?.targetableRoles).toEqual({ all: false, roles: [] });

    const { body: adminAccess } = await apiJson<AccessBody>(request, 'GET', '/admin/access', {
      token: admin.accessToken,
      expectedStatus: 200,
    });
    expect(adminAccess.access?.manageRoles).toBe(true);
    expect(adminAccess.access?.permissions).toEqual([...PERMISSIONS]);
    expect(adminAccess.access?.targetableRoles).toEqual({ all: true, roles: [] });
    expect(adminAccess.access?.assignableRoles.some((r) => r.code === 'preparator')).toBe(true);

    await apiJson(request, 'GET', '/admin/roles', {
      token: preparator.accessToken,
      expectedStatus: 403,
    });
    await apiJson(request, 'GET', `/admin/role-accounts?q=${encodeURIComponent(customer.email)}`, {
      token: preparator.accessToken,
      expectedStatus: 403,
    });
    const customerId = String(customer.user.id ?? '');
    expect(customerId).toBeTruthy();
    await apiJson(request, 'PUT', `/admin/users/${customerId}/roles`, {
      token: preparator.accessToken,
      data: { roles: ['preparator'] },
      expectedStatus: 403,
    });

    const { body: impersonation } = await apiJson<{ accessToken?: string }>(
      request,
      'POST',
      '/admin/impersonate',
      {
        token: admin.accessToken,
        data: { email: customer.email },
        expectedStatus: 200,
      },
    );
    expect(impersonation.accessToken).toBeTruthy();
    await apiJson(request, 'GET', '/admin/access', {
      token: impersonation.accessToken!,
      expectedStatus: 403,
    });
    await apiJson(request, 'GET', '/admin/roles', {
      token: impersonation.accessToken!,
      expectedStatus: 403,
    });
  });

  test('role CRUD errors, own_role, assign, immediate revoke', async ({ request }) => {
    const admin = await registerAdmin(request);
    const other = await registerUser(request, { email: uniqueEmail('role-target') });
    const stamp = Date.now().toString(36).slice(-5);

    const { body: created } = await apiJson<RoleBody>(request, 'POST', '/admin/roles', {
      token: admin.accessToken,
      data: {
        label: `Service ${stamp}`,
        grants: [{ permission: 'messages', granted: true, dominant: false }],
        parents: ['preparator'],
        assignable: ['preparator'],
        assignableDominant: false,
        targetable: ['user', 'preparator'],
        targetableDominant: false,
      },
      expectedStatus: 201,
    });
    expect(created.role?.parents).toEqual(['preparator']);
    expect(created.role?.permissions).toContain('orders');
    expect(created.role?.permissions).toContain('messages');
    expect(created.role?.assignable).toEqual(['preparator']);
    expect(created.role?.assignableResolved).toEqual(['preparator']);
    expect([...(created.role?.targetable ?? [])].sort()).toEqual(['preparator', 'user']);
    expect([...(created.role?.targetableResolved ?? [])].sort()).toEqual(['preparator', 'user']);
    const code = created.role!.code;

    await apiJson(request, 'POST', '/admin/roles', {
      token: admin.accessToken,
      data: { label: 'x', grants: [], parents: [] },
      expectedStatus: 400,
    });
    await apiJson(request, 'POST', '/admin/roles', {
      token: admin.accessToken,
      data: {
        label: `Dup ${stamp}`,
        grants: [],
        parents: [],
        assignable: ['preparator'],
        // Dominance must travel with the list.
      },
      expectedStatus: 400,
    });
    await apiJson(request, 'POST', '/admin/roles', {
      token: admin.accessToken,
      data: {
        label: `Bad assign ${stamp}`,
        grants: [],
        parents: [],
        assignable: ['super-admin'],
        assignableDominant: false,
      },
      expectedStatus: 400,
    });
    await apiJson(request, 'POST', '/admin/roles', {
      token: admin.accessToken,
      data: {
        label: `Service ${stamp}`,
        grants: [{ permission: 'messages', granted: true, dominant: false }],
        parents: [],
      },
      expectedStatus: 409,
    });
    await apiJson(request, 'PATCH', '/admin/roles/super-admin', {
      token: admin.accessToken,
      data: { label: 'Nope' },
      expectedStatus: 409,
    });
    await apiJson(request, 'PATCH', `/admin/roles/${code}`, {
      token: admin.accessToken,
      data: { parents: ['super-admin'] },
      expectedStatus: 400,
    });
    await apiJson(request, 'PATCH', `/admin/roles/${code}`, {
      token: admin.accessToken,
      data: { parents: [code] },
      expectedStatus: 409,
    });
    await apiJson(request, 'PATCH', `/admin/roles/${code}`, {
      token: admin.accessToken,
      data: { targetable: ['super-admin'], targetableDominant: false },
      expectedStatus: 400,
    });

    // Resolve admin id from users list (registerAdmin does not expose it).
    const { body: staffPage } = await apiJson<{
      users?: Array<{ id: string; email: string }>;
    }>(request, 'GET', '/admin/users?role=staff&q=' + encodeURIComponent(admin.email), {
      token: admin.accessToken,
      expectedStatus: 200,
    });
    const adminRow = staffPage.users?.find((u) => u.email === admin.email);
    expect(adminRow?.id).toBeTruthy();
    await apiJson(request, 'PUT', `/admin/users/${adminRow!.id}/roles`, {
      token: admin.accessToken,
      data: { roles: ['preparator'] },
      expectedStatus: 409,
    });

    const otherId = String(other.user.id ?? '');
    const { body: assigned } = await apiJson<{
      user?: { role: string; roles: Array<{ code: string }> };
    }>(request, 'PUT', `/admin/users/${otherId}/roles`, {
      token: admin.accessToken,
      data: { roles: [code, 'super-admin'] },
      expectedStatus: 200,
    });
    expect(assigned.user?.role).toBe('super-admin');

    await apiJson(request, 'PUT', `/admin/users/${otherId}/roles`, {
      token: admin.accessToken,
      data: { roles: [] },
      expectedStatus: 200,
    });

    // Immediate revoke: grant orders, then strip grants; same token is denied.
    const probeCode = await createSinglePermissionRole(request, admin.accessToken, 'orders');
    const probeUser = await registerUser(request, { email: uniqueEmail('revoke') });
    const probeId = String(probeUser.user.id ?? '');
    await apiJson(request, 'PUT', `/admin/users/${probeId}/roles`, {
      token: admin.accessToken,
      data: { roles: [probeCode] },
      expectedStatus: 200,
    });
    await apiJson(request, 'GET', '/admin/orders?status=confirmed', {
      token: probeUser.accessToken,
      expectedStatus: 200,
    });
    await apiJson(request, 'PATCH', `/admin/roles/${probeCode}`, {
      token: admin.accessToken,
      data: { grants: [] },
      expectedStatus: 200,
    });
    await apiJson(request, 'GET', '/admin/orders?status=confirmed', {
      token: probeUser.accessToken,
      expectedStatus: 403,
    });

    const { body: deleted } = await apiJson<{
      removedFromAccounts?: number;
      removedFromRoles?: string[];
    }>(request, 'DELETE', `/admin/roles/${code}`, {
      token: admin.accessToken,
      expectedStatus: 200,
    });
    expect(deleted.removedFromAccounts).toBeGreaterThanOrEqual(0);
  });

  test('permission matrix: holding opens the section, missing closes it', async ({ request }) => {
    const admin = await registerAdmin(request);
    const holder = await registerUser(request, { email: uniqueEmail('hold') });
    const outsider = await registerUser(request, { email: uniqueEmail('out') });
    const outsiderId = String(outsider.user.id ?? '');
    // Stats-only outsider: every other probe must be forbidden for them.
    const statsOnly = await createSinglePermissionRole(request, admin.accessToken, 'stats');
    await apiJson(request, 'PUT', `/admin/users/${outsiderId}/roles`, {
      token: admin.accessToken,
      data: { roles: [statsOnly] },
      expectedStatus: 200,
    });

    const holderId = String(holder.user.id ?? '');
    for (const probe of PERMISSION_PROBES) {
      const roleCode = await createSinglePermissionRole(request, admin.accessToken, probe.permission);
      await apiJson(request, 'PUT', `/admin/users/${holderId}/roles`, {
        token: admin.accessToken,
        data: { roles: [roleCode] },
        expectedStatus: 200,
      });

      const allowed = await apiJson(request, probe.method, probe.path, {
        token: holder.accessToken,
        data: probe.method === 'POST' ? { email: uniqueEmail('imp') } : undefined,
      });
      // Gate opened: not forbidden (may be 400 on body-less POST).
      expect(allowed.status, `${probe.permission} should pass gate`).not.toBe(403);

      if (probe.permission !== 'stats') {
        const denied = await apiJson(request, probe.method, probe.path, {
          token: outsider.accessToken,
          data: probe.method === 'POST' ? { email: uniqueEmail('imp2') } : undefined,
        });
        expect(denied.status, `${probe.permission} denied for stats-only`).toBe(403);
      }

      await apiJson(request, 'DELETE', `/admin/roles/${roleCode}`, {
        token: admin.accessToken,
        expectedStatus: 200,
      });
    }

    // Shared reads: users alone opens loyalty wallet and does not open the orders queue.
    const usersOnly = await createSinglePermissionRole(request, admin.accessToken, 'users');
    await apiJson(request, 'PUT', `/admin/users/${holderId}/roles`, {
      token: admin.accessToken,
      data: { roles: [usersOnly] },
      expectedStatus: 200,
    });
    await apiJson(request, 'GET', '/admin/orders?status=confirmed', {
      token: holder.accessToken,
      expectedStatus: 403,
    });
    await apiJson(request, 'GET', `/admin/loyalty/users/${holderId}/wallet`, {
      token: holder.accessToken,
      expectedStatus: 200,
    });
  });

  test('ops single-role assign replaces the set', async ({ request }) => {
    const account = await registerUser(request, { email: uniqueEmail('ops-role') });
    await promoteToRole(account.email, 'manager');
    const { body } = await apiJson<AccessBody>(request, 'GET', '/admin/access', {
      token: account.accessToken,
      expectedStatus: 200,
    });
    expect(body.access?.roles.map((r) => r.code)).toEqual(['manager']);
    await promoteToRole(account.email, 'user');
    await apiJson(request, 'GET', '/admin/access', {
      token: account.accessToken,
      expectedStatus: 403,
    });
  });

  test('delegated assignment: access lists, role-accounts, assignment guards', async ({
    request,
  }) => {
    const admin = await registerAdmin(request);
    const stamp = Date.now().toString(36).slice(-5);
    // Delegation is the two lists themselves (no separate permission grant).
    const { body: chefRole } = await apiJson<RoleBody>(request, 'POST', '/admin/roles', {
      token: admin.accessToken,
      data: {
        label: `Chef ${stamp}`,
        grants: [],
        parents: [],
        assignable: ['preparator'],
        assignableDominant: false,
        targetable: ['user', 'preparator'],
        targetableDominant: false,
      },
      expectedStatus: 201,
    });
    const chefCode = chefRole.role!.code;

    const chef = await registerUser(request, { email: uniqueEmail('chef-api') });
    const customer = await registerUser(request, { email: uniqueEmail('chef-cust') });
    const managerHold = await registerUser(request, { email: uniqueEmail('chef-mgr') });
    await promoteToRole(managerHold.email, 'manager');
    const chefId = String(chef.user.id ?? '');
    const customerId = String(customer.user.id ?? '');
    const managerId = String(managerHold.user.id ?? '');

    await apiJson(request, 'PUT', `/admin/users/${chefId}/roles`, {
      token: admin.accessToken,
      data: { roles: [chefCode] },
      expectedStatus: 200,
    });

    const { body: chefAccess } = await apiJson<AccessBody>(request, 'GET', '/admin/access', {
      token: chef.accessToken,
      expectedStatus: 200,
    });
    expect(chefAccess.access?.manageRoles).toBe(false);
    expect(chefAccess.access?.permissions).toEqual([]);
    expect(chefAccess.access?.assignableRoles.map((r) => r.code)).toEqual(['preparator']);
    expect(chefAccess.access?.targetableRoles.all).toBe(false);
    expect([...(chefAccess.access?.targetableRoles.roles ?? [])].sort()).toEqual([
      'preparator',
      'user',
    ]);

    // Role CRUD stays super-admin only.
    await apiJson(request, 'GET', '/admin/roles', {
      token: chef.accessToken,
      expectedStatus: 403,
    });

    const { body: found } = await apiJson<{
      accounts?: Array<{ id: string; email: string }>;
      total?: number;
    }>(request, 'GET', `/admin/role-accounts?q=${encodeURIComponent(customer.email)}`, {
      token: chef.accessToken,
      expectedStatus: 200,
    });
    expect(found.total).toBe(1);
    expect(found.accounts?.[0]?.id).toBe(customerId);

    // Manager is outside targetable: hidden from search, assignment refused.
    const { body: hidden } = await apiJson<{ total?: number }>(
      request,
      'GET',
      `/admin/role-accounts?q=${encodeURIComponent(managerHold.email)}`,
      { token: chef.accessToken, expectedStatus: 200 },
    );
    expect(hidden.total).toBe(0);
    await apiJson(request, 'PUT', `/admin/users/${managerId}/roles`, {
      token: chef.accessToken,
      data: { roles: ['preparator'] },
      expectedStatus: 403,
    });

    await apiJson(request, 'PUT', `/admin/users/${customerId}/roles`, {
      token: chef.accessToken,
      data: { roles: ['preparator'] },
      expectedStatus: 200,
    });
    await apiJson(request, 'PUT', `/admin/users/${customerId}/roles`, {
      token: chef.accessToken,
      data: { roles: ['preparator', 'manager'] },
      expectedStatus: 403,
    });
    await apiJson(request, 'PUT', `/admin/users/${customerId}/roles`, {
      token: chef.accessToken,
      data: { roles: ['super-admin'] },
      expectedStatus: 403,
    });

    // Super-admin role-accounts sees every account.
    const { body: adminFound } = await apiJson<{ total?: number }>(
      request,
      'GET',
      `/admin/role-accounts?q=${encodeURIComponent(managerHold.email)}`,
      { token: admin.accessToken, expectedStatus: 200 },
    );
    expect(adminFound.total).toBe(1);
  });
});
