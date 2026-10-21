import type { AdminUserSummary } from '../api/admin/users';
import type { AdminStrings } from '../assets/i18n/types';
import { SUPER_ADMIN_ROLE } from '../utils/adminRoute';
import type { ActivityKind } from './admin/AdminUserActivityModal';
import styles from './AdminUsersPage.module.css';

export function AdminUserActivityLinks({
  user,
  t,
  requestsOn,
  loyaltyOn,
  onOpen,
}: {
  user: AdminUserSummary;
  t: { admin: AdminStrings };
  requestsOn: boolean;
  loyaltyOn: boolean;
  onOpen: (kind: ActivityKind, user: AdminUserSummary) => void;
}) {
  if (user.role === SUPER_ADMIN_ROLE) {
    return (
      <div className={styles.activityLinks}>
        <button type="button" onClick={() => onOpen('identity', user)}>
          {t.admin.userIdentityHistoryLink} <span>{user.activityCounts.identityHistory}</span>
        </button>
      </div>
    );
  }
  return (
    <div className={styles.activityLinks}>
      <button type="button" onClick={() => onOpen('orders', user)}>
        {t.admin.userOrdersLink}{' '}
        <span>{user.orders.inFlight.count + user.orders.received.count + user.orders.cancelled.count}</span>
      </button>
      <button type="button" onClick={() => onOpen('contacts', user)}>
        {t.admin.userContactsLink} <span>{user.activityCounts.contacts}</span>
      </button>
      <button type="button" onClick={() => onOpen('chats', user)}>
        {t.admin.userChatsLink} <span>{user.activityCounts.chats}</span>
      </button>
      {requestsOn ? (
        <button type="button" onClick={() => onOpen('requests', user)}>
          {t.admin.userProductRequestsLink} <span>{user.activityCounts.productRequests}</span>
        </button>
      ) : null}
      <button type="button" onClick={() => onOpen('identity', user)}>
        {t.admin.userIdentityHistoryLink} <span>{user.activityCounts.identityHistory}</span>
      </button>
      {loyaltyOn ? (
        <button type="button" onClick={() => onOpen('loyalty', user)}>
          {t.admin.loyaltyUserWalletLink}
        </button>
      ) : null}
    </div>
  );
}
