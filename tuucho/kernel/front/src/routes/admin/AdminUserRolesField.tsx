import { useState } from 'react';
import { AdminMultiSelect } from '../../components/admin/AdminFilterSelect';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { setAdminUserRoles, type AdminRoleRef } from '../../api/admin/roles';
import type { AdminUserSummary } from '../../api/admin/users';
import { ApiError } from '../../api/errors';
import { useLang } from '../../assets/i18n';
import { useAdminStrings } from '../../assets/i18n/admin';
import { useAuthSession } from '../../state/AuthContext';
import { useToast } from '../../state/ToastContext';
import { withMinDuration } from '../../utils/withMinDuration';
import { shopConfig } from '../../config/env';
import styles from '../AdminUsersPage.module.css';
import { SUPER_ADMIN_ROLE } from '../../utils/adminRoute';

type Translate = ReturnType<typeof useLang>['t'];

/** Built-in administrator keeps its localized name; a staff role shows the
 * name given on the Roles page. */
export function roleRefName(role: AdminRoleRef, t: Translate): string {
  return role.code === SUPER_ADMIN_ROLE ? t.admin.userAdministrator : role.label;
}

function rolesSummary(roles: readonly AdminRoleRef[], t: Translate, customerLabel: string): string {
  return roles.map((role) => roleRefName(role, t)).join(', ') || customerLabel;
}

/** The "Rôles" field of a user card: pick roles among those the signed-in
 * account may assign (`access.assignableRoles`: all of them for a
 * super-admin, otherwise the resolved assignable list), confirm,
 * save. Roles the account holds outside that list are kept as they are. No
 * role means a customer. A super-admin account is only editable by a
 * super-admin. Split from AdminUsersPage. */
export function AdminUserRolesField({
  user,
  assignable,
  canEditSuperAdmin,
  targetable,
  disabled,
  onSaving,
  onSaved,
  onError,
}: {
  user: Pick<AdminUserSummary, 'id' | 'email' | 'role' | 'roles'>;
  /** Roles the signed-in account may give or take away. */
  assignable: readonly AdminRoleRef[];
  /** True for a super-admin: may edit an account holding super-admin. */
  canEditSuperAdmin: boolean;
  /** Accounts the signed-in account may edit (`access.targetableRoles`): all,
   * or those whose every role is listed (`user` = no staff role). */
  targetable: { all: boolean; roles: readonly string[] };
  disabled: boolean;
  onSaving: (userId: string | null) => void;
  onSaved: (patch: Pick<AdminUserSummary, 'role' | 'roles'>) => void;
  onError: (message: string) => void;
}) {
  const { t } = useLang();
  const a = useAdminStrings();
  const toast = useToast();
  const { authedRequest, user: sessionUser } = useAuthSession();
  const [pending, setPending] = useState<string[] | null>(null);
  const self = user.id === sessionUser?.id;
  const assignableCodes = assignable.map((role) => role.code);
  /** Held roles this account may not touch: sent back unchanged. */
  const kept = user.roles.filter((role) => !assignableCodes.includes(role.code));
  const held = user.roles.map((role) => role.code).filter((code) => assignableCodes.includes(code));
  // Same rule as the API (canTargetAccount); the API stays the authority.
  const targetableAccount =
    targetable.all ||
    (user.roles.length === 0
      ? targetable.roles.includes('user')
      : user.roles.every((role) => targetable.roles.includes(role.code)));
  const protectedAccount = (user.role === SUPER_ADMIN_ROLE && !canEditSuperAdmin) || !targetableAccount;
  /** The account's full role set once `selected` replaces the assignable part. */
  const finalRoles = (selected: readonly string[]): AdminRoleRef[] => [
    ...kept,
    ...assignable.filter((role) => selected.includes(role.code)),
  ];

  async function apply(codes: string[]) {
    setPending(null);
    onSaving(user.id);
    try {
      const result = await withMinDuration(
        authedRequest((token) => setAdminUserRoles(token, user.id, codes)),
        shopConfig.loadingMinMs.short,
      );
      onSaved({ role: result.user.role, roles: result.user.roles });
      toast(a.roles.roleChangedToast(rolesSummary(result.user.roles, t, a.roles.customerOnly)));
    } catch (err) {
      onError(
        err instanceof ApiError && err.code === 'own_role' ? a.roles.ownRoleHint : a.roles.errChangeRole,
      );
    } finally {
      onSaving(null);
    }
  }

  if (assignable.length === 0 || protectedAccount) return null;
  return (
    <div className={styles.roleField}>
      <AdminMultiSelect
        label={a.roles.userRoleLabel}
        options={assignable.map((role) => ({ value: role.code, label: roleRefName(role, t) }))}
        values={held}
        onChange={(codes) => {
          const unchanged = codes.length === held.length && codes.every((code) => held.includes(code));
          if (!unchanged) setPending(finalRoles(codes).map((role) => role.code));
        }}
        closeLabel={t.gallery.close}
        confirmLabel={a.roles.applySelection}
        emptyLabel={a.roles.customerOnly}
        disabled={self || disabled}
      />
      {self && <small className={styles.fieldHint}>{a.roles.ownRoleHint}</small>}
      {pending && (
        <ConfirmModal
          variant="dialog"
          title={a.roles.changeRoleTitle(user.email)}
          message={
            <RoleChangeSummary
              before={user.roles}
              after={finalRoles(pending.filter((code) => assignableCodes.includes(code)))}
            />
          }
          confirmLabel={a.roles.changeRoleConfirm}
          closeLabel={t.gallery.close}
          onConfirm={() => void apply(pending)}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}

/** Body of the confirmation: the account's current roles, what is removed,
 * what is added, and the set it ends up with, as chips rather than one long
 * sentence. */
function RoleChangeSummary({
  before,
  after,
}: {
  before: readonly AdminRoleRef[];
  after: readonly AdminRoleRef[];
}) {
  const { t } = useLang();
  const a = useAdminStrings();
  const removed = before.filter((role) => !after.some((entry) => entry.code === role.code));
  const added = after.filter((role) => !before.some((entry) => entry.code === role.code));

  function chips(roles: readonly AdminRoleRef[], tone: string | undefined) {
    return (
      <span className={styles.roleChangeChips}>
        {roles.map((role) => (
          <span key={role.code} className={`${styles.roleChangeChip} ${tone ?? ''}`}>
            {roleRefName(role, t)}
          </span>
        ))}
      </span>
    );
  }

  /** A role set as chips, or "Client (aucun rôle)" when empty. */
  function roleSet(roles: readonly AdminRoleRef[], tone: string | undefined) {
    return roles.length > 0 ? (
      chips(roles, tone)
    ) : (
      <span className={styles.roleChangeChips}>
        <span className={`${styles.roleChangeChip} ${styles.unverifiedStatus ?? ''}`}>
          {a.roles.customerOnly}
        </span>
      </span>
    );
  }

  return (
    <span className={styles.roleChange}>
      <span className={styles.roleChangeRow}>
        <span className={styles.roleChangeLabel}>{a.roles.changeBefore}</span>
        {roleSet(before, styles.adminStatus)}
      </span>
      {removed.length > 0 && (
        <span className={styles.roleChangeRow}>
          <span className={styles.roleChangeLabel}>{a.roles.changeRemoved}</span>
          {chips(removed, styles.lockedStatus)}
        </span>
      )}
      {added.length > 0 && (
        <span className={styles.roleChangeRow}>
          <span className={styles.roleChangeLabel}>{a.roles.changeAdded}</span>
          {chips(added, styles.activeStatus)}
        </span>
      )}
      <span className={styles.roleChangeRow}>
        <span className={styles.roleChangeLabel}>{a.roles.changeAfter}</span>
        {roleSet(after, styles.adminStatus)}
      </span>
      <span className={styles.roleChangeNote}>{a.roles.changeNote}</span>
    </span>
  );
}
