import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getAdminChatAttentionCounts,
  getAdminOrderAttentionCounts,
  getAdminProductRequestAttentionCounts,
  getAdminUnconnectedContactAttentionCounts,
  type AdminOrderAttentionCounts,
} from '../api/admin/stats';
import { listAdminOrders } from '../api/admin/orders';
import { useAuthSession } from '../state/AuthContext';
import { canAccess } from '../state/AdminAccessContext';
import type { AdminAccess } from '../api/admin/roles';

export interface AdminAttentionCounts {
  orders: AdminOrderAttentionCounts | null;
  /** Not part of the attention-counts endpoint (only confirmed/disponible/
   * received/cancelled are) — fetched separately via listAdminOrders'
   * pagination total, just for the bottom-nav Orders badge (confirmed + in
   * preparation + to send = every order still moving toward "sent"). */
  ordersInPreparation: number | null;
  ordersToSend: number | null;
  chatsOpen: number | null;
  contactsNew: number | null;
  productRequestsRequested: number | null;
}

const EMPTY: AdminAttentionCounts = {
  orders: null,
  ordersInPreparation: null,
  ordersToSend: null,
  chatsOpen: null,
  contactsNew: null,
  productRequestsRequested: null,
};

export interface AdminAttentionCountsController {
  counts: AdminAttentionCounts;
  /** Explicit refresh after an administrator changes an order/request state.
   * There is deliberately no polling: the dashboard only changes in response
   * to a human action or a page load. */
  refresh: () => Promise<void>;
}

/** Fetched when the admin area is entered, then only refreshed explicitly
 * after a human action. The request generation guard prevents a slower,
 * older refresh from overwriting a newer count snapshot. A count whose
 * section the role does not hold is never requested and stays null. */
export function useAdminAttentionCounts(access: AdminAccess): AdminAttentionCountsController {
  const { authedRequest } = useAuthSession();
  const [counts, setCounts] = useState<AdminAttentionCounts>(EMPTY);
  const requestGeneration = useRef(0);

  const refresh = useCallback(async () => {
    const generation = ++requestGeneration.current;
    // A refused section settles as rejected, exactly like a failed request.
    const ifGranted = <T>(granted: boolean, load: () => Promise<T>): Promise<T> =>
      granted ? load() : Promise.reject(new Error('not granted'));
    const orderAccess = canAccess(access, 'orders');
    const messageAccess = canAccess(access, 'messages');
    const [orders, chats, contacts, productRequests, inPreparation, toSend] = await Promise.allSettled([
      ifGranted(orderAccess, () => authedRequest((accessToken) => getAdminOrderAttentionCounts(accessToken))),
      ifGranted(messageAccess, () =>
        authedRequest((accessToken) => getAdminChatAttentionCounts(accessToken)),
      ),
      ifGranted(messageAccess, () =>
        authedRequest((accessToken) => getAdminUnconnectedContactAttentionCounts(accessToken)),
      ),
      ifGranted(canAccess(access, 'product_requests'), () =>
        authedRequest((accessToken) => getAdminProductRequestAttentionCounts(accessToken)),
      ),
      ifGranted(orderAccess, () =>
        authedRequest((accessToken) => listAdminOrders(accessToken, 'in_preparation', 1)),
      ),
      ifGranted(orderAccess, () =>
        authedRequest((accessToken) => listAdminOrders(accessToken, 'to_send', 1)),
      ),
    ]);
    if (generation !== requestGeneration.current) return;
    setCounts({
      orders: orders.status === 'fulfilled' ? orders.value.counts : null,
      ordersInPreparation: inPreparation.status === 'fulfilled' ? inPreparation.value.pagination.total : null,
      ordersToSend: toSend.status === 'fulfilled' ? toSend.value.pagination.total : null,
      chatsOpen: chats.status === 'fulfilled' ? chats.value.counts.open : null,
      contactsNew: contacts.status === 'fulfilled' ? contacts.value.counts.new : null,
      productRequestsRequested:
        productRequests.status === 'fulfilled' ? productRequests.value.counts.requested : null,
    });
  }, [access, authedRequest]);

  useEffect(() => {
    void refresh();
    return () => {
      requestGeneration.current += 1;
    };
  }, [refresh]);

  return { counts, refresh };
}
