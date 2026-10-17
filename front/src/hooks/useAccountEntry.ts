import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthSession, useAuthPrompt } from '../state/AuthContext';
import { useLang } from '../assets/i18n';
import { localizedPath } from '../config/i18nRoutes';
import { useOrders } from './useOrders';
import { useIsDesktopNav } from './useIsDesktopNav';

/**
 * Header / mobile-nav/footer account entry: always clickable. If auth or the
 * current account's order list is still loading, a click arms a pending open
 * and waits. Authenticated customers land on active orders when any exist,
 * otherwise on the account overview.
 */
export function useAccountEntry() {
  const { status } = useAuthSession();
  const { promptAuth } = useAuthPrompt();
  const { activeOrders, loading: ordersLoading } = useOrders();
  const isDesktopNav = useIsDesktopNav();
  const navigate = useNavigate();
  const { lang } = useLang();
  const [awaitingAuth, setAwaitingAuth] = useState(false);

  useEffect(() => {
    if (!awaitingAuth || status === 'loading' || (status === 'authenticated' && ordersLoading)) return;
    setAwaitingAuth(false);
    if (status === 'authenticated') {
      navigate(localizedPath(activeOrders.length > 0 ? '/orders' : '/account', lang));
      return;
    }
    if (isDesktopNav) promptAuth('login');
    else navigate(localizedPath('/login', lang));
  }, [activeOrders.length, awaitingAuth, status, ordersLoading, isDesktopNav, navigate, promptAuth, lang]);

  function openAccountEntry() {
    if (status === 'loading') {
      setAwaitingAuth(true);
      return;
    }
    if (status === 'authenticated') {
      if (ordersLoading) {
        setAwaitingAuth(true);
        return;
      }
      navigate(localizedPath(activeOrders.length > 0 ? '/orders' : '/account', lang));
      return;
    }
    if (isDesktopNav) promptAuth('login');
    else navigate(localizedPath('/login', lang));
  }

  return { status, awaitingAuth, openAccountEntry };
}
