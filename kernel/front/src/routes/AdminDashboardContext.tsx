import { createContext, useContext } from 'react';
import type { AdminStats } from '../api/admin/stats';

export const AdminDashboardContext = createContext<{ stats: AdminStats | null }>({ stats: null });

export function useAdminDashboardStats(): AdminStats | null {
  return useContext(AdminDashboardContext).stats;
}
