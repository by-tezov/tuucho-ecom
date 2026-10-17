import { useCallback, useEffect, useRef, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Seo } from '@kernel/front/components/seo/Seo';
import { LoadingModal } from '@kernel/front/components/ui/LoadingModal';
import { ToggleSwitch } from '@kernel/front/components/ui/ToggleSwitch';
import { AdminThreadMessages, type AdminThreadMessageVM } from '@kernel/front/components/admin/AdminThreadMessages';
import { AdminThreadComposer } from '@kernel/front/components/admin/AdminThreadComposer';
import {
  fetchAdminChatAttachment,
  getAdminChat,
  listAdminChats,
  notifyAdminChatUser,
  closeAdminChat,
  sendAdminChatMessage,
  setAdminChatOwnerEmailNotification,
  streamAdminChatEvents,
  type AdminChat,
  type AdminChatStatus,
  type AdminChatSummary,
} from '@kernel/front/api/admin/chats';
import { useAuthSession } from '@kernel/front/state/AuthContext';
import { useAdminInfiniteList } from '@kernel/front/hooks/useAdminInfiniteList';
import { AdminInfiniteList } from '@kernel/front/components/admin/AdminInfiniteList';
import { AdminStatusTabs } from '@kernel/front/components/admin/AdminStatusTabs';
import { AdminDetailBar } from '@kernel/front/components/admin/AdminDetailBar';
import { AdminMessagesSwitch } from '@kernel/front/components/admin/AdminMessagesSwitch';
import { AdminInboxFilters, useAdminInboxFilters } from '@kernel/front/routes/admin/AdminInboxFilters';
import { useAdminSectionReset } from '@kernel/front/state/AdminChromeContext';
import type { AdminAttentionCounts } from '@kernel/front/hooks/useAdminAttentionCounts';
import { useLang } from '@kernel/front/assets/i18n';
import { useAdminStrings, type AdminUiStrings } from '@kernel/front/assets/i18n/admin';
import { withMinDuration } from '@kernel/front/utils/withMinDuration';
import { adminPath } from '@kernel/front/utils/adminRoute';
import styles from './AdminThreadPage.module.css';
import { shopConfig } from '@kernel/front/config/env';

const STATUSES: AdminChatStatus[] = ['open', 'closed'];
function statusLabels(a: AdminUiStrings): Record<AdminChatStatus, string> {
  return { open: a.messages.statusOpen, closed: a.messages.statusClosed };
}

type FilterValue = AdminChatStatus | '';
function isChatStatus(value: string | null): value is AdminChatStatus {
  return value === 'open' || value === 'closed';
}

function filterFromSearchParams(params: URLSearchParams): FilterValue {
  const status = params.get('status');
  return isChatStatus(status) ? status : '';
}

function formatDate(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : '-';
}

function toMessageVM(chat: AdminChat): AdminThreadMessageVM[] {
  return chat.messages.map((message) => ({
    id: message.id,
    body: message.body,
    fromAdmin: message.sender === 'owner',
    attachments: message.attachments,
  }));
}

export function AdminChatsPage() {
  const { t } = useLang();
  const a = useAdminStrings();
  const STATUS_LABEL = statusLabels(a);
  const { authedRequest } = useAuthSession();
  const { counts } = useOutletContext<{ counts: AdminAttentionCounts }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState<FilterValue>(() => filterFromSearchParams(searchParams) || 'open');
  const [selected, setSelected] = useState<AdminChat | null>(null);
  const [draft, setDraft] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inboxFilters = useAdminInboxFilters();
  const listQuery = inboxFilters.query;
  /** Window scroll of the list when a thread was opened, restored on back. */
  const listScrollRef = useRef(0);

  const fetchChats = useCallback(
    async (page: number) => {
      const result = await withMinDuration(
        authedRequest((token) => listAdminChats(token, filter as Exclude<FilterValue, ''>, page, listQuery)),
        page === 1 ? 350 : 0,
      );
      return {
        rows: result.chats,
        page: result.pagination.page,
        totalPages: result.pagination.totalPages,
        total: result.pagination.total,
      };
    },
    [authedRequest, filter, listQuery],
  );
  const {
    rows: chats,
    setRows: setChats,
    total,
    hasMore,
    loading,
    loadingMore,
    error,
    setError,
    loadMore,
  } = useAdminInfiniteList<AdminChatSummary>({
    fetchPage: fetchChats,
    errorMessage: a.messages.chatsLoadError,
    enabled: filter !== '',
  });
  const busy = loading || detailLoading || acting;
  /** Index to open once an appended chunk has arrived (see moveChat). */
  const [pendingStep, setPendingStep] = useState<number | null>(null);
  const selectChatRef = useRef<(row: AdminChatSummary) => Promise<void>>(async () => {});

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
    const row = chats[pendingStep];
    if (row) {
      setPendingStep(null);
      void selectChatRef.current(row);
    } else if (!loadingMore) {
      setPendingStep(null);
    }
  }, [pendingStep, chats, loadingMore]);

  useEffect(() => {
    const suppressedUntil = selected?.ownerEmailSuppressedUntil;
    if (!selected || !suppressedUntil) return;
    const remaining = Date.parse(suppressedUntil) - Date.now();
    const timer = window.setTimeout(
      () => {
        setSelected((current) =>
          current?.publicId === selected.publicId ? { ...current, ownerEmailSuppressedUntil: null } : current,
        );
        setNotice(a.messages.muteExpired);
      },
      Math.max(0, remaining),
    );
    return () => window.clearTimeout(timer);
  }, [selected, a.messages.muteExpired]);

  useEffect(() => {
    const publicId = selected?.publicId;
    if (!publicId) return;
    const controller = new AbortController();
    const refresh = () => {
      void authedRequest((token) => getAdminChat(token, publicId))
        .then((result) => setSelected((current) => (current?.publicId === publicId ? result.chat : current)))
        .catch(() => undefined);
    };
    void authedRequest((token) => streamAdminChatEvents(token, publicId, controller.signal, refresh)).catch(
      () => undefined,
    );
    return () => controller.abort();
  }, [authedRequest, selected?.publicId]);

  /** Picking a filter only sets it; useAdminInfiniteList reloads from the
   * first chunk because `fetchChats` gets a new identity. */
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

  async function selectChat(row: AdminChatSummary) {
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
        authedRequest((token) => getAdminChat(token, row.publicId)),
        shopConfig.loadingMinMs.short,
      );
      setSelected(result.chat);
    } catch {
      setSelected(null);
      setError(a.messages.chatLoadError);
    } finally {
      setDetailLoading(false);
    }
  }

  async function moveChat(direction: -1 | 1) {
    if (!selected) return;
    const index = chats.findIndex((row) => row.publicId === selected.publicId);
    const adjacent = chats[index + direction];
    if (adjacent) {
      await selectChat(adjacent);
      return;
    }
    // Stepping past the last loaded conversation: fetch the next chunk first,
    // then open what it appended. Backwards never needs this.
    if (direction !== 1 || !hasMore) return;
    await loadMore();
    setPendingStep(index + 1);
  }

  async function send() {
    if (!selected || !draft.trim()) return;
    setActing(true);
    setActionError(null);
    setNotice(null);
    try {
      const result = await withMinDuration(
        authedRequest((token) => sendAdminChatMessage(token, selected.publicId, { body: draft, images })),
        shopConfig.loadingMinMs.short,
      );
      setSelected({ ...selected, messages: [...selected.messages, result.message] });
      setDraft('');
      setImages([]);
      setAttachError(null);
      setNotice(a.messages.replySent);
    } catch {
      setActionError(a.messages.replyFailed);
    } finally {
      setActing(false);
    }
  }

  async function toggleOwnerEmailNotification(suppressed: boolean) {
    if (!selected) return;
    setActing(true);
    setActionError(null);
    setNotice(null);
    try {
      const result = await withMinDuration(
        authedRequest((token) => setAdminChatOwnerEmailNotification(token, selected.publicId, suppressed)),
        shopConfig.loadingMinMs.short,
      );
      setSelected({ ...selected, ownerEmailSuppressedUntil: result.ownerEmailSuppressedUntil });
      setNotice(suppressed ? a.messages.ownerEmailsPaused : a.messages.ownerEmailsResumed);
    } catch {
      setActionError(a.messages.ownerEmailsFailed);
    } finally {
      setActing(false);
    }
  }

  async function notify() {
    if (!selected) return;
    setActing(true);
    setActionError(null);
    setNotice(null);
    try {
      const result = await withMinDuration(
        authedRequest((token) => notifyAdminChatUser(token, selected.publicId)),
        shopConfig.loadingMinMs.short,
      );
      setNotice(
        result.sent
          ? a.messages.notifySent
          : result.reason === 'notification_disabled'
            ? a.messages.notifyOptedOut
            : a.messages.notifyNothing,
      );
    } catch {
      setActionError(a.messages.notifyFailed);
    } finally {
      setActing(false);
    }
  }

  /** A conversation closed from the open inbox no longer belongs to it: drop
   * it and return to the list, where the notice confirms the close. */
  function removeClosedChat(publicId: string) {
    setChats((current) => current.filter((chat) => chat.publicId !== publicId));
    backToList();
  }

  async function closeChat() {
    if (!selected || selected.status !== 'open' || busy) return;
    setActing(true);
    setActionError(null);
    setNotice(null);
    try {
      const result = await withMinDuration(
        authedRequest((token) => closeAdminChat(token, selected.publicId)),
        shopConfig.loadingMinMs.short,
      );
      if (filter === 'open') {
        removeClosedChat(selected.publicId);
        // After backToList, which clears the detail notice.
        setNotice(a.messages.chatClosedNotice);
      } else {
        setSelected(result.chat);
        setChats((current) =>
          current.map((chat) =>
            chat.publicId === result.chat.publicId ? { ...chat, status: result.chat.status } : chat,
          ),
        );
        setNotice(a.messages.chatClosedNotice);
      }
    } catch {
      setActionError(a.messages.closeFailed);
    } finally {
      setActing(false);
    }
  }

  const index = selected ? chats.findIndex((row) => row.publicId === selected.publicId) : -1;
  // chats accumulates every chunk, so the index is the absolute position.
  const position = selected ? index + 1 : 0;
  const emailSuppressed = Boolean(
    selected?.ownerEmailSuppressedUntil && Date.parse(selected.ownerEmailSuppressedUntil) > Date.now(),
  );
  const open = selected?.status === 'open';

  return (
    <section className={styles.section} aria-labelledby="admin-chats-h">
      <Seo
        title={t.admin.chatsTitle}
        description={a.messages.chatsSeoDescription}
        path={adminPath('/chats')}
        noindex
      />
      {!selected && (
        <>
          <h1 id="admin-chats-h" className={styles.title}>
            {a.nav.contactLabel}
          </h1>
          <AdminMessagesSwitch active="chats" counts={counts} />
          <AdminStatusTabs
            label={a.messages.status}
            tabs={STATUSES.map((value) => ({
              value,
              label: STATUS_LABEL[value],
              count: value === 'open' ? counts.chatsOpen : null,
            }))}
            active={filter}
            onSelect={(value) => {
              if (value !== filter) selectFilter(value);
            }}
            closeLabel={t.gallery.close}
          >
            <AdminInboxFilters id="admin-chats" state={inboxFilters} />
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
            {filter && !busy && chats.length === 0 && (
              <p className={styles.empty}>
                {inboxFilters.narrowed ? a.messages.noChatFiltered : a.messages.noChat}
              </p>
            )}
            {chats.length > 0 && (
              <AdminInfiniteList
                className={styles.cardGrid}
                dividers={false}
                cardMinWidth={300}
                label={t.admin.chatsTitle}
                count={chats.length}
                rowKey={(index) => chats[index]!.publicId}
                hasMore={hasMore}
                loadingMore={loadingMore}
                onLoadMore={() => void loadMore()}
                renderRow={(index) => {
                  const row = chats[index]!;
                  return (
                    <button type="button" className={styles.threadCard} onClick={() => void selectChat(row)}>
                      <span className={styles.avatar} aria-hidden="true">
                        {(row.identity || row.email).slice(0, 2).toUpperCase()}
                      </span>
                      <span className={styles.threadCardMain}>
                        <strong>{row.identity || row.email}</strong>
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
          <h1 id="admin-chats-h" className="visuallyHidden">
            {a.messages.conversation}
          </h1>
          <AdminDetailBar
            backLabel={
              filter
                ? `${a.messages.registered} · ${STATUS_LABEL[filter].toLowerCase()}`
                : a.messages.registered
            }
            onBack={backToList}
            position={position}
            total={total}
            canPrevious={index > 0}
            canNext={index >= 0 && (index < chats.length - 1 || hasMore)}
            busy={busy}
            onPrevious={() => void moveChat(-1)}
            onNext={() => void moveChat(1)}
            previousLabel={a.messages.previousChat}
            nextLabel={a.messages.nextChat}
            navLabel={a.messages.chatsNav}
          />
          <article className={styles.detail}>
            <header className={styles.detailHeader}>
              <span
                className={
                  open
                    ? `${styles.statusBadge} ${styles.tone_open}`
                    : `${styles.statusBadge} ${styles.tone_closed}`
                }
              >
                {open ? a.messages.chatOpen : a.messages.chatClosed}
              </span>
              <h2>{selected.visitorIdentity || selected.visitorEmail}</h2>
              <p className={styles.detailMeta}>
                <a href={`mailto:${selected.visitorEmail}`}>{selected.visitorEmail}</a>
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
                authedRequest((token) => fetchAdminChatAttachment(token, selected.publicId, attachmentId))
              }
            />
            {!open && <p className={styles.readOnly}>{a.messages.closedReadOnly}</p>}
            <AdminThreadComposer
              draft={draft}
              setDraft={setDraft}
              images={images}
              setImages={setImages}
              attachError={attachError}
              setAttachError={setAttachError}
              acting={acting}
              onSend={() => void send()}
              footer={
                open && (
                  <div className={styles.checkbox}>
                    <ToggleSwitch
                      checked={emailSuppressed}
                      onChange={(checked) => void toggleOwnerEmailNotification(checked)}
                      aria-label={a.messages.muteOwnerEmails}
                      disabled={acting}
                    />
                    {a.messages.muteOwnerEmails}
                  </div>
                )
              }
            />
            <div className={styles.actions}>
              {open && (
                <button
                  type="button"
                  className={styles.ghostAction}
                  onClick={() => void closeChat()}
                  disabled={acting}
                >
                  {a.messages.closeChat}
                </button>
              )}
              <button type="button" onClick={() => void notify()} disabled={acting}>
                {a.messages.emailCustomer}
              </button>
            </div>
          </article>
        </div>
      )}

      {busy && <LoadingModal message={acting ? t.admin.actionLoading : t.admin.contentLoading} />}
    </section>
  );
}
