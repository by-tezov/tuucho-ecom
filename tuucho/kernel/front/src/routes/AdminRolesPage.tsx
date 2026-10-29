import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Seo } from '../components/seo/Seo';
import { LoadingModal } from '../components/ui/LoadingModal';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { Button } from '../components/ui/Button';
import { ApiError } from '../api/errors';
import {
  createAdminRole,
  deleteAdminRole,
  listAdminRoles,
  updateAdminRole,
  type AdminPermissionCode,
  type AdminPermissionGrant,
  type AdminRole,
} from '../api/admin/roles';
import { AdminMultiSelect } from '../components/admin/AdminFilterSelect';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';
import { Separator } from '../components/ui/Separator';
import { AdminRoleAccounts } from './admin/AdminRoleAccounts';
import { useAdminAccess } from '../state/AdminAccessContext';
import { useAuthSession } from '../state/AuthContext';
import { useAdminSectionReset } from '../state/AdminChromeContext';
import { useLang } from '../assets/i18n';
import { useAdminStrings, type AdminUiStrings } from '../assets/i18n/admin';
import { adminPath, SUPER_ADMIN_ROLE } from '../utils/adminRoute';
import { withMinDuration } from '../utils/withMinDuration';
import { adminNavGroups, adminPermissionRows, type AdminNavGroup, type AdminPermissionRow } from './adminNav';
import { useStorefrontBootstrap } from '../plugins/StorefrontBootstrap';
import { resolveAdminNavLabel } from './resolveAdminNavLabel';
import { BackButton, Chevron } from './adminBackButton';
import { staffRoleLabel } from '../assets/i18n/admin/roleLabel';
import styles from './AdminRolesPage.module.css';
import { shopConfig } from '../config/env';
import { AdminRoleConfigFiles } from './AdminRoleConfigFiles';

type GrantState = { granted: boolean; dominant: boolean };
type RoleDraft = {
  label: string;
  /** Own grants by permission; a missing entry is off and not dominant. */
  grants: Partial<Record<AdminPermissionCode, GrantState>>;
  parents: string[];
  assignable: string[];
  assignableDominant: boolean;
  targetable: string[];
  targetableDominant: boolean;
};

const EMPTY_DRAFT: RoleDraft = {
  label: '',
  grants: {},
  parents: [],
  assignable: [],
  assignableDominant: false,
  targetable: [],
  targetableDominant: false,
};

function draftOf(role: AdminRole): RoleDraft {
  const grants: RoleDraft['grants'] = {};
  for (const grant of role.grants)
    grants[grant.permission] = { granted: grant.granted, dominant: grant.dominant };
  return {
    label: role.label,
    grants,
    parents: role.parents,
    assignable: role.assignable,
    assignableDominant: role.assignableDominant,
    targetable: role.targetable,
    targetableDominant: role.targetableDominant,
  };
}

/** Only what differs from "no grant" is sent, in catalogue order. */
function grantsOf(draft: RoleDraft, rows: readonly AdminPermissionRow[]): AdminPermissionGrant[] {
  return rows.flatMap((row) => {
    const state = draft.grants[row.code];
    return state && (state.granted || state.dominant) ? [{ permission: row.code, ...state }] : [];
  });
}

/** What the detail view shows: an existing role, or a new one being created. */
type RoleView = { kind: 'edit'; code: string } | { kind: 'create' };

const LABEL_MIN = 2;
const LABEL_MAX = 60;

function normalizedLabel(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function labelValid(value: string): boolean {
  const label = normalizedLabel(value);
  return label.length >= LABEL_MIN && label.length <= LABEL_MAX;
}

function roleName(role: AdminRole, t: ReturnType<typeof useLang>['t'], a: AdminUiStrings): string {
  return staffRoleLabel(role.code, role.label, a, t.admin.userAdministrator);
}

function roleSummary(
  role: AdminRole,
  roles: readonly AdminRole[],
  t: ReturnType<typeof useLang>['t'],
  a: AdminUiStrings,
  total: number,
): string {
  const access =
    role.code === SUPER_ADMIN_ROLE || role.permissions.length >= total
      ? a.roles.allPermissions
      : role.permissions.length === 0
        ? a.roles.noPermission
        : a.roles.permissionCount(role.permissions.length);
  const parents = roles.filter((entry) => role.parents.includes(entry.code)).map((entry) => roleName(entry, t, a));
  return parents.length > 0 ? `${access} · ${a.roles.inheritsSummary(parents.join(', '))}` : access;
}

function errorMessage(error: unknown, a: AdminUiStrings, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.code === 'role_exists') return a.roles.errExists;
    if (error.code === 'invalid_label') return a.roles.errLabel;
    if (error.code === 'role_cycle') return a.roles.errCycle;
  }
  return fallback;
}

/** The Roles page. A super-admin manages roles and every account's roles; an
 * account that may only assign roles (non-empty resolved lists) gets the account
 * search alone, limited by the API to the accounts it may change. */
export function AdminRolesPage() {
  const access = useAdminAccess();
  return access.manageRoles ? <RolesManager /> : <DelegatedRoleAccounts />;
}

function DelegatedRoleAccounts() {
  const a = useAdminStrings();
  return (
    <section className={styles.section} aria-labelledby="admin-roles-h">
      <Seo title={a.nav.rolesLabel} description={a.roles.accountsIntro} path={adminPath('/roles')} noindex />
      <h1 id="admin-roles-h" className={styles.title}>
        {a.nav.rolesLabel}
      </h1>
      <AdminRoleAccounts />
    </section>
  );
}

function RolesManager() {
  const { t } = useLang();
  const a = useAdminStrings();
  const { authedRequest } = useAuthSession();
  const { adminNav: pluginAdminNav = [] } = useStorefrontBootstrap();
  const [grantable, setGrantable] = useState<AdminPermissionCode[] | null>(null);
  const permissionRows = useMemo(() => {
    const rows = [...adminPermissionRows(t, a)];
    const seen = new Set(rows.map((row) => row.code));
    for (const item of pluginAdminNav) {
      if (seen.has(item.permission)) continue;
      seen.add(item.permission);
      const label = resolveAdminNavLabel(item, a) || item.label || item.permission;
      rows.push({
        code: item.permission,
        group: item.group as AdminNavGroup,
        label,
        description: label,
      });
    }
    if (!grantable) return rows;
    const allowed = new Set(grantable);
    return rows.filter((row) => allowed.has(row.code));
  }, [t, a, grantable, pluginAdminNav]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<RoleView | null>(null);
  const [draft, setDraft] = useState<RoleDraft>(EMPTY_DRAFT);
  const [viewError, setViewError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminRole | null>(null);
  const busy = loading || saving;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await withMinDuration(
        authedRequest((token) => listAdminRoles(token)),
        shopConfig.loadingMinMs.short,
      );
      setRoles(result.roles);
      setGrantable(result.permissions);
    } catch {
      setError(a.roles.loadError);
    } finally {
      setLoading(false);
    }
  }, [authedRequest, a.roles.loadError]);

  useEffect(() => {
    void load();
  }, [load]);

  const backToList = useCallback(() => {
    setView(null);
    setViewError(null);
    window.scrollTo({ top: 0 });
  }, []);
  useAdminSectionReset(backToList);

  function openRole(role: AdminRole) {
    if (busy) return;
    setDraft(draftOf(role));
    setViewError(null);
    setNotice(null);
    setView({ kind: 'edit', code: role.code });
    window.scrollTo({ top: 0 });
  }

  function openCreate() {
    if (busy) return;
    setDraft(EMPTY_DRAFT);
    setViewError(null);
    setNotice(null);
    setView({ kind: 'create' });
    window.scrollTo({ top: 0 });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !view) return;
    if (!labelValid(draft.label)) {
      setViewError(a.roles.errLabel);
      return;
    }
    const write = {
      label: normalizedLabel(draft.label),
      grants: grantsOf(draft, permissionRows),
      parents: draft.parents,
      assignable: draft.assignable,
      assignableDominant: draft.assignableDominant,
      targetable: draft.targetable,
      targetableDominant: draft.targetableDominant,
    };
    setSaving(true);
    setViewError(null);
    try {
      if (view.kind === 'create') {
        const result = await withMinDuration(
          authedRequest((token) => createAdminRole(token, write)),
          shopConfig.loadingMinMs.short,
        );
        setRoles((current) => [...current, result.role]);
        setNotice(a.roles.createdNotice(roleName(result.role, t, a)));
      } else {
        const result = await withMinDuration(
          authedRequest((token) => updateAdminRole(token, view.code, write)),
          shopConfig.loadingMinMs.short,
        );
        setRoles((current) => current.map((entry) => (entry.code === view.code ? result.role : entry)));
        setNotice(a.roles.savedNotice(roleName(result.role, t, a)));
      }
      backToList();
    } catch (err) {
      setViewError(errorMessage(err, a, a.roles.errSave));
    } finally {
      setSaving(false);
    }
  }

  async function remove(role: AdminRole) {
    if (busy) return;
    setSaving(true);
    setViewError(null);
    try {
      await withMinDuration(
        authedRequest((token) => deleteAdminRole(token, role.code)),
        shopConfig.loadingMinMs.short,
      );
      setRoles((current) => current.filter((entry) => entry.code !== role.code));
      setNotice(a.roles.deletedNotice(roleName(role, t, a)));
      backToList();
    } catch (err) {
      setViewError(errorMessage(err, a, a.roles.errDelete));
    } finally {
      setSaving(false);
    }
  }

  const viewedRole = view?.kind === 'edit' ? (roles.find((role) => role.code === view.code) ?? null) : null;

  return (
    <>
      {busy && <LoadingModal message={saving ? t.admin.actionLoading : t.admin.contentLoading} />}

      {view ? (
        <RoleDetailView
          role={viewedRole}
          roles={roles}
          name={viewedRole ? roleName(viewedRole, t, a) : a.roles.createTitle}
          draft={draft}
          rows={permissionRows}
          busy={busy}
          error={viewError}
          onChange={setDraft}
          onSubmit={(event) => void save(event)}
          onDelete={() => viewedRole && setPendingDelete(viewedRole)}
          onBack={backToList}
        />
      ) : (
        <section className={styles.section} aria-labelledby="admin-roles-h">
          <Seo
            title={a.nav.rolesLabel}
            description={a.nav.rolesDescription}
            path={adminPath('/roles')}
            noindex
          />
          <h1 id="admin-roles-h" className={styles.title}>
            {a.nav.rolesLabel}
          </h1>
          <p className={styles.note}>{a.roles.intro}</p>
          <AdminRoleConfigFiles onApplied={() => void load()} />

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          {notice && <p className={styles.notice}>{notice}</p>}

          <button type="button" className={styles.createTrigger} onClick={openCreate}>
            + {a.roles.create}
          </button>

          {!loading && roles.length === 0 && !error && <p className={styles.note}>{a.roles.empty}</p>}
          {roles.length > 0 && (
            <div className={styles.list} role="list" aria-label={a.nav.rolesLabel}>
              {roles.map((role) => (
                <div key={role.code} className={styles.item} role="listitem">
                  <button
                    type="button"
                    className={styles.header}
                    title={a.roles.open(roleName(role, t, a))}
                    onClick={() => openRole(role)}
                  >
                    <span className={styles.headerText}>
                      <span className={styles.nameLine}>
                        <strong>{roleName(role, t, a)}</strong>
                        {role.system && (
                          <span className={`${styles.status} ${styles.statusOff}`}>
                            {a.roles.systemBadge}
                          </span>
                        )}
                      </span>
                      <span className={styles.hint}>
                        {roleSummary(role, roles, t, a, permissionRows.length)} ·{' '}
                        {a.roles.userCount(role.userCount)}
                      </span>
                    </span>
                    <Chevron direction="right" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <AdminRoleAccounts roles={roles} onRolesChanged={() => void load()} />
        </section>
      )}

      {pendingDelete && (
        <ConfirmModal
          variant="dialog"
          title={a.roles.deleteTitle}
          message={<DeleteImpact role={pendingDelete} roles={roles} />}
          confirmLabel={t.admin.voucherDeleteConfirm}
          closeLabel={t.gallery.close}
          confirmDanger
          onConfirm={() => {
            const role = pendingDelete;
            setPendingDelete(null);
            void remove(role);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}

/** Full-page detail of one role (or of the role being created), reached from
 * the list and left with the back buttons, like the journal screens. */
function RoleDetailView({
  role,
  roles,
  name,
  draft,
  rows,
  busy,
  error,
  onChange,
  onSubmit,
  onDelete,
  onBack,
}: {
  /** Null while creating. */
  role: AdminRole | null;
  roles: readonly AdminRole[];
  name: string;
  draft: RoleDraft;
  rows: AdminPermissionRow[];
  busy: boolean;
  error: string | null;
  onChange: (next: RoleDraft) => void;
  onSubmit: (event: FormEvent) => void;
  onDelete: () => void;
  onBack: () => void;
}) {
  const { t } = useLang();
  const a = useAdminStrings();
  const system = role?.system ?? false;
  // Any staff role can be on either list (itself included); never super-admin.
  // Customers ("user") can be targeted, not assigned.
  const nameOf = (entry: AdminRole) => roleName(entry, t, a);
  const staffOptions = roles
    .filter((entry) => !entry.system)
    .map((entry) => ({ value: entry.code, label: nameOf(entry) }));
  const targetOptions = [{ value: 'user', label: a.roles.customerRole }, ...staffOptions];
  const labelOf = (code: string) => {
    const match = roles.find((entry) => entry.code === code);
    return match ? nameOf(match) : code === 'user' ? a.roles.customerRole : code;
  };
  const self = role?.code ?? null;
  const inheritedPermissions = system ? new Map() : inheritedGrants(draft.parents, roles, self, nameOf);
  // A role can inherit from any other staff role; the API refuses a loop.
  const parentOptions = roles
    .filter((entry) => !entry.system && entry.code !== role?.code)
    .map((entry) => ({ value: entry.code, label: nameOf(entry) }));
  const localeName = role ? staffRoleLabel(role.code, '', a, t.admin.userAdministrator) : '';
  const nameFromLocale = localeName !== '';

  return (
    <section className={styles.section} aria-labelledby="admin-role-h">
      <Seo title={name} description={a.nav.rolesDescription} path={adminPath('/roles')} noindex />
      <div className={styles.topBar}>
        <BackButton label={a.cronLogs.back} onClick={onBack} />
      </div>
      <h1 id="admin-role-h" className={styles.title}>
        {name}
      </h1>
      {role && (
        <p className={styles.meta}>
          <span className={styles.roleCode}>{a.roles.code(role.code)}</span>
          <span>{a.roles.userCount(role.userCount)}</span>
        </p>
      )}

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {system ? (
          <p className={styles.systemNote}>
            {role?.code === SUPER_ADMIN_ROLE ? a.roles.systemAdminNote : a.roles.systemUserNote}
          </p>
        ) : nameFromLocale ? (
          <p className={styles.field}>
            <span>{a.roles.nameLabel}</span>
            <strong>{localeName}</strong>
            <small className={styles.hint}>{a.roles.nameFromLocale}</small>
          </p>
        ) : (
          <label className={styles.field}>
            <span>{a.roles.nameLabel}</span>
            <input
              value={draft.label}
              onChange={(event) => onChange({ ...draft, label: event.target.value })}
              maxLength={LABEL_MAX}
              autoComplete="off"
              disabled={busy}
              placeholder={a.roles.namePlaceholder}
            />
            <small className={styles.hint}>{a.roles.nameHint}</small>
          </label>
        )}

        {!system && (
          <div className={styles.parentsField}>
            <AdminMultiSelect
              label={a.roles.parentsLabel}
              options={parentOptions}
              values={draft.parents}
              onChange={(parents) => onChange({ ...draft, parents })}
              closeLabel={t.gallery.close}
              confirmLabel={a.roles.applySelection}
              emptyLabel={a.roles.noParent}
              disabled={busy}
            />
            <small className={styles.hint}>{a.roles.parentsHint}</small>
          </div>
        )}

        <PermissionMatrix
          rows={rows}
          grants={draft.grants}
          inherited={inheritedPermissions}
          allGranted={role?.code === SUPER_ADMIN_ROLE}
          system={system}
          disabled={busy || system}
          onChange={(grants) => onChange({ ...draft, grants })}
        />

        {!system && (
          <fieldset className={styles.matrix} disabled={busy}>
            <legend className={styles.matrixLegend}>{a.roles.assignBlockTitle}</legend>
            <p className={styles.hint}>{a.roles.assignBlockIntro}</p>
            <RoleListEditor
              label={a.roles.assignableLabel}
              hint={a.roles.assignableHint}
              options={staffOptions}
              values={draft.assignable}
              dominant={draft.assignableDominant}
              inherited={inheritedLists(draft, roles, self, 'assignable', labelOf, a.roles.assignableNone)}
              result={resolveListLive(draft, roles, self, 'assignable').map(labelOf)}
              busy={busy}
              onChange={(assignable, assignableDominant) =>
                onChange({ ...draft, assignable, assignableDominant })
              }
            />
            <RoleListEditor
              label={a.roles.targetableLabel}
              hint={a.roles.targetableHint}
              options={targetOptions}
              values={draft.targetable}
              dominant={draft.targetableDominant}
              inherited={inheritedLists(draft, roles, self, 'targetable', labelOf, a.roles.assignableNone)}
              result={resolveListLive(draft, roles, self, 'targetable').map(labelOf)}
              busy={busy}
              onChange={(targetable, targetableDominant) =>
                onChange({ ...draft, targetable, targetableDominant })
              }
            />
          </fieldset>
        )}

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        {!system && (
          <div className={styles.actions}>
            <Button type="submit" disabled={busy}>
              {t.admin.saveAction}
            </Button>
            {role && (
              <Button type="button" variant="ghostDanger" disabled={busy} onClick={onDelete}>
                {t.admin.voucherDeleteConfirm}
              </Button>
            )}
          </div>
        )}
      </form>

      <div className={styles.bottomBar}>
        <BackButton label={a.cronLogs.back} onClick={onBack} />
      </div>
    </section>
  );
}

/** Body of the delete confirmation: deleting never blocks, so it says what
 * the role is detached from (accounts holding it, roles inheriting it). */
function DeleteImpact({ role, roles }: { role: AdminRole; roles: readonly AdminRole[] }) {
  const a = useAdminStrings();
  const { t } = useLang();
  const heirs = roles.filter((entry) => entry.parents.includes(role.code)).map((entry) => roleName(entry, t, a));
  return (
    <span className={styles.deleteImpact}>
      <span>{a.roles.deleteMessage(roleName(role, t, a))}</span>
      {role.userCount === 0 && heirs.length === 0 ? (
        <span className={styles.deleteImpactNote}>{a.roles.deleteImpactNone}</span>
      ) : (
        <span className={styles.deleteImpactList}>
          {role.userCount > 0 && <span>{a.roles.deleteImpactAccounts(role.userCount)}</span>}
          {heirs.length > 0 && <span>{a.roles.deleteImpactRoles(heirs.join(', '))}</span>}
        </span>
      )}
    </span>
  );
}

/** What a holder of the draft role (with its parents) resolves for one list
 * (assignable or targetable): every list reachable through the inheritance,
 * merged as a union narrowed to each dominant list. Display only; the server
 * resolves the same way and decides. */
function resolveListLive(
  draft: RoleDraft,
  roles: readonly AdminRole[],
  self: string | null,
  kind: 'assignable' | 'targetable',
): string[] {
  const listOf = (source: RoleDraft | AdminRole) =>
    kind === 'assignable'
      ? { roles: source.assignable, dominant: source.assignableDominant }
      : { roles: source.targetable, dominant: source.targetableDominant };
  const byCode = new Map(roles.map((role) => [role.code, role]));
  const lists = [listOf(draft)];
  const seen = new Set<string>(self ? [self] : []);
  const stack = [...draft.parents];
  while (stack.length > 0) {
    const code = stack.pop()!;
    if (seen.has(code)) continue;
    seen.add(code);
    const role = byCode.get(code);
    if (!role) continue;
    lists.push(listOf(role));
    stack.push(...role.parents);
  }
  const contributing = lists.filter((list) => list.dominant || list.roles.length > 0);
  const union = [...new Set(contributing.flatMap((list) => list.roles))];
  return union.filter((code) => contributing.every((list) => !list.dominant || list.roles.includes(code)));
}

/** Each ancestor's own list for one kind, as "Role : a, b, dominant" lines,
 * for the "inherited" part of a RoleListEditor. Lists that contribute nothing
 * (empty and not dominant) are left out. */
function inheritedLists(
  draft: RoleDraft,
  roles: readonly AdminRole[],
  self: string | null,
  kind: 'assignable' | 'targetable',
  labelOf: (code: string) => string,
  none: string,
): { role: string; roles: string; dominant: boolean }[] {
  const byCode = new Map(roles.map((role) => [role.code, role]));
  const seen = new Set<string>(self ? [self] : []);
  const stack = [...draft.parents];
  const lines: { role: string; roles: string; dominant: boolean }[] = [];
  while (stack.length > 0) {
    const code = stack.pop()!;
    if (seen.has(code)) continue;
    seen.add(code);
    const role = byCode.get(code);
    if (!role) continue;
    const list = kind === 'assignable' ? role.assignable : role.targetable;
    const dominant = kind === 'assignable' ? role.assignableDominant : role.targetableDominant;
    if (dominant || list.length > 0) {
      lines.push({ role: labelOf(role.code), roles: list.map(labelOf).join(', ') || none, dominant });
    }
    stack.push(...role.parents);
  }
  return lines;
}

/** One list of the "Attribution des rôles" block: its name and explanation,
 * the selector with the Dominant switch on the same line, then what it
 * inherits and, below, the resulting list. */
function RoleListEditor({
  label,
  hint,
  options,
  values,
  dominant,
  inherited,
  result,
  busy,
  onChange,
}: {
  label: string;
  hint: string;
  options: { value: string; label: string }[];
  values: string[];
  dominant: boolean;
  inherited: { role: string; roles: string; dominant: boolean }[];
  /** Labels of the resolved list (own list merged with the inherited ones). */
  result: string[];
  busy: boolean;
  onChange: (values: string[], dominant: boolean) => void;
}) {
  const { t } = useLang();
  const a = useAdminStrings();
  return (
    <div className={styles.listRow}>
      <strong>{label}</strong>
      <span className={styles.hint}>{hint}</span>
      <div className={styles.listControls}>
        <div className={styles.listSelect}>
          <AdminMultiSelect
            label={label}
            options={options}
            values={values}
            onChange={(next) => onChange(next, dominant)}
            closeLabel={t.gallery.close}
            confirmLabel={a.roles.applySelection}
            emptyLabel={a.roles.assignableNone}
            disabled={busy}
          />
        </div>
        <label className={styles.switchField}>
          <ToggleSwitch
            checked={dominant}
            onChange={(next) => onChange(values, next)}
            disabled={busy}
            aria-label={`${label} : ${a.roles.dominantLabel}`}
          />
          <span>{a.roles.dominantLabel}</span>
        </label>
      </div>
      <span className={styles.inheritedLine}>
        <span className={styles.inheritedLabel}>{a.roles.inheritedLabel}</span>
        {inherited.length === 0 ? (
          <span className={styles.inheritedEmpty}>{a.roles.inheritedNone}</span>
        ) : (
          inherited.map((entry) => (
            <span key={entry.role} className={entry.dominant ? styles.inheritedOff : styles.inheritedOn}>
              {a.roles.inheritedList(entry.role, entry.roles, entry.dominant)}
            </span>
          ))
        )}
      </span>
      <span className={styles.inheritedLine}>
        <span className={styles.inheritedLabel}>{a.roles.assignableResult}</span>
        {result.length === 0 ? (
          <span className={styles.resultOff}>{a.roles.assignableNone}</span>
        ) : (
          result.map((entry) => (
            <span key={entry} className={styles.resultOn}>
              {entry}
            </span>
          ))
        )}
      </span>
    </div>
  );
}

type InheritedGrant = { role: string; granted: boolean; dominant: boolean };

/** Every grant the draft inherits, by permission: the own grants of each
 * parent and of their parents in turn (a loop is walked once). Display only;
 * the server resolves the same way and stays the authority. */
function inheritedGrants(
  parents: readonly string[],
  roles: readonly AdminRole[],
  self: string | null,
  nameOf: (role: AdminRole) => string,
): Map<AdminPermissionCode, InheritedGrant[]> {
  const byCode = new Map(roles.map((role) => [role.code, role]));
  const seen = new Set<string>(self ? [self] : []);
  const stack = [...parents];
  const result = new Map<AdminPermissionCode, InheritedGrant[]>();
  while (stack.length > 0) {
    const code = stack.pop()!;
    if (seen.has(code)) continue;
    seen.add(code);
    const role = byCode.get(code);
    if (!role) continue;
    for (const grant of role.grants) {
      const entry = { role: nameOf(role), granted: grant.granted, dominant: grant.dominant };
      result.set(grant.permission, [...(result.get(grant.permission) ?? []), entry]);
    }
    stack.push(...role.parents);
  }
  return result;
}

/** The access rule: a dominant refusal wins, otherwise any access wins. */
function resolves(grants: readonly { granted: boolean; dominant: boolean }[]): boolean {
  if (grants.some((grant) => grant.dominant && !grant.granted)) return false;
  return grants.some((grant) => grant.granted);
}

/** One row per administration section, grouped like the navigation: the
 * role's own Access and Dominant switches, what it inherits from its parent
 * roles, and the resulting access, recomputed as the switches change. */
function PermissionMatrix({
  rows,
  grants,
  inherited,
  allGranted,
  system,
  disabled,
  onChange,
}: {
  rows: AdminPermissionRow[];
  grants: RoleDraft['grants'];
  inherited: ReadonlyMap<AdminPermissionCode, InheritedGrant[]>;
  /** The super-admin holds every permission whatever is stored. */
  allGranted: boolean;
  system: boolean;
  disabled: boolean;
  onChange: (next: RoleDraft['grants']) => void;
}) {
  const a = useAdminStrings();
  const groups = adminNavGroups(a)
    .map((group) => ({ group, groupRows: rows.filter((row) => row.group === group.id) }))
    .filter((entry) => entry.groupRows.length > 0);

  function update(code: AdminPermissionCode, patch: Partial<GrantState>) {
    const current = grants[code] ?? { granted: false, dominant: false };
    onChange({ ...grants, [code]: { ...current, ...patch } });
  }

  return (
    <fieldset className={styles.matrix} disabled={disabled}>
      <legend className={styles.matrixLegend}>{a.roles.permissionsLabel}</legend>
      {!system && <p className={styles.hint}>{a.roles.rulesHint}</p>}
      {groups.map(({ group, groupRows }) => (
        <section key={group.id} className={styles.matrixGroup} aria-label={group.label}>
          <h2 className={styles.matrixGroupLabel}>{group.label}</h2>
          <Separator />
          {groupRows.map((row) => {
            const state = grants[row.code] ?? { granted: false, dominant: false };
            const fromParents = inherited.get(row.code) ?? [];
            const result = allGranted || resolves([state, ...fromParents]);
            return (
              <div key={row.code} className={styles.permissionRow}>
                <div className={styles.permissionText}>
                  <strong>{row.label}</strong>
                  <span className={styles.hint}>{row.description}</span>
                  {!system && (
                    <span className={styles.inheritedLine}>
                      <span className={styles.inheritedLabel}>{a.roles.inheritedLabel}</span>
                      {fromParents.length === 0 ? (
                        <span className={styles.inheritedEmpty}>{a.roles.inheritedNone}</span>
                      ) : (
                        fromParents.map((entry, index) => (
                          <span
                            key={`${entry.role}-${index}`}
                            className={entry.granted ? styles.inheritedOn : styles.inheritedOff}
                          >
                            {a.roles.inheritedGrant(entry.role, entry.granted, entry.dominant)}
                          </span>
                        ))
                      )}
                    </span>
                  )}
                </div>
                <div className={styles.permissionSide}>
                  {!system && (
                    <div className={styles.permissionControls}>
                      <label className={styles.switchField}>
                        <ToggleSwitch
                          checked={state.granted}
                          onChange={(checked) => update(row.code, { granted: checked })}
                          disabled={disabled}
                          aria-label={a.roles.toggleAria(row.label)}
                        />
                        <span>{a.roles.grantedLabel}</span>
                      </label>
                      <label className={styles.switchField}>
                        <ToggleSwitch
                          checked={state.dominant}
                          onChange={(checked) => update(row.code, { dominant: checked })}
                          disabled={disabled}
                          aria-label={a.roles.dominantAria(row.label)}
                        />
                        <span>{a.roles.dominantLabel}</span>
                      </label>
                    </div>
                  )}
                  <span className={result ? styles.resultOn : styles.resultOff}>
                    {result ? a.roles.effectiveOn : a.roles.effectiveOff}
                  </span>
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </fieldset>
  );
}
