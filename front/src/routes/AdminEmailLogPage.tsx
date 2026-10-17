import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Seo } from '../components/seo/Seo';
import { Button } from '../components/ui/Button';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { LoadingModal } from '../components/ui/LoadingModal';
import { AdminFilterSelect } from '../components/admin/AdminFilterSelect';
import { clearAdminEmailLog, getAdminEmailLog } from '../api/admin/emailLog';
import type { AdminEmailLogMetrics } from '../api/contract/admin/emailLog';
import { useAuthSession } from '../state/AuthContext';
import { useLang } from '../assets/i18n';
import { useAdminStrings, type AdminUiStrings } from '../assets/i18n/admin';
import { useAdminSectionReset } from '../state/AdminChromeContext';
import { shopConfig } from '../config/env';
import { adminPath } from '../utils/adminRoute';
import { withMinDuration } from '../utils/withMinDuration';
import { BackButton, Chevron } from './adminBackButton';
import { usePluginEnabled } from '../plugins/StorefrontBootstrap';
import { NotFoundPage } from './NotFoundPage';
import cronStyles from './AdminCronLogsPage.module.css';
import styles from './AdminApiLogPage.module.css';
import localStyles from './AdminEmailLogPage.module.css';

const MAX_LINES = 500;

type EmailLogEntry = {
  at: string;
  outcome: string;
  channel: string;
  kind: string;
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  text: string;
  textTruncated: boolean;
  html: boolean;
  attachmentCount: number;
  attachmentNames: string[];
  error: string;
};

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function parseLines(lines: string[]): EmailLogEntry[] {
  const entries: EmailLogEntry[] = [];
  for (const line of lines) {
    try {
      const raw = JSON.parse(line) as Record<string, unknown>;
      const names = Array.isArray(raw.attachmentNames)
        ? raw.attachmentNames.filter((item) => typeof item === 'string')
        : [];
      entries.push({
        at: asString(raw.at),
        outcome: asString(raw.outcome),
        channel: asString(raw.channel),
        kind: asString(raw.kind),
        to: asString(raw.to),
        from: asString(raw.from),
        replyTo: asString(raw.replyTo),
        subject: asString(raw.subject),
        text: asString(raw.text),
        textTruncated: raw.textTruncated === true,
        html: raw.html === true,
        attachmentCount: typeof raw.attachmentCount === 'number' ? raw.attachmentCount : names.length,
        attachmentNames: names,
        error: asString(raw.error),
      });
    } catch {
      entries.push({
        at: '',
        outcome: '',
        channel: '',
        kind: '',
        to: '',
        from: '',
        replyTo: '',
        subject: line,
        text: '',
        textTruncated: false,
        html: false,
        attachmentCount: 0,
        attachmentNames: [],
        error: '',
      });
    }
  }
  return entries.reverse();
}

const EMAIL_WINDOWS = ['hour', 'day', 'week', 'month'] as const;

function emailWindowLabel(key: (typeof EMAIL_WINDOWS)[number], a: AdminUiStrings): string {
  if (key === 'hour') return a.emailLogs.metricsHour;
  if (key === 'day') return a.emailLogs.metricsDay;
  if (key === 'week') return a.emailLogs.metricsWeek;
  return a.emailLogs.metricsMonth;
}

function EmailLogMetricsView({ metrics, lang }: { metrics: AdminEmailLogMetrics; lang: string }) {
  const a = useAdminStrings();
  const count = new Intl.NumberFormat(lang);
  return (
    <section className={styles.metrics} aria-label={a.emailLogs.metricsLabel}>
      <div className={styles.metricCards}>
        {EMAIL_WINDOWS.map((key) => (
          <article key={key} className={styles.metricCard}>
            <p className={styles.metricWindow}>{emailWindowLabel(key, a)}</p>
            <p className={styles.metricValue}>{count.format(metrics[key])}</p>
            <p className={styles.metricCaption}>{a.emailLogs.metricsEmails}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function kindLabel(kind: string, a: AdminUiStrings): string {
  if (kind === 'user') return a.emailLogs.kindUser;
  if (kind === 'spy') return a.emailLogs.kindSpy;
  if (kind === 'contact') return a.emailLogs.kindContact;
  if (kind === 'chat') return a.emailLogs.kindChat;
  return kind;
}

function outcomeLabel(outcome: string, a: AdminUiStrings): string {
  if (outcome === 'sent') return a.emailLogs.sent;
  if (outcome === 'failed') return a.emailLogs.failed;
  return outcome;
}

function channelLabel(channel: string, a: AdminUiStrings): string {
  if (channel === 'smtp') return a.emailLogs.channelSmtp;
  if (channel === 'folder') return a.emailLogs.channelFolder;
  return channel;
}

function EntryDetail({ entry, onBack, a }: { entry: EmailLogEntry; onBack: () => void; a: AdminUiStrings }) {
  return (
    <section className={cronStyles.section} aria-labelledby="admin-email-log-detail-h">
      <Seo
        title={entry.subject || a.nav.emailLogLabel}
        description={a.nav.emailLogDescription}
        path={adminPath('/email-log')}
        noindex
      />
      <div className={cronStyles.topBar}>
        <BackButton label={a.emailLogs.back} onClick={onBack} />
      </div>
      <h1 id="admin-email-log-detail-h" className={cronStyles.title}>
        {entry.subject || a.nav.emailLogLabel}
      </h1>
      <p className={localStyles.meta}>
        <span className={entry.outcome === 'failed' ? localStyles.failed : undefined}>
          {outcomeLabel(entry.outcome, a)}
        </span>
        {' · '}
        {kindLabel(entry.kind, a)}
        {' · '}
        {channelLabel(entry.channel, a)}
        {entry.at ? ` · ${entry.at}` : ''}
      </p>
      {entry.to ? (
        <p className={localStyles.meta}>
          {a.emailLogs.to}: {entry.to}
        </p>
      ) : null}
      {entry.from ? (
        <p className={localStyles.meta}>
          {a.emailLogs.from}: {entry.from}
        </p>
      ) : null}
      {entry.replyTo ? (
        <p className={localStyles.meta}>
          {a.emailLogs.replyTo}: {entry.replyTo}
        </p>
      ) : null}
      {entry.attachmentCount > 0 ? (
        <p className={localStyles.meta}>
          {a.emailLogs.attachments}: {entry.attachmentNames.join(', ') || String(entry.attachmentCount)}
        </p>
      ) : null}
      {entry.error ? (
        <div className={styles.block}>
          <h2>{a.emailLogs.error}</h2>
          <pre className={styles.pre}>{entry.error}</pre>
        </div>
      ) : null}
      {entry.text ? (
        <div className={styles.block}>
          <h2>{a.emailLogs.body}</h2>
          <pre className={styles.pre}>{entry.text}</pre>
          {entry.textTruncated ? <p className={styles.hint}>{a.emailLogs.textTruncated}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

export function AdminEmailLogPage() {
  const journalOn = usePluginEnabled('journal-email');
  const a = useAdminStrings();
  const { lang, t } = useLang();
  const { authedRequest } = useAuthSession();
  const [enabled, setEnabled] = useState(true);
  const [entries, setEntries] = useState<EmailLogEntry[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [metrics, setMetrics] = useState<AdminEmailLogMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [kind, setKind] = useState('');
  const [outcome, setOutcome] = useState('');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const [selected, setSelected] = useState<EmailLogEntry | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  useAdminSectionReset(() => setSelected(null));

  useEffect(() => {
    const handle = window.setTimeout(() => setSearch(q.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    void withMinDuration(
      authedRequest((token) =>
        getAdminEmailLog(token, {
          lines: MAX_LINES,
          ...(kind ? { kind } : {}),
          ...(outcome ? { outcome } : {}),
          ...(search ? { q: search } : {}),
        }),
      ),
      shopConfig.loadingMinMs.short,
    )
      .then((result) => {
        if (cancelled) return;
        setEnabled(result.enabled);
        setTruncated(result.truncated);
        setMetrics(result.metrics);
        setEntries(parseLines(result.lines));
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authedRequest, kind, outcome, refreshTick, search]);

  async function erase() {
    setClearing(true);
    setClearError(null);
    try {
      await withMinDuration(
        authedRequest((token) => clearAdminEmailLog(token)),
        shopConfig.loadingMinMs.short,
      );
      setConfirmClear(false);
      setSelected(null);
      setRefreshTick((tick) => tick + 1);
    } catch {
      setConfirmClear(false);
      setClearError(a.emailLogs.clearError);
    } finally {
      setClearing(false);
    }
  }

  if (!journalOn) return <NotFoundPage />;

  if (selected) return <EntryDetail entry={selected} onBack={() => setSelected(null)} a={a} />;

  const busy = loading || clearing;

  return (
    <section className={cronStyles.section} aria-labelledby="admin-email-log-h">
      <Seo
        title={a.nav.emailLogLabel}
        description={a.nav.emailLogDescription}
        path={adminPath('/email-log')}
        noindex
      />
      {busy ? <LoadingModal message={clearing ? t.admin.actionLoading : t.admin.contentLoading} /> : null}
      <div className={cronStyles.topBar}>
        <Button variant="ghost" disabled={busy} onClick={() => setRefreshTick((tick) => tick + 1)}>
          {a.emailLogs.refresh}
        </Button>
        <Button variant="ghostDanger" disabled={clearing} onClick={() => setConfirmClear(true)}>
          {a.emailLogs.clear}
        </Button>
      </div>
      <h1 id="admin-email-log-h" className={cronStyles.title}>
        {a.nav.emailLogLabel}
      </h1>
      <p className={cronStyles.note}>{a.emailLogs.intro}</p>
      {metrics ? <EmailLogMetricsView metrics={metrics} lang={lang} /> : null}
      {!enabled ? (
        <p className={cronStyles.status}>
          {a.emailLogs.off}{' '}
          <Link to={`${adminPath('/preferences')}?tab=technique`}>{a.emailLogs.prefsLink}</Link>
        </p>
      ) : null}
      {loadError ? (
        <p className={`${cronStyles.status} ${cronStyles.error}`} role="alert">
          {a.emailLogs.loadError}
        </p>
      ) : null}
      {clearError ? (
        <p className={`${cronStyles.status} ${cronStyles.error}`} role="alert">
          {clearError}
        </p>
      ) : null}
      {confirmClear ? (
        <ConfirmModal
          title={a.emailLogs.clearTitle}
          message={a.emailLogs.clearMessage}
          confirmLabel={a.emailLogs.clearConfirm}
          closeLabel={t.gallery.close}
          confirmDanger
          onConfirm={() => void erase()}
          onCancel={() => {
            if (!clearing) setConfirmClear(false);
          }}
        />
      ) : null}
      <div className={styles.filters}>
        <div className={styles.filtersRow}>
          <AdminFilterSelect
            label={a.emailLogs.kind}
            options={[
              { value: '', label: a.emailLogs.allKinds },
              { value: 'user', label: a.emailLogs.kindUser },
              { value: 'spy', label: a.emailLogs.kindSpy },
              { value: 'contact', label: a.emailLogs.kindContact },
              { value: 'chat', label: a.emailLogs.kindChat },
            ]}
            value={kind}
            onChange={setKind}
            closeLabel={t.gallery.close}
          />
          <AdminFilterSelect
            label={a.emailLogs.outcome}
            options={[
              { value: '', label: a.emailLogs.allOutcomes },
              { value: 'sent', label: a.emailLogs.sent },
              { value: 'failed', label: a.emailLogs.failed },
            ]}
            value={outcome}
            onChange={setOutcome}
            closeLabel={t.gallery.close}
          />
          <div className={styles.field}>
            <label htmlFor="email-log-q">{a.emailLogs.search}</label>
            <input
              id="email-log-q"
              type="search"
              value={q}
              placeholder={a.emailLogs.searchPlaceholder}
              autoComplete="off"
              onChange={(event) => setQ(event.target.value)}
            />
          </div>
        </div>
      </div>
      {truncated ? <p className={styles.hint}>{a.emailLogs.truncated}</p> : null}
      {!loading && !loadError && entries.length === 0 ? (
        <p className={cronStyles.status}>{a.emailLogs.empty}</p>
      ) : null}
      {entries.map((entry, index) => (
        <button
          key={`${entry.at}-${index}`}
          type="button"
          className={styles.row}
          onClick={() => {
            setSelected(entry);
            window.scrollTo({ top: 0 });
          }}
        >
          <span className={styles.rowBody}>
            <p className={styles.headline}>{entry.subject || entry.error || a.nav.emailLogLabel}</p>
            <p className={localStyles.meta}>
              <span className={entry.outcome === 'failed' ? localStyles.failed : undefined}>
                {outcomeLabel(entry.outcome, a)}
              </span>
              {' · '}
              {kindLabel(entry.kind, a)}
              {entry.to ? ` · ${entry.to}` : ''}
            </p>
          </span>
          <Chevron direction="right" />
        </button>
      ))}
    </section>
  );
}
