import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Seo } from '../components/seo/Seo';
import { Button } from '../components/ui/Button';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { AdminInfiniteList } from '../components/admin/AdminInfiniteList';
import { LoadingModal } from '../components/ui/LoadingModal';
import { clearAdminCronLog, getAdminCronLog, type AdminCronLogKind } from '../api/admin/cronLogs';
import { ApiError } from '../api/errors';
import { useAuthSession } from '../state/AuthContext';
import { useLang } from '../assets/i18n';
import { useAdminStrings, type AdminUiStrings } from '../assets/i18n/admin';
import { useAdminInfiniteList } from '../hooks/useAdminInfiniteList';
import { useAdminSectionReset } from '../state/AdminChromeContext';
import { shopConfig } from '../config/env';
import { adminPath } from '../utils/adminRoute';
import { withMinDuration } from '../utils/withMinDuration';
import { cronLogPageChunk, type CronLogEntryView } from './adminCronLogEntries';
import { BackButton, Chevron } from './adminBackButton';
import { usePluginEnabled } from '../plugins/StorefrontBootstrap';
import { NotFoundPage } from './NotFoundPage';
import styles from './AdminCronLogsPage.module.css';

const CHUNK_SIZE = 30;
const MAX_LINES = 500;

type Journal = {
  kind: AdminCronLogKind;
  script: string;
  title: (a: AdminUiStrings) => string;
  hint: (a: AdminUiStrings) => string;
};

const JOURNALS: Journal[] = [
  {
    kind: 'shipment',
    script: 'main-cron-shipment-tracking.sh',
    title: (a) => a.prefs.cronShipmentLog,
    hint: (a) => a.prefs.cronShipmentLogHint,
  },
  {
    kind: 'account-deletion',
    script: 'main-cron-account-deletion.sh',
    title: (a) => a.prefs.cronDeletionLog,
    hint: (a) => a.prefs.cronDeletionLogHint,
  },
  {
    kind: 'guest-saved-cleanup',
    script: 'main-cron-guest-saved-cleanup.sh',
    title: (a) => a.prefs.cronGuestLog,
    hint: (a) => a.prefs.cronGuestLogHint,
  },
  {
    kind: 'loyalty',
    script: 'main-cron-loyalty.sh',
    title: (a) => a.prefs.cronLoyaltyLog,
    hint: (a) => a.prefs.cronLoyaltyLogHint,
  },
  {
    kind: 'gift',
    script: 'main-cron-gift.sh',
    title: (a) => a.prefs.cronGiftLog,
    hint: (a) => a.prefs.cronGiftLogHint,
  },
  {
    kind: 'gift-purge',
    script: 'main-cron-gift-purge.sh',
    title: (a) => a.prefs.cronGiftPurgeLog,
    hint: (a) => a.prefs.cronGiftPurgeLogHint,
  },
  {
    kind: 'payment-auth-expiry',
    script: 'main-cron-payment-auth-expiry.sh',
    title: (a) => a.prefs.cronAuthLog,
    hint: (a) => a.prefs.cronAuthLogHint,
  },
  {
    kind: 'warm',
    script: 'main-cron-warm.sh',
    title: (a) => a.prefs.cronWarmLog,
    hint: (a) => a.prefs.cronWarmLogHint,
  },
];

function isJournalOff(error: unknown): boolean {
  return error instanceof ApiError && error.code.startsWith('cron_') && error.code.endsWith('_log_disabled');
}

function fieldLabel(key: string, a: AdminUiStrings): string {
  const labels = a.cronLogs.fields as Record<string, string>;
  return labels[key] ?? key;
}

function errorLabel(code: string, a: AdminUiStrings): string {
  const labels = a.cronLogs.errors as Record<string, string>;
  return labels[code] ?? code;
}

function formatChip(value: unknown, a: AdminUiStrings): string {
  if (typeof value === 'boolean') return value ? a.activity.yes : a.activity.no;
  if (value === null || value === undefined) return '';
  return String(value);
}

function dateTime(value: string, lang: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function CronEntryCard({ entry, lang, a }: { entry: CronLogEntryView; lang: string; a: AdminUiStrings }) {
  return (
    <article className={styles.card}>
      <div className={styles.cardMeta}>
        <span className={`${styles.tag} ${entry.ok ? '' : styles.tagFailure}`}>
          {entry.unreadable ? a.cronLogs.unreadable : entry.ok ? a.cronLogs.success : a.cronLogs.failure}
        </span>
        {entry.at ? <time dateTime={entry.at}>{dateTime(entry.at, lang)}</time> : null}
      </div>
      {entry.error ? <p className={styles.status}>{errorLabel(entry.error, a)}</p> : null}
      {entry.chips.length > 0 ? (
        <dl className={styles.chips}>
          {entry.chips.map((chip, index) => (
            <div key={`${chip.key}-${index}`} className={styles.chip}>
              <dt>{fieldLabel(chip.key, a)}</dt>
              <dd>{formatChip(chip.value, a)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  );
}

function CronJournalView({ journal, onBack }: { journal: Journal; onBack: () => void }) {
  const a = useAdminStrings();
  const { lang, t } = useLang();
  const { authedRequest } = useAuthSession();
  const [off, setOff] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const title = journal.title(a);

  const fetchPage = useCallback(
    async (page: number) => {
      if (page === 1) setOff(false);
      try {
        const want = Math.min(page * CHUNK_SIZE, MAX_LINES);
        const result = await withMinDuration(
          authedRequest((token) => getAdminCronLog(token, journal.kind, want)),
          shopConfig.loadingMinMs.short,
        );
        const { rows, done } = cronLogPageChunk(result.lines, page, CHUNK_SIZE, MAX_LINES);
        return { rows, page, totalPages: done ? page : page + 1 };
      } catch (error) {
        if (isJournalOff(error)) {
          setOff(true);
          return { rows: [], page: 1, totalPages: 1 };
        }
        throw error;
      }
    },
    [authedRequest, journal.kind],
  );

  const { rows, hasMore, loading, loadingMore, error, loadMore, reload } =
    useAdminInfiniteList<CronLogEntryView>({
      fetchPage,
      errorMessage: a.cronLogs.loadError,
    });

  async function erase() {
    setClearing(true);
    setClearError(null);
    try {
      await withMinDuration(
        authedRequest((token) => clearAdminCronLog(token, journal.kind)),
        shopConfig.loadingMinMs.short,
      );
      setConfirmClear(false);
      reload();
    } catch {
      setConfirmClear(false);
      setClearError(a.cronLogs.clearError);
    } finally {
      setClearing(false);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="admin-cron-journal-h">
      <Seo title={title} description={journal.hint(a)} path={adminPath('/crons')} noindex />
      <div className={styles.topBar}>
        <BackButton label={a.cronLogs.back} onClick={onBack} />
        <Button variant="ghost" disabled={loading || loadingMore || clearing} onClick={reload}>
          {a.cronLogs.refresh}
        </Button>
        <Button
          variant="ghostDanger"
          className={styles.clear}
          disabled={clearing}
          onClick={() => setConfirmClear(true)}
        >
          {a.cronLogs.clear}
        </Button>
      </div>
      <h1 id="admin-cron-journal-h" className={styles.title}>
        {title}
      </h1>
      <code className={styles.script}>{journal.script}</code>
      <p className={styles.note}>{journal.hint(a)}</p>
      {(loading || loadingMore || clearing) && (
        <LoadingModal message={clearing ? t.admin.actionLoading : t.admin.contentLoading} />
      )}
      {off ? (
        <p className={styles.status}>
          {a.cronLogs.off}{' '}
          <Link to={`${adminPath('/preferences')}?tab=technique`}>{a.cronLogs.prefsLink}</Link>
        </p>
      ) : null}
      {error && !off ? (
        <p className={`${styles.status} ${styles.error}`} role="alert">
          {error}
        </p>
      ) : null}
      {clearError ? (
        <p className={`${styles.status} ${styles.error}`} role="alert">
          {clearError}
        </p>
      ) : null}
      {confirmClear ? (
        <ConfirmModal
          title={a.cronLogs.clearTitle}
          message={a.cronLogs.clearMessage}
          confirmLabel={a.cronLogs.clearConfirm}
          closeLabel={t.gallery.close}
          confirmDanger
          onConfirm={() => void erase()}
          onCancel={() => {
            if (!clearing) setConfirmClear(false);
          }}
        />
      ) : null}
      {!loading && !off && !error && rows.length === 0 ? (
        <p className={styles.status}>{journal.kind === 'warm' ? a.cronLogs.emptyWarm : a.cronLogs.empty}</p>
      ) : null}
      {rows.length > 0 ? (
        <AdminInfiniteList
          className={styles.entries}
          label={title}
          count={rows.length}
          rowKey={(index) => `${journal.kind}-${index}`}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={() => void loadMore()}
          dividers={false}
          renderRow={(index) => <CronEntryCard entry={rows[index]!} lang={lang} a={a} />}
        />
      ) : null}
      <div className={styles.bottomBar}>
        <BackButton label={a.cronLogs.back} onClick={onBack} />
      </div>
    </section>
  );
}

export function AdminCronLogsPage() {
  const cronOn = usePluginEnabled('journal-cron');
  const a = useAdminStrings();
  const [selected, setSelected] = useState<Journal | null>(null);

  const backToList = useCallback(() => {
    setSelected(null);
    window.scrollTo({ top: 0 });
  }, []);
  useAdminSectionReset(backToList);

  function openJournal(journal: Journal) {
    setSelected(journal);
    window.scrollTo({ top: 0 });
  }

  if (!cronOn) return <NotFoundPage />;

  if (selected) {
    return <CronJournalView journal={selected} onBack={backToList} />;
  }

  return (
    <section className={styles.section} aria-labelledby="admin-crons-h">
      <Seo title={a.nav.cronsLabel} description={a.nav.cronsDescription} path={adminPath('/crons')} noindex />
      <h1 id="admin-crons-h" className={styles.title}>
        {a.nav.cronsLabel}
      </h1>
      <p className={styles.note}>{a.cronLogs.intro}</p>
      <div className={styles.list} role="list" aria-label={a.cronLogs.listLabel}>
        {JOURNALS.map((journal) => (
          <div key={journal.kind} className={styles.item} role="listitem">
            <button type="button" className={styles.header} onClick={() => openJournal(journal)}>
              <span className={styles.headerText}>
                <strong>{journal.title(a)}</strong>
                <code className={styles.script}>{journal.script}</code>
                <span className={styles.hint}>{journal.hint(a)}</span>
              </span>
              <Chevron direction="right" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
