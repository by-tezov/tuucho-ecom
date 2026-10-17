import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useLang } from '../../assets/i18n';
import {
  closeAccountChatSession,
  createAccountChatSession,
  fetchAccountChatAttachment,
  getAccountChatSession,
  listAccountChatSessions,
  markAccountChatRead,
  setAccountChatPresence,
  sendAccountChatMessage,
  streamAccountChatEvents,
  type AccountChatSession,
  type AccountChatSummary,
  type ChatAttachment,
} from '../../api/chat';
import { useAuthSession } from '../../state/AuthContext';
import { Button } from '../ui/Button';
import {
  CONTACT_IMAGE_MAX_COUNT,
  ImageAttachField,
  type ImageAttachFieldHandle,
} from '../contact/ImageAttachField';
import { FIELD_CONTACT_MESSAGE_MAX } from '../../utils/fieldLimits';
import { usesSingularItemCount } from '../../utils/cartDisplayName';
import styles from './AccountContactChat.module.css';
import { useScrollHint } from '../../hooks/useScrollHint';
import { useDragScroll } from '../../hooks/useDragScroll';

function localDate(value: string | null): string {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

function localDay(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(new Date(value));
}

function isSameDay(a: string, b: string): boolean {
  const first = new Date(a);
  const second = new Date(b);
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

function AttachmentThumb({ sessionId, attachment }: { sessionId: string; attachment: ChatAttachment }) {
  const { t } = useLang();
  const { authedRequest } = useAuthSession();
  const [url, setUrl] = useState<string | null>(null);
  const label = t.contact.attachmentLabel.replace('{fileName}', attachment.fileName);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    void authedRequest((token) => fetchAccountChatAttachment(token, sessionId, attachment.id))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [sessionId, attachment.id, authedRequest]);

  return url ? (
    <img loading="lazy" decoding="async" src={url} alt={label} className={styles.attachmentThumb} />
  ) : (
    <span className={styles.attachmentPlaceholder}>{label}</span>
  );
}

export function AccountContactChat() {
  const { t, lang } = useLang();
  const { authedRequest } = useAuthSession();
  const [summaries, setSummaries] = useState<AccountChatSummary[]>([]);
  const [session, setSession] = useState<AccountChatSession | null>(null);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [oldestMessageId, setOldestMessageId] = useState<number | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  // Messages stay selectable for copy; links and buttons keep their click.
  const transcriptDragScroll = useDragScroll<HTMLDivElement>({
    ignore: 'a, button',
    preventSelection: false,
  });
  const [transcriptVisible, setTranscriptVisible] = useState(false);
  const { scrollHint, updateScrollHint } = useScrollHint(transcriptRef);
  const previousSessionIdRef = useRef<string | undefined>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const attachFieldRef = useRef<ImageAttachFieldHandle>(null);
  const initialLoadErrorRef = useRef(t.contact.errorGeneric);
  const {
    scrollHint: composerScrollHint,
    updateScrollHint: updateComposerScrollHint,
    clearScrollHint: clearComposerScrollHint,
  } = useScrollHint(textareaRef);

  const sessionId = session?.publicId;
  const closedSummaries = summaries.filter((item) => item.status === 'closed');

  // The 2→5 line auto-grow + up/down chevrons are a mobile-only compact
  // treatment (see AccountContactChat.module.css's 1023px breakpoint,
  // the site's one chrome/mobile breakpoint) — desktop keeps its plain
  // fixed-rows textarea, same as before.
  const autoGrowComposer = useCallback(() => {
    const element = textareaRef.current;
    if (!element) return;
    if (!window.matchMedia('(max-width: 1023px)').matches) {
      element.style.height = '';
      clearComposerScrollHint();
      return;
    }
    const computed = window.getComputedStyle(element);
    const lineHeight = parseFloat(computed.lineHeight) || 20;
    const paddingV = parseFloat(computed.paddingTop) + parseFloat(computed.paddingBottom);
    const minHeight = lineHeight * 2 + paddingV;
    const maxHeight = lineHeight * 5 + paddingV;
    // Collapse to 0 (not 'auto') before measuring — with the `rows={4}`
    // fallback still on the element, 'auto' resolves to the rows-based
    // intrinsic height, so scrollHeight would read ~4 lines even for a
    // one-line draft and never report anything below the true 2-line floor.
    element.style.height = '0px';
    element.style.height = `${Math.min(Math.max(element.scrollHeight, minHeight), maxHeight)}px`;
    updateComposerScrollHint();
  }, [clearComposerScrollHint, updateComposerScrollHint]);

  const refresh = useCallback(
    async (preferredId?: string) => {
      const result = await authedRequest((token) => listAccountChatSessions(token));
      setSummaries(result.data.sessions);
      // Never default to a closed session — a closed conversation only shows
      // when the user explicitly opens it from history (selectConversation).
      const id = preferredId ?? result.data.sessions.find((item) => item.status === 'open')?.publicId;
      if (!id) {
        setSession(null);
        setHasMoreOlder(false);
        setOldestMessageId(null);
        return;
      }
      const detail = await authedRequest((token) => getAccountChatSession(token, id, { limit: 50 }));
      setSession(detail.data.session);
      setHasMoreOlder(detail.data.pagination.hasMore);
      setOldestMessageId(detail.data.pagination.oldestId);
    },
    [authedRequest],
  );

  const loadOlderMessages = useCallback(async () => {
    if (!session || !hasMoreOlder || oldestMessageId == null || loadingOlder) return;
    const transcript = transcriptRef.current;
    const previousHeight = transcript?.scrollHeight ?? 0;
    const previousTop = transcript?.scrollTop ?? 0;
    setLoadingOlder(true);
    try {
      const detail = await authedRequest((token) =>
        getAccountChatSession(token, session.publicId, { limit: 50, before: oldestMessageId }),
      );
      setSession((current) => {
        if (!current) return detail.data.session;
        const seen = new Set(current.messages.map((message) => message.id));
        const older = detail.data.session.messages.filter((message) => !seen.has(message.id));
        return { ...current, messages: [...older, ...current.messages] };
      });
      setHasMoreOlder(detail.data.pagination.hasMore);
      setOldestMessageId(detail.data.pagination.oldestId);
      requestAnimationFrame(() => {
        const node = transcriptRef.current;
        if (!node) return;
        node.scrollTop = previousTop + (node.scrollHeight - previousHeight);
      });
    } catch {
      setError(t.contact.errorGeneric);
    } finally {
      setLoadingOlder(false);
    }
  }, [authedRequest, hasMoreOlder, loadingOlder, oldestMessageId, session, t.contact.errorGeneric]);

  useEffect(() => {
    void refresh()
      .catch(() => setError(initialLoadErrorRef.current))
      .finally(() => setLoading(false));
    // The first load intentionally occurs once; auth refresh is handled by authedRequest.
  }, [refresh]);

  useEffect(() => {
    if (!session || !transcriptVisible || document.visibilityState !== 'visible') return;
    const lastOwner = [...session.messages].reverse().find((message) => message.sender === 'owner');
    if (!lastOwner) return;
    void authedRequest((token) => markAccountChatRead(token, session.publicId, lastOwner.id));
  }, [session, transcriptVisible, authedRequest]);

  useEffect(() => {
    const node = transcriptRef.current;
    if (!node) {
      setTranscriptVisible(false);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setTranscriptVisible(Boolean(entry?.isIntersecting)),
      { threshold: 0.35 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [sessionId, session?.messages.length]);

  useEffect(() => {
    if (!sessionId) return;
    const report = (active: boolean) =>
      void authedRequest((token) => setAccountChatPresence(token, sessionId, active)).catch(() => undefined);
    const sync = () => report(document.visibilityState === 'visible' && transcriptVisible);
    sync();
    const heartbeat = window.setInterval(sync, 20_000);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', sync);
      report(false);
    };
  }, [sessionId, transcriptVisible, authedRequest]);

  useEffect(() => {
    if (!sessionId) return;
    let stopped = false;
    let controller: AbortController | undefined;
    let retry: number | undefined;
    const sync = () =>
      void Promise.all([
        authedRequest((token) => getAccountChatSession(token, sessionId)),
        authedRequest((token) => listAccountChatSessions(token)),
      ])
        .then(([detail, list]) => {
          if (!stopped) {
            setSession((current) => {
              const next = detail.data.session;
              if (!current || current.publicId !== next.publicId) return next;
              const seen = new Set(next.messages.map((message) => message.id));
              const olderKept = current.messages.filter((message) => !seen.has(message.id));
              return { ...next, messages: [...olderKept, ...next.messages] };
            });
            setHasMoreOlder((current) => current || detail.data.pagination.hasMore);
            if (detail.data.pagination.oldestId != null) {
              setOldestMessageId((current) =>
                current == null
                  ? detail.data.pagination.oldestId
                  : Math.min(current, detail.data.pagination.oldestId!),
              );
            }
            setSummaries(list.data.sessions);
          }
        })
        .catch(() => undefined);
    const connect = () => {
      controller = new AbortController();
      void authedRequest((token) => streamAccountChatEvents(token, sessionId, controller!.signal, sync))
        .catch(() => undefined)
        .finally(() => {
          if (!stopped) retry = window.setTimeout(connect, 1_500);
        });
    };
    connect();
    return () => {
      stopped = true;
      controller?.abort();
      if (retry) window.clearTimeout(retry);
    };
  }, [sessionId, authedRequest]);

  useLayoutEffect(() => {
    // Telegram/WhatsApp-style anchoring: jump to the newest message on
    // session switch, but only follow new messages in if the reader was
    // already at the bottom — someone scrolled up into history shouldn't
    // get yanked back down by an incoming reply.
    const transcript = transcriptRef.current;
    if (transcript) {
      const isNewSession = previousSessionIdRef.current !== sessionId;
      const wasNearBottom = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 80;
      if (isNewSession || wasNearBottom) transcript.scrollTop = transcript.scrollHeight;
    }
    previousSessionIdRef.current = sessionId;
    updateScrollHint();
    window.addEventListener('resize', updateScrollHint);
    return () => window.removeEventListener('resize', updateScrollHint);
  }, [sessionId, session?.messages.length, loading, updateScrollHint]);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (!transcript || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateScrollHint);
    observer.observe(transcript);
    return () => observer.disconnect();
  }, [sessionId, updateScrollHint]);

  useLayoutEffect(() => {
    autoGrowComposer();
  }, [draft, autoGrowComposer]);
  useEffect(() => {
    window.addEventListener('resize', autoGrowComposer);
    return () => window.removeEventListener('resize', autoGrowComposer);
  }, [autoGrowComposer]);

  async function selectConversation(publicId: string) {
    setLoading(true);
    setError(null);
    try {
      const detail = await authedRequest((token) => getAccountChatSession(token, publicId, { limit: 50 }));
      setSession(detail.data.session);
      setHasMoreOlder(detail.data.pagination.hasMore);
      setOldestMessageId(detail.data.pagination.oldestId);
      // The conversation panel sits above the history list the user just
      // clicked in — bring it back into view instead of leaving them
      // scrolled down at the entry they picked.
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setError(t.contact.errorGeneric);
    } finally {
      setLoading(false);
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending || session?.status === 'closed') return;
    setSending(true);
    setError(null);
    setAttachError(null);
    try {
      let current = session;
      if (!current) {
        const created = await authedRequest((token) =>
          createAccountChatSession(token, body, crypto.randomUUID(), images),
        );
        current = created.data.session;
        // The create response's session already contains its first message.
        // Appending `data.message` again renders the same id twice.
        setSession(current);
        setDraft('');
        setImages([]);
        await refresh(current.publicId);
        return;
      }
      const sent = await authedRequest((token) =>
        sendAccountChatMessage(token, current.publicId, body, crypto.randomUUID(), images),
      );
      setSession({ ...current, messages: [...current.messages, sent.data.message] });
      setDraft('');
      setImages([]);
      await refresh(current.publicId);
    } catch {
      setError(t.contact.errorGeneric);
    } finally {
      setSending(false);
    }
  }

  function onDraftKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  async function close() {
    if (!session || session.status !== 'open') return;
    setSending(true);
    try {
      const result = await authedRequest((token) => closeAccountChatSession(token, session.publicId));
      setSession(result.data.session);
      await refresh(session.publicId);
    } catch {
      setError(t.contact.errorGeneric);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={styles.root} data-testid="account-contact-chat">
      <section className={styles.conversation} aria-labelledby="conversation-title">
        <header className={styles.conversationHeader}>
          <div className={styles.headerTop}>
            {session ? (
              <p className={styles.eyebrow}>
                {session.status === 'open' ? t.contact.chatActiveStatus : t.contact.chatClosedStatus}
              </p>
            ) : (
              <span className={styles.eyebrowPlaceholder} aria-hidden="true" />
            )}
            {session?.status === 'open' && session.messages.length > 0 ? (
              <button type="button" className={styles.close} onClick={() => void close()} disabled={sending}>
                {t.contact.chatClose}
              </button>
            ) : null}
          </div>
          <h2 id="conversation-title">{t.contact.chatSpaceTitle}</h2>
          <p className={styles.spaceIntro}>{t.contact.chatSpaceIntro}</p>
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
        </header>

        <div className={styles.transcriptWrap}>
          <div
            ref={transcriptRef}
            className={
              session?.status === 'closed'
                ? `${styles.transcript} ${styles.transcriptClosed}`
                : styles.transcript
            }
            role="log"
            aria-live="polite"
            onScroll={updateScrollHint}
            {...transcriptDragScroll}
          >
            {loading ? <p className={styles.muted}>{t.notifications.loading}</p> : null}
            {session && hasMoreOlder ? (
              <div className={styles.loadOlderWrap}>
                <button
                  type="button"
                  className={styles.loadOlder}
                  data-testid="chat-load-older"
                  disabled={loadingOlder}
                  onClick={() => void loadOlderMessages()}
                >
                  {loadingOlder ? t.contact.chatLoadingOlder : t.contact.chatLoadOlder}
                </button>
              </div>
            ) : null}
            {session
              ? session.messages.map((message, index) => {
                  const previous = session.messages[index - 1];
                  const showDateSeparator = !previous || !isSameDay(previous.createdAt, message.createdAt);
                  return (
                    <Fragment key={message.id}>
                      {showDateSeparator ? (
                        <div className={styles.dateSeparator}>
                          <span>{localDay(message.createdAt)}</span>
                        </div>
                      ) : null}
                      <article
                        className={message.sender === 'user' ? styles.userMessage : styles.ownerMessage}
                        title={localDate(message.createdAt)}
                      >
                        <p>{message.body}</p>
                        {message.attachments.length > 0 ? (
                          <div className={styles.attachments}>
                            {message.attachments.map((attachment) => (
                              <AttachmentThumb
                                key={attachment.id}
                                sessionId={session.publicId}
                                attachment={attachment}
                              />
                            ))}
                          </div>
                        ) : null}
                      </article>
                    </Fragment>
                  );
                })
              : null}
          </div>
          {scrollHint.up ? (
            <span className={styles.scrollHintUp} aria-hidden="true">
              <ChevronUp />
            </span>
          ) : null}
          {scrollHint.down ? (
            <span className={styles.scrollHintDown} aria-hidden="true">
              <ChevronDown />
            </span>
          ) : null}
          {scrollHint.up || scrollHint.down ? (
            <span
              className={[
                styles.scrollHintBar,
                scrollHint.up && styles.scrollHintBarFromUp,
                scrollHint.down && styles.scrollHintBarToDown,
              ]
                .filter(Boolean)
                .join(' ')}
              aria-hidden="true"
            />
          ) : null}
        </div>

        {session?.status === 'closed' ? (
          <div className={styles.closedActions}>
            <p className={styles.readOnly}>{t.contact.chatReadOnly}</p>
            <button
              type="button"
              className={styles.newConversation}
              onClick={() => {
                setSession(null);
                setDraft('');
                setImages([]);
                setAttachError(null);
              }}
            >
              {t.contact.chatNewConversation}
            </button>
          </div>
        ) : (
          <form className={styles.composer} onSubmit={send} noValidate>
            <ImageAttachField
              ref={attachFieldRef}
              rowClassName={styles.pickerRow}
              label={t.contact.attachImagesLabel}
              hint={t.contact.attachImagesHint}
              removeAria={t.contact.attachRemoveAria}
              files={images}
              onChange={setImages}
              disabled={sending}
              error={attachError}
              onError={setAttachError}
              errorTooMany={t.contact.errorImageTooMany}
              errorInvalidType={t.contact.errorImageInvalidType}
              errorTooLarge={t.contact.errorImageTooLarge}
            />
            <div className={styles.composerRow}>
              <div className={styles.composerFieldWrap}>
                <textarea
                  aria-label={t.contact.messageLabel}
                  ref={textareaRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={onDraftKeyDown}
                  onScroll={updateComposerScrollHint}
                  maxLength={FIELD_CONTACT_MESSAGE_MAX}
                  rows={4}
                  placeholder={t.contact.chatPlaceholder}
                />
                {composerScrollHint.up ? (
                  <span className={styles.scrollHintUp} aria-hidden="true">
                    <ChevronUp />
                  </span>
                ) : null}
                {composerScrollHint.down ? (
                  <span className={styles.scrollHintDown} aria-hidden="true">
                    <ChevronDown />
                  </span>
                ) : null}
              </div>
              <div className={styles.composerButtons}>
                <button
                  type="button"
                  className={styles.attachButton}
                  disabled={sending || images.length >= CONTACT_IMAGE_MAX_COUNT}
                  aria-label={t.contact.attachImagesLabel}
                  onClick={() => attachFieldRef.current?.openPicker()}
                >
                  <AttachIcon />
                </button>
                <Button type="submit" disabled={!draft.trim() || sending}>
                  <span className={styles.sendLabel}>
                    {sending ? t.contact.chatSending : t.contact.chatSend}
                  </span>
                  <SendIcon />
                </Button>
              </div>
            </div>
          </form>
        )}
      </section>

      <section className={styles.history} aria-labelledby="history-title">
        <header>
          <h2 id="history-title">{t.contact.chatHistoryTitle}</h2>
          <p>{t.contact.chatHistoryIntro}</p>
        </header>
        {closedSummaries.length === 0 ? (
          <p className={styles.muted}>{t.contact.chatHistoryEmpty}</p>
        ) : (
          <ol className={styles.historyList}>
            {closedSummaries.map((item) => (
              <li key={item.publicId}>
                <button
                  type="button"
                  className={session?.publicId === item.publicId ? styles.historySelected : styles.historyRow}
                  onClick={() => void selectConversation(item.publicId)}
                >
                  <span className={styles.historyMain}>
                    <span className={styles.preview}>{item.preview || ''}</span>
                    <span className={styles.metadata}>
                      {t.contact.chatFirstMessageDate.replace('{date}', localDate(item.firstMessageAt))}
                    </span>
                  </span>
                  <span className={styles.historyMeta}>
                    <span>
                      {t.contact.chatLastMessageDate.replace('{date}', localDate(item.lastMessageAt))}
                    </span>
                    <span>
                      {(usesSingularItemCount(item.messageCount, lang)
                        ? t.contact.chatMessageCount
                        : t.contact.chatMessagesCount
                      ).replace('{count}', String(item.messageCount))}
                    </span>
                    {item.unreadOwnerCount > 0 ? <strong>{item.unreadOwnerCount}</strong> : null}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function ChevronUp() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path
        d="M2.5 7.5L6 4L9.5 7.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path
        d="M2.5 4.5L6 8L9.5 4.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      className={styles.sendIcon}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M14 2 2 7.2l4.6 1.7L8.3 14 14 2Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AttachIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M9.6 3.3 4.9 8a1.7 1.7 0 0 0 2.4 2.4l4.3-4.3a2.9 2.9 0 0 0-4.1-4.1L3.2 6.3a4.1 4.1 0 0 0 5.7 5.9"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
