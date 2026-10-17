const ADMIN_ORDER_PAGE_SIZES = [15, 30, 100] as const;
const DEFAULT_ADMIN_ORDER_PAGE_SIZE = ADMIN_ORDER_PAGE_SIZES[0];
export const ADMIN_PRODUCT_REQUEST_PAGE_SIZE = 20;
export const ADMIN_CHAT_PAGE_SIZE = 20;
export const ADMIN_UNCONNECTED_CONTACT_PAGE_SIZE = 20;
const ADMIN_STOCK_PAGE_SIZES = [15, 30, 100] as const;
const DEFAULT_ADMIN_STOCK_PAGE_SIZE = ADMIN_STOCK_PAGE_SIZES[0];
const ADMIN_USER_PAGE_SIZES = [15, 30, 100] as const;
const DEFAULT_ADMIN_USER_PAGE_SIZE = ADMIN_USER_PAGE_SIZES[0];

export function requestedPage(value: unknown): number {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return 1;
  return Math.max(1, Number(value));
}

export function requestedOrderPageSize(value: unknown): (typeof ADMIN_ORDER_PAGE_SIZES)[number] {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return DEFAULT_ADMIN_ORDER_PAGE_SIZE;
  const size = Number(value);
  return ADMIN_ORDER_PAGE_SIZES.includes(size as (typeof ADMIN_ORDER_PAGE_SIZES)[number])
    ? (size as (typeof ADMIN_ORDER_PAGE_SIZES)[number])
    : DEFAULT_ADMIN_ORDER_PAGE_SIZE;
}

export function requestedStockPageSize(value: unknown): (typeof ADMIN_STOCK_PAGE_SIZES)[number] {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return DEFAULT_ADMIN_STOCK_PAGE_SIZE;
  const size = Number(value);
  return ADMIN_STOCK_PAGE_SIZES.includes(size as (typeof ADMIN_STOCK_PAGE_SIZES)[number])
    ? (size as (typeof ADMIN_STOCK_PAGE_SIZES)[number])
    : DEFAULT_ADMIN_STOCK_PAGE_SIZE;
}

export function requestedAdminUserPageSize(value: unknown): (typeof ADMIN_USER_PAGE_SIZES)[number] {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return DEFAULT_ADMIN_USER_PAGE_SIZE;
  const size = Number(value);
  return ADMIN_USER_PAGE_SIZES.includes(size as (typeof ADMIN_USER_PAGE_SIZES)[number])
    ? (size as (typeof ADMIN_USER_PAGE_SIZES)[number])
    : DEFAULT_ADMIN_USER_PAGE_SIZE;
}

/** `staff` lists every non-customer role, `all` every account (the Roles
 * page's account search). `admin` is the previous name of `staff`, kept so
 * an older front still gets the staff list. */
export function requestedAdminUserRole(value: unknown): 'user' | 'staff' | 'all' {
  if (value === 'all') return 'all';
  return value === 'staff' || value === 'admin' ? 'staff' : 'user';
}
