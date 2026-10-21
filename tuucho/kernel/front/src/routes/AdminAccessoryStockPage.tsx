import { useCallback, useEffect, useState } from 'react';
import { AdminStockList, StockEditModal, StockListRow } from '../components/admin/AdminStockList';
import {
  getAdminAccessoryStock,
  patchAdminAccessoryStock,
  setAdminAccessoryStockHidden,
  type AdminAccessoryStockRow,
  type AdminStockListFilters,
} from '../api/admin/catalog';
import { useAuthSession } from '../state/AuthContext';
import { useLang } from '../assets/i18n';
import { formatPrice } from '../utils/formatPrice';
import { adminPath } from '../utils/adminRoute';
import { withMinDuration } from '../utils/withMinDuration';
import { AdminStockFilters, DEFAULT_STOCK_FILTERS } from '../components/admin/AdminStockFilters';
import { VisibilityCard, VisibilityRow } from '../components/admin/AdminVariantVisibility';
import {
  PriceField,
  StockFigure,
  StockSection,
  StockStepper,
  stockFieldStyles,
} from '../components/admin/AdminStockFields';
import { Button } from '../components/ui/Button';
import { AdminProductEditor } from '../components/admin/AdminProductEditor';
import styles from '../components/admin/AdminStockList.module.css';
import { shopConfig } from '../config/env';
import { useAdminStrings } from '../assets/i18n/admin';
import { canAccess, useAdminAccess } from '../state/AdminAccessContext';

/** Fetch chunk for the infinite list. Not a user-facing choice any
 * more: the admin scrolls, the list appends. */
const CHUNK_SIZE = 30;

function packKeys(row: AdminAccessoryStockRow): string[] {
  return Object.keys(row.packs).sort();
}

export function AdminAccessoryStockPage() {
  const { t } = useLang();
  const a = useAdminStrings();
  const canEditProduct = canAccess(useAdminAccess(), 'catalogue_edit');
  const { authedRequest } = useAuthSession();
  const [rows, setRows] = useState<AdminAccessoryStockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filters, setFilters] = useState<AdminStockListFilters>(DEFAULT_STOCK_FILTERS);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [draftAvailable, setDraftAvailable] = useState(0);
  const [draftUnitPrice, setDraftUnitPrice] = useState('');
  const [draftPackPrices, setDraftPackPrices] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [changingVisibilityUid, setChangingVisibilityUid] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [productEditorUid, setProductEditorUid] = useState<string | null | undefined>(undefined);
  const busy = loading || saving || changingVisibilityUid !== null;
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
          getAdminAccessoryStock(token, nextPage, q, CHUNK_SIZE, nextFilters),
        );
        const result = append ? await request : await withMinDuration(request, shopConfig.loadingMinMs.short);
        setRows((current) => (append ? [...current, ...result.rows] : result.rows));
        setPage(result.pagination.page);
        setPages(result.pagination.totalPages);
      } catch {
        setError(a.stock.accessoryLoadError);
      } finally {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [authedRequest, a.stock.accessoryLoadError],
  );

  useEffect(() => {
    load(1, query, filters, false);
  }, [filters, load, query]);

  function onSearch(q: string) {
    setEditingUid(null);
    setActionError(null);
    setQuery(q);
  }

  function startEdit(row: AdminAccessoryStockRow) {
    if (busy) return;
    setEditingUid(row.productUid);
    setDraftAvailable(row.available);
    setDraftUnitPrice(row.unitPrice === null ? '' : String(row.unitPrice));
    setDraftPackPrices(
      row.packPrices
        ? Object.fromEntries(Object.entries(row.packPrices).map(([key, value]) => [key, String(value)]))
        : {},
    );
    setActionError(null);
  }

  function cancelEdit() {
    setEditingUid(null);
    setActionError(null);
  }

  async function saveEdit(row: AdminAccessoryStockRow) {
    if (busy) return;
    if (!Number.isSafeInteger(draftAvailable) || draftAvailable < 0) {
      setActionError(a.stock.errQuantity);
      return;
    }

    const body: { available: number; unitPrice?: number; packPrices?: Record<string, number> } = {
      available: draftAvailable,
    };

    if (row.packPrices) {
      const packPrices: Record<string, number> = {};
      for (const key of packKeys(row)) {
        const text = (draftPackPrices[key] ?? '').trim();
        const value = Number(text.replace(',', '.'));
        if (!Number.isFinite(value) || value < 0) {
          setActionError(a.stock.errPackPrice(key));
          return;
        }
        packPrices[key] = value;
      }
      body.packPrices = packPrices;
    } else {
      const priceText = draftUnitPrice.trim();
      if (priceText !== '') {
        const unitPrice = Number(priceText.replace(',', '.'));
        if (!Number.isFinite(unitPrice) || unitPrice < 0) {
          setActionError(a.stock.errPrice);
          return;
        }
        body.unitPrice = unitPrice;
      }
    }

    setSaving(true);
    setActionError(null);
    try {
      const result = await withMinDuration(
        authedRequest((token) => patchAdminAccessoryStock(token, row.productUid, body)),
        shopConfig.loadingMinMs.short,
      );
      setRows((current) =>
        current.map((entry) => (entry.productUid === result.row.productUid ? result.row : entry)),
      );
      setEditingUid(null);
    } catch {
      setActionError(a.stock.errSaveAccessory);
    } finally {
      setSaving(false);
    }
  }

  async function toggleVisibility(row: AdminAccessoryStockRow) {
    if (busy) return;
    setChangingVisibilityUid(row.productUid);
    setError(null);
    try {
      const result = await withMinDuration(
        authedRequest((token) => setAdminAccessoryStockHidden(token, row.productUid, !row.hidden)),
        shopConfig.loadingMinMs.short,
      );
      setRows((current) =>
        current.map((entry) =>
          entry.productUid === row.productUid ? { ...entry, hidden: result.hidden } : entry,
        ),
      );
    } catch {
      setError(a.stock.errVisibilityAccessory);
    } finally {
      setChangingVisibilityUid(null);
    }
  }

  const editingRow = editingUid ? (rows.find((row) => row.productUid === editingUid) ?? null) : null;
  const editingPackKeys = editingRow ? packKeys(editingRow) : [];
  const editingPackQuantities = editingRow
    ? editingPackKeys.map((key) =>
        editingRow.type === 'byQuantity' ? String(editingRow.packs[key]) : `${key}×${editingRow.packs[key]}`,
      )
    : [];

  if (canEditProduct && productEditorUid !== undefined) {
    return (
      <AdminProductEditor
        catalogue="accessory"
        productUid={productEditorUid}
        backLabel={t.admin.accessoryStockTitle}
        seoTitle={t.admin.accessoryStockTitle}
        seoDescription={t.admin.accessoryStockDescription}
        seoPath={adminPath('/accessory-stock')}
        onClose={() => setProductEditorUid(undefined)}
        onSaved={() => void load(1, query, filters, false)}
      />
    );
  }

  return (
    <AdminStockList<AdminAccessoryStockRow>
      seoTitle={t.admin.accessoryStockTitle}
      seoDescription={t.admin.accessoryStockDescription}
      seoPath={adminPath('/accessory-stock')}
      pageTitle={t.admin.accessoryStockTitle}
      searchLabel={t.admin.searchLabel}
      searchPlaceholder={a.stock.accessorySearchPlaceholder}
      submitLabel={t.admin.searchSubmit}
      emptyMessage={a.stock.accessoryEmpty}
      emptySearchMessage={a.stock.emptySearch}
      closePreviewLabel={t.admin.closePhotoPreview}
      enableCardView={false}
      toolbar={
        <div className={styles.toolbarRow}>
          <AdminStockFilters
            filters={filters}
            onChange={(next) => {
              setEditingUid(null);
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
      rowKey={(row) => row.productUid}
      loading={busy}
      loadingMessage={loadingMessage}
      error={error}
      onSearch={onSearch}
      renderListRow={(row) => {
        const keys = packKeys(row);
        const packQuantities = keys.map((key) =>
          row.type === 'byQuantity' ? String(row.packs[key]) : `${key}×${row.packs[key]}`,
        );
        const summary =
          keys.length > 0
            ? `${a.stock.qty(row.available)} · ${a.stock.packs(packQuantities.join(' · '))}`
            : a.stock.qty(row.available);
        return (
          <StockListRow
            uid={row.productUid}
            title={row.title}
            summary={summary}
            priceLabel={row.unitPrice === null ? '-' : formatPrice(row.unitPrice)}
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
        );
      }}
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
              <span>{editingRow.type === 'byQuantity' ? a.stock.typeByQuantity : a.stock.typeStandard}</span>
              <span className={styles.metaNote}>
                {editingRow.createdAt}
                {editingPackKeys.length > 0 && a.stock.packsList(editingPackQuantities.join(', '))}
              </span>
            </>
          }
          headerControl={
            <VisibilityCard>
              <VisibilityRow
                label={t.admin.visibilityWholeProduct}
                hidden={editingRow.hidden}
                disabled={busy}
                onChange={() => void toggleVisibility(editingRow)}
                ariaLabel={
                  editingRow.hidden
                    ? t.admin.showProduct(editingRow.title)
                    : t.admin.hideProduct(editingRow.title)
                }
              />
            </VisibilityCard>
          }
          saving={saving}
          error={actionError}
          onSave={() => void saveEdit(editingRow)}
          onClose={cancelEdit}
        >
          <StockSection title={a.stock.stock}>
            <div className={stockFieldStyles.fieldRow}>
              <StockStepper
                label={a.stock.quantity}
                value={draftAvailable}
                onChange={setDraftAvailable}
                disabled={busy}
              />
              <StockFigure
                label={a.stock.stockValue}
                value={editingRow.stockValue === null ? '-' : formatPrice(editingRow.stockValue)}
              />
            </div>
          </StockSection>
          <StockSection title={editingRow.packPrices ? a.stock.pricePerPack : a.stock.price}>
            {editingRow.packPrices ? (
              <div className={stockFieldStyles.fieldRow}>
                {editingPackKeys.map((key) => (
                  <PriceField
                    key={key}
                    label={
                      editingRow.type === 'byQuantity'
                        ? `Pack ${editingRow.packs[key]}`
                        : `${key}×${editingRow.packs[key]}`
                    }
                    value={draftPackPrices[key] ?? ''}
                    onChange={(value) => setDraftPackPrices((current) => ({ ...current, [key]: value }))}
                    disabled={busy}
                  />
                ))}
              </div>
            ) : (
              <div className={stockFieldStyles.fieldRow}>
                <PriceField
                  label={a.stock.unitPrice}
                  value={draftUnitPrice}
                  onChange={setDraftUnitPrice}
                  disabled={busy}
                />
              </div>
            )}
          </StockSection>
        </StockEditModal>
      )}
    </AdminStockList>
  );
}
