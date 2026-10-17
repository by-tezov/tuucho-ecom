import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { ApiError } from '../../api/errors';
import { type CartSummary } from '../../api/cart';
import { isBackendUnavailableError } from '../../api/http';
import type { Lang } from '../../assets/i18n';
import type { Strings } from '../../assets/i18n/types';
import { useFitTitle } from '../../hooks/useFitOneLineTitle';
import {
  cartDisplayName,
  cartLimitMessage,
  limitedCartCount,
  formatCartItemCount,
} from '../../utils/cartDisplayName';
import { formatPrice } from '../../utils/formatPrice';
import { shopConfig } from '../../config/env';
import { ConfirmModal } from '../ui/ConfirmModal';
import { LoadingModal } from '../ui/LoadingModal';
import { withMinDuration } from '../../utils/withMinDuration';
import { GiftCornerMark } from '../layout/GiftCornerMark';
import { CartNameDialog } from './CartNameDialog';
import styles from './CartSwitcher.module.css';

const TILE_NAME_MIN_PX = 10;
const TILE_NAME_MAX_PX = 14;

/**
 * Show the merge pill label when the action row can fit icon+text; collapse to
 * icon-only when that would overflow. Always measures with the label visible
 * first so ResizeObserver does not oscillate between compact and full.
 */
function useFitMergeLabel(
  rowRef: RefObject<HTMLElement | null>,
  mergeRef: RefObject<HTMLElement | null>,
  labelText: string,
) {
  const [compact, setCompact] = useState(false);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const merge = mergeRef.current;
    if (!row || !merge) return;

    let cancelled = false;

    const fit = () => {
      // Probe with the full pill; decide from that single measurement.
      merge.classList.remove(styles.mergeCompact!);
      const overflows = row.scrollWidth > row.clientWidth + 0.5;
      if (overflows) merge.classList.add(styles.mergeCompact!);
      else merge.classList.remove(styles.mergeCompact!);
      if (!cancelled) setCompact((prev) => (prev === overflows ? prev : overflows));
    };

    fit();
    void document.fonts?.ready.then(() => {
      if (!cancelled) fit();
    });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(row);
    window.addEventListener('resize', fit);
    return () => {
      cancelled = true;
      ro?.disconnect();
      window.removeEventListener('resize', fit);
      merge.classList.remove(styles.mergeCompact!);
    };
  }, [rowRef, mergeRef, labelText]);

  return compact;
}

function TileActions({
  renameAria,
  mergeAria,
  mergeLabel,
  mergeDisabled,
  onRename,
  onMerge,
}: {
  renameAria: string;
  mergeAria: string;
  mergeLabel: string;
  mergeDisabled: boolean;
  /** Omitted for system carts (Wish List, Unconnected) — their label comes
   * from their kind, so renaming them would change nothing on screen. */
  onRename?: () => void;
  onMerge?: () => void;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const mergeRef = useRef<HTMLButtonElement | null>(null);
  const compact = useFitMergeLabel(rowRef, mergeRef, mergeLabel);

  return (
    <div ref={rowRef} className={styles.tileActions}>
      {onRename && (
        <button
          type="button"
          className={`${styles.iconButton} ${styles.iconButtonEdit}`}
          aria-label={renameAria}
          onClick={onRename}
        >
          <PencilIcon />
        </button>
      )}
      {onMerge ? (
        <button
          ref={mergeRef}
          type="button"
          className={`${styles.iconButton} ${styles.iconButtonMerge}${compact ? ` ${styles.mergeCompact}` : ''}`}
          aria-label={mergeAria}
          data-testid="cart-merge"
          disabled={mergeDisabled}
          onClick={onMerge}
        >
          <MergeIcon />
          <span>{mergeLabel}</span>
        </button>
      ) : null}
    </div>
  );
}

function cartItemLabel(cart: CartSummary, t: Strings, lang: Lang): string {
  return formatCartItemCount(cart.itemCount, t, lang);
}

/** Scales 10–14px across up to 2 lines; CSS line-clamp ellipsis is last resort. */
function CartTileName({ name }: { name: string }) {
  const titleRef = useRef<HTMLSpanElement | null>(null);
  useFitTitle(titleRef, name, {
    minFont: TILE_NAME_MIN_PX,
    maxFont: TILE_NAME_MAX_PX,
    maxLines: 2,
  });
  return (
    <span ref={titleRef} className={styles.tileName}>
      {name}
    </span>
  );
}

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20h4.5L19 9.5 14.5 5 4 15.5V20z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12.5 7.5l4 4" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function MergeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 4v8a5 5 0 0 0 5 5h0a5 5 0 0 0 5-5V4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M4 8l3-4 3 4M14 8l3-4 3 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* Same path/stroke as CartLine deleteIconButton (scaled to fill the 32px circle). */
function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M2 3.5H12M5.4 3.5V2.2C5.4 1.9 5.6 1.7 5.9 1.7H8.1C8.4 1.7 8.6 1.9 8.6 2.2V3.5M3.6 3.5 4.1 11.9C4.1 12.2 4.4 12.4 4.6 12.4H9.4C9.7 12.4 9.9 12.2 9.9 11.9L10.4 3.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatCartDate(value: string, lang: Lang): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(lang, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export interface CartSwitcherProps {
  carts: CartSummary[];
  cartLimit: number;
  t: Strings;
  lang: Lang;
  onActivate: (cartId: string) => Promise<void>;
  onDelete: (cartId: string) => Promise<void>;
  onMerge: (sourceCartId: string) => Promise<void>;
  onCreate: (name: string) => Promise<void>;
  onRename: (cartId: string, name: string) => Promise<void>;
}

/** Lists non-active carts as tiles (activate / rename / merge / delete) plus
 * a "create new cart" tile. Tile summaries only — full lines load on activate. */
export function CartSwitcher({
  carts,
  cartLimit,
  t,
  lang,
  onActivate,
  onDelete,
  onMerge,
  onCreate,
  onRename,
}: CartSwitcherProps) {
  // Alphabetical by the same localized label the tile shows (not raw
  // cart.name — system carts store an English sentinel there), so the
  // "Autres paniers" order matches what the customer actually reads.
  // Every cart that is not the one on screen, including an empty default.
  // That default is the way back after creating or switching to another cart.
  const otherCarts = useMemo(
    () =>
      [...carts.filter((cart) => !cart.isActive)].sort((a, b) =>
        cartDisplayName(a, t).localeCompare(cartDisplayName(b, t), lang),
      ),
    [carts, t, lang],
  );
  const activeCart = useMemo(() => carts.find((cart) => cart.isActive) ?? null, [carts]);
  const [renameTarget, setRenameTarget] = useState<CartSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CartSummary | null>(null);
  const [mergeTarget, setMergeTarget] = useState<CartSummary | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (carts.length === 0) return null;

  const openCreate = () => {
    if (limitedCartCount(carts) >= cartLimit) {
      setLimitOpen(true);
      return;
    }
    setCreateOpen(true);
  };

  const closeLimit = () => setLimitOpen(false);

  const handleActivate = (cartId: string) => {
    if (switching || busy || deleting) return;
    setSwitching(true);
    void withMinDuration(onActivate(cartId), shopConfig.loadingMinMs.normal).finally(() => {
      setSwitching(false);
    });
  };

  return (
    <section className={styles.section} aria-labelledby="other-carts-h">
      <h2 id="other-carts-h" className={styles.title}>
        {t.cart.otherCartsTitle}
      </h2>
      <div className={styles.grid}>
        {otherCarts.map((cart) => (
          <div
            key={cart.id}
            className={cart.kind === 'gift' ? `${styles.tile} ${styles.tileGift}` : styles.tile}
            role="group"
          >
            {cart.kind === 'gift' ? <GiftCornerMark compact /> : null}
            <button
              type="button"
              className={styles.tileActivate}
              data-testid="cart-switch"
              data-cart-id={cart.id}
              disabled={switching || busy || deleting}
              onClick={() => handleActivate(cart.id)}
            >
              <CartTileName name={cartDisplayName(cart, t)} />
              <span className={styles.tileMeta}>
                {cartItemLabel(cart, t, lang)}
                <br />
                {formatCartDate(cart.createdAt, lang)}
              </span>
              <span className={styles.tileTotal}>{formatPrice(cart.total)}</span>
            </button>
            {cart.kind !== 'gift' && (
              <button
                type="button"
                className={`${styles.iconButton} ${styles.iconButtonDanger} ${styles.tileDeleteButton}`}
                aria-label={cart.kind === 'default' ? t.cart.clearCartButton : t.cart.deleteButton}
                disabled={switching || busy || deleting}
                onClick={() => setDeleteTarget(cart)}
              >
                <TrashIcon />
              </button>
            )}
            {cart.kind === 'gift' ? (
              <TileActions
                renameAria={t.cart.renameCart}
                mergeAria={t.cart.mergeCart}
                mergeLabel={t.cart.mergeButton}
                mergeDisabled
                onRename={() => setRenameTarget(cart)}
              />
            ) : (
              <TileActions
                renameAria={t.cart.renameCart}
                mergeAria={t.cart.mergeCart}
                mergeLabel={t.cart.mergeButton}
                mergeDisabled={switching || busy || deleting || !activeCart}
                {...(cart.kind === 'wishlist' || cart.kind === 'unconnected'
                  ? {}
                  : { onRename: () => setRenameTarget(cart) })}
                onMerge={() => setMergeTarget(cart)}
              />
            )}
          </div>
        ))}
        <button
          type="button"
          className={`${styles.tile} ${styles.tileCreate}`}
          data-testid="cart-create"
          disabled={switching || busy || deleting}
          onClick={openCreate}
        >
          <span className={styles.createIcon} aria-hidden="true">
            +
          </span>
          <span>{t.cart.createCart}</span>
        </button>
      </div>

      {createOpen && (
        <CartNameDialog
          title={t.cart.createCartDialogTitle}
          confirmLabel={t.cart.createCartConfirm}
          placeholder={t.cart.createCartNamePlaceholder}
          closeLabel={t.auth.closeAria}
          initialName=""
          t={t}
          cartLimit={cartLimit}
          onCancel={() => setCreateOpen(false)}
          onConfirm={async (name) => {
            try {
              await onCreate(name);
            } catch (err) {
              if (isBackendUnavailableError(err)) return;
              // Race: list was under the cap when the name dialog opened.
              if (err instanceof ApiError && err.code === 'cart_limit_exceeded') {
                setCreateOpen(false);
                setLimitOpen(true);
                return;
              }
              throw err;
            }
          }}
        />
      )}

      {limitOpen && (
        <ConfirmModal
          variant="dialog"
          title={t.cart.cartLimitTitle}
          message={cartLimitMessage(t, cartLimit)}
          confirmLabel={t.cart.cartLimitOk}
          closeLabel={t.auth.closeAria}
          onConfirm={closeLimit}
          onCancel={closeLimit}
        />
      )}

      {renameTarget && (
        <CartNameDialog
          title={t.cart.renameCart}
          confirmLabel={t.address.saveButton}
          placeholder={t.cart.renameCartPlaceholder}
          closeLabel={t.auth.closeAria}
          initialName={cartDisplayName(renameTarget, t)}
          t={t}
          cartLimit={cartLimit}
          onCancel={() => setRenameTarget(null)}
          onConfirm={async (name) => {
            await onRename(renameTarget.id, name);
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          variant="dialog"
          // The backend clears a `default` cart's lines instead of removing
          // it (DELETE /account/carts/:cartId) — reflect that here so the
          // confirmation doesn't promise the tile will disappear when it
          // will actually just show 0 items afterward.
          title={deleteTarget.kind === 'default' ? t.cart.clearCartConfirm : t.cart.deleteCartConfirm}
          message={
            <div className={styles.deletePreview}>
              <div className={styles.deletePreviewName}>{cartDisplayName(deleteTarget, t)}</div>
              <div>{cartItemLabel(deleteTarget, t, lang)}</div>
              <div>{formatPrice(deleteTarget.total)}</div>
            </div>
          }
          confirmLabel={deleteTarget.kind === 'default' ? t.cart.clearCartButton : t.cart.deleteButton}
          closeLabel={t.auth.closeAria}
          confirmDanger
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            const id = deleteTarget.id;
            setDeleteTarget(null);
            setDeleting(true);
            void withMinDuration(onDelete(id), shopConfig.loadingMinMs.normal).finally(() => {
              setDeleting(false);
            });
          }}
        />
      )}

      {mergeTarget && activeCart && (
        <ConfirmModal
          variant="dialog"
          title={t.cart.mergeCartConfirm}
          message={
            <div className={styles.mergePreview}>
              <div className={styles.mergePreviewBlock}>
                <div className={styles.mergePreviewLabel}>{t.cart.mergeCartSourceLabel}</div>
                <div className={styles.deletePreviewName}>{cartDisplayName(mergeTarget, t)}</div>
                <div>{cartItemLabel(mergeTarget, t, lang)}</div>
                <div>{formatPrice(mergeTarget.total)}</div>
              </div>
              <hr className={styles.mergePreviewSeparator} aria-hidden="true" />
              <div className={styles.mergePreviewBlock}>
                <div className={styles.mergePreviewLabel}>{t.cart.mergeCartTargetLabel}</div>
                <div className={styles.deletePreviewName}>{cartDisplayName(activeCart, t)}</div>
                <div>{cartItemLabel(activeCart, t, lang)}</div>
                <div>{formatPrice(activeCart.total)}</div>
              </div>
            </div>
          }
          confirmLabel={t.cart.mergeButton}
          closeLabel={t.auth.closeAria}
          onCancel={() => setMergeTarget(null)}
          onConfirm={() => {
            const id = mergeTarget.id;
            setMergeTarget(null);
            setBusy(true);
            void onMerge(id).finally(() => setBusy(false));
          }}
        />
      )}

      {switching && <LoadingModal message={t.cart.switchingCart} />}
      {deleting && <LoadingModal message={t.cart.deletingCart} />}
    </section>
  );
}
