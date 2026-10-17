import { useCallback, useEffect, useState } from 'react';
import { BottomSheet } from '../../components/ui/BottomSheet';
import {
  listAdminUserChats,
  listAdminUserContacts,
  listAdminUserIdentityHistory,
  listAdminUserOrders,
  listAdminUserProductRequests,
  type AdminIdentityHistoryEvent,
  type AdminUserOrderSummary,
  type AdminUserSummary,
} from '../../api/admin/users';
import type { AdminChatSummary } from '../../api/admin/chats';
import type { AdminUnconnectedContactSummary } from '../../api/admin/contacts';
import { getAdminOrder, type AdminOrder, type AdminOrderPagination } from '../../api/admin/orders';
import type { AdminProductRequest } from '../../api/admin/productRequests';
import { listAdminUserLoyaltyLedger, type LoyaltyLedgerEntry } from '../../api/loyalty';
import { useLang } from '../../assets/i18n';
import { useAuthSession } from '../../state/AuthContext';
import { formatPrice } from '../../utils/formatPrice';
import { withMinDuration } from '../../utils/withMinDuration';
import { shopConfig } from '../../config/env';
import styles from '../AdminUsersPage.module.css';

/** The paginated activity lists opened from a user card (orders, contacts,
 * chats, product requests, identity history, loyalty ledger), and the
 * read-only order snapshot an order row opens. Split from AdminUsersPage. */

const PAGE_SIZES = [15, 30, 100] as const;
export type ActivityKind = 'orders' | 'contacts' | 'chats' | 'requests' | 'identity' | 'loyalty';

export function dateTime(value: string | null, language: string): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

export function date(value: string, language: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(new Date(value));
}

function orderStatusLabel(
  status: AdminUserOrderSummary['status'],
  t: ReturnType<typeof useLang>['t'],
): string {
  switch (status) {
    case 'confirmed':
      return t.ordersPage.statusConfirmed;
    case 'in_preparation':
      return t.ordersPage.statusInPreparation;
    case 'to_send':
      return t.ordersPage.statusToSend;
    case 'sent':
      return t.ordersPage.statusSent;
    case 'disponible':
      return t.ordersPage.statusDisponible;
    case 'received':
      return t.ordersPage.statusReceived;
    case 'cancelled':
      return t.ordersPage.statusCancelled;
    case 'need_review':
      return t.admin.needReviewOrderStatus;
    case 'return_review':
      return t.admin.returnReviewOrderStatus;
  }
}

function identityEventLabel(event: AdminIdentityHistoryEvent, t: ReturnType<typeof useLang>['t']): string {
  switch (event.kind) {
    case 'account_created':
      return t.admin.userIdentityEventAccountCreated;
    case 'email_changed':
      return t.admin.userIdentityEventEmailChanged(event.previousEmail ?? '-', event.email ?? '-');
    case 'google_linked':
      return t.admin.userIdentityEventGoogleLinked;
    case 'google_unlinked':
      return t.admin.userIdentityEventGoogleUnlinked;
    case 'facebook_linked':
      return t.admin.userIdentityEventFacebookLinked;
    case 'facebook_unlinked':
      return t.admin.userIdentityEventFacebookUnlinked;
    case 'apple_linked':
      return t.admin.userIdentityEventAppleLinked;
    case 'apple_unlinked':
      return t.admin.userIdentityEventAppleUnlinked;
  }
}

export function UserActivityModal({
  kind,
  user,
  onClose,
}: {
  kind: ActivityKind;
  user: AdminUserSummary;
  onClose: () => void;
}) {
  const { t, lang } = useLang();
  const { authedRequest } = useAuthSession();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  const [pagination, setPagination] = useState<AdminOrderPagination | null>(null);
  const [orders, setOrders] = useState<AdminUserOrderSummary[]>([]);
  const [contacts, setContacts] = useState<AdminUnconnectedContactSummary[]>([]);
  const [chats, setChats] = useState<AdminChatSummary[]>([]);
  const [requests, setRequests] = useState<AdminProductRequest[]>([]);
  const [identityEvents, setIdentityEvents] = useState<AdminIdentityHistoryEvent[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LoyaltyLedgerEntry[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [orderLoading, setOrderLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (nextPage: number, nextPageSize: number) => {
      setLoading(true);
      setError(null);
      setSelectedOrder(null);
      try {
        if (kind === 'orders') {
          const result = await withMinDuration(
            authedRequest((token) => listAdminUserOrders(token, user.id, nextPage, nextPageSize)),
            shopConfig.loadingMinMs.short,
          );
          setOrders(result.orders);
          setPage(result.pagination.page);
          setPagination(result.pagination);
        } else if (kind === 'contacts') {
          const result = await withMinDuration(
            authedRequest((token) => listAdminUserContacts(token, user.id, nextPage, nextPageSize)),
            shopConfig.loadingMinMs.short,
          );
          setContacts(result.contacts);
          setPage(result.pagination.page);
          setPagination(result.pagination);
        } else if (kind === 'chats') {
          const result = await withMinDuration(
            authedRequest((token) => listAdminUserChats(token, user.id, nextPage, nextPageSize)),
            shopConfig.loadingMinMs.short,
          );
          setChats(result.chats);
          setPage(result.pagination.page);
          setPagination(result.pagination);
        } else if (kind === 'identity') {
          const result = await withMinDuration(
            authedRequest((token) => listAdminUserIdentityHistory(token, user.id, nextPage, nextPageSize)),
            shopConfig.loadingMinMs.short,
          );
          setIdentityEvents(result.events);
          setPage(result.pagination.page);
          setPagination(result.pagination);
        } else if (kind === 'loyalty') {
          const result = await withMinDuration(
            authedRequest((token) => listAdminUserLoyaltyLedger(token, user.id, nextPage, nextPageSize)),
            shopConfig.loadingMinMs.short,
          );
          setLedgerEntries(result.entries);
          setPage(result.pagination.page);
          setPagination({
            ...result.pagination,
            totalPages: Math.max(1, Math.ceil(result.pagination.total / result.pagination.pageSize)),
          });
        } else {
          const result = await withMinDuration(
            authedRequest((token) => listAdminUserProductRequests(token, user.id, nextPage, nextPageSize)),
            shopConfig.loadingMinMs.short,
          );
          setRequests(result.requests);
          setPage(result.pagination.page);
          setPagination(result.pagination);
        }
      } catch {
        setError(t.admin.actionError);
      } finally {
        setLoading(false);
      }
    },
    [authedRequest, kind, t.admin.actionError, user.id],
  );

  useEffect(() => {
    void load(1, pageSize);
  }, [load, pageSize]);

  async function openOrder(order: AdminUserOrderSummary) {
    setOrderLoading(true);
    setError(null);
    try {
      const result = await withMinDuration(
        authedRequest((token) => getAdminOrder(token, order.id)),
        shopConfig.loadingMinMs.short,
      );
      setSelectedOrder(result.order);
    } catch {
      setError(t.admin.actionError);
    } finally {
      setOrderLoading(false);
    }
  }

  const title = selectedOrder
    ? t.admin.userOrderDetailModalTitle(selectedOrder.orderNumber)
    : kind === 'orders'
      ? t.admin.userOrdersModalTitle(user.email)
      : kind === 'contacts'
        ? t.admin.userContactsModalTitle(user.email)
        : kind === 'chats'
          ? t.admin.userChatsModalTitle(user.email)
          : kind === 'identity'
            ? t.admin.userIdentityHistoryModalTitle(user.email)
            : kind === 'loyalty'
              ? t.admin.loyaltyLedgerModalTitle(user.email)
              : t.admin.userProductRequestsModalTitle(user.email);

  return (
    <BottomSheet title={title} onClose={onClose} closeLabel={t.gallery.close}>
      {selectedOrder ? (
        <ReadOnlyOrderDetail order={selectedOrder} onBack={() => setSelectedOrder(null)} />
      ) : (
        <>
          {kind === 'contacts' && <p className={styles.matchNote}>{t.admin.userEmailMatchedContacts}</p>}
          {error && (
            <p className={styles.modalError} role="alert">
              {error}
            </p>
          )}
          {loading ? (
            <p className={styles.modalEmpty} role="status">
              {t.admin.contentLoading}
            </p>
          ) : (
            <ActivityRows
              kind={kind}
              orders={orders}
              contacts={contacts}
              chats={chats}
              requests={requests}
              identityEvents={identityEvents}
              ledgerEntries={ledgerEntries}
              language={lang}
              t={t}
              onOrder={(order) => void openOrder(order)}
            />
          )}
          {!loading &&
            !error &&
            itemCount(kind, orders, contacts, chats, requests, identityEvents, ledgerEntries) === 0 && (
              <p className={styles.modalEmpty}>{t.admin.userActivityEmpty}</p>
            )}
          {pagination && pagination.totalPages > 1 && (
            <nav className={styles.modalPagination} aria-label={title}>
              <button
                type="button"
                disabled={page <= 1 || orderLoading}
                onClick={() => void load(page - 1, pageSize)}
              >
                {t.admin.previousPage}
              </button>
              <span>
                {page} / {pagination.totalPages}
              </span>
              <button
                type="button"
                disabled={page >= pagination.totalPages || orderLoading}
                onClick={() => void load(page + 1, pageSize)}
              >
                {t.admin.nextPage}
              </button>
            </nav>
          )}
          <label className={styles.modalPageSize}>
            <span>{t.admin.itemsPerPage}</span>
            <select
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
              disabled={loading || orderLoading}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          {orderLoading && (
            <p className={styles.modalEmpty} role="status">
              {t.admin.contentLoading}
            </p>
          )}
        </>
      )}
    </BottomSheet>
  );
}

function itemCount(
  kind: ActivityKind,
  orders: AdminUserOrderSummary[],
  contacts: AdminUnconnectedContactSummary[],
  chats: AdminChatSummary[],
  requests: AdminProductRequest[],
  identityEvents: AdminIdentityHistoryEvent[],
  ledgerEntries: LoyaltyLedgerEntry[],
) {
  if (kind === 'orders') return orders.length;
  if (kind === 'contacts') return contacts.length;
  if (kind === 'chats') return chats.length;
  if (kind === 'identity') return identityEvents.length;
  if (kind === 'loyalty') return ledgerEntries.length;
  return requests.length;
}

function ledgerKindLabel(kind: LoyaltyLedgerEntry['kind'], t: ReturnType<typeof useLang>['t']): string {
  switch (kind) {
    case 'earn':
      return t.admin.loyaltyLedgerKindEarn;
    case 'spend':
      return t.admin.loyaltyLedgerKindSpend;
    case 'spend_refund':
      return t.admin.loyaltyLedgerKindSpendRefund;
    case 'expire':
      return t.admin.loyaltyLedgerKindExpire;
    case 'earn_reversal':
      return t.admin.loyaltyLedgerKindEarnReversal;
    case 'credit_manual':
      return t.admin.loyaltyLedgerKindCreditManual;
    case 'uncredit_manual':
      return t.admin.loyaltyLedgerKindUncreditManual;
  }
}

function ActivityRows({
  kind,
  orders,
  contacts,
  chats,
  requests,
  identityEvents,
  ledgerEntries,
  language,
  t,
  onOrder,
}: {
  kind: ActivityKind;
  orders: AdminUserOrderSummary[];
  contacts: AdminUnconnectedContactSummary[];
  chats: AdminChatSummary[];
  requests: AdminProductRequest[];
  identityEvents: AdminIdentityHistoryEvent[];
  ledgerEntries: LoyaltyLedgerEntry[];
  language: string;
  t: ReturnType<typeof useLang>['t'];
  onOrder: (order: AdminUserOrderSummary) => void;
}) {
  if (kind === 'orders') {
    return (
      <ul className={styles.activityList}>
        {orders.map((order) => (
          <li key={order.id}>
            <button
              type="button"
              className={styles.activityButton}
              aria-label={`${order.orderNumber}, ${orderStatusLabel(order.status, t)}, ${formatPrice(order.total)}`}
              onClick={() => onOrder(order)}
            >
              <span>
                <strong>{order.orderNumber}</strong>
                <small>{date(order.confirmedAt, language)}</small>
              </span>
              <span>
                <em>{orderStatusLabel(order.status, t)}</em>
                <strong>{formatPrice(order.total)}</strong>
              </span>
            </button>
          </li>
        ))}
      </ul>
    );
  }
  if (kind === 'contacts') {
    return (
      <ul className={styles.activityList}>
        {contacts.map((contact) => (
          <li key={contact.publicId} className={styles.activityPlain}>
            <span>
              <strong>{contact.identity || contact.email}</strong>
              <small>{dateTime(contact.createdAt, language)}</small>
            </span>
            <span>
              <em>{contact.status}</em>
              <small>
                {contact.messageCount} {t.admin.userActivityMessages.toLowerCase()}
              </small>
            </span>
            {contact.preview && <p>{contact.preview}</p>}
          </li>
        ))}
      </ul>
    );
  }
  if (kind === 'chats') {
    return (
      <ul className={styles.activityList}>
        {chats.map((chat) => (
          <li key={chat.publicId} className={styles.activityPlain}>
            <span>
              <strong>{chat.identity || chat.email}</strong>
              <small>{dateTime(chat.lastMessageAt ?? chat.createdAt, language)}</small>
            </span>
            <span>
              <em>{chat.status}</em>
              <small>
                {chat.messageCount} {t.admin.userActivityMessages.toLowerCase()}
              </small>
            </span>
            {chat.preview && <p>{chat.preview}</p>}
          </li>
        ))}
      </ul>
    );
  }
  if (kind === 'identity') {
    return (
      <ul className={styles.activityList}>
        {identityEvents.map((event, index) => (
          <li key={`${event.kind}-${event.createdAt}-${index}`} className={styles.activityPlain}>
            <span>
              <strong>{identityEventLabel(event, t)}</strong>
              <small>{dateTime(event.createdAt, language)}</small>
            </span>
            {event.kind !== 'email_changed' && event.email && (
              <span>
                <em>{event.email}</em>
              </span>
            )}
            {event.backfilled && (
              <p className={styles.backfilledNote}>{t.admin.userIdentityEventBackfilled}</p>
            )}
          </li>
        ))}
      </ul>
    );
  }
  if (kind === 'loyalty') {
    return (
      <ul className={styles.activityList}>
        {ledgerEntries.map((entry) => (
          <li key={entry.id} className={styles.activityPlain}>
            <span>
              <strong>{ledgerKindLabel(entry.kind, t)}</strong>
              <small>{dateTime(entry.createdAt, language)}</small>
            </span>
            <span>
              <em>{formatPrice(Math.abs(entry.amount))}</em>
              {entry.orderNumber && <small>{t.loyalty.ledgerOrder(entry.orderNumber)}</small>}
              {entry.reason && <small>{entry.reason}</small>}
            </span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className={styles.activityList}>
      {requests.map((request) => (
        <li key={request.id} className={styles.activityPlain}>
          <span>
            <strong>{request.title}</strong>
            <small>{dateTime(request.createdAt, language)}</small>
          </span>
          <span>
            <em>{request.status}</em>
            <small>
              {request.quantity} × {request.size}
            </small>
          </span>
          <p>
            {request.productUid} · {request.shapeLabel} · {request.lengthKey}
          </p>
        </li>
      ))}
    </ul>
  );
}

function ReadOnlyOrderDetail({ order, onBack }: { order: AdminOrder; onBack: () => void }) {
  const { t, lang } = useLang();
  const identity = order.companyName ?? order.recipientName;
  return (
    <article className={styles.orderDetail}>
      <button type="button" className={styles.backButton} onClick={onBack}>
        {t.admin.previousPage}
      </button>
      <div className={styles.orderHeading}>
        <strong>{order.orderNumber}</strong>
        <span>{orderStatusLabel(order.status, t)}</span>
      </div>
      <dl className={styles.orderOverview}>
        <div>
          <dt>{t.admin.userActivityDate}</dt>
          <dd>{dateTime(order.confirmedAt, lang)}</dd>
        </div>
        <div>
          <dt>{t.admin.totalPrice}</dt>
          <dd>{formatPrice(order.total)}</dd>
        </div>
        <div>
          <dt>{t.admin.customerEmail}</dt>
          <dd>{order.userEmail ?? '-'}</dd>
        </div>
        <div>
          <dt>{t.admin.payment}</dt>
          <dd>{order.paymentCaptureStatus}</dd>
        </div>
      </dl>
      <section className={styles.orderSection}>
        <h3>{t.admin.delivery}</h3>
        <p>
          {identity && (
            <>
              {identity}
              <br />
            </>
          )}
          {order.line1}
          {order.line2 && (
            <>
              <br />
              {order.line2}
            </>
          )}
          <br />
          {order.postalCode} {order.city}
          <br />
          {order.countryCode}
          {order.phone && (
            <>
              <br />
              {order.phone}
            </>
          )}
        </p>
        {order.courierName && <p>{order.courierName}</p>}
        {order.shipmentNumber && (
          <p>
            {t.admin.tracking}: {order.shipmentNumber}
          </p>
        )}
      </section>
      <section className={styles.orderSection}>
        <h3>{t.admin.items}</h3>
        <ul className={styles.orderItems}>
          {order.items.map((item) => (
            <li key={item.id}>
              {item.photo ? (
                <img loading="lazy" decoding="async" src={item.photo} alt="" />
              ) : (
                <span className={styles.itemPlaceholder} aria-hidden="true" />
              )}
              <span>
                <strong>{item.title}</strong>
                <small>{item.productUid}</small>
                <small>
                  {item.quantity} × {formatPrice(item.lineTotal)}
                </small>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
