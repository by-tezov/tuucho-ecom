import { ToggleSwitch } from '../../components/ui/ToggleSwitch';
import type { AdminUserSummary } from '../../api/admin/users';
import { useLang } from '../../assets/i18n';
import { SUPER_ADMIN_ROLE } from '../../utils/adminRoute';
import { useAdminAccess } from '../../state/AdminAccessContext';
import type { AdminAccess } from '../../api/admin/roles';
import styles from '../AdminUsersPage.module.css';

function userStatusLabel(user: AdminUserSummary, t: ReturnType<typeof useLang>['t']): string {
  if (user.status === 'locked') return t.admin.userLocked;
  if (user.status === 'pending_deletion') return t.admin.userPendingDeletion;
  return t.admin.userActive;
}

/** Mirrors the API's hierarchy for locking (canActOnAccount): a super-admin
 * always; anyone on a customer; on a staff account, only when every role it
 * holds is in the signed-in account's targetable list. */
function canActOn(user: AdminUserSummary, access: AdminAccess): boolean {
  if (access.manageRoles || user.roles.length === 0) return true;
  const { all, roles } = access.targetableRoles;
  return all || user.roles.every((role) => roles.includes(role.code));
}

/** Status chip and lock/unlock switch of a user card. A super-admin is never
 * locked from here; a locked one (sign-in alert link, CLI) can only be
 * unlocked by another super-admin. A staff account outside the signed-in
 * account's hierarchy shows its status without the switch. Split from
 * AdminUsersPage. */
export function AdminUserAccountControl({
  user,
  actionUserId,
  onToggle,
}: {
  user: AdminUserSummary;
  /** Account whose lock/unlock is in flight, if any. */
  actionUserId: string | null;
  onToggle: () => void;
}) {
  const { t } = useLang();
  const access = useAdminAccess();
  const canUnlockSuperAdmin = access.manageRoles;
  const canAct = canActOn(user, access);
  // A super-admin card already shows its role tag below; here only a lock,
  // when there is one (with the switch for another super-admin, see below).
  if (user.role === SUPER_ADMIN_ROLE && !(user.status === 'locked' && canUnlockSuperAdmin)) {
    if (user.status !== 'locked') return null;
    return (
      <span className={styles.accountControl}>
        <span className={styles.lockedStatus}>{t.admin.userLocked}</span>
      </span>
    );
  }
  const actionable = canAct && (user.status === 'active' || user.status === 'locked');
  const tone =
    user.status === 'locked'
      ? styles.lockedStatus
      : user.status === 'active'
        ? styles.activeStatus
        : styles.pendingStatus;
  return (
    <span className={styles.accountControl}>
      <span className={tone}>{userStatusLabel(user, t)}</span>
      <ToggleSwitch
        checked={user.status === 'active'}
        onChange={onToggle}
        disabled={!actionable || actionUserId !== null}
        aria-label={user.status === 'active' ? t.admin.userLock : t.admin.userUnlock}
      />
      {actionUserId === user.id && <span className={styles.actionHint}>{t.admin.actionLoading}</span>}
    </span>
  );
}
