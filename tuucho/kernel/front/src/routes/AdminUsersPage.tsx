import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AdminStockList } from '../components/admin/AdminStockList';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { CloseIcon } from '../components/ui/CloseIcon';
import { LoadingModal } from '../components/ui/LoadingModal';
import { ModalBackdrop } from '../components/ui/ModalBackdrop';
import { ModalScrollBody } from '../components/ui/ModalScrollBody';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';
import {
  listAdminUsers,
  lockAdminUser,
  unlockAdminUser,
  type AdminUserSummary,
  type AdminUserLockSource,
} from '../api/admin/users';
import { getAdminUserLoyaltyWallet, type LoyaltyWalletSummary } from '../api/loyalty';
import { useLang } from '../assets/i18n';
import { useAdminStrings } from '../assets/i18n/admin';
import { useAuthSession } from '../state/AuthContext';
import { adminPath, SUPER_ADMIN_ROLE } from '../utils/adminRoute';
import { formatPrice } from '../utils/formatPrice';
import { withMinDuration } from '../utils/withMinDuration';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useHistoryBackClose } from '../hooks/useHistoryBackClose';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import styles from './AdminUsersPage.module.css';
import { roleRefName } from './admin/AdminUserRolesField';
import { AdminUserAccountControl } from './admin/AdminUserAccountControl';
import { UserActivityModal, date, dateTime, type ActivityKind } from './admin/AdminUserActivityModal';
import { AdminUserActivityLinks } from './adminUserActivityLinks';
import { shopConfig } from '../config/env';
import { usePluginEnabled } from '../plugins/StorefrontBootstrap';

/** Fetch chunk for the infinite user list. Not a user-facing choice:
 * the admin scrolls, the list appends. The order list inside the user
 * detail modal keeps its own paging — it is a different widget. */
const CHUNK_SIZE = 30;
type PendingAction = { user: AdminUserSummary; kind: 'lock' | 'unlock' };

function customerName(user: AdminUserSummary): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return name || user.email;
}

function signInMethodTags(user: AdminUserSummary, t: ReturnType<typeof useLang>['t']): string[] {
  const tags: string[] = [];
  if (user.hasPassword) tags.push(t.admin.userSignInPassword);
  if (user.hasGoogle) {
    const extra =
      user.googleEmail && user.googleEmail.toLowerCase() !== user.email.toLowerCase()
        ? ` (${user.googleEmail})`
        : '';
    tags.push(`${t.admin.userSignInGoogle}${extra}`);
  }
  if (user.hasFacebook) {
    const extra =
      user.facebookEmail && user.facebookEmail.toLowerCase() !== user.email.toLowerCase()
        ? ` (${user.facebookEmail})`
        : '';
    tags.push(`${t.admin.userSignInFacebook}${extra}`);
  }
  if (user.hasApple) {
    const extra =
      user.appleEmail && user.appleEmail.toLowerCase() !== user.email.toLowerCase()
        ? ` (${user.appleEmail})`
        : '';
    tags.push(`${t.admin.userSignInApple}${extra}`);
  }
  return tags;
}

function lockSourceLabel(source: AdminUserLockSource | null, t: ReturnType<typeof useLang>['t']): string {
  if (source === 'customer') return t.admin.userLockSourceCustomer;
  if (source === 'admin') return t.admin.userLockSourceAdmin;
  if (source === 'ops') return t.admin.userLockSourceOps;
  return t.admin.userLockReasonUnknown;
}

export function AdminUsersPage() {
  const requestsOn = usePluginEnabled('tuucho-commerce-product-requests');
  const loyaltyOn = usePluginEnabled('tuucho-commerce-loyalty');
  const { t, lang } = useLang();
  const a = useAdminStrings();
  const { authedRequest } = useAuthSession();
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [staffOnly, setStaffOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [lockReasonDraft, setLockReasonDraft] = useState('');
  const [detailUser, setDetailUser] = useState<AdminUserSummary | null>(null);
  const [activity, setActivity] = useState<{ kind: ActivityKind; user: AdminUserSummary } | null>(null);

  const load = useCallback(
    async (nextPage: number, onlyStaff: boolean, nextQuery: string, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        // Appends are not delayed: the admin is already reading rows and is
        // waiting for the next chunk under the scroll. Only the first load
        // keeps the minimum duration, so the list does not flash.
        const request = authedRequest((token) =>
          listAdminUsers(token, nextPage, CHUNK_SIZE, onlyStaff ? 'staff' : 'user', nextQuery),
        );
        const result = append ? await request : await withMinDuration(request, shopConfig.loadingMinMs.short);
        setUsers((current) => (append ? [...current, ...result.users] : result.users));
        setPage(result.pagination.page);
        setTotalPages(result.pagination.totalPages);
      } catch {
        setError(t.admin.actionError);
      } finally {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [authedRequest, t.admin.actionError],
  );

  useEffect(() => {
    void load(1, staffOnly, query, false);
  }, [staffOnly, load, query]);

  function requestToggle(user: AdminUserSummary) {
    if (actionUserId) return;
    if (user.status === 'active') {
      setLockReasonDraft('');
      setPendingAction({ user, kind: 'lock' });
    } else if (user.status === 'locked') {
      setPendingAction({ user, kind: 'unlock' });
    }
  }

  async function applyPendingAction(reason?: string) {
    if (!pendingAction) return;
    const { user, kind } = pendingAction;
    if (kind === 'lock') {
      const trimmed = reason?.trim() ?? '';
      if (trimmed.length < 3) {
        setError(t.admin.userLockReasonRequired);
        return;
      }
    }
    setPendingAction(null);
    setActionUserId(user.id);
    setError(null);
    try {
      if (kind === 'lock') {
        const result = await withMinDuration(
          authedRequest((token) => lockAdminUser(token, user.id, reason!.trim())),
          shopConfig.loadingMinMs.short,
        );
        const patch = {
          status: result.user.status,
          lockedAt: result.user.lockedAt,
          lockReason: result.user.lockReason,
          lockSource: result.user.lockSource,
        };
        setUsers((current) =>
          current.map((entry) => (entry.id === user.id ? { ...entry, ...patch } : entry)),
        );
        setDetailUser((current) => (current?.id === user.id ? { ...current, ...patch } : current));
      } else {
        const result = await withMinDuration(
          authedRequest((token) => unlockAdminUser(token, user.id)),
          shopConfig.loadingMinMs.short,
        );
        const patch = {
          status: result.user.status,
          lockedAt: result.user.lockedAt,
          lockReason: result.user.lockReason,
          lockSource: result.user.lockSource,
        };
        setUsers((current) =>
          current.map((entry) => (entry.id === user.id ? { ...entry, ...patch } : entry)),
        );
        setDetailUser((current) => (current?.id === user.id ? { ...current, ...patch } : current));
      }
    } catch {
      setError(t.admin.actionError);
    } finally {
      setActionUserId(null);
    }
  }

  function activityLinks(user: AdminUserSummary) {
    return (
      <AdminUserActivityLinks
        user={user}
        t={t}
        requestsOn={requestsOn}
        loyaltyOn={loyaltyOn}
        onOpen={(kind, target) => setActivity({ kind, user: target })}
      />
    );
  }

  return (
    <>
      <AdminStockList<AdminUserSummary>
        seoTitle={t.admin.usersTitle}
        seoDescription={t.admin.usersDescription}
        seoPath={adminPath('/users')}
        pageTitle={t.admin.usersTitle}
        searchLabel={t.admin.userEmailSearchLabel}
        searchPlaceholder={t.admin.userEmailSearchPlaceholder}
        submitLabel={t.admin.searchSubmit}
        toolbar={
          <label className={styles.adminFilter}>
            <span>{t.admin.usersAdminsOnly}</span>
            <ToggleSwitch
              checked={staffOnly}
              onChange={(checked) => {
                setDetailUser(null);
                setStaffOnly(checked);
              }}
              disabled={loading || actionUserId !== null}
              aria-label={t.admin.usersAdminsOnly}
            />
          </label>
        }
        emptyMessage={staffOnly ? t.admin.usersAdminsEmpty : t.admin.usersEmpty}
        emptySearchMessage={t.admin.userEmailSearchEmpty}
        closePreviewLabel={t.gallery.close}
        enableCardView={false}
        hasMore={page < totalPages}
        loadingMore={loadingMore}
        onLoadMore={() => void load(page + 1, staffOnly, query, true)}
        rows={users}
        rowKey={(user) => user.id}
        loading={loading}
        loadingMessage={t.admin.contentLoading}
        error={error}
        onSearch={(nextQuery) => {
          setDetailUser(null);
          setQuery(nextQuery);
        }}
        renderListRow={(user) => (
          <button
            type="button"
            className={styles.simpleListRow}
            title={t.admin.userOpen(user.email)}
            onClick={() => setDetailUser(user)}
          >
            <div className={styles.simpleListIdentity}>
              <strong>{user.email}</strong>
              <span>{customerName(user) === user.email ? user.id : customerName(user)}</span>
            </div>
            <div className={styles.simpleListTags}>
              {user.roles.map((role) => (
                <span key={role.code} className={styles.adminStatus}>
                  {roleRefName(role, t, a)}
                </span>
              ))}
              {user.status === 'locked' && <span className={styles.lockedStatus}>{t.admin.userLocked}</span>}
              {user.status === 'pending_deletion' && (
                <span className={styles.pendingStatus}>{t.admin.userPendingDeletion}</span>
              )}
              {!user.emailVerified && (
                <span className={styles.unverifiedStatus}>{t.admin.userEmailUnverified}</span>
              )}
            </div>
            <time dateTime={user.createdAt}>{date(user.createdAt, lang)}</time>
          </button>
        )}
      />

      {detailUser && (
        <UserDetailModal
          user={detailUser}
          busy={actionUserId !== null}
          accountControl={
            <AdminUserAccountControl
              user={detailUser}
              actionUserId={actionUserId}
              onToggle={() => requestToggle(detailUser)}
            />
          }
          activityLinks={activityLinks(detailUser)}
          onClose={() => {
            if (actionUserId === null) setDetailUser(null);
          }}
        />
      )}

      {pendingAction?.kind === 'lock' && (
        <UserLockModal
          email={pendingAction.user.email}
          reason={lockReasonDraft}
          onReasonChange={setLockReasonDraft}
          onConfirm={() => void applyPendingAction(lockReasonDraft)}
          onCancel={() => setPendingAction(null)}
        />
      )}

      {pendingAction?.kind === 'unlock' && (
        <ConfirmModal
          variant="dialog"
          title={t.admin.userUnlockTitle(pendingAction.user.email)}
          message={t.admin.userUnlockMessage}
          confirmLabel={t.admin.userUnlockConfirm}
          closeLabel={t.gallery.close}
          onConfirm={() => void applyPendingAction()}
          onCancel={() => setPendingAction(null)}
        />
      )}

      {activity && (
        <UserActivityModal kind={activity.kind} user={activity.user} onClose={() => setActivity(null)} />
      )}
      {actionUserId && <LoadingModal message={t.admin.actionLoading} />}
    </>
  );
}

function UserLockModal({
  email,
  reason,
  onReasonChange,
  onConfirm,
  onCancel,
}: {
  email: string;
  reason: string;
  onReasonChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useLang();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement | null>(null);
  const requestClose = useHistoryBackClose(onCancel);
  useLockBodyScroll();
  useFocusTrap(panelRef, { onEscape: requestClose });
  const valid = reason.trim().length >= 3;

  useEffect(() => {
    reasonRef.current?.focus();
  }, []);

  return createPortal(
    <ModalBackdrop
      className={`${styles.detailBackdrop ?? ''} ${styles.lockModalBackdrop ?? ''}`}
      label={t.admin.userLockTitle(email)}
      onClose={requestClose}
    >
      <div ref={panelRef} className={`${styles.detailPanel} ${styles.lockModalPanel}`}>
        <div className={styles.detailHeader}>
          <span className={styles.detailTitle}>{t.admin.userLockTitle(email)}</span>
          <button
            type="button"
            className={styles.detailClose}
            onClick={requestClose}
            aria-label={t.gallery.close}
          >
            <CloseIcon />
          </button>
        </div>
        <ModalScrollBody contentKey={email}>
          <p className={styles.lockModalMessage}>{t.admin.userLockMessage}</p>
          <label className={styles.modalField}>
            <span>{t.admin.userLockReasonLabel}</span>
            <textarea
              ref={reasonRef}
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder={t.admin.userLockReasonPlaceholder}
              maxLength={500}
              rows={4}
            />
          </label>
          <button
            type="button"
            className={`${styles.modalPrimary} ${styles.lockModalConfirm}`}
            onClick={onConfirm}
            disabled={!valid}
          >
            {t.admin.userLockConfirm}
          </button>
        </ModalScrollBody>
      </div>
    </ModalBackdrop>,
    document.body,
  );
}

function UserDetailModal({
  user,
  busy,
  accountControl,
  activityLinks,
  onClose,
}: {
  user: AdminUserSummary;
  busy: boolean;
  accountControl: ReactNode;
  activityLinks: ReactNode;
  onClose: () => void;
}) {
  const { t, lang } = useLang();
  const a = useAdminStrings();
  const { authedRequest } = useAuthSession();
  const loyaltyOn = usePluginEnabled('tuucho-commerce-loyalty');
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [wallet, setWallet] = useState<LoyaltyWalletSummary | null>(null);
  const requestClose = useHistoryBackClose(() => {
    if (!busy) onClose();
  });
  useLockBodyScroll();
  useFocusTrap(panelRef, { onEscape: busy ? undefined : requestClose });

  useEffect(() => {
    if (!loyaltyOn || user.role === SUPER_ADMIN_ROLE) {
      setWallet(null);
      return;
    }
    let cancelled = false;
    void authedRequest((token) => getAdminUserLoyaltyWallet(token, user.id))
      .then((result) => {
        if (!cancelled) setWallet(result.wallet);
      })
      .catch(() => {
        if (!cancelled) setWallet(null);
      });
    return () => {
      cancelled = true;
    };
  }, [authedRequest, loyaltyOn, user.id, user.role]);

  return createPortal(
    <ModalBackdrop
      className={styles.detailBackdrop ?? ''}
      label={user.email}
      onClose={busy ? () => {} : requestClose}
      closeOnBackdropClick={!busy}
    >
      <div ref={panelRef} className={styles.detailPanel}>
        <div className={styles.detailHeader}>
          <span className={styles.detailTitle}>{customerName(user)}</span>
          <button
            type="button"
            className={styles.detailClose}
            onClick={requestClose}
            aria-label={t.gallery.close}
            disabled={busy}
          >
            <CloseIcon />
          </button>
        </div>
        <ModalScrollBody contentKey={user.id}>
          <div className={styles.detailToolbar}>
            <p className={styles.detailEmail}>{user.email}</p>
            {accountControl}
          </div>
          {/* Roles are shown here, changed on the Roles page ("Rôles des comptes"). */}
          {user.roles.length > 0 && (
            <div className={styles.simpleListTags}>
              {user.roles.map((role) => (
                <span key={role.code} className={styles.adminStatus}>
                  {roleRefName(role, t, a)}
                </span>
              ))}
            </div>
          )}
          <div className={styles.tags}>
            <span>{user.emailVerified ? t.admin.userEmailVerified : t.admin.userEmailUnverified}</span>
            {signInMethodTags(user, t).map((label) => (
              <span key={label}>{label}</span>
            ))}
            <span>
              {t.admin.userCreated} {date(user.createdAt, lang)}
            </span>
            <span>
              {user.lastConnectedAt
                ? `${t.admin.userLastConnected} ${dateTime(user.lastConnectedAt, lang)}`
                : t.admin.userNeverConnected}
            </span>
            <span>{t.admin.userConnectionCount(user.connectionCount)}</span>
          </div>
          {user.status === 'locked' && (
            <dl className={styles.lockDetail}>
              <div>
                <dt>{t.admin.userLockedAtLabel}</dt>
                <dd>{user.lockedAt ? dateTime(user.lockedAt, lang) : '-'}</dd>
              </div>
              <div>
                <dt>{t.admin.userLockSourceLabel}</dt>
                <dd>{lockSourceLabel(user.lockSource, t)}</dd>
              </div>
              <div className={styles.lockReasonRow}>
                <dt>{t.admin.userLockReasonLabel}</dt>
                <dd>{user.lockReason ?? t.admin.userLockReasonUnknown}</dd>
              </div>
            </dl>
          )}
          {user.role !== SUPER_ADMIN_ROLE ? (
            <>
              <dl className={styles.orderMetrics}>
                <div>
                  <dt>{t.admin.userOrdersInFlight}</dt>
                  <dd>
                    <strong>{user.orders.inFlight.count}</strong>
                    <span>{formatPrice(user.orders.inFlight.total)}</span>
                  </dd>
                </div>
                <div>
                  <dt>{t.admin.userOrdersReceived}</dt>
                  <dd>
                    <strong>{user.orders.received.count}</strong>
                    <span>{formatPrice(user.orders.received.total)}</span>
                  </dd>
                </div>
                <div>
                  <dt>{t.admin.userOrdersCancelled}</dt>
                  <dd>
                    <strong>{user.orders.cancelled.count}</strong>
                    <span>{formatPrice(user.orders.cancelled.total)}</span>
                  </dd>
                </div>
              </dl>
              {wallet && (
                <dl className={styles.orderMetrics}>
                  <div>
                    <dt>{t.admin.loyaltyUserAvailable}</dt>
                    <dd>
                      <strong>{formatPrice(wallet.available)}</strong>
                    </dd>
                  </div>
                  <div>
                    <dt>{t.admin.loyaltyUserComing}</dt>
                    <dd>
                      <strong>{formatPrice(wallet.coming)}</strong>
                    </dd>
                  </div>
                  <div>
                    <dt>{t.admin.loyaltyUserBurned}</dt>
                    <dd>
                      <strong>{formatPrice(wallet.burned)}</strong>
                    </dd>
                  </div>
                </dl>
              )}
              {user.status !== 'active' && user.status !== 'locked' && (
                <p className={styles.unavailable}>{t.admin.userActionUnavailable}</p>
              )}
              {activityLinks}
            </>
          ) : (
            activityLinks
          )}
        </ModalScrollBody>
      </div>
    </ModalBackdrop>,
    document.body,
  );
}
