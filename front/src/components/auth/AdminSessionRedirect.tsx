import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthSession } from '../../state/AuthContext';
import {
  preferSplashExitPath,
  shouldPlaySplashEntry,
  useSplashEntryActive,
} from '../../state/splashEntryGate';
import { isAdminBrowserSessionLive, markAdminBrowserSessionLanded } from '../../state/adminSessionLand';
import { adminPath, isStaffRole } from '../../utils/adminRoute';

/** Sends an administrator to the dashboard once per browser opening.
 * Covers an explicit login and the silent restore of a remembered session
 * on the first document of that opening. Refresh of the shop, or another
 * tab, must not steal the URL back to `/admin`.
 *
 * While the cold-load splash is still owed or on screen, do **not** navigate
 * away from `/` — Layout would bounce back to the splash route and remount
 * SplashEntry, playing the intro twice. Instead, steer the splash exit path
 * to the admin dashboard so the first (and only) intro lands there. */
export function AdminSessionRedirect() {
  const { status, user, isImpersonating } = useAuthSession();
  const location = useLocation();
  const navigate = useNavigate();
  const splashActive = useSplashEntryActive();

  useEffect(() => {
    const isAdminSession = status === 'authenticated' && isStaffRole(user?.role) && !isImpersonating;
    if (!isAdminSession) return;

    if (isAdminBrowserSessionLive()) return;

    markAdminBrowserSessionLanded();
    const dashboard = adminPath();
    if (shouldPlaySplashEntry() || splashActive) {
      preferSplashExitPath(dashboard);
      return;
    }
    if (location.pathname !== dashboard) navigate(dashboard, { replace: true });
  }, [isImpersonating, location.pathname, navigate, splashActive, status, user?.role]);

  return null;
}
