import { useCallback, useEffect, useRef, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Seo } from '@kernel/front/components/seo/Seo';
import { LoadingModal } from '@kernel/front/components/ui/LoadingModal';
import { Lightbox } from '@kernel/front/components/ui/Lightbox';
import {
  getAdminProductRequest,
  listAdminProductRequests,
  respondAdminProductRequest,
  type AdminProductRequest,
  type AdminProductRequestMessage,
  type AdminProductRequestStatus,
} from '@kernel/front/api/admin/productRequests';
import { useAuthSession } from '@kernel/front/state/AuthContext';
import { useAdminInfiniteList } from '@kernel/front/hooks/useAdminInfiniteList';
import { AdminInfiniteList } from '@kernel/front/components/admin/AdminInfiniteList';
import { AdminStatusTabs } from '@kernel/front/components/admin/AdminStatusTabs';
import { AdminDetailBar } from '@kernel/front/components/admin/AdminDetailBar';
import { useAdminSectionReset } from '@kernel/front/state/AdminChromeContext';
import type { AdminAttentionCounts } from '@kernel/front/hooks/useAdminAttentionCounts';
import { useLang } from '@kernel/front/assets/i18n';
import { useAdminStrings, type AdminUiStrings } from '@kernel/front/assets/i18n/admin';
import { formatPrice } from '@kernel/front/utils/formatPrice';
import { withMinDuration } from '@kernel/front/utils/withMinDuration';
import { adminPath } from '@kernel/front/utils/adminRoute';
import styles from './AdminProductRequestsPage.module.css';
import { shopConfig } from '@kernel/front/config/env';
import { usePluginEnabled } from '@kernel/front/plugins/StorefrontBootstrap';
import { NotFoundPage } from '@kernel/front/routes/NotFoundPage';

const STATUSES: AdminProductRequestStatus[] = ['requested', 'accepted', 'refused'];
function statusLabels(a: AdminUiStrings): Record<AdminProductRequestStatus, string> {
  return {
    requested: a.productRequests.statusRequested,
    accepted: a.productRequests.statusAccepted,
    refused: a.productRequests.statusRefused,
  };
}
const STATUS_TONE: Record<AdminProductRequestStatus, string> = {
  requested: 'tone_requested',
  accepted: 'tone_accepted',
  refused: 'tone_refused',
};

type FilterValue = AdminProductRequestStatus | '';

type SelectedRequest = {
  request: AdminProductRequest;
  messages: AdminProductRequestMessage[];
};

function isRequestStatus(value: string | null): value is AdminProductRequestStatus {
  return value === 'requested' || value === 'accepted' || value === 'refused';
}

function filterFromSearchParams(params: URLSearchParams): FilterValue {
  const status = params.get('status');
  return isRequestStatus(status) ? status : '';
}

export function AdminProductRequestsPage() {
  const requestsOn = usePluginEnabled('tuucho-commerce-product-requests');
  const { t } = useLang();
  const a = useAdminStrings();
  const STATUS_LABEL = statusLabels(a);
  const { authedRequest } = useAuthSession();
  const { counts } = useOutletContext<{ counts: AdminAttentionCounts }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState<FilterValue>(
    () => filterFromSearchParams(searchParams) || 'requested',
  );
  const [selected, setSelected] = useState<SelectedRequest | null>(null);
  const [price, setPrice] = useState('');
  const [message, setMessage] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Window scroll of the list when a record was opened, restored on back. */
  const listScrollRef = useRef(0);
  const fetchRequests = useCallback(
    async (page: number) => {
      const result = await withMinDuration(
        authedRequest((token) => listAdminProductRequests(token, filter as AdminProductRequestStatus, page)),
        page === 1 ? 350 : 0,
      );
      return {
        rows: result.requests,
        page: result.pagination.page,
        totalPages: result.pagination.totalPages,
        total: result.pagination.total,
      };
    },
    [authedRequest, filter],
  );
  const { rows, setRows, total, hasMore, loading, loadingMore, error, setError, loadMore } =
    useAdminInfiniteList<AdminProductRequest>({
      fetchPage: fetchRequests,
      errorMessage: a.productRequests.loadError,
      enabled: filter !== '',
    });
  const busy = loading || detailLoading || acting;
  /** Index to open once an appended chunk has arrived (see moveRequest). */
  const [pendingStep, setPendingStep] = useState<number | null>(null);
  const selectRequestRef = useRef<(row: AdminProductRequest) => Promise<void>>(async () => {});

  const backToListRef = useRef(backToList);
  backToListRef.current = backToList;
  const resetSection = useCallback(() => backToListRef.current(), []);
  useAdminSectionReset(resetSection);

  useEffect(() => {
    // Keep the URL in step with the default queue picked on landing; any
    // later pick writes the URL itself, so this only fires once.
    if (filter && !searchParams.get('status')) setSearchParams({ status: filter }, { replace: true });
  }, [filter, searchParams, setSearchParams]);

  function backToList() {
    setSelected(null);
    setActionError(null);
    setNotice(null);
    const top = listScrollRef.current;
    requestAnimationFrame(() => window.scrollTo({ top }));
  }

  useEffect(() => {
    if (pendingStep === null) return;
    const row = rows[pendingStep];
    if (row) {
      setPendingStep(null);
      void selectRequestRef.current(row);
    } else if (!loadingMore) {
      setPendingStep(null);
    }
  }, [pendingStep, rows, loadingMore]);

  /** Picking a filter only sets it; useAdminInfiniteList reloads from the
   * first chunk because `fetchRequests` gets a new identity. */
  function selectFilter(value: FilterValue) {
    setFilter(value);
    setSelected(null);
    setPrice('');
    setMessage('');
    setError(null);
    setActionError(null);
    setNotice(null);
    setSearchParams(value ? { status: value } : {}, { replace: true });
  }

  selectRequestRef.current = selectRequest;

  async function selectRequest(row: AdminProductRequest) {
    if (!selected) listScrollRef.current = window.scrollY;
    window.scrollTo({ top: 0 });
    setDetailLoading(true);
    setError(null);
    setActionError(null);
    setNotice(null);
    try {
      const result = await withMinDuration(
        authedRequest((token) => getAdminProductRequest(token, row.publicId)),
        shopConfig.loadingMinMs.short,
      );
      setSelected({ request: result.request, messages: result.messages });
      setPrice(String(result.request.responsePrice ?? result.request.unitPrice ?? ''));
      setMessage(result.request.responseMessage ?? '');
    } catch {
      setSelected(null);
      setError(a.productRequests.requestLoadError);
    } finally {
      setDetailLoading(false);
    }
  }

  async function moveRequest(direction: -1 | 1) {
    if (!selected) return;
    const index = rows.findIndex((row) => row.id === selected.request.id);
    const adjacent = rows[index + direction];
    if (adjacent) {
      await selectRequest(adjacent);
      return;
    }
    // Stepping past the last loaded record: fetch the next chunk first, then
    // select what it appended. Backwards can never need this — everything
    // before the current record is already loaded.
    if (direction !== 1 || !hasMore) return;
    await loadMore();
    setPendingStep(index + 1);
  }

  function removeCurrentFromList(requestId: string) {
    const index = rows.findIndex((row) => row.id === requestId);
    const remaining = rows.filter((row) => row.id !== requestId);
    setRows(remaining);
    setSelected(null);
    const next = remaining[index] ?? remaining[index - 1];
    if (next) void selectRequest(next);
  }

  async function respond(next: 'accepted' | 'refused') {
    if (!selected) return;
    const parsedPrice = Number(price.replace(',', '.'));
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setActionError(a.productRequests.errPrice);
      return;
    }
    if (!message.trim()) {
      setActionError(a.productRequests.errMessage);
      return;
    }
    setActing(true);
    setActionError(null);
    setNotice(null);
    try {
      await withMinDuration(
        authedRequest((token) =>
          respondAdminProductRequest(token, selected.request.publicId, {
            status: next,
            price: parsedPrice,
            message: message.trim(),
          }),
        ),
        shopConfig.loadingMinMs.short,
      );
      setNotice(next === 'accepted' ? a.productRequests.acceptedNotice : a.productRequests.refusedNotice);
      if (filter === 'requested' || (filter && filter !== next)) {
        removeCurrentFromList(selected.request.id);
      } else {
        await selectRequest(selected.request);
      }
    } catch {
      setActionError(a.productRequests.sendFailed);
    } finally {
      setActing(false);
    }
  }

  const selectedIndex = selected ? rows.findIndex((row) => row.id === selected.request.id) : -1;

  if (!requestsOn) return <NotFoundPage />;

  return (
    <section className={styles.section} aria-labelledby="admin-product-requests-h">
      <Seo
        title={t.admin.productRequestsTitle}
        description={t.admin.productRequestsDescription}
        path={adminPath('/product-requests')}
        noindex
      />
      {!selected && (
        <>
          <h1 id="admin-product-requests-h" className={styles.title}>
            {t.admin.productRequestsTitle}
          </h1>
          <AdminStatusTabs
            label={a.messages.status}
            tabs={STATUSES.map((value) => ({
              value,
              label: STATUS_LABEL[value],
              count: value === 'requested' ? counts.productRequestsRequested : null,
            }))}
            active={filter}
            onSelect={(value) => {
              if (value !== filter) selectFilter(value);
            }}
            closeLabel={t.gallery.close}
          >
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            {filter && !busy && rows.length === 0 && (
              <p className={styles.empty}>{a.productRequests.empty}</p>
            )}
            {rows.length > 0 && (
              <AdminInfiniteList
                className={styles.cardGrid}
                dividers={false}
                cardMinWidth={300}
                label={t.admin.productRequestsTitle}
                count={rows.length}
                rowKey={(index) => rows[index]!.id}
                hasMore={hasMore}
                loadingMore={loadingMore}
                onLoadMore={() => void loadMore()}
                renderRow={(index) => {
                  const row = rows[index]!;
                  return (
                    <button
                      type="button"
                      className={styles.reqCard}
                      aria-label={`${row.title}, ${row.publicId}, ${row.email}`}
                      onClick={() => void selectRequest(row)}
                    >
                      {row.photoPath ? (
                        <img
                          loading="lazy"
                          decoding="async"
                          className={styles.reqCardThumb}
                          src={row.photoPath}
                          alt=""
                        />
                      ) : (
                        <span className={styles.reqCardThumb} aria-hidden="true" />
                      )}
                      <span className={styles.reqCardMain}>
                        <strong>{row.title}</strong>
                        <span className={styles.reqCardMeta}>
                          {row.size} × {row.quantity} · {row.shapeLabel}
                        </span>
                        <span className={styles.reqCardEmail}>{row.email}</span>
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
          <h1 id="admin-product-requests-h" className="visuallyHidden">
            {t.admin.productRequestsTitle}
          </h1>
          <AdminDetailBar
            backLabel={filter ? STATUS_LABEL[filter] : t.admin.productRequestsTitle}
            onBack={backToList}
            position={selectedIndex + 1}
            total={total}
            canPrevious={selectedIndex > 0}
            canNext={selectedIndex >= 0 && (selectedIndex < rows.length - 1 || hasMore)}
            busy={busy}
            onPrevious={() => void moveRequest(-1)}
            onNext={() => void moveRequest(1)}
            previousLabel={a.productRequests.previous}
            nextLabel={a.productRequests.next}
            navLabel={a.productRequests.nav}
          />
          <RequestDetail
            selected={selected}
            price={price}
            setPrice={setPrice}
            message={message}
            setMessage={setMessage}
            acting={acting}
            notice={notice}
            actionError={actionError}
            onAccept={() => void respond('accepted')}
            onRefuse={() => void respond('refused')}
            t={t}
          />
        </div>
      )}

      {busy && <LoadingModal message={acting ? t.admin.actionLoading : t.admin.contentLoading} />}
    </section>
  );
}

function RequestDetail({
  selected,
  price,
  setPrice,
  message,
  setMessage,
  acting,
  notice,
  actionError,
  onAccept,
  onRefuse,
  t,
}: {
  selected: SelectedRequest;
  price: string;
  setPrice: (value: string) => void;
  message: string;
  setMessage: (value: string) => void;
  acting: boolean;
  notice: string | null;
  actionError: string | null;
  onAccept: () => void;
  onRefuse: () => void;
  t: ReturnType<typeof useLang>['t'];
}) {
  const a = useAdminStrings();
  const { request, messages } = selected;
  const canRespond = request.status === 'requested';
  const [zoom, setZoom] = useState(false);
  return (
    <article className={styles.detail}>
      <header className={styles.detailHeader}>
        <span className={`${styles.statusBadge} ${styles[STATUS_TONE[request.status]]}`}>
          {statusLabels(a)[request.status]}
        </span>
        <h2>{request.title}</h2>
        <p className={styles.detailMeta}>
          <a href={`mailto:${request.email}`}>{request.email}</a>
          <span aria-hidden="true"> · </span>
          <span>{request.publicId}</span>
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
      <div className={styles.detailGrid}>
        <section className={styles.detailCard}>
          {request.photoPath && (
            <button type="button" className={styles.photoButton} onClick={() => setZoom(true)}>
              <img
                loading="lazy"
                decoding="async"
                className={styles.photo}
                src={request.photoPath}
                alt={request.title}
              />
            </button>
          )}
          <p className={styles.meta}>
            {request.productUid} · {request.shapeLabel} · {request.lengthKey} ·{' '}
            {a.productRequests.sizeQuantity(request.size, request.quantity)}
          </p>
          {request.comment && (
            <p className={styles.comment}>
              <strong>{a.productRequests.customerMessage}</strong> {request.comment}
            </p>
          )}
          {messages.length > 0 && (
            <div className={styles.messages}>
              {messages.map((item) => (
                <div key={item.id} className={item.direction === 'admin' ? styles.admin : styles.customer}>
                  <p>{item.body}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={styles.detailCard}>
          {canRespond ? (
            <div className={styles.form}>
              <label className={styles.field}>
                <span>{a.productRequests.proposedPrice}</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  disabled={acting}
                />
              </label>
              <p className={styles.pricePreview}>{formatPrice(Number(price.replace(',', '.')) || 0)}</p>
              <label className={styles.field}>
                <span>{a.productRequests.message}</span>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={4}
                  disabled={acting}
                />
              </label>
              <div className={styles.actions}>
                <button type="button" onClick={onAccept} disabled={acting}>
                  {a.productRequests.acceptSend}
                </button>
                <button type="button" className={styles.dangerAction} onClick={onRefuse} disabled={acting}>
                  {a.productRequests.refuse}
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.answered}>
              {request.responsePrice !== null && (
                <p>
                  <strong>{a.productRequests.proposedPriceLabel}</strong> {formatPrice(request.responsePrice)}
                </p>
              )}
              {request.responseMessage && (
                <p>
                  <strong>{a.productRequests.sentMessage}</strong> {request.responseMessage}
                </p>
              )}
            </div>
          )}
        </section>
      </div>
      {zoom && request.photoPath && (
        <Lightbox
          src={request.photoPath}
          alt={request.title}
          onClose={() => setZoom(false)}
          closeLabel={t.gallery.close}
        />
      )}
    </article>
  );
}
