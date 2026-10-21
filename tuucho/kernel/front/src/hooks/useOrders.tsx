import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuthSession } from '../state/AuthContext';
import type { GuestOrderCandidate, Order } from '../api/orders';
import { useLang } from '../assets/i18n';

const ORDERS_PAGE_SIZE = 30;

/** The orders client, loaded on first use: this provider is mounted on every
 * page (the account entry reads its snapshot), but only a signed-in session
 * ever calls the API, so the client stays off the entry bundle. */
const ordersApi = () => import('../api/orders');

interface OrdersContextValue {
  activeOrders: Order[];
  historyOrders: Order[];
  guestOrderCandidates: GuestOrderCandidate[];
  loading: boolean;
  activeHasMore: boolean;
  historyHasMore: boolean;
  loadingMoreActive: boolean;
  loadingMoreHistory: boolean;
  refreshOrders: () => Promise<void>;
  loadMoreActive: () => Promise<void>;
  loadMoreHistory: () => Promise<void>;
  removeGuestOrderCandidate: (orderId: string) => void;
  cancelOrder: (orderId: string) => Promise<Order>;
  commitCanceledOrder: (order: Order) => void;
}

const OrdersContext = createContext<OrdersContextValue | null>(null);

export function OrdersProvider({ children }: { children: ReactNode }) {
  const { status, user, authedRequest } = useAuthSession();
  const { lang } = useLang();
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [guestOrderCandidates, setGuestOrderCandidates] = useState<GuestOrderCandidate[]>([]);
  const [activeCursor, setActiveCursor] = useState<string | null>(null);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [activeHasMore, setActiveHasMore] = useState(false);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [loadingMoreActive, setLoadingMoreActive] = useState(false);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const currentSnapshotKey = status === 'authenticated' && user ? `${user.id}:${lang}` : null;
  const [snapshotKey, setSnapshotKey] = useState<string | null>(null);
  const requestGenerationRef = useRef(0);
  const statusRef = useRef(status);
  const accountIdRef = useRef<string | null>(user?.id ?? null);
  const langRef = useRef(lang);
  const snapshotKeyRef = useRef(snapshotKey);
  const inFlightRefreshRef = useRef<{ key: string | null; promise: Promise<void> } | null>(null);
  statusRef.current = status;
  accountIdRef.current = user?.id ?? null;
  langRef.current = lang;
  snapshotKeyRef.current = snapshotKey;

  const refreshOrders = useCallback((): Promise<void> => {
    const accountId = user?.id ?? null;
    const requestedSnapshotKey = status === 'authenticated' && accountId ? `${accountId}:${lang}` : null;
    const inFlight = inFlightRefreshRef.current;
    if (inFlight?.key === requestedSnapshotKey) return inFlight.promise;

    const requestGeneration = ++requestGenerationRef.current;
    const promise = (async () => {
      const isCurrent = () =>
        requestGenerationRef.current === requestGeneration &&
        statusRef.current === status &&
        accountIdRef.current === accountId &&
        langRef.current === lang;
      if (status !== 'authenticated') {
        if (!isCurrent()) return;
        setActiveOrders([]);
        setHistoryOrders([]);
        setGuestOrderCandidates([]);
        setActiveCursor(null);
        setHistoryCursor(null);
        setActiveHasMore(false);
        setHistoryHasMore(false);
        setSnapshotKey(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const authApi = await ordersApi();
        const [active, history, guest] = await Promise.all([
          authedRequest((token) => authApi.listOrders(token, 'active', { limit: ORDERS_PAGE_SIZE })),
          authedRequest((token) => authApi.listOrders(token, 'history', { limit: ORDERS_PAGE_SIZE })),
          authedRequest((token) => authApi.listGuestOrders(token)).catch(() => ({
            success: true as const,
            orders: [],
          })),
        ]);
        if (!isCurrent()) return;
        setActiveOrders(active.orders);
        setHistoryOrders(history.orders);
        setGuestOrderCandidates(guest.orders);
        setActiveCursor(active.pagination.nextCursor);
        setHistoryCursor(history.pagination.nextCursor);
        setActiveHasMore(active.pagination.hasMore);
        setHistoryHasMore(history.pagination.hasMore);
        setSnapshotKey(requestedSnapshotKey);
      } catch {
        if (!isCurrent()) return;
        if (snapshotKeyRef.current !== requestedSnapshotKey) {
          setActiveOrders([]);
          setHistoryOrders([]);
          setGuestOrderCandidates([]);
          setActiveCursor(null);
          setHistoryCursor(null);
          setActiveHasMore(false);
          setHistoryHasMore(false);
        }
        setSnapshotKey(requestedSnapshotKey);
      } finally {
        if (isCurrent()) setLoading(false);
      }
    })();

    inFlightRefreshRef.current = { key: requestedSnapshotKey, promise };
    void promise.finally(() => {
      if (inFlightRefreshRef.current?.promise === promise) inFlightRefreshRef.current = null;
    });
    return promise;
  }, [status, user?.id, authedRequest, lang]);

  const loadMoreActive = useCallback(async () => {
    if (!activeHasMore || !activeCursor || loadingMoreActive || status !== 'authenticated') return;
    setLoadingMoreActive(true);
    try {
      const authApi = await ordersApi();
      const page = await authedRequest((token) =>
        authApi.listOrders(token, 'active', { limit: ORDERS_PAGE_SIZE, cursor: activeCursor }),
      );
      setActiveOrders((current) => {
        const seen = new Set(current.map((order) => order.id));
        return [...current, ...page.orders.filter((order) => !seen.has(order.id))];
      });
      setActiveCursor(page.pagination.nextCursor);
      setActiveHasMore(page.pagination.hasMore);
    } finally {
      setLoadingMoreActive(false);
    }
  }, [activeCursor, activeHasMore, authedRequest, loadingMoreActive, status]);

  const loadMoreHistory = useCallback(async () => {
    if (!historyHasMore || !historyCursor || loadingMoreHistory || status !== 'authenticated') return;
    setLoadingMoreHistory(true);
    try {
      const authApi = await ordersApi();
      const page = await authedRequest((token) =>
        authApi.listOrders(token, 'history', { limit: ORDERS_PAGE_SIZE, cursor: historyCursor }),
      );
      setHistoryOrders((current) => {
        const seen = new Set(current.map((order) => order.id));
        return [...current, ...page.orders.filter((order) => !seen.has(order.id))];
      });
      setHistoryCursor(page.pagination.nextCursor);
      setHistoryHasMore(page.pagination.hasMore);
    } finally {
      setLoadingMoreHistory(false);
    }
  }, [authedRequest, historyCursor, historyHasMore, loadingMoreHistory, status]);

  useEffect(() => {
    void refreshOrders();
  }, [status, user?.id, authedRequest, lang, refreshOrders]);

  const cancelOrder = useCallback(
    async (orderId: string) => {
      const authApi = await ordersApi();
      const result = await authedRequest((token) => authApi.cancelOrder(token, orderId));
      return result.order;
    },
    [authedRequest],
  );

  const commitCanceledOrder = useCallback((order: Order) => {
    setActiveOrders((current) => current.filter((item) => item.id !== order.id));
    setHistoryOrders((current) => [order, ...current.filter((item) => item.id !== order.id)]);
  }, []);

  const removeGuestOrderCandidate = useCallback((orderId: string) => {
    setGuestOrderCandidates((current) => current.filter((order) => order.id !== orderId));
  }, []);

  const contentLoading = status === 'authenticated' && (loading || snapshotKey !== currentSnapshotKey);

  const value = useMemo<OrdersContextValue>(
    () => ({
      activeOrders,
      historyOrders,
      guestOrderCandidates,
      loading: contentLoading,
      activeHasMore,
      historyHasMore,
      loadingMoreActive,
      loadingMoreHistory,
      refreshOrders,
      loadMoreActive,
      loadMoreHistory,
      removeGuestOrderCandidate,
      cancelOrder,
      commitCanceledOrder,
    }),
    [
      activeOrders,
      historyOrders,
      guestOrderCandidates,
      contentLoading,
      activeHasMore,
      historyHasMore,
      loadingMoreActive,
      loadingMoreHistory,
      refreshOrders,
      loadMoreActive,
      loadMoreHistory,
      removeGuestOrderCandidate,
      cancelOrder,
      commitCanceledOrder,
    ],
  );

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
}

export function useOrders(): OrdersContextValue {
  const context = useContext(OrdersContext);
  if (!context) throw new Error('useOrders must be used within OrdersProvider');
  return context;
}

/** Orders routes deliberately revalidate once on entry. The provider's
 * account-wide snapshot may already be ready for navigation decisions, but
 * the page itself stays behind the in-content loader until this entry check
 * settles. Concurrent StrictMode/provider refreshes are coalesced above. */
export function useOrdersPageData(): OrdersContextValue {
  const orders = useOrders();
  const refreshOrders = orders.refreshOrders;
  const [entryLoading, setEntryLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setEntryLoading(true);
    void refreshOrders().finally(() => {
      if (!cancelled) setEntryLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshOrders]);

  return useMemo(() => ({ ...orders, loading: orders.loading || entryLoading }), [entryLoading, orders]);
}
