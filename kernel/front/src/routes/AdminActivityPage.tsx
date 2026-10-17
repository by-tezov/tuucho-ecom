import { useCallback, useEffect, useState } from 'react';
import { Seo } from '../components/seo/Seo';
import { Button } from '../components/ui/Button';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { LoadingModal } from '../components/ui/LoadingModal';
import {
  clearAdminActivity,
  listAdminActivity,
  listAdminActivityActors,
  type AdminActivityActor,
  type AdminActivityCategory,
  type AdminActivityEntry,
  type AdminActivityOrigin,
} from '../api/admin/activity';
import { useAuthSession } from '../state/AuthContext';
import { useLang } from '../assets/i18n';
import { useAdminStrings, type AdminUiStrings } from '../assets/i18n/admin';
import { useAdminInfiniteList } from '../hooks/useAdminInfiniteList';
import { AdminInfiniteList } from '../components/admin/AdminInfiniteList';
import { AdminFilterSelect } from '../components/admin/AdminFilterSelect';
import { shopConfig } from '../config/env';
import { adminPath } from '../utils/adminRoute';
import { withMinDuration } from '../utils/withMinDuration';
import styles from './AdminActivityPage.module.css';

const CHUNK_SIZE = 30;

function categoryLabels(a: AdminUiStrings): Record<AdminActivityCategory | '', string> {
  return {
    '': a.activity.allCategories,
    catalogue: a.activity.catCatalogue,
    orders: a.activity.catOrders,
    accounts: a.activity.catAccounts,
    loyalty: a.activity.catLoyalty,
    gift: a.activity.catGift,
    promotions: a.activity.catPromotions,
    shipping: a.activity.catShipping,
    messaging: a.activity.catMessaging,
    settings: a.activity.catSettings,
    operations: a.activity.catOperations,
    deploy: a.activity.catDeploy,
  };
}

function originLabels(a: AdminUiStrings): Record<AdminActivityOrigin | '', string> {
  return {
    '': a.activity.allOrigins,
    admin: a.activity.originAdmin,
    operator: a.activity.originOperator,
    system: a.activity.originSystem,
  };
}

function options<V extends string>(labels: Record<V, string>): { value: V; label: string }[] {
  return Object.entries(labels).map(([value, label]) => ({ value: value as V, label: label as string }));
}

function dateTime(value: string, lang: string): string {
  return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function changeFieldLabel(field: string, a: AdminUiStrings): string {
  const labels: Record<string, string> = {
    price: a.activity.fieldPrice,
    unitPrice: a.activity.fieldUnitPrice,
    available: a.activity.fieldStock,
    packPrices: a.activity.fieldPackPrices,
    hidden: a.activity.fieldHidden,
    featured: a.activity.fieldFeatured,
    enabled: a.activity.fieldEnabled,
    status: a.activity.fieldStatus,
    suppressed: a.activity.fieldEmailNotification,
    adminVerified: a.activity.fieldVerified,
  };
  const size = /^sizes\.(XS|S|M|L)$/.exec(field);
  if (size) return `${a.activity.fieldSize} ${size[1]}`;
  return labels[field] ?? field;
}

type ActivityChange = { field: string; before: unknown; after: unknown };

function isActivityChange(value: unknown): value is ActivityChange {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.field === 'string' && 'before' in row && 'after' in row;
}

function formatChangeValue(value: unknown, a: AdminUiStrings): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? a.activity.yes : a.activity.no;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

function changeLines(detail: Record<string, unknown>, a: AdminUiStrings): string[] | null {
  if (!Array.isArray(detail.changes)) return null;
  return detail.changes.filter(isActivityChange).map((change) => {
    const label = changeFieldLabel(change.field, a);
    return `${label}: ${formatChangeValue(change.before, a)} → ${formatChangeValue(change.after, a)}`;
  });
}

function detailEntries(detail: Record<string, unknown>): { key: string; value: string }[] {
  return Object.entries(detail)
    .filter(([key]) => key !== 'changes')
    .map(([key, value]) => ({
      key,
      value:
        value === null || value === undefined
          ? '-'
          : typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
            ? String(value)
            : JSON.stringify(value),
    }));
}

export function AdminActivityPage() {
  const { t, lang } = useLang();
  const a = useAdminStrings();
  const CATEGORY_LABELS = categoryLabels(a);
  const ORIGIN_LABELS = originLabels(a);
  const { authedRequest } = useAuthSession();
  const [category, setCategory] = useState<AdminActivityCategory | ''>('');
  const [origin, setOrigin] = useState<AdminActivityOrigin | ''>('');
  const [actorUserId, setActorUserId] = useState('');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [actors, setActors] = useState<AdminActivityActor[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const actorOptions = [
    { value: '', label: a.activity.allAdmins },
    ...actors.map((actor) => ({ value: actor.userId, label: actor.email })),
  ];

  useEffect(() => {
    void authedRequest((token) => listAdminActivityActors(token))
      .then((result) => setActors(result.actors))
      .catch(() => setActors([]));
  }, [authedRequest]);

  useEffect(() => {
    const handle = window.setTimeout(() => setSearch(q.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [q]);

  const fetchPage = useCallback(
    async (page: number) => {
      const result = await withMinDuration(
        authedRequest((token) =>
          listAdminActivity(token, {
            page,
            pageSize: CHUNK_SIZE,
            ...(category ? { category } : {}),
            ...(actorUserId ? { origin: 'admin' as const, actorUserId } : origin ? { origin } : {}),
            ...(search ? { q: search } : {}),
          }),
        ),
        shopConfig.loadingMinMs.short,
      );
      return {
        rows: result.entries,
        page: result.pagination.page,
        totalPages: result.pagination.totalPages,
      };
    },
    [authedRequest, category, origin, actorUserId, search],
  );

  const { rows, hasMore, loading, loadingMore, error, loadMore, reload } =
    useAdminInfiniteList<AdminActivityEntry>({
      fetchPage,
      errorMessage: a.activity.loadError,
    });
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  async function erase() {
    setClearing(true);
    setClearError(null);
    try {
      await withMinDuration(
        authedRequest((token) => clearAdminActivity(token)),
        shopConfig.loadingMinMs.short,
      );
      setConfirmClear(false);
      reload();
    } catch {
      setConfirmClear(false);
      setClearError(a.activity.clearError);
    } finally {
      setClearing(false);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="admin-activity-h">
      <Seo
        title={a.nav.activityLabel}
        description={a.nav.activityDescription}
        path={adminPath('/activity')}
        noindex
      />
      <div className={styles.topBar}>
        <h1 id="admin-activity-h" className={styles.title}>
          {a.nav.activityLabel}
        </h1>
        <Button
          variant="ghostDanger"
          className={styles.clear}
          disabled={clearing}
          onClick={() => setConfirmClear(true)}
        >
          {a.activity.clear}
        </Button>
      </div>
      <p className={styles.note}>{a.activity.intro}</p>

      <div className={styles.filters}>
        <div className={styles.filtersRow}>
          <AdminFilterSelect
            label={a.activity.category}
            options={options(CATEGORY_LABELS)}
            value={category}
            onChange={setCategory}
            closeLabel={t.gallery.close}
          />
          <AdminFilterSelect
            label={a.activity.origin}
            options={options(ORIGIN_LABELS)}
            value={actorUserId ? 'admin' : origin}
            onChange={setOrigin}
            closeLabel={t.gallery.close}
            disabled={Boolean(actorUserId)}
          />
          <AdminFilterSelect
            label={a.activity.admin}
            options={actorOptions}
            value={actorUserId}
            onChange={setActorUserId}
            closeLabel={t.gallery.close}
          />
          <div className={styles.searchField}>
            <label htmlFor="activity-q">{a.activity.search}</label>
            <input
              id="activity-q"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder={a.activity.searchPlaceholder}
              autoComplete="off"
            />
          </div>
        </div>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {clearError ? (
        <p className={styles.error} role="alert">
          {clearError}
        </p>
      ) : null}
      {confirmClear ? (
        <ConfirmModal
          title={a.activity.clearTitle}
          message={a.activity.clearMessage}
          confirmLabel={a.activity.clearConfirm}
          closeLabel={t.gallery.close}
          confirmDanger
          onConfirm={() => void erase()}
          onCancel={() => {
            if (!clearing) setConfirmClear(false);
          }}
        />
      ) : null}

      {rows.length === 0 && !loading ? (
        <p className={styles.empty}>{a.activity.empty}</p>
      ) : (
        <AdminInfiniteList
          className={styles.list}
          label={a.activity.listLabel}
          count={rows.length}
          rowKey={(index) => rows[index]!.id}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
          renderRow={(index) => {
            const entry = rows[index]!;
            const open = expandedId === entry.id;
            const changes = changeLines(entry.detail, a);
            const details = detailEntries(entry.detail);
            return (
              <button
                type="button"
                className={styles.row}
                aria-expanded={open}
                onClick={() => setExpandedId(open ? null : entry.id)}
              >
                <div className={styles.rowMain}>
                  <strong>{entry.summary}</strong>
                  <div className={styles.rowMeta}>
                    <span className={styles.tag}>{CATEGORY_LABELS[entry.category]}</span>
                    <span className={styles.tag}>{ORIGIN_LABELS[entry.origin]}</span>
                    {entry.outcome === 'failure' ? (
                      <span className={`${styles.tag} ${styles.tagFailure}`}>{a.activity.failure}</span>
                    ) : null}
                    <time dateTime={entry.occurredAt}>{dateTime(entry.occurredAt, lang)}</time>
                    <span>{entry.actorLabel}</span>
                  </div>
                </div>
                {open ? (
                  <dl className={styles.detail}>
                    <div className={styles.detailRow}>
                      <dt>{a.activity.action}</dt>
                      <dd>{entry.action}</dd>
                    </div>
                    {entry.targetType && entry.targetId ? (
                      <div className={styles.detailRow}>
                        <dt>{a.activity.target}</dt>
                        <dd>
                          {entry.targetType}: {entry.targetId}
                        </dd>
                      </div>
                    ) : null}
                    {entry.sourceCommand ? (
                      <div className={styles.detailRow}>
                        <dt>{a.activity.command}</dt>
                        <dd>{entry.sourceCommand}</dd>
                      </div>
                    ) : null}
                    {entry.targets.length > 0 ? (
                      <div className={styles.detailRow}>
                        <dt>{a.activity.identifiers}</dt>
                        <dd>{entry.targets.join(', ')}</dd>
                      </div>
                    ) : null}
                    {changes ? (
                      <div className={styles.detailRow}>
                        <dt>{a.activity.changes}</dt>
                        <dd>
                          {changes.length === 0 ? (
                            a.activity.noChange
                          ) : (
                            <ul className={styles.changeList}>
                              {changes.map((line) => (
                                <li key={line}>{line}</li>
                              ))}
                            </ul>
                          )}
                        </dd>
                      </div>
                    ) : null}
                    {details.map((item) => (
                      <div key={item.key} className={styles.detailRow}>
                        <dt>{item.key}</dt>
                        <dd>{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </button>
            );
          }}
        />
      )}

      {loading || loadingMore || clearing ? (
        <LoadingModal message={clearing ? t.admin.actionLoading : t.admin.contentLoading} />
      ) : null}
    </section>
  );
}
