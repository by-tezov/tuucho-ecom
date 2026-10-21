import { useCallback, useEffect, useState } from 'react';
import { AdminStockList, StockEditModal, StockListRow } from '../components/admin/AdminStockList';
import {
  getAdminUserLibraryStock,
  patchAdminUserLibraryStock,
  setAdminUserLibraryStockHidden,
  type AdminHiddenScope,
  type AdminStockListFilters,
  type AdminUserLibraryStockRow,
} from '../api/admin/catalog';
import { useAuthSession } from '../state/AuthContext';
import { useLang } from '../assets/i18n';
import { formatPrice } from '../utils/formatPrice';
import { adminPath } from '../utils/adminRoute';
import { withMinDuration } from '../utils/withMinDuration';
import { AdminVariantVisibility } from '../components/admin/AdminVariantVisibility';
import { PriceField, StockFigure, StockSection, StockStepper, stockFieldStyles } from '../components/admin/AdminStockFields';
import { AdminStockFilters, DEFAULT_STOCK_FILTERS } from '../components/admin/AdminStockFilters';
import { AdminProductEditor } from '../components/admin/AdminProductEditor';
import styles from '../components/admin/AdminStockList.module.css';
import { shopConfig } from '../config/env';
import { useAdminStrings } from '../assets/i18n/admin';
import { canAccess, useAdminAccess } from '../state/AdminAccessContext';

const SIZES = ['XS', 'S', 'M', 'L'] as const;
const CHUNK_SIZE = 30;
type SizeKey = (typeof SIZES)[number];
type SizeMap = Record<SizeKey, number>;

function variantKey(row: Pick<AdminUserLibraryStockRow, 'productUid' | 'shapeKey' | 'lengthKey'>) {
  return `${row.productUid}::${row.shapeKey}::${row.lengthKey}`;
}

export function AdminUserLibraryStockPage() {
  const { t } = useLang();
  const a = useAdminStrings();
  const canEditProduct = canAccess(useAdminAccess(), 'catalogue_edit');
  const { authedRequest } = useAuthSession();
  const [rows, setRows] = useState<AdminUserLibraryStockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filters, setFilters] = useState<AdminStockListFilters>(DEFAULT_STOCK_FILTERS);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftSizes, setDraftSizes] = useState<SizeMap>({ XS: 0, S: 0, M: 0, L: 0 });
  const [draftPrice, setDraftPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [productEditorUid, setProductEditorUid] = useState<string | null | undefined>(undefined);
  const busy = loading || saving;
  const hasMore = page < pages;
  const loadingMessage = saving ? t.admin.actionLoading : t.admin.contentLoading;

  const load = useCallback(
    async (nextPage: number, q: string, nextFilters: AdminStockListFilters, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const request = authedRequest((token) =>
          getAdminUserLibraryStock(token, nextPage, q, CHUNK_SIZE, nextFilters),
        );
        const result = append ? await request : await withMinDuration(request, shopConfig.loadingMinMs.short);
        setRows((current) => (append ? [...current, ...result.rows] : result.rows));
        setPage(result.pagination.page);
        setPages(result.pagination.totalPages);
      } catch {
        setError(t.admin.loadError);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [authedRequest, t.admin.loadError],
  );

  useEffect(() => {
    void load(1, query, filters, false);
  }, [filters, load, query]);

  function startEdit(row: AdminUserLibraryStockRow) {
    setEditingKey(variantKey(row));
    setDraftSizes({ ...row.sizes });
    setDraftPrice(row.price == null ? '' : String(row.price));
    setActionError(null);
  }

  function cancelEdit() {
    setEditingKey(null);
    setActionError(null);
  }

  async function saveEdit(row: AdminUserLibraryStockRow) {
    setSaving(true);
    setActionError(null);
    try {
      const price = draftPrice.trim() === '' ? undefined : Number(draftPrice);
      const result = await authedRequest((token) =>
        patchAdminUserLibraryStock(token, row.productUid, {
          shapeKey: row.shapeKey,
          lengthKey: row.lengthKey,
          price,
          sizes: draftSizes,
        }),
      );
      setRows((current) =>
        current.map((item) => (variantKey(item) === variantKey(row) ? result.row : item)),
      );
      setEditingKey(null);
    } catch {
      setActionError(t.admin.saveError);
    } finally {
      setSaving(false);
    }
  }

  async function setVisibility(row: AdminUserLibraryStockRow, hidden: boolean, scope?: AdminHiddenScope) {
    setSaving(true);
    try {
      await authedRequest((token) => setAdminUserLibraryStockHidden(token, row.productUid, hidden, scope));
      await load(1, query, filters, false);
    } catch {
      setActionError(t.admin.saveError);
    } finally {
      setSaving(false);
    }
  }

  function visibilityControl(row: AdminUserLibraryStockRow) {
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
        catalogue="user-library"
        productUid={productEditorUid}
        backLabel={t.admin.userLibraryStockTitle}
        seoTitle={t.admin.userLibraryStockTitle}
        seoDescription={t.admin.userLibraryStockDescription}
        seoPath={adminPath('/user-library-stock')}
        onClose={() => setProductEditorUid(undefined)}
        onSaved={() => void load(1, query, filters, false)}
      />
    );
  }

  return (
    <AdminStockList<AdminUserLibraryStockRow>
      seoTitle={t.admin.userLibraryStockTitle}
      seoDescription={t.admin.userLibraryStockDescription}
      seoPath={adminPath('/user-library-stock')}
      pageTitle={t.admin.userLibraryStockTitle}
      searchLabel={t.admin.searchLabel}
      searchPlaceholder={a.stock.librarySearchPlaceholder}
      submitLabel={t.admin.searchSubmit}
      emptyMessage={a.stock.libraryEmpty}
      emptySearchMessage={a.stock.emptySearch}
      closePreviewLabel={t.admin.closePhotoPreview}
      enableCardView={false}
      toolbar={
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
      }
      hasMore={hasMore}
      loadingMore={loadingMore}
      onLoadMore={() => void load(page + 1, query, filters, true)}
      rows={rows}
      rowKey={variantKey}
      loading={busy}
      loadingMessage={loadingMessage}
      error={error}
      onSearch={(next) => {
        setQuery(next);
        void load(1, next, filters, false);
      }}
      renderListRow={(row) => (
        <StockListRow
          uid={row.productUid}
          title={row.title}
          summary={[
            ...(row.hidden || row.variantHidden ? [t.admin.variantHiddenBadge] : []),
            ...(row.owners.length > 0 ? [row.owners.join(', ')] : []),
            ...SIZES.map((size) => `${size} ${row.sizes[size]}`),
          ].join(' · ')}
          priceLabel={row.price === null ? '-' : formatPrice(row.price)}
          totalLabel={row.stockValue === null ? '-' : formatPrice(row.stockValue)}
          thumbnail={row.thumbnail}
          previewLabel={t.admin.openPhotoPreview}
          onOpen={() => startEdit(row)}
          openLabel={t.admin.openStockItem(row.title)}
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
              {editingRow.owners.length > 0 && (
                <span className={styles.metaNote}>{editingRow.owners.join(', ')}</span>
              )}
            </>
          }
          headerControl={visibilityControl(editingRow)}
          saving={saving}
          error={actionError}
          onSave={() => void saveEdit(editingRow)}
          onClose={cancelEdit}
        >
          <StockSection>
            <PriceField value={draftPrice} onChange={setDraftPrice} disabled={busy} />
            <div className={stockFieldStyles.row}>
              {SIZES.map((size) => (
                <StockFigure key={size} label={size}>
                  <StockStepper
                    value={draftSizes[size]}
                    onChange={(value) => setDraftSizes((current) => ({ ...current, [size]: value }))}
                    disabled={busy}
                  />
                </StockFigure>
              ))}
            </div>
          </StockSection>
        </StockEditModal>
      )}
    </AdminStockList>
  );
}
