import { useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { LoadingModal } from '../../components/ui/LoadingModal';
import { searchRoleAccounts, type AdminRole, type AdminRoleAccount } from '../../api/admin/roles';
import { useLang } from '../../assets/i18n';
import { useAdminStrings } from '../../assets/i18n/admin';
import { useAuthSession } from '../../state/AuthContext';
import { useAdminAccess } from '../../state/AdminAccessContext';
import { withMinDuration } from '../../utils/withMinDuration';
import { shopConfig } from '../../config/env';
import { AdminUserRolesField } from './AdminUserRolesField';
import styles from '../AdminRolesPage.module.css';

/** "Rôles des comptes" card of the Roles page: find accounts by e-mail
 * (exact, or `*` as a wildcard) among those the signed-in account may
 * change (the API filters by hierarchy), and give or take roles on each one
 * with the same field and confirmation as before. A super-admin passes every
 * role (`roles`, newly created ones included) and may edit any account; a
 * delegate uses its resolved lists from `/admin/access`.
 * `onRolesChanged` lets the page refresh its per-role account counts. */
export function AdminRoleAccounts({
  roles,
  onRolesChanged,
}: {
  /** Every role, for a super-admin; omitted for a delegate. */
  roles?: readonly AdminRole[];
  onRolesChanged?: () => void;
}) {
  const { t } = useLang();
  const a = useAdminStrings();
  const { authedRequest } = useAuthSession();
  const access = useAdminAccess();
  const assignable = roles
    ? roles.filter((role) => role.code !== 'user').map(({ code, label }) => ({ code, label }))
    : access.assignableRoles;
  const targetable = access.manageRoles ? { all: true, roles: [] } : access.targetableRoles;
  const [q, setQ] = useState('');
  const [results, setResults] = useState<AdminRoleAccount[] | null>(null);
  const [total, setTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search(event: FormEvent) {
    event.preventDefault();
    const query = q.trim();
    if (!query || searching) return;
    setSearching(true);
    setError(null);
    try {
      const result = await withMinDuration(
        authedRequest((token) => searchRoleAccounts(token, query)),
        shopConfig.loadingMinMs.short,
      );
      setResults(result.accounts);
      setTotal(result.total);
    } catch {
      setError(t.admin.actionError);
    } finally {
      setSearching(false);
    }
  }

  return (
    <section className={styles.accounts} aria-labelledby="admin-role-accounts-h">
      <h2 id="admin-role-accounts-h" className={styles.accountsTitle}>
        {a.roles.accountsTitle}
      </h2>
      <p className={styles.note}>{a.roles.accountsIntro}</p>
      <form className={styles.accountsSearch} onSubmit={(event) => void search(event)} role="search">
        <label className={styles.field}>
          <span>{t.admin.userEmailSearchLabel}</span>
          <input
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder={t.admin.userEmailSearchPlaceholder}
            autoComplete="off"
          />
        </label>
        <Button type="submit" disabled={searching || !q.trim()}>
          {t.admin.searchSubmit}
        </Button>
      </form>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {results && results.length === 0 && <p className={styles.note}>{t.admin.userEmailSearchEmpty}</p>}
      {results && results.length > 0 && (
        <div className={styles.list} role="list" aria-label={a.roles.accountsTitle}>
          {results.map((user) => {
            const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
            return (
              <div key={user.id} className={`${styles.item} ${styles.accountRow}`} role="listitem">
                <span className={styles.headerText}>
                  <strong>{user.email}</strong>
                  {name && <span className={styles.hint}>{name}</span>}
                </span>
                <AdminUserRolesField
                  user={user}
                  assignable={assignable}
                  canEditSuperAdmin={access.manageRoles}
                  targetable={targetable}
                  disabled={savingId !== null}
                  onSaving={setSavingId}
                  onError={setError}
                  onSaved={(patch) => {
                    setResults((current) =>
                      (current ?? []).map((entry) => (entry.id === user.id ? { ...entry, ...patch } : entry)),
                    );
                    onRolesChanged?.();
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
      {results && total > results.length && (
        <p className={styles.note}>{a.roles.accountsTruncated(results.length, total)}</p>
      )}
      {(searching || savingId) && (
        <LoadingModal message={savingId ? t.admin.actionLoading : t.admin.contentLoading} />
      )}
    </section>
  );
}
