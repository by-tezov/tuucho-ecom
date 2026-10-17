import type { ReactElement } from 'react';
import type { AdminStrings } from '../assets/i18n/types';
import type { AdminUiStrings } from '../assets/i18n/admin';
import { adminPath } from '../utils/adminRoute';
import type { AdminAttentionCounts } from '../hooks/useAdminAttentionCounts';
import {
  AccessoryStockTileIcon,
  ActivityTileIcon,
  CronLogsTileIcon,
  CartRulesTileIcon,
  ChatsTileIcon,
  ImpersonateTileIcon,
  LibraryStockTileIcon,
  OrdersTileIcon,
  PreferencesTileIcon,
  ProductRequestsTileIcon,
  UsersTileIcon,
  VouchersTileIcon,
  LoyaltyTileIcon,
  GiftTileIcon,
  ReviewsTileIcon,
  ApiLogTileIcon,
  EmailLogTileIcon,
  RolesTileIcon,
  VocabularyTileIcon,
  PluginsTileIcon,
  DocsTileIcon,
} from './AdminPageIcons';
import type { AdminAccess, AdminPermissionCode } from '../api/admin/roles';

export type AdminNavGroup =
  'standalone' | 'activity' | 'journal' | 'customers' | 'catalog' | 'commerce' | 'settings';

/** Groups split the sections into scannable blocks in the sidebar and the
 * mobile "Plus" sheet. `standalone` is omitted: those items render above
 * Accueil with no group label. */
export function adminNavGroups(a: AdminUiStrings): { id: AdminNavGroup; label: string }[] {
  return [
    { id: 'activity', label: a.nav.groupActivity },
    { id: 'catalog', label: a.nav.groupCatalog },
    { id: 'customers', label: a.nav.groupCustomers },
    { id: 'commerce', label: a.nav.groupCommerce },
    { id: 'settings', label: a.nav.groupSettings },
    { id: 'journal', label: a.nav.groupJournal },
  ];
}

export interface AdminNavItem {
  id: string;
  group: AdminNavGroup;
  to: string;
  /** Other paths that belong to this entry (highlighted as active there). */
  alsoActiveOn?: string[];
  label: string;
  description: string;
  icon: ReactElement;
  count: number;
  /** The permission that opens this section; `roles` is the Roles page: a
   * super-admin, or anyone who may assign roles (its account search only). */
  access: AdminPermissionCode | 'roles';
  /** When set, the item is hidden while that plugin is disabled. */
  pluginId?: string;
}

/** Whether the signed-in role may open `item` (the API enforces the same). */
export function canOpenSection(item: AdminNavItem, access: AdminAccess): boolean {
  if (item.access === 'roles') return access.manageRoles || access.assignableRoles.length > 0;
  return access.permissions.includes(item.access);
}

/** Single source of truth for the admin section list — feeds the desktop
 * sidebar and the mobile "Plus" sheet.
 * Stats has no entry here: its figures live on the dashboard instead (see
 * AdminPage.tsx), so it isn't a destination of its own. */
export function buildAdminSections(
  t: { admin: AdminStrings },
  a: AdminUiStrings,
  counts: AdminAttentionCounts,
): AdminNavItem[] {
  return [
    {
      id: 'activity-journal',
      access: 'activity',
      group: 'journal',
      to: adminPath('/activity'),
      label: a.nav.activityLabel,
      description: a.nav.activityDescription,
      icon: <ActivityTileIcon />,
      count: 0,
    },
    {
      id: 'cron-logs',
      access: 'cron_logs',
      pluginId: 'journal-cron',
      group: 'journal',
      to: adminPath('/crons'),
      label: a.nav.cronsLabel,
      description: a.nav.cronsDescription,
      icon: <CronLogsTileIcon />,
      count: 0,
    },
    {
      id: 'api-log',
      access: 'api_log',
      pluginId: 'journal-admin',
      group: 'journal',
      to: adminPath('/api-log'),
      label: a.nav.apiLogLabel,
      description: a.nav.apiLogDescription,
      icon: <ApiLogTileIcon />,
      count: 0,
    },
    {
      id: 'email-log',
      access: 'email_log',
      pluginId: 'journal-email',
      group: 'journal',
      to: adminPath('/email-log'),
      label: a.nav.emailLogLabel,
      description: a.nav.emailLogDescription,
      icon: <EmailLogTileIcon />,
      count: 0,
    },
    {
      id: 'orders',
      access: 'orders',
      group: 'activity',
      to: adminPath('/orders'),
      label: t.admin.ordersTitle,
      description: t.admin.ordersDescription,
      icon: <OrdersTileIcon />,
      // Every order requiring attention before "sent": the normal
      // fulfilment queues plus internal payment exceptions awaiting a human
      // decision.
      count:
        (counts.orders?.needReview ?? 0) +
        (counts.orders?.confirmed ?? 0) +
        (counts.ordersInPreparation ?? 0) +
        (counts.ordersToSend ?? 0),
    },
    {
      id: 'product-requests',
      access: 'product_requests',
      pluginId: 'commerce-product-requests',
      group: 'activity',
      to: adminPath('/product-requests'),
      label: t.admin.productRequestsTitle,
      description: t.admin.productRequestsDescription,
      icon: <ProductRequestsTileIcon />,
      count: counts.productRequestsRequested ?? 0,
    },
    {
      // One entry for both inboxes: the page itself switches between
      // registered customers (chats) and guests (contact form).
      id: 'contact',
      access: 'messages',
      group: 'activity',
      to: adminPath('/chats'),
      alsoActiveOn: [adminPath('/unconnected-contacts')],
      label: a.nav.contactLabel,
      description: a.nav.contactDescription,
      icon: <ChatsTileIcon />,
      count: (counts.chatsOpen ?? 0) + (counts.contactsNew ?? 0),
    },
    {
      id: 'users',
      access: 'users',
      group: 'customers',
      to: adminPath('/users'),
      label: t.admin.usersTitle,
      description: t.admin.usersDescription,
      icon: <UsersTileIcon />,
      count: 0,
    },
    {
      id: 'reviews',
      access: 'reviews',
      pluginId: 'commerce-reviews',
      group: 'customers',
      to: adminPath('/reviews'),
      label: a.nav.reviewsLabel,
      description: a.nav.reviewsDescription,
      icon: <ReviewsTileIcon />,
      count: 0,
    },
    {
      id: 'library-stock',
      access: 'library_stock',
      group: 'catalog',
      to: adminPath('/library-stock'),
      label: t.admin.libraryStockTitle,
      description: t.admin.libraryStockDescription,
      icon: <LibraryStockTileIcon />,
      count: 0,
    },
    {
      id: 'accessory-stock',
      access: 'accessory_stock',
      group: 'catalog',
      to: adminPath('/accessory-stock'),
      label: t.admin.accessoryStockTitle,
      description: t.admin.accessoryStockDescription,
      icon: <AccessoryStockTileIcon />,
      count: 0,
    },
    {
      id: 'cart-rules',
      access: 'cart_rules',
      pluginId: 'commerce-cart-rules',
      group: 'commerce',
      to: adminPath('/cart-rules'),
      label: t.admin.cartRulesTitle,
      description: t.admin.cartRulesDescription,
      icon: <CartRulesTileIcon />,
      count: 0,
    },
    {
      id: 'vouchers',
      access: 'vouchers',
      pluginId: 'commerce-vouchers',
      group: 'commerce',
      to: adminPath('/vouchers'),
      label: t.admin.vouchersTitle,
      description: t.admin.vouchersDescription,
      icon: <VouchersTileIcon />,
      count: 0,
    },
    {
      id: 'loyalty',
      access: 'loyalty',
      pluginId: 'commerce-loyalty',
      group: 'commerce',
      to: adminPath('/loyalty'),
      label: t.admin.loyaltyTitle,
      description: t.admin.loyaltyDescription,
      icon: <LoyaltyTileIcon />,
      count: 0,
    },
    {
      id: 'gift',
      access: 'gift',
      pluginId: 'commerce-gift',
      group: 'commerce',
      to: adminPath('/gift'),
      label: t.admin.giftTitle,
      description: t.admin.giftDescription,
      icon: <GiftTileIcon />,
      count: 0,
    },
    {
      id: 'preferences',
      access: 'preferences',
      group: 'settings',
      to: adminPath('/preferences'),
      label: t.admin.preferencesTitle,
      description: t.admin.preferencesDescription,
      icon: <PreferencesTileIcon />,
      count: 0,
    },
    {
      id: 'shop-setup',
      access: 'preferences',
      group: 'settings',
      to: adminPath('/shop'),
      label: a.whiteLabel.boutiqueNavLabel,
      description: a.whiteLabel.boutiqueNavDescription,
      icon: <PreferencesTileIcon />,
      count: 0,
    },
    {
      id: 'plugins',
      access: 'preferences',
      group: 'settings',
      to: adminPath('/plugins'),
      label: a.whiteLabel.pluginsNavLabel,
      description: a.whiteLabel.pluginsNavDescription,
      icon: <PluginsTileIcon />,
      count: 0,
    },
    {
      id: 'docs',
      access: 'preferences',
      pluginId: 'docs-developer',
      group: 'standalone',
      to: adminPath('/docs'),
      label: a.whiteLabel.docsNavLabel,
      description: a.whiteLabel.docsNavDescription,
      icon: <DocsTileIcon />,
      count: 0,
    },
    {
      id: 'roles',
      access: 'roles',
      group: 'settings',
      to: adminPath('/roles'),
      label: a.nav.rolesLabel,
      description: a.nav.rolesDescription,
      icon: <RolesTileIcon />,
      count: 0,
    },
    {
      id: 'catalogue-vocabulary',
      access: 'catalogue_edit',
      group: 'settings',
      to: adminPath('/catalogue-vocabulary'),
      label: a.nav.vocabularyLabel,
      description: a.nav.vocabularyDescription,
      icon: <VocabularyTileIcon />,
      count: 0,
    },
    {
      id: 'impersonate',
      access: 'impersonate',
      group: 'customers',
      to: adminPath('/impersonate'),
      label: t.admin.impersonateTitle,
      description: t.admin.impersonateDescription,
      icon: <ImpersonateTileIcon />,
      count: 0,
    },
  ];
}

const NO_COUNTS: AdminAttentionCounts = {
  orders: null,
  ordersInPreparation: null,
  ordersToSend: null,
  chatsOpen: null,
  contactsNew: null,
  productRequestsRequested: null,
};

export interface AdminPermissionRow {
  code: AdminPermissionCode;
  group: AdminNavGroup;
  label: string;
  description: string;
}

/** The rows of a role's permission matrix, one per grantable section, with
 * the same label, description and group as the navigation entry it opens.
 * Dashboard statistics have no entry of their own (see buildAdminSections),
 * so they lead the first group. */
export function adminPermissionRows(t: { admin: AdminStrings }, a: AdminUiStrings): AdminPermissionRow[] {
  const sectionRows = buildAdminSections(t, a, NO_COUNTS).flatMap((item) =>
    item.access === 'roles' ||
    item.id === 'catalogue-vocabulary' ||
    item.id === 'plugins' ||
    item.id === 'shop-setup' ||
    item.id === 'docs'
      ? []
      : [{ code: item.access, group: item.group, label: item.label, description: item.description }],
  );
  const rows: AdminPermissionRow[] = [
    { code: 'stats', group: 'activity', label: t.admin.statsTitle, description: a.roles.statsLabel },
    ...sectionRows,
  ];
  const accessory = rows.findIndex((row) => row.code === 'accessory_stock');
  rows.splice(accessory + 1, 0, {
    code: 'catalogue_edit',
    group: 'catalog',
    label: a.roles.catalogueEditLabel,
    description: a.roles.catalogueEditDescription,
  });
  return rows;
}
