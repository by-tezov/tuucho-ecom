import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/config/env', () => ({
  shopConfig: { adminRouteToken: '' },
}));

import {
  adminPermissionRows,
  buildAdminSections,
  canOpenSection,
  type AdminNavItem,
} from '../../../src/routes/adminNav';
import { isStaffRole } from '../../../src/utils/adminRoute';
import type { AdminAccess, AdminPermissionCode } from '../../../src/api/admin/roles';
import { admin as frAdmin } from '../../../src/assets/i18n/strings/fr/admin';
import { adminUi as frAdminUi } from '../../../src/assets/i18n/admin/strings/fr';

const ALL_PERMISSIONS: AdminPermissionCode[] = [
  'stats',
  'orders',
  'product_requests',
  'messages',
  'users',
  'impersonate',
  'reviews',
  'library_stock',
  'accessory_stock',
  'catalogue_edit',
  'cart_rules',
  'vouchers',
  'loyalty',
  'gift',
  'preferences',
  'activity',
  'cron_logs',
  'api_log',
  'email_log',
];

const emptyCounts = {
  orders: null,
  ordersInPreparation: null,
  ordersToSend: null,
  chatsOpen: null,
  contactsNew: null,
  productRequestsRequested: null,
};

function access(partial: Partial<AdminAccess>): AdminAccess {
  return {
    roles: [],
    manageRoles: false,
    permissions: [],
    assignableRoles: [],
    targetableRoles: { all: false, roles: [] },
    ...partial,
  };
}

describe('canOpenSection', () => {
  const ordersItem: AdminNavItem = {
    id: 'orders',
    group: 'activity',
    to: '/admin/orders',
    label: 'Commandes',
    description: '',
    icon: null as unknown as AdminNavItem['icon'],
    count: 0,
    access: 'orders',
  };
  const rolesItem: AdminNavItem = {
    ...ordersItem,
    id: 'roles',
    access: 'roles',
    label: 'Rôles',
  };

  it('opens a section only when the permission is held', () => {
    expect(canOpenSection(ordersItem, access({ permissions: ['orders'] }))).toBe(true);
    expect(canOpenSection(ordersItem, access({ permissions: ['users'] }))).toBe(false);
  });

  it('opens Roles for a super-admin, or for an account that may assign roles', () => {
    expect(canOpenSection(rolesItem, access({ manageRoles: true, permissions: ALL_PERMISSIONS }))).toBe(true);
    expect(
      canOpenSection(
        rolesItem,
        access({
          permissions: [],
          assignableRoles: [{ code: 'preparator', label: 'Préparateur' }],
        }),
      ),
    ).toBe(true);
    // Every permission but nothing assignable (empty resolved lists): no Roles page.
    expect(canOpenSection(rolesItem, access({ manageRoles: false, permissions: ALL_PERMISSIONS }))).toBe(
      false,
    );
  });
});

describe('buildAdminSections permission coverage', () => {
  it('covers every permission except stats; each journal plugin has its own code', () => {
    const sections = buildAdminSections({ admin: frAdmin }, frAdminUi, emptyCounts);
    const permissionEntries = sections.filter((item) => item.access !== 'roles');
    const codes = permissionEntries.map((item) => item.access);
    expect(codes).not.toContain('stats');
    expect(codes.filter((code) => code === 'api_log').length).toBe(1);
    expect(codes.filter((code) => code === 'email_log').length).toBe(1);
    for (const code of ALL_PERMISSIONS) {
      // Stats live on the dashboard.
      if (code === 'stats') continue;
      expect(codes).toContain(code);
    }
    const vocabulary = sections.find((item) => item.id === 'catalogue-vocabulary');
    expect(vocabulary?.group).toBe('settings');
    expect(vocabulary?.access).toBe('catalogue_edit');
    expect(sections.some((item) => item.access === 'roles')).toBe(true);
    expect(sections.some((item) => item.id === 'reviews')).toBe(true);
  });

  it('keeps kernel sections on without a pluginId; commerce and journals are plugins', () => {
    const sections = buildAdminSections({ admin: frAdmin }, frAdminUi, emptyCounts);
    const byId = Object.fromEntries(sections.map((item) => [item.id, item]));
    for (const id of [
      'orders',
      'contact',
      'users',
      'library-stock',
      'accessory-stock',
      'preferences',
      'shop-setup',
      'plugins',
      'roles',
      'catalogue-vocabulary',
      'impersonate',
    ]) {
      expect(byId[id]?.pluginId, id).toBeUndefined();
    }
    expect(byId['product-requests']?.pluginId).toBe('commerce-product-requests');
    expect(byId.loyalty?.pluginId).toBe('commerce-loyalty');
    expect(byId.gift?.pluginId).toBe('commerce-gift');
    expect(byId.reviews?.pluginId).toBe('commerce-reviews');
    expect(byId.vouchers?.pluginId).toBe('commerce-vouchers');
    expect(byId['cart-rules']?.pluginId).toBe('commerce-cart-rules');
    expect(byId['api-log']?.pluginId).toBe('journal-admin');
    expect(byId['email-log']?.pluginId).toBe('journal-email');
    expect(byId['cron-logs']?.pluginId).toBe('journal-cron');
    expect(byId.docs?.pluginId).toBe('docs-developer');
    expect(byId.docs?.group).toBe('standalone');
  });

  it('puts product editing in Catalogue and stock, shared by the four lists', () => {
    const row = adminPermissionRows({ admin: frAdmin }, frAdminUi).find(
      (entry) => entry.code === 'catalogue_edit',
    );
    expect(row?.group).toBe('catalog');
    expect(row?.label).toBe(frAdminUi.roles.catalogueEditLabel);
  });
});

describe('isStaffRole', () => {
  it('treats any non-customer summary as staff', () => {
    expect(isStaffRole('user')).toBe(false);
    expect(isStaffRole(null)).toBe(false);
    expect(isStaffRole(undefined)).toBe(false);
    expect(isStaffRole('super-admin')).toBe(true);
    expect(isStaffRole('manager')).toBe(true);
    expect(isStaffRole('preparator')).toBe(true);
  });
});
