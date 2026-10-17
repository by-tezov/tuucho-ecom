import { useCallback, useEffect, useRef, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Seo } from '@kernel/front/components/seo/Seo';
import { LoadingModal } from '@kernel/front/components/ui/LoadingModal';
import { AdminThreadMessages, type AdminThreadMessageVM } from '@kernel/front/components/admin/AdminThreadMessages';
import { AdminThreadComposer } from '@kernel/front/components/admin/AdminThreadComposer';
import {
  fetchAdminUnconnectedContactAttachment,
  getAdminUnconnectedContact,
  listAdminUnconnectedContacts,
  sendAdminUnconnectedContactReply,
  setAdminUnconnectedContactStatus,
  type AdminUnconnectedContact,
  type AdminUnconnectedContactStatus,
  type AdminUnconnectedContactSummary,
} from '@kernel/front/api/admin/contacts';
import { useAuthSession } from '@kernel/front/state/AuthContext';
import { useAdminInfiniteList } from '@kernel/front/hooks/useAdminInfiniteList';
import { AdminInfiniteList } from '@kernel/front/components/admin/AdminInfiniteList';
import { AdminStatusTabs } from '@kernel/front/components/admin/AdminStatusTabs';
import { AdminDetailBar } from '@kernel/front/components/admin/AdminDetailBar';
import { AdminMessagesSwitch } from '@kernel/front/components/admin/AdminMessagesSwitch';
import { useAdminSectionReset } from '@kernel/front/state/AdminChromeContext';
import type { AdminAttentionCounts } from '@kernel/front/hooks/useAdminAttentionCounts';
import { useLang } from '@kernel/front/assets/i18n';
import { useAdminStrings, type AdminUiStrings } from '@kernel/front/assets/i18n/admin';
import { withMinDuration } from '@kernel/front/utils/withMinDuration';
import { adminPath } from '@kernel/front/utils/adminRoute';
import styles from './AdminThreadPage.module.css';
import { AdminInboxFilters, useAdminInboxFilters } from '@kernel/front/routes/admin/AdminInboxFilters';
import { shopConfig } from '@kernel/front/config/env';

const STATUSES: AdminUnconnectedContactStatus[] = ['new', 'answered', 'ignored'];
function statusLabels(a: AdminUiStrings): Record<AdminUnconnectedContactStatus, string> {
  return {
    new: a.messages.statusNew,
    answered: a.messages.statusAnswered,
    ignored: a.messages.statusIgnored,
  };
}

type FilterValue = AdminUnconnectedContactStatus | '';

function isContactStatus(value: string | null): value is AdminUnconnectedContactStatus {
  return value === 'new' || value === 'answered' || value === 'ignored';
}

function filterFromSearchParams(params: URLSearchParams): FilterValue {
  const status = params.get('status');
  return isContactStatus(status) ? status : '';
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

function toMessageVM(contact: AdminUnconnectedContact): AdminThreadMessageVM[] {
  return contact.messages.map((message) => ({
    id: message.id,
    body: message.body,
    fromAdmin: message.direction === 'admin',
    attachments: message.attachments,
  }));
}

export function AdminUnconnectedContactsPage() {
  const { t } = useLang();
  const a = useAdminStrings();
  const STATUS_LABEL = statusLabels(a);
  const { authedRequest } = useAuthSession();
  const { counts } = useOutletContext<{ counts: AdminAttentionCounts }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState<FilterValue>(() => filterFromSearchParams(searchParams) || 'new');
  const [selected, setSelected] = useState<AdminUnconnectedContact | null>(null);
  const [draft, setDraft] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inboxFilters = useAdminInboxFilters();
  const listQuery = inboxFilters.query;
  /** Window scroll of the list when a message was opened, restored on back. */
  const listScrollRef = useRef(0);
  const fetchContacts = useCallback(
    async (page: number) => {
      const result = await withMinDuration(
        authedRequest((token) =>
          listAdminUnconnectedContacts(token, filter as Exclude<FilterValue, ''>, page, listQuery),
        ),
        page === 1 ? 350 : 0,
      );
      return {
        rows: result.contacts,
        page: result.pagination.page,
        totalPages: result.pagination.totalPages,
        total: result.pagination.total,
      };
    },
    [authedRequest, filter, listQuery],
  );
  const {
    rows: contacts,
    setRows: setContacts,
    total,
    hasMore,
    loading,
    loadingMore,
    error,
    setError,
    loadMore,
  } = useAdminInfiniteList<AdminUnconnectedContactSummary>({
    fetchPage: fetchContacts,
    errorMessage: a.messages.contactsLoadError,
    enabled: filter !== '',
  });
  const busy = loading || detailLoading || acting;
  /** Index to open once an appended chunk has arrived (see moveContact). */
  const [pendingStep, setPendingStep] = useState<number | null>(null);
  const selectContactRef = useRef<(row: AdminUnconnectedContactSummary) => Promise<void>>(async () => {});

  const backToListRef = useRef(backToList);
  backToListRef.current = backToList;
  const resetSection = useCallback(() => backToListRef.current(), []);
  useAdminSectionReset(resetSection);

  useEffect(() => {
    // Keep the URL in step with the default inbox picked on landing; any
    // later pick writes the URL itself, so this only fires once.
    if (filter && !searchParams.get('status')) setSearchParams({ status: filter }, { replace: true });
  }, [filter, searchParams, setSearchParams]);

  function backToList() {
    setSelected(null);
    setDraft('');
    setImages([]);
    setAttachError(null);
    setActionError(null);
    setNotice(null);
    const top = listScrollRef.current;
    requestAnimationFrame(() => window.scrollTo({ top }));
  }

  useEffect(() => {
    if (pendingStep === null) return;
    const row = contacts[pendingStep];
    if (row) {
      setPendingStep(null);
      void selectContactRef.current(row);
    } else if (!loadingMore) {
      setPendingStep(null);
    }
  }, [pendingStep, contacts, loadingMore]);

  /** Picking a filter only sets it; useAdminInfiniteList reloads from the
   * first chunk because `fetchContacts` gets a new identity. */
  function selectFilter(value: FilterValue) {
    setFilter(value);
    setSelected(null);
    setDraft('');
    setImages([]);
    setAttachError(null);
    setError(null);
    setActionError(null);
    setNotice(null);
    setSearchParams(value ? { status: value } : {}, { replace: true });
  }

  selectContactRef.current = selectContact;

  async function selectContact(row: AdminUnconnectedContactSummary) {
    if (!selected) listScrollRef.current = window.scrollY;
    window.scrollTo({ top: 0 });
    setDetailLoading(true);
    setDraft('');
    setImages([]);
    setAttachError(null);
    setError(null);
    setActionError(null);
    setNotice(null);
    try {
      const result = await withMinDuration(
        authedRequest((token) => getAdminUnconnectedContact(token, row.publicId)),
        shopConfig.loadingMinMs.short,
      );
      setSelected(result.contact);
    } catch {
      setSelected(null);
      setError(a.messages.contactLoadError);
    } finally {
      setDetailLoading(false);
    }
  }

  async function moveContact(direction: -1 | 1) {
    if (!selected) return;
    const index = contacts.findIndex((row) => row.publicId === selected.publicId);
    const adjacent = contacts[index + direction];
    if (adjacent) {
      await selectContact(adjacent);
      return;
    }
    // Stepping past the last loaded message: fetch the next chunk first, then
    // open what it appended. Backwards never needs this.
    if (direction !== 1 || !hasMore) return;
    await loadMore();
    setPendingStep(index + 1);
  }

  /** A message that left the current tab no longer belongs to it: drop it
   * and return to the list, where the caller's notice confirms the action. */
  function removeCurrentFromList(publicId: string) {
    setContacts((current) => current.filter((row) => row.publicId !== publicId));
    backToList();
  }

  async function changeStatus(nextStatus: AdminUnconnectedContactStatus) {
    if (!selected) return;
    setActing(true);
    setActionError(null);
    setNotice(null);
    try {
      await withMinDuration(
        authedRequest((token) => setAdminUnconnectedContactStatus(token, selected.publicId, nextStatus)),
        shopConfig.loadingMinMs.short,
      );
      if (filter && filter !== nextStatus) {
        removeCurrentFromList(selected.publicId);
      } else {
        setSelected({ ...selected, status: nextStatus });
        setContacts((current) =>
          current.map((row) => (row.publicId === selected.publicId ? { ...row, status: nextStatus } : row)),
        );
      }
      // After removeCurrentFromList, whose backToList clears the notice.
      setNotice(nextStatus === 'ignored' ? a.messages.ignoredNotice : a.messages.statusUpdated);
    } catch {
      setActionError(a.messages.statusFailed);
    } finally {
      setActing(false);
    }
  }

  async function send() {
    if (!selected || !draft.trim()) return;
    setActing(true);
    setActionError(null);
    setNotice(null);
    try {
      const result = await withMinDuration(
        authedRequest((token) =>
          sendAdminUnconnectedContactReply(token, selected.publicId, { body: draft, images }),
        ),
        shopConfig.loadingMinMs.short,
      );
      setDraft('');
      setImages([]);
      setAttachError(null);
      if (filter === 'new' || filter === 'ignored') {
        removeCurrentFromList(selected.publicId);
      } else {
        setSelected({ ...selected, status: 'answered', messages: [...selected.messages, result.message] });
        setContacts((current) =>
          current.map((row) => (row.publicId === selected.publicId ? { ...row, status: 'answered' } : row)),
        );
      }
      setNotice(a.messages.replyEmailed);
    } catch {
      setActionError(a.messages.replyFailed);
    } finally {
      setActing(false);
    }
  }

  const index = selected ? contacts.findIndex((row) => row.publicId === selected.publicId) : -1;
  // contacts accumulates every chunk, so the index is the absolute position.
  const position = selected ? index + 1 : 0;

  return (
    <section className={styles.section} aria-labelledby="admin-contacts-h">
      <Seo
        title={t.admin.unconnectedContactsTitle}
        description={a.messages.contactsSeoDescription}
        path={adminPath('/unconnected-contacts')}
        noindex
      />
      {!selected && (
        <>
          <h1 id="admin-contacts-h" className={styles.title}>
            {a.nav.contactLabel}
          </h1>
          <AdminMessagesSwitch active="contacts" counts={counts} />
          <AdminStatusTabs
            label={a.messages.status}
            tabs={STATUSES.map((value) => ({
              value,
              label: STATUS_LABEL[value],
              count: value === 'new' ? counts.contactsNew : null,
            }))}
            active={filter}
            onSelect={(value) => {
              if (value !== filter) selectFilter(value);
            }}
            closeLabel={t.gallery.close}
          >
            <AdminInboxFilters id="admin-contacts" state={inboxFilters} />
            {notice && (
              <p className={styles.successNotice} role="status">
                {notice}
              </p>
            )}
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            {filter && !busy && contacts.length === 0 && (
              <p className={styles.empty}>
                {inboxFilters.narrowed ? a.messages.noChatFiltered : a.messages.noMessage}
              </p>
            )}
            {contacts.length > 0 && (
              <AdminInfiniteList
                className={styles.cardGrid}
                dividers={false}
                cardMinWidth={300}
                label={t.admin.unconnectedContactsTitle}
                count={contacts.length}
                rowKey={(index) => contacts[index]!.publicId}
                hasMore={hasMore}
                loadingMore={loadingMore}
                onLoadMore={() => void loadMore()}
                renderRow={(index) => {
                  const row = contacts[index]!;
                  return (
                    <button
                      type="button"
                      className={styles.threadCard}
                      onClick={() => void selectContact(row)}
                    >
                      <span className={styles.avatar} aria-hidden="true">
                        {row.identity.slice(0, 2).toUpperCase()}
                      </span>
                      <span className={styles.threadCardMain}>
                        <strong>{row.identity}</strong>
                        <span className={styles.threadCardDate}>
                          {a.messages.openedOn(formatDate(row.createdAt))}
                        </span>
                        <span className={styles.threadCardPreview}>{row.preview || '-'}</span>
                      </span>
                    </button>
                  );
                }}
              />
            )}
          </AdminStatusTabs>
        </>
      )}

      {selected && !detailLoading && (
        <div className={styles.detailOnly}>
          <h1 id="admin-contacts-h" className="visuallyHidden">
            {a.messages.contactMessage}
          </h1>
          <AdminDetailBar
            backLabel={
              filter ? `${a.messages.guests} · ${STATUS_LABEL[filter].toLowerCase()}` : a.messages.guests
            }
            onBack={backToList}
            position={position}
            total={total}
            canPrevious={index > 0}
            canNext={index >= 0 && (index < contacts.length - 1 || hasMore)}
            busy={busy}
            onPrevious={() => void moveContact(-1)}
            onNext={() => void moveContact(1)}
            previousLabel={a.messages.previousMessage}
            nextLabel={a.messages.nextMessage}
            navLabel={a.messages.messagesNav}
          />
          <article className={styles.detail}>
            <header className={styles.detailHeader}>
              <span className={styles.statusBadge}>{STATUS_LABEL[selected.status]}</span>
              <h2>{selected.identity}</h2>
              <p className={styles.detailMeta}>
                <a href={`mailto:${selected.email}`}>{selected.email}</a>
                <span aria-hidden="true"> · </span>
                <span>{formatDate(selected.createdAt)}</span>
              </p>
            </header>
            {notice && (
              <p className={acting ? styles.loadingNotice : styles.successNotice} role="status">
                {notice}
              </p>
            )}
            {actionError && (
              <p className={styles.error} role="alert">
                {actionError}
              </p>
            )}
            <AdminThreadMessages
              messages={toMessageVM(selected)}
              fetchAttachment={(attachmentId) =>
                authedRequest((token) =>
                  fetchAdminUnconnectedContactAttachment(token, selected.publicId, attachmentId),
                )
              }
            />
            <AdminThreadComposer
              draft={draft}
              setDraft={setDraft}
              images={images}
              setImages={setImages}
              attachError={attachError}
              setAttachError={setAttachError}
              acting={acting}
              onSend={() => void send()}
            />
            <div className={styles.actions}>
              <button
                type="button"
                onClick={() => void changeStatus('answered')}
                disabled={acting || selected.status === 'answered'}
              >
                {a.messages.markAnswered}
              </button>
              <button
                type="button"
                className={styles.ghostAction}
                onClick={() => void changeStatus('ignored')}
                disabled={acting || selected.status === 'ignored'}
              >
                {a.messages.markIgnored}
              </button>
            </div>
          </article>
        </div>
      )}

      {busy && <LoadingModal message={acting ? t.admin.actionLoading : t.admin.contentLoading} />}
    </section>
  );
}
