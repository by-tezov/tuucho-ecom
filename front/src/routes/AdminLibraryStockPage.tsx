import { useCallback, useEffect, useState } from 'react';
import { AdminStockList, StockEditModal, StockListRow } from '../components/admin/AdminStockList';
import {
  getAdminLibraryStock,
  patchAdminLibraryStock,
  setAdminLibraryStockFeatured,
  setAdminLibraryStockHidden,
  type AdminHiddenScope,
  type AdminLibraryStockRow,
  type AdminStockListFilters,
} from '../api/admin/catalog';
import { useAuthSession } from '../state/AuthContext';
import { useLang } from '../assets/i18n';
import { formatPrice } from '../utils/formatPrice';
import { adminPath } from '../utils/adminRoute';
import { withMinDuration } from '../utils/withMinDuration';
import { AdminVariantVisibility } from '../components/admin/AdminVariantVisibility';
import {
  PriceField,
  StockFigure,
  StockSection,
  StockStepper,
  stockFieldStyles,
} from '../components/admin/AdminStockFields';
import { AdminStockFilters, DEFAULT_STOCK_FILTERS } from '../components/admin/AdminStockFilters';
import { Button } from '../components/ui/Button';
import { AdminProductEditor } from '../components/admin/AdminProductEditor';
import styles from '../components/admin/AdminStockList.module.css';
import { shopConfig } from '../config/env';
import { useAdminStrings } from '../assets/i18n/admin';
import { canAccess, useAdminAccess } from '../state/AdminAccessContext';

const SIZES = ['XS', 'S', 'M', 'L'] as const;
/** Fetch chunk for the infinite list. Not a user-facing choice any
 * more: the admin scrolls, the list appends. */
const CHUNK_SIZE = 30;
type SizeKey = (typeof SIZES)[number];
type SizeMap = Record<SizeKey, number>;

function variantKey(row: Pick<AdminLibraryStockRow, 'productUid' | 'shapeKey' | 'lengthKey'>) {
  return `${row.productUid}::${row.shapeKey}::${row.lengthKey}`;
}

export function AdminLibraryStockPage() {
  const { t } = useLang();
  const a = useAdminStrings();
  const canEditProduct = canAccess(useAdminAccess(), 'catalogue_edit');
  const { authedRequest } = useAuthSession();
  const [rows, setRows] = useState<AdminLibraryStockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filters, setFilters] = useState<AdminStockListFilters>(DEFAULT_STOCK_FILTERS);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftPrice, setDraftPrice] = useState('');
  const [draftSizes, setDraftSizes] = useState<SizeMap>({ XS: 0, S: 0, M: 0, L: 0 });
  const [saving, setSaving] = useState(false);
  const [changingVisibilityUid, setChangingVisibilityUid] = useState<string | null>(null);
  const [changingFeaturedUid, setChangingFeaturedUid] = useState<string | null>(null);
  /** Window length the API applies, sent with the list so the button can name
   * it rather than repeating the number here. */
  const [featuredDays, setFeaturedDays] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [productEditorUid, setProductEditorUid] = useState<string | null | undefined>(undefined);
  const busy = loading || saving || changingVisibilityUid !== null || changingFeaturedUid !== null;
  const hasMore = page < pages;
  const loadingMessage =
    saving || changingVisibilityUid !== null ? t.admin.actionLoading : t.admin.contentLoading;

  const load = useCallback(
    async (nextPage: number, q: string, nextFilters: AdminStockListFilters, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        // The first chunk keeps the minimum spinner duration so the list does
        // not flash; appends must not be delayed — the admin is already
        // looking at rows and is waiting for more under the scroll.
        const request = authedRequest((token) =>
          getAdminLibraryStock(token, nextPage, q, CHUNK_SIZE, nextFilters),
        );
        const result = append ? await request : await withMinDuration(request, shopConfig.loadingMinMs.short);
        setRows((current) => (append ? [...current, ...result.rows] : result.rows));
        setFeaturedDays(result.featuredDays);
        setPage(result.pagination.page);
        setPages(result.pagination.totalPages);
      } catch {
        setError(a.stock.libraryLoadError);
      } finally {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [authedRequest, a.stock.libraryLoadError],
  );

  useEffect(() => {
    load(1, query, filters, false);
  }, [filters, load, query]);

  function onSearch(q: string) {
    setEditingKey(null);
    setActionError(null);
    setQuery(q);
  }

  function startEdit(row: AdminLibraryStockRow) {
    if (busy) return;
    setEditingKey(variantKey(row));
    setDraftPrice(row.price === null ? '' : String(row.price));
    setDraftSizes({ ...row.sizes });
    setActionError(null);
  }

  function cancelEdit() {
    setEditingKey(null);
    setActionError(null);
  }

  async function saveEdit(row: AdminLibraryStockRow) {
    if (busy) return;
    const priceText = draftPrice.trim();
    let price: number | undefined;
    if (priceText !== '') {
      price = Number(priceText.replace(',', '.'));
      if (!Number.isFinite(price) || price < 0) {
        setActionError(a.stock.errPrice);
        return;
      }
    }
    for (const size of SIZES) {
      if (!Number.isSafeInteger(draftSizes[size]) || draftSizes[size] < 0) {
        setActionError(a.stock.errQuantities);
        return;
      }
    }

    setSaving(true);
    setActionError(null);
    try {
      const result = await withMinDuration(
        authedRequest((token) =>
          patchAdminLibraryStock(token, row.productUid, {
            shapeKey: row.shapeKey,
            lengthKey: row.lengthKey,
            ...(price !== undefined ? { price } : {}),
            sizes: draftSizes,
          }),
        ),
        shopConfig.loadingMinMs.short,
      );
      setRows((current) =>
        current.map((entry) => {
          if (variantKey(entry) === variantKey(result.row)) return result.row;
          if (entry.productUid === result.row.productUid && result.row.price !== null) {
            const total = entry.total;
            return { ...entry, price: result.row.price, stockValue: result.row.price * total };
          }
          return entry;
        }),
      );
      setEditingKey(null);
    } catch {
      setActionError(a.stock.errSaveVariant);
    } finally {
      setSaving(false);
    }
  }

  /** The whole product, one shape (every length of it) or this one
   * shape/length. The answer carries the product's whole hidden state, so
   * every loaded row of the product is brought in line with it. */
  async function setVisibility(row: AdminLibraryStockRow, hidden: boolean, scope?: AdminHiddenScope) {
    if (busy) return;
    setChangingVisibilityUid(row.productUid);
    setError(null);
    try {
      const result = await withMinDuration(
        authedRequest((token) => setAdminLibraryStockHidden(token, row.productUid, hidden, scope)),
        shopConfig.loadingMinMs.short,
      );
      setRows((current) =>
        current.map((entry) =>
          entry.productUid === row.productUid
            ? {
                ...entry,
                hidden: result.hidden,
                variantHidden: result.hiddenShapeLengths.some(
                  (pair) => pair.shapeKey === entry.shapeKey && pair.lengthKey === entry.lengthKey,
                ),
              }
            : entry,
        ),
      );
    } catch {
      setError(a.stock.errVisibilityProduct);
    } finally {
      setChangingVisibilityUid(null);
    }
  }

  /** Product-level, like visibility: every variant of the set shares the
   * window, so each loaded row for that UID is updated. */
  async function toggleFeatured(row: AdminLibraryStockRow) {
    if (busy) return;
    setChangingFeaturedUid(row.productUid);
    setActionError(null);
    try {
      const result = await withMinDuration(
        authedRequest((token) =>
          setAdminLibraryStockFeatured(token, row.productUid, row.featuredUntil === null),
        ),
        shopConfig.loadingMinMs.short,
      );
      setRows((current) =>
        current.map((entry) =>
          entry.productUid === row.productUid ? { ...entry, featuredUntil: result.featuredUntil } : entry,
        ),
      );
    } catch {
      setActionError(a.stock.errFeatured);
    } finally {
      setChangingFeaturedUid(null);
    }
  }

  function visibilityControl(row: AdminLibraryStockRow) {
    return (
      <AdminVariantVisibility
        title={row.title}
        shapeLabel={row.shapeLabel}
        lengthLabel={row.lengthLabel}
        productHidden={row.hidden}
        variantHidden={row.variantHidden}
        disabled={busy}
        onProductChange={(hidden) => void setVisibility(row, hidden)}
        onVariantChange={(hidden) =>
          void setVisibility(row, hidden, { shapeKey: row.shapeKey, lengthKey: row.lengthKey })
        }
        onShapeChange={(hidden) => void setVisibility(row, hidden, { shapeKey: row.shapeKey })}
      />
    );
  }

  const editingRow = editingKey ? (rows.find((row) => variantKey(row) === editingKey) ?? null) : null;

  if (canEditProduct && productEditorUid !== undefined) {
    return (
      <AdminProductEditor
        catalogue="library"
        productUid={productEditorUid}
        backLabel={t.admin.libraryStockTitle}
        seoTitle={t.admin.libraryStockTitle}
        seoDescription={t.admin.libraryStockDescription}
        seoPath={adminPath('/library-stock')}
        onClose={() => setProductEditorUid(undefined)}
        onSaved={() => void load(1, query, filters, false)}
      />
    );
  }

  return (
    <AdminStockList<AdminLibraryStockRow>
      seoTitle={t.admin.libraryStockTitle}
      seoDescription={t.admin.libraryStockDescription}
      seoPath={adminPath('/library-stock')}
      pageTitle={t.admin.libraryStockTitle}
      searchLabel={t.admin.searchLabel}
      searchPlaceholder={a.stock.librarySearchPlaceholder}
      submitLabel={t.admin.searchSubmit}
      emptyMessage={a.stock.libraryEmpty}
      emptySearchMessage={a.stock.emptySearch}
      closePreviewLabel={t.admin.closePhotoPreview}
      enableCardView={false}
      toolbar={
        <div className={styles.toolbarRow}>
          <AdminStockFilters
            filters={filters}
            onChange={(next) => {
              setEditingKey(null);
              setActionError(null);
              setFilters(next);
            }}
            disabled={busy}
            hiddenLabel={t.admin.stockOnlyVisible}
            stockLabel={t.admin.stockOnlyInStock}
          />
          {canEditProduct && (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setProductEditorUid(null)}>
              {a.productEditor.addProduct}
            </Button>
          )}
        </div>
      }
      hasMore={hasMore}
      loadingMore={loadingMore}
      onLoadMore={() => void load(page + 1, query, filters, true)}
      rows={rows}
      rowKey={variantKey}
      loading={busy}
      loadingMessage={loadingMessage}
      error={error}
      onSearch={onSearch}
      renderListRow={(row) => (
        <StockListRow
          uid={row.productUid}
          title={row.title}
          summary={[
            ...(row.hidden || row.variantHidden ? [t.admin.variantHiddenBadge] : []),
            ...SIZES.map((size) => `${size} ${row.sizes[size]}`),
          ].join(' · ')}
          priceLabel={row.price === null ? '-' : formatPrice(row.price)}
          totalLabel={row.stockValue === null ? '-' : formatPrice(row.stockValue)}
          thumbnail={row.thumbnail}
          previewLabel={t.admin.openPhotoPreview}
          onOpen={() => startEdit(row)}
          openLabel={t.admin.openStockItem(row.title)}
          actions={
            canEditProduct ? (
              <button
                type="button"
                className={styles.editLink}
                disabled={busy}
                onClick={() => setProductEditorUid(row.productUid)}
              >
                {a.productEditor.editProduct}
              </button>
            ) : undefined
          }
        />
      )}
    >
      {editingRow && (
        <StockEditModal
          closeLabel={t.gallery.close}
          saveLabel={t.admin.saveAction}
          thumbnail={editingRow.thumbnail}
          enlargeLabel={t.admin.enlargeItemPhoto}
          uid={editingRow.productUid}
          productTitle={editingRow.title}
          meta={
            <>
              <span>
                {editingRow.shapeLabel} · {editingRow.lengthLabel}
              </span>
              <span className={styles.metaNote}>{editingRow.createdAt}</span>
              {editingRow.featuredUntil !== null && (
                <span className={styles.metaFeatured}>
                  {t.admin.featuredUntilLabel(editingRow.featuredUntil)}
                </span>
              )}
            </>
          }
          headerControl={visibilityControl(editingRow)}
          saving={saving}
          error={actionError}
          onSave={() => void saveEdit(editingRow)}
          onClose={cancelEdit}
          footerAction={
            <Button
              type="button"
              variant="ghost"
              onClick={() => void toggleFeatured(editingRow)}
              disabled={busy || featuredDays === null}
            >
              {editingRow.featuredUntil === null
                ? t.admin.featureProduct(featuredDays ?? 0)
                : t.admin.unfeatureProduct}
            </Button>
          }
        >
          <StockSection
            title={a.stock.stockBySize(
              SIZES.reduce(
                (sum, size) => sum + (Number.isFinite(draftSizes[size]) ? draftSizes[size] : 0),
                0,
              ),
            )}
          >
            <div className={stockFieldStyles.stepperGrid}>
              {SIZES.map((size) => (
                <StockStepper
                  key={size}
                  label={size}
                  value={draftSizes[size]}
                  onChange={(value) => setDraftSizes((current) => ({ ...current, [size]: value }))}
                  disabled={busy}
                />
              ))}
            </div>
          </StockSection>
          <StockSection title={a.stock.price}>
            <div className={stockFieldStyles.fieldRow}>
              <PriceField
                label={a.stock.unitPrice}
                value={draftPrice}
                onChange={setDraftPrice}
                disabled={busy}
              />
              <StockFigure
                label={a.stock.stockValue}
                value={editingRow.stockValue === null ? '-' : formatPrice(editingRow.stockValue)}
              />
            </div>
          </StockSection>
        </StockEditModal>
      )}
    </AdminStockList>
  );
}
