import { createContext, useContext, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from '../ui/CloseIcon';
import { Button } from '../ui/Button';
import { Seo } from '../seo/Seo';
import { LoadingModal } from '../ui/LoadingModal';
import { Lightbox } from '../ui/Lightbox';
import { SegmentedSwitch } from '../ui/SegmentedSwitch';
import { ModalBackdrop } from '../ui/ModalBackdrop';
import { ModalScrollBody } from '../ui/ModalScrollBody';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useHistoryBackClose } from '../../hooks/useHistoryBackClose';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { AdminInfiniteList } from './AdminInfiniteList';
import { StockSection } from './AdminStockFields';
import styles from './AdminStockList.module.css';
import { useAdminStrings } from '../../assets/i18n/admin';

interface AdminStockListProps<Row> {
  seoTitle: string;
  seoDescription: string;
  seoPath: string;
  pageTitle: string;
  searchLabel: string;
  searchPlaceholder: string;
  submitLabel: string;
  emptyMessage: string;
  emptySearchMessage: string;
  closePreviewLabel: string;
  listViewLabel?: string;
  cardViewLabel?: string;
  rows: Row[];
  rowKey: (row: Row) => string;
  loading: boolean;
  loadingMessage: string;
  error: string | null;
  /** User management has no fuzzy search (customer emails are encrypted), so
   * it reuses the list/card/pagination shell without a misleading input. */
  hideSearch?: boolean;
  /** Library stock, accessories, and user management stay list-only. */
  enableCardView?: boolean;
  /** Another chunk exists on the server. */
  hasMore: boolean;
  /** A chunk is in flight — keeps the blocking spinner off an append. */
  loadingMore: boolean;
  /** Append the next chunk. */
  onLoadMore: () => void;
  /** Optional controls shown even when the current page is empty. */
  toolbar?: ReactNode;
  onSearch: (query: string) => void;
  /** Compact row for the list view. Returns the row's inner content;
   * AdminStockList supplies the `<li>` wrapper and key. */
  renderListRow: (row: Row) => ReactNode;
  /** Full card for the optional "Cartes" view. */
  renderCard?: (row: Row) => ReactNode;
  children?: ReactNode;
}

const StockPreviewContext = createContext<(src: string) => void>(() => {});

/** Shared list/search/pagination shell for stock pages and user management.
 * Stock pages stay list-only and supply an edit modal as children; user
 * management opens a detail modal from the list row. */
export function AdminStockList<Row>({
  seoTitle,
  seoDescription,
  seoPath,
  pageTitle,
  searchLabel,
  searchPlaceholder,
  submitLabel,
  emptyMessage,
  emptySearchMessage,
  closePreviewLabel,
  listViewLabel,
  cardViewLabel,
  rows,
  rowKey,
  loading,
  loadingMessage,
  error,
  hideSearch = false,
  enableCardView = false,
  hasMore,
  loadingMore,
  onLoadMore,
  toolbar,
  onSearch,
  renderListRow,
  renderCard,
  children,
}: AdminStockListProps<Row>) {
  const [searchInput, setSearchInput] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const showCards = enableCardView && viewMode === 'card' && renderCard;

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setHasSearched(true);
    onSearch(searchInput.trim());
  }

  return (
    <StockPreviewContext.Provider value={setPreview}>
      <section className={styles.section}>
        <Seo title={seoTitle} description={seoDescription} path={seoPath} noindex />
        <h1 className={styles.title}>{pageTitle}</h1>
        {!hideSearch && (
          <form className={styles.search} onSubmit={submitSearch} noValidate>
            <label className={styles.searchField}>
              <span>{searchLabel}</span>
              <input
                type="search"
                value={searchInput}
                onChange={(event) => {
                  const next = event.target.value;
                  setSearchInput(next);
                  // Clearing the field (or the native ✕) restores the full
                  // list right away instead of waiting for another submit.
                  if (next === '' && hasSearched && !loading) {
                    setHasSearched(false);
                    onSearch('');
                  }
                }}
                placeholder={searchPlaceholder}
                autoComplete="off"
                disabled={loading}
              />
            </label>
            <button type="submit" disabled={loading}>
              {submitLabel}
            </button>
          </form>
        )}
        {toolbar}
        {rows.length > 0 && (
          <div className={styles.viewBar}>
            {enableCardView && listViewLabel && cardViewLabel && (
              <SegmentedSwitch
                ariaLabel={`${listViewLabel} / ${cardViewLabel}`}
                activeKey={viewMode}
                options={[
                  { key: 'list', label: listViewLabel },
                  { key: 'card', label: cardViewLabel },
                ]}
                onSelect={(key) => setViewMode(key as 'list' | 'card')}
              />
            )}
          </div>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {showCards ? (
          <div className={styles.list}>
            {rows.map((row) => (
              <div key={rowKey(row)}>{renderCard(row)}</div>
            ))}
          </div>
        ) : (
          rows.length > 0 && (
            <AdminInfiniteList
              className={styles.listRows}
              count={rows.length}
              rowKey={(index) => rowKey(rows[index]!)}
              renderRow={(index) => renderListRow(rows[index]!)}
              hasMore={hasMore}
              loadingMore={loadingMore}
              onLoadMore={onLoadMore}
              label={pageTitle}
            />
          )
        )}
        {!loading && !error && rows.length === 0 && (
          <p className={styles.empty}>{hasSearched ? emptySearchMessage : emptyMessage}</p>
        )}
        {children}
        {loading && <LoadingModal message={loadingMessage} />}
        {preview && (
          <Lightbox src={preview} alt="" onClose={() => setPreview(null)} closeLabel={closePreviewLabel} />
        )}
      </section>
    </StockPreviewContext.Provider>
  );
}

interface StockListRowProps {
  uid: string;
  title: string;
  /** e.g. "XS 2 · S 6 · M 9 · L 4" or "Qté dispo 42". */
  summary: string;
  priceLabel: string;
  totalLabel: string;
  thumbnail?: string | null;
  control?: ReactNode;
  /** Secondary row actions (e.g. open the full product JSON editor). */
  actions?: ReactNode;
  onOpen?: () => void;
  openLabel?: string;
  /** Label for the thumbnail's own button, which zooms the photo instead of
   * opening the row. Omit to leave the thumbnail inert. */
  previewLabel?: string;
  /** Replaces the single-photo zoom, e.g. with a slider of every photo. */
  onPreview?: () => void;
}

/** Compact row for the list view.
 *
 * The photo and the rest of the row are two separate buttons, not one: a tap
 * on the picture zooms it, a tap anywhere else opens the detail. They are
 * siblings rather than nested because a button inside a button is invalid and
 * browsers drop the inner one's click. */
export function StockListRow({
  uid,
  title,
  summary,
  priceLabel,
  totalLabel,
  thumbnail,
  control,
  actions,
  onOpen,
  openLabel,
  previewLabel,
  onPreview,
}: StockListRowProps) {
  const setPreview = useContext(StockPreviewContext);

  const thumb = thumbnail ? (
    previewLabel ? (
      <button
        type="button"
        className={styles.listRowThumbButton}
        onClick={() => (onPreview ? onPreview() : setPreview(thumbnail))}
        title={previewLabel}
        aria-label={previewLabel}
      >
        <img loading="lazy" decoding="async" className={styles.listRowThumb} src={thumbnail} alt="" />
      </button>
    ) : (
      <img loading="lazy" decoding="async" className={styles.listRowThumb} src={thumbnail} alt="" />
    )
  ) : thumbnail === null ? (
    <span className={styles.listRowThumbMissing} aria-hidden="true" />
  ) : null;

  const main = (
    <>
      <span className={styles.listRowMain}>
        <span className={styles.listRowTop}>
          <strong>{uid}</strong>
          <span>{title}</span>
        </span>
        <span className={styles.listRowSummary}>{summary}</span>
      </span>
      <span className={styles.listRowTrailing}>
        {control}
        <span className={styles.listRowPrice}>
          <strong>{priceLabel}</strong>
          <span>{totalLabel}</span>
        </span>
      </span>
    </>
  );

  return (
    <div className={styles.listRow}>
      {thumb}
      <div className={styles.listRowBody}>
        {onOpen ? (
          <button type="button" className={styles.listRowOpen} onClick={onOpen} title={openLabel}>
            {main}
          </button>
        ) : (
          <div className={styles.listRowOpen}>{main}</div>
        )}
        {actions ? <div className={styles.listRowActions}>{actions}</div> : null}
      </div>
    </div>
  );
}

interface StockEditModalProps {
  closeLabel: string;
  saveLabel: string;
  thumbnail: string | null;
  enlargeLabel: string;
  uid: string;
  productTitle: string;
  /** Shape · length · date line, shown beside the thumbnail. */
  meta: ReactNode;
  /** Visibility controls, shown as the modal's last section. */
  headerControl?: ReactNode;
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onClose: () => void;
  /** Extra footer action shown beside Save, on the same line. */
  footerAction?: ReactNode;
  /** Replaces the single-photo zoom of the thumbnail. */
  onPreview?: () => void;
  children: ReactNode;
}

/** Edit dialog opened from a stock list row. The header names the product
 * itself; close discards drafts; Save is the primary footer action and
 * `footerAction` a secondary one beside it. */
export function StockEditModal({
  closeLabel,
  saveLabel,
  thumbnail,
  enlargeLabel,
  uid,
  productTitle,
  meta,
  headerControl,
  saving,
  error,
  onSave,
  onClose,
  footerAction,
  onPreview,
  children,
}: StockEditModalProps) {
  const a = useAdminStrings();
  const setPreview = useContext(StockPreviewContext);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const requestClose = useHistoryBackClose(() => {
    if (!saving) onClose();
  });
  useLockBodyScroll();
  useFocusTrap(panelRef, { onEscape: saving ? undefined : requestClose });

  return createPortal(
    <ModalBackdrop
      className={styles.editBackdrop ?? ''}
      label={productTitle}
      onClose={saving ? () => {} : requestClose}
      closeOnBackdropClick={!saving}
    >
      <div ref={panelRef} className={styles.editPanel}>
        <div className={styles.editHeader}>
          <span className={styles.editTitle}>{productTitle}</span>
          <button
            type="button"
            className={styles.editClose}
            onClick={requestClose}
            aria-label={closeLabel}
            disabled={saving}
          >
            <CloseIcon />
          </button>
        </div>
        <ModalScrollBody contentKey={uid}>
          <div className={styles.editIdentity}>
            {thumbnail ? (
              <button
                type="button"
                className={styles.thumbButton}
                onClick={() => (onPreview ? onPreview() : setPreview(thumbnail))}
                aria-label={enlargeLabel}
              >
                <img loading="lazy" decoding="async" className={styles.thumb} src={thumbnail} alt="" />
              </button>
            ) : (
              <div className={styles.thumbMissing} aria-hidden="true" />
            )}
            <div className={styles.headerText}>
              <strong className={styles.uid}>{uid}</strong>
              <span className={styles.meta}>{meta}</span>
            </div>
          </div>
          {children}
          {headerControl && <StockSection title={a.stock.shopVisibility}>{headerControl}</StockSection>}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </ModalScrollBody>
        <div className={styles.editFooter}>
          {footerAction}
          <Button type="button" onClick={onSave} disabled={saving}>
            {saveLabel}
          </Button>
        </div>
      </div>
    </ModalBackdrop>,
    document.body,
  );
}
