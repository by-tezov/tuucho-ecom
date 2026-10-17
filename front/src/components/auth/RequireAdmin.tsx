import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuthSession } from '../../state/AuthContext';
import { useLang } from '../../assets/i18n';
import { localizedPath } from '../../config/i18nRoutes';
import { isStaffRole } from '../../utils/adminRoute';

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { status, user, isImpersonating } = useAuthSession();
  const { lang } = useLang();
  if (status === 'loading') return null;
  if (status !== 'authenticated' || !isStaffRole(user?.role) || isImpersonating) {
    return <Navigate to={localizedPath('/account', lang)} replace />;
  }
  return <>{children}</>;
}
