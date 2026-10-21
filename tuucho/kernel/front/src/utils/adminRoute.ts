import { shopConfig } from '../config/env';

/** Public route to the lazily loaded admin area. The optional deployment
 * token is deliberately part of the path, not an API credential: server-side
 * admin authorization remains mandatory for every admin request. */
export function adminPath(suffix = ''): string {
  const prefix = shopConfig.adminRouteToken ? `/${shopConfig.adminRouteToken}` : '';
  return `${prefix}/admin${suffix}`;
}

/** The highest role: every permission, role management and assignment. */
export const SUPER_ADMIN_ROLE = 'super-admin';

/** Any role other than the customer role (`user`) opens the admin area; what
 * it may do there comes from `GET /admin/access`, and the API enforces it. */
export function isStaffRole(role: string | null | undefined): boolean {
  return role != null && role !== 'user';
}
