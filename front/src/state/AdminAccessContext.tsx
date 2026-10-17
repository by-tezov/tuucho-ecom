import { createContext, useContext, type ReactNode } from 'react';
import type { AdminAccess, AdminPermissionCode } from '../api/admin/roles';

/** What the signed-in staff role may open (`GET /admin/access`). Loaded once
 * by AdminLayout before any section renders; the API stays the authority and
 * refuses a section the role does not hold, this only shapes the UI. */
const AdminAccessContext = createContext<AdminAccess | null>(null);

export function AdminAccessProvider({ access, children }: { access: AdminAccess; children: ReactNode }) {
  return <AdminAccessContext.Provider value={access}>{children}</AdminAccessContext.Provider>;
}

export function useAdminAccess(): AdminAccess {
  const access = useContext(AdminAccessContext);
  if (!access) throw new Error('useAdminAccess must be used inside AdminLayout');
  return access;
}

/** True when the role holds `permission` (an administrator holds them all). */
export function canAccess(access: AdminAccess, permission: AdminPermissionCode): boolean {
  return access.permissions.includes(permission);
}
