import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthSession } from '../state/AuthContext';
import { useLang } from '../assets/i18n';
import { localizedPath } from '../config/i18nRoutes';
import { useOrders } from './useOrders';

/**
 * Mobile bottom tab bar's Commandes tab: authenticated customers land on
 * their active order(s) if any, otherwise order history; anonymous visitors
 * go to /login. Same awaitingAuth-style state machine as useAccountEntry.ts
 * (a click while auth/orders are still loading arms a pending navigation
 * instead of deciding on stale data), but this tab's fallback is order
 * history rather than the account overview — Account stays reachable from
 * the hamburger menu, unrelated to this tab.
 */
export function useOrdersTabEntry() {
  const { status } = useAuthSession();
  const { activeOrders, loading: ordersLoading } = useOrders();
  const navigate = useNavigate();
  const { lang } = useLang();
  const [awaiting, setAwaiting] = useState(false);

  useEffect(() => {
    if (!awaiting || status === 'loading' || (status === 'authenticated' && ordersLoading)) return;
    setAwaiting(false);
    if (status === 'authenticated') {
      navigate(localizedPath(activeOrders.length > 0 ? '/orders' : '/orders/history', lang));
      return;
    }
    navigate(localizedPath('/login', lang));
  }, [activeOrders.length, awaiting, status, ordersLoading, navigate, lang]);

  function openOrdersTab() {
    if (status === 'loading' || (status === 'authenticated' && ordersLoading)) {
      setAwaiting(true);
      return;
    }
    if (status === 'authenticated') {
      navigate(localizedPath(activeOrders.length > 0 ? '/orders' : '/orders/history', lang));
      return;
    }
    navigate(localizedPath('/login', lang));
  }

  return { awaiting, openOrdersTab };
}
