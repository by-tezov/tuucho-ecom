import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Seo } from '@kernel/front/components/seo/Seo';
import { Button } from '@kernel/front/components/ui/Button';
import { ConfirmModal } from '@kernel/front/components/ui/ConfirmModal';
import { LoadingModal } from '@kernel/front/components/ui/LoadingModal';
import { AdminInfiniteList } from '@kernel/front/components/admin/AdminInfiniteList';
import { AdminFilterSelect } from '@kernel/front/components/admin/AdminFilterSelect';
import { clearAdminApiLog, getAdminApiLog } from '@kernel/front/api/admin/apiLog';
import type { AdminApiLogMetrics, AdminApiLogWindow } from '@kernel/front/api/contract/admin/apiLog';
import { useAuthSession } from '@kernel/front/state/AuthContext';
import { useLang } from '@kernel/front/assets/i18n';
import { useAdminStrings, type AdminUiStrings } from '@kernel/front/assets/i18n/admin';
import { useAdminInfiniteList } from '@kernel/front/hooks/useAdminInfiniteList';
import { useAdminSectionReset } from '@kernel/front/state/AdminChromeContext';
import { shopConfig } from '@kernel/front/config/env';
import { adminPath } from '@kernel/front/utils/adminRoute';
import { withMinDuration } from '@kernel/front/utils/withMinDuration';
import { apiLogPageChunk, formatApiLogDuration, type ApiLogEntryView } from '@kernel/front/routes/adminApiLogEntries';
import { BackButton, Chevron } from '@kernel/front/routes/adminBackButton';
import { usePluginEnabled } from '@kernel/front/plugins/StorefrontBootstrap';
import { NotFoundPage } from '@kernel/front/routes/NotFoundPage';
import cronStyles from './AdminCronLogsPage.module.css';
import styles from './AdminApiLogPage.module.css';

const CHUNK_SIZE = 30;
const MAX_LINES = 500;

function localDayIso(value: string, end: boolean): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return undefined;
  const date = new Date(year, month - 1, day, end ? 23 : 0, end ? 59 : 0, end ? 59 : 0, end ? 999 : 0);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function dateTime(value: string, lang: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function headlineOf(entry: ApiLogEntryView, a: AdminUiStrings): string {
  if (entry.unreadable) return a.cronLogs.unreadable;
  return [entry.method, entry.path].filter(Boolean).join(' ') || a.cronLogs.unreadable;
}

function entrySections(entry: ApiLogEntryView, a: AdminUiStrings): { title: string; text: string }[] {
  const copy = a.apiLogs;
  return [
    entry.queryText ? { title: copy.query, text: entry.queryText } : null,
    entry.requestHeadersText ? { title: copy.requestHeaders, text: entry.requestHeadersText } : null,
    entry.requestBodyText ? { title: copy.requestBody, text: entry.requestBodyText } : null,
    entry.responseHeadersText ? { title: copy.responseHeaders, text: entry.responseHeadersText } : null,
    entry.responseBodyText ? { title: copy.responseBody, text: entry.responseBodyText } : null,
  ].filter((section) => section !== null);
}

function EntryMeta({ entry, lang, a }: { entry: ApiLogEntryView; lang: string; a: AdminUiStrings }) {
  const failed = entry.unreadable || (entry.status !== null && entry.status >= 400);
  return (
    <div className={cronStyles.cardMeta}>
      {entry.status !== null ? (
        <span className={`${cronStyles.tag} ${failed ? cronStyles.tagFailure : ''}`}>{entry.status}</span>
      ) : (
        <span className={`${cronStyles.tag} ${cronStyles.tagFailure}`}>{a.cronLogs.unreadable}</span>
      )}
      {entry.at ? <time dateTime={entry.at}>{dateTime(entry.at, lang)}</time> : null}
      {entry.durationMs !== null ? <span>{formatApiLogDuration(entry.durationMs)}</span> : null}
      {entry.target ? <span>{entry.target}</span> : null}
    </div>
  );
}

function ApiEntryRow({
  entry,
  lang,
  a,
  onOpen,
}: {
  entry: ApiLogEntryView;
  lang: string;
  a: AdminUiStrings;
  onOpen: () => void;
}) {
  return (
    <button type="button" className={styles.row} onClick={onOpen}>
      <span className={styles.rowBody}>
        <EntryMeta entry={entry} lang={lang} a={a} />
        <span className={styles.headline}>{headlineOf(entry, a)}</span>
      </span>
      <Chevron direction="right" />
    </button>
  );
}

const METRIC_WINDOWS = ['hour', 'day', 'week', 'month'] as const;

function windowLabel(key: (typeof METRIC_WINDOWS)[number], a: AdminUiStrings): string {
  if (key === 'hour') return a.apiLogs.metricsHour;
  if (key === 'day') return a.apiLogs.metricsDay;
  if (key === 'week') return a.apiLogs.metricsWeek;
  return a.apiLogs.metricsMonth;
}

function ApiLogMetricsView({
  metrics,
  lang,
  route,
  onPickRoute,
}: {
  metrics: AdminApiLogMetrics;
  lang: string;
  route: string;
  onPickRoute: (path: string) => void;
}) {
  const a = useAdminStrings();
  const count = new Intl.NumberFormat(lang);

  return (
    <section className={styles.metrics} aria-label={a.apiLogs.metricsLabel}>
      <div className={styles.metricCards}>
        {METRIC_WINDOWS.map((key) => {
          const summary: AdminApiLogWindow = metrics[key];
          return (
            <article key={key} className={styles.metricCard}>
              <p className={styles.metricWindow}>{windowLabel(key, a)}</p>
              <p className={styles.metricValue}>{count.format(summary.requests)}</p>
              <p className={styles.metricCaption}>{a.apiLogs.metricsRequests}</p>
            </article>
          );
        })}
      </div>
      <div className={styles.tops}>
        {METRIC_WINDOWS.map((key) => {
          const summary: AdminApiLogWindow = metrics[key];
          return (
            <section key={key} className={styles.topCard} aria-labelledby={`api-log-top-${key}`}>
              <h2 id={`api-log-top-${key}`}>{windowLabel(key, a)}</h2>
              {summary.top.length === 0 ? (
                <p className={styles.metricsEmpty}>{a.apiLogs.metricsEmpty}</p>
              ) : (
                <ol className={styles.topList}>
                  {summary.top.map((entry) => {
                    const active = route === entry.path;
                    return (
                      <li key={entry.path}>
                        <button
                          type="button"
                          className={active ? `${styles.topRow} ${styles.topRowActive}` : styles.topRow}
                          aria-pressed={active}
                          onClick={() => onPickRoute(entry.path)}
                        >
                          <span className={styles.topPath}>{entry.path}</span>
                          <span className={styles.topCount}>{count.format(entry.count)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}

function ApiCallView({ entry, onBack }: { entry: ApiLogEntryView; onBack: () => void }) {
  const a = useAdminStrings();
  const { lang } = useLang();
  const headline = headlineOf(entry, a);
  const sections = entrySections(entry, a);
  const bodiesMissing = !entry.unreadable && !entry.requestBodyText && !entry.responseBodyText;

  return (
    <section className={cronStyles.section} aria-labelledby="admin-api-call-h">
      <Seo title={headline} description={a.nav.apiLogDescription} path={adminPath('/api-log')} noindex />
      <div className={cronStyles.topBar}>
        <BackButton label={a.cronLogs.back} onClick={onBack} />
      </div>
      <h1 id="admin-api-call-h" className={cronStyles.title}>
        {headline}
      </h1>
      <EntryMeta entry={entry} lang={lang} a={a} />
      {sections.map((section) => (
        <div key={section.title} className={styles.block}>
          <h2>{section.title}</h2>
          <pre className={styles.pre}>{section.text}</pre>
        </div>
      ))}
      {bodiesMissing ? <p className={cronStyles.status}>{a.apiLogs.bodyNotRecorded}</p> : null}
      <div className={cronStyles.bottomBar}>
        <BackButton label={a.cronLogs.back} onClick={onBack} />
      </div>
    </section>
  );
}

export function AdminApiLogPage() {
  const journalOn = usePluginEnabled('tuucho-journal-admin');
  const a = useAdminStrings();
  const { lang, t } = useLang();
  const { authedRequest } = useAuthSession();
  const [enabled, setEnabled] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [route, setRoute] = useState('');
  const [routes, setRoutes] = useState<string[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [metrics, setMetrics] = useState<AdminApiLogMetrics | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [selected, setSelected] = useState<ApiLogEntryView | null>(null);
  const generation = useRef(0);
  const cacheRef = useRef<{ key: string; lines: string[] } | null>(null);
  const rangeInvalid = Boolean(from && to && from > to);
  const filtered = Boolean(route || from || to || search);

  useEffect(() => {
    const handle = window.setTimeout(() => setSearch(q.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [q]);

  const fetchPage = useCallback(
    async (page: number) => {
      if (from && to && from > to) return { rows: [], page: 1, totalPages: 1 };
      const key = `${refreshTick}|${route}|${from}|${to}|${search}`;
      if (page === 1) generation.current += 1;
      const gen = generation.current;
      if (cacheRef.current?.key !== key) {
        if (page !== 1) return { rows: [], page, totalPages: page };
        const fromIso = from ? localDayIso(from, false) : undefined;
        const toIso = to ? localDayIso(to, true) : undefined;
        const result = await withMinDuration(
          authedRequest((token) =>
            getAdminApiLog(token, {
              lines: MAX_LINES,
              ...(route ? { route } : {}),
              ...(fromIso ? { from: fromIso } : {}),
              ...(toIso ? { to: toIso } : {}),
              ...(search ? { q: search } : {}),
            }),
          ),
          shopConfig.loadingMinMs.short,
        );
        if (gen !== generation.current) return { rows: [], page: 1, totalPages: 1 };
        cacheRef.current = { key, lines: result.lines };
        setEnabled(result.enabled);
        setRoutes(result.routes);
        setTruncated(result.truncated);
        setMetrics(result.metrics);
      }
      const lines = cacheRef.current?.key === key ? cacheRef.current.lines : [];
      const { rows, done } = apiLogPageChunk(lines, page, CHUNK_SIZE, MAX_LINES);
      return { rows, page, totalPages: done ? page : page + 1 };
    },
    [authedRequest, from, refreshTick, route, search, to],
  );

  const backToList = useCallback(() => {
    setSelected(null);
    window.scrollTo({ top: 0 });
  }, []);
  useAdminSectionReset(backToList);

  const { rows, hasMore, loading, loadingMore, error, loadMore } = useAdminInfiniteList<ApiLogEntryView>({
    fetchPage,
    errorMessage: a.cronLogs.loadError,
  });

  async function erase() {
    setClearing(true);
    setClearError(null);
    try {
      await withMinDuration(
        authedRequest((token) => clearAdminApiLog(token)),
        shopConfig.loadingMinMs.short,
      );
      setConfirmClear(false);
      setRefreshTick((tick) => tick + 1);
    } catch {
      setConfirmClear(false);
      setClearError(a.cronLogs.clearError);
    } finally {
      setClearing(false);
    }
  }

  function openEntry(entry: ApiLogEntryView) {
    setSelected(entry);
    window.scrollTo({ top: 0 });
  }

  const busy = loading || clearing;

  if (!journalOn) return <NotFoundPage />;

  return (
    <>
      {busy ? <LoadingModal message={clearing ? t.admin.actionLoading : t.admin.contentLoading} /> : null}
      {selected ? (
        <ApiCallView entry={selected} onBack={backToList} />
      ) : (
        <section className={cronStyles.section} aria-labelledby="admin-api-log-h">
          <Seo
            title={a.nav.apiLogLabel}
            description={a.nav.apiLogDescription}
            path={adminPath('/api-log')}
            noindex
          />
          <div className={cronStyles.topBar}>
            <Button
              variant="ghost"
              disabled={loading || loadingMore || clearing}
              onClick={() => setRefreshTick((tick) => tick + 1)}
            >
              {a.cronLogs.refresh}
            </Button>
            <Button
              variant="ghostDanger"
              className={cronStyles.clear}
              disabled={clearing}
              onClick={() => setConfirmClear(true)}
            >
              {a.cronLogs.clear}
            </Button>
          </div>
          <h1 id="admin-api-log-h" className={cronStyles.title}>
            {a.nav.apiLogLabel}
          </h1>
          <p className={cronStyles.note}>{a.apiLogs.intro}</p>
          {metrics ? (
            <ApiLogMetricsView
              metrics={metrics}
              lang={lang}
              route={route}
              onPickRoute={(path) => setRoute(route === path ? '' : path)}
            />
          ) : null}
          <div className={styles.filters}>
            <div className={styles.filtersRow}>
              <AdminFilterSelect
                label={a.apiLogs.route}
                options={[
                  { value: '', label: a.apiLogs.allRoutes },
                  ...(route && !routes.includes(route) ? [{ value: route, label: route }] : []),
                  ...routes.map((path) => ({ value: path, label: path })),
                ]}
                value={route}
                onChange={setRoute}
                closeLabel={t.gallery.close}
                filter={{
                  label: a.apiLogs.routeFilter,
                  placeholder: a.apiLogs.routeFilterPlaceholder,
                  empty: a.apiLogs.routeFilterEmpty,
                }}
              />
              <div className={styles.field}>
                <label htmlFor="api-log-from">{a.apiLogs.from}</label>
                <input
                  id="api-log-from"
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="api-log-to">{a.apiLogs.to}</label>
                <input
                  id="api-log-to"
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="api-log-q">{a.apiLogs.search}</label>
                <input
                  id="api-log-q"
                  type="search"
                  value={q}
                  placeholder={a.apiLogs.searchPlaceholder}
                  autoComplete="off"
                  onChange={(event) => setQ(event.target.value)}
                />
              </div>
            </div>
            <p className={styles.hint}>{a.apiLogs.searchHint}</p>
          </div>
          {!loading && !enabled ? (
            <p className={cronStyles.status}>
              {a.apiLogs.off}{' '}
              <Link to={`${adminPath('/preferences')}?tab=technique`}>{a.cronLogs.prefsLink}</Link>
            </p>
          ) : null}
          {error ? (
            <p className={`${cronStyles.status} ${cronStyles.error}`} role="alert">
              {error}
            </p>
          ) : null}
          {clearError ? (
            <p className={`${cronStyles.status} ${cronStyles.error}`} role="alert">
              {clearError}
            </p>
          ) : null}
          {confirmClear ? (
            <ConfirmModal
              title={a.cronLogs.clearTitle}
              message={a.apiLogs.clearMessage}
              confirmLabel={a.cronLogs.clearConfirm}
              closeLabel={t.gallery.close}
              confirmDanger
              onConfirm={() => void erase()}
              onCancel={() => {
                if (!clearing) setConfirmClear(false);
              }}
            />
          ) : null}
          {rangeInvalid ? (
            <p className={`${cronStyles.status} ${cronStyles.error}`} role="alert">
              {a.apiLogs.rangeError}
            </p>
          ) : null}
          {truncated && !rangeInvalid ? <p className={cronStyles.note}>{a.apiLogs.truncated}</p> : null}
          {!loading && !error && !rangeInvalid && rows.length === 0 ? (
            <p className={cronStyles.status}>{filtered ? a.apiLogs.emptyMatch : a.cronLogs.empty}</p>
          ) : null}
          {rows.length > 0 ? (
            <AdminInfiniteList
              className={cronStyles.entries}
              label={a.nav.apiLogLabel}
              count={rows.length}
              rowKey={(index) => `api-${index}`}
              hasMore={hasMore}
              loadingMore={loadingMore}
              onLoadMore={() => void loadMore()}
              dividers={false}
              renderRow={(index) => (
                <ApiEntryRow entry={rows[index]!} lang={lang} a={a} onOpen={() => openEntry(rows[index]!)} />
              )}
            />
          ) : null}
        </section>
      )}
    </>
  );
}
