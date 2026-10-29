import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLang } from '../../assets/i18n';
import { localizedPath, stripLangPrefix } from '../../config/i18nRoutes';
import { useCartData, useCartOverlay, useCartCommands } from '../../hooks/useCart';
import { useOptionalGiftReceiver } from '../../hooks/useGiftReceiver';
import { useAuthSession } from '../../state/AuthContext';
import {
  audienceForCatalogue,
  loadProducts,
  readProductCache,
  type ProductSnapshot,
} from '../../state/productCache';
import { fetchGalleryFeed, fetchProductsByIds, type ProductById } from '../../api/gallery';
import { getReceiverGalleryFeed, getReceiverCartProductsByIds, receiverFollowsOrder } from '../../api/gift';
import { useGiftLock } from '../../hooks/useGiftLock';
import type { DrawerNotice } from './CartDrawerNotice';
import type { GalleryItem } from '../../data/types';
import { formatCartItemCount } from '../../utils/cartDisplayName';
import { withMinDuration } from '../../utils/withMinDuration';
import { shopConfig } from '../../config/env';
import { HOME_PATH } from '../../config/paths';
import { LoadingModal } from '../ui/LoadingModal';
import styles from './CartControl.module.css';
import { GiftIcon } from './GiftIcon';
import { LazyCartDrawer, useCartDrawerChunk } from './LazyCartDrawer';
interface CartControlProps {
  className?: string;
}

/** Mobile pages that hide MobileTabBar but still need direct cart access.
 * /contact is deliberately excluded even though it also hides the tab bar —
 * the chat view there should stay free of a floating cart distraction. */
const MOBILE_FAB_PATHS = new Set(['/home', '/sizes', '/capsules', '/pose', '/about']);

/** Cart icon + item-count badge, right of AccountControl — visible whether
 * signed in or not (a guest's cart is cached locally, see
 * state/guestCart.ts, and merged into the account on login). Adding an item
 * (see useCart's `justAdded`) opens a right-hand drawer showing the whole
 * cart (not just the item that was just added), with quick "finish order" /
 * "keep browsing" actions — easy to miss off in a header corner, especially
 * on a first add. On mobile the permanent tab bar normally owns cart access;
 * pages that deliberately hide that bar use the floating button below. */
export function CartControl({ className }: CartControlProps) {
  const { status, authedRequest } = useAuthSession();
  const gift = useOptionalGiftReceiver();
  const { lock } = useGiftLock();
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const { items, extraSets, extraLocked, cartCount, hasCartItems, activeCart } = useCartData();
  const { removeFromCart } = useCartCommands();
  const {
    justAdded,
    dismissJustAdded,
    justRebought,
    cartError,
    dismissCartError,
    pendingAdd,
    closeActiveModal,
    hasActiveModal,
  } = useCartOverlay();
  const [productsById, setProductsById] = useState<Record<string, ProductById>>({});
  const [gallerySets, setGallerySets] = useState<Record<string, GalleryItem>>({});
  /** Monotonic guard: a background revalidation may resolve after a newer
   * hydration has already applied, and must not clobber it. */
  const hydrationIdRef = useRef(0);
  const shownNoticeRef = useRef<typeof justAdded>(null);
  const notice: DrawerNotice | null = justAdded
    ? { kind: 'success', title: justAdded.title }
    : cartError
      ? { kind: 'error', title: cartError.title }
      : pendingAdd
        ? { kind: 'pending', title: pendingAdd.title }
        : null;
  const wantsOpen = notice !== null;
  // The drawer itself only renders once its product data has loaded —
  // wantsOpen flips true (e.g. right after "Ajouter") well before that data
  // is ready, and rendering the drawer in the gap used to show it briefly as
  // empty before the real lines popped in. A LoadingModal fills that gap
  // instead (below), so the drawer only ever appears already populated.
  const [productsHydrated, setProductsHydrated] = useState(false);
  // Add-from-zoom closes PhotoLightbox first, but its unregister lands in
  // an effect. Hold the drawer (and its history entry) until then so it
  // never stacks on top of the zoom modal.
  const drawerReady = productsHydrated;
  // An add opens the drawer at once on its loading banner, and once open it
  // stays open (list loading) until dismissed rather than flicker closed.
  const [stayOpen, setStayOpen] = useState(false);
  const drawerChunkReady = useCartDrawerChunk(wantsOpen);
  // Once an add is pending or succeeded, do not wait on hasActiveModal: the
  // add path already closed the zoom. Waiting left guest cart-auth races
  // without cart-drawer-success when unregister lagged behind pendingAdd.
  const addInFlight = pendingAdd !== null || justAdded !== null || cartError !== null;
  const open =
    wantsOpen &&
    drawerChunkReady &&
    (pendingAdd !== null || drawerReady || stayOpen) &&
    (addInFlight || !hasActiveModal);
  if (open !== stayOpen && (open || !wantsOpen)) setStayOpen(open);
  const showContinueShopping = !justRebought;
  const followOrder = receiverFollowsOrder(gift.summary?.status) || Boolean(lock?.followLocked);
  const pathRest = stripLangPrefix(location.pathname).rest;

  const showMobileFab =
    hasCartItems &&
    !wantsOpen &&
    !hasActiveModal &&
    MOBILE_FAB_PATHS.has(pathRest) &&
    !(followOrder && pathRest === HOME_PATH);

  // Lifts the fixed FAB above the footer once scrolling brings it into
  // view, instead of letting it sit fixed on top of the footer's content.
  const [fabLift, setFabLift] = useState(0);
  useEffect(() => {
    if (!showMobileFab) {
      setFabLift(0);
      return;
    }
    // The FAB's own resting offset from the viewport bottom (CSS `.fab`'s
    // `16px`, ignoring the safe-area inset) — subtracted below so lift stays
    // 0 until the footer would actually close the gap under that resting
    // offset to less than FAB_GAP_PX, instead of firing as soon as the
    // footer merely nears the viewport.
    const FAB_BASE_PX = 16;
    const FAB_GAP_PX = 12;
    let frame = 0;
    const update = () => {
      frame = 0;
      const footer = document.querySelector('footer[role="contentinfo"]');
      const footerTop = footer?.getBoundingClientRect().top;
      const neededOffset = footerTop === undefined ? 0 : window.innerHeight - footerTop + FAB_GAP_PX;
      setFabLift(Math.max(0, neededOffset - FAB_BASE_PX));
    };
    const onScrollOrResize = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [showMobileFab]);

  function dismissNotice() {
    dismissJustAdded();
    dismissCartError();
  }

  // Resolved lazily, only while the drawer is wanted open — the cart
  // context itself only carries ids/shape/size/quantity (see useCart.tsx),
  // the photo/title/price shown per line comes from product hydration.
  //
  // Served from state/productCache.ts, so the usual case (the gallery just
  // seeded these very products, or the drawer was opened a moment ago) is a
  // synchronous hit that renders with no request and no spinner. Only a
  // genuine cold miss — a product this tab has never resolved — is allowed
  // to block behind the LoadingModal.
  useEffect(() => {
    if (!wantsOpen) return;
    const audience = audienceForCatalogue(status, gift.active);
    // Auth still resolving (and this is not a gift lock): caching now would
    // file everything under the wrong audience, so wait for the next run.
    if (!audience) return;

    const ids = [...new Set(items.map((item) => item.productId))];
    if (ids.length === 0) {
      setProductsById({});
      setGallerySets({});
      // A just-added notice with no lines yet is still hydrating: no empty
      // drawer. Extra-set rows need no hydration; and once this notice showed
      // its lines, empty means the last one was removed from the drawer.
      const shown = justAdded !== null && shownNoticeRef.current === justAdded;
      setProductsHydrated(shown || extraSets.length > 0 || (!justAdded && !cartError));
      return;
    }

    let cancelled = false;
    const requestId = (hydrationIdRef.current += 1);
    const apply = (snapshot: ProductSnapshot) => {
      // A slow background revalidation must never overwrite a newer fill.
      if (cancelled || hydrationIdRef.current !== requestId) return;
      setProductsById(snapshot.productsById);
      setGallerySets(snapshot.gallerySets);
      setProductsHydrated(true);
      shownNoticeRef.current = justAdded;
    };

    const fetchProducts = (missing: string[]) =>
      gift.active && gift.token
        ? getReceiverCartProductsByIds(gift.token, missing, lang)
        : status === 'authenticated'
          ? authedRequest((accessToken) => fetchProductsByIds(missing, lang, accessToken))
          : fetchProductsByIds(missing, lang);
    const fetchSets = (nailIds: string[]) =>
      (gift.active && gift.token
        ? getReceiverGalleryFeed(gift.token, lang, { ids: nailIds, limit: nailIds.length })
        : status === 'authenticated'
          ? authedRequest((accessToken) =>
              fetchGalleryFeed({ ids: nailIds, limit: nailIds.length }, lang, accessToken),
            )
          : fetchGalleryFeed({ ids: nailIds, limit: nailIds.length }, lang)
      ).then((result) => result.items);

    const cached = readProductCache(ids, lang, audience);
    // Only a missing ProductById blocks. A missing GalleryItem does not: the
    // renderer already falls back to product.photo and the grouped shape
    // label, and stock clamping reads product.available. The feed is pure
    // enhancement here, so it is fetched without ever holding the drawer up.
    const isColdMiss = cached.missingProductIds.length > 0;

    if (!isColdMiss) {
      apply(cached);
      if (cached.stale || cached.missingSetIds.length > 0) {
        void loadProducts({
          ids,
          lang,
          audience,
          mode: cached.stale ? 'revalidate' : 'fill',
          fetchProducts,
          fetchSets,
        }).then(apply, () => undefined);
      }
      return () => {
        cancelled = true;
      };
    }

    setProductsHydrated(false);
    void withMinDuration(
      loadProducts({ ids, lang, audience, mode: 'fill', fetchProducts, fetchSets }),
      shopConfig.loadingMinMs.short,
    ).then(apply, () => {
      // Leave the drawer's own empty/partial state rather than hanging on a
      // spinner forever — the cart lines themselves are already known.
      if (!cancelled && hydrationIdRef.current === requestId) setProductsHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [
    wantsOpen,
    items,
    extraSets.length,
    justAdded,
    cartError,
    lang,
    status,
    authedRequest,
    gift.active,
    gift.token,
  ]);

  // Leave the "just added" / error notice behind when navigating away, so a
  // leftover scroll lock (Layout-mounted CartControl) cannot follow the
  // customer onto another page with no way to dismiss it. Language-prefix
  // only changes (same path rest) must not clear the notice — §1/§2 locale
  // redirects were wiping cart-drawer-success mid guest cart-auth.
  useEffect(() => {
    dismissJustAdded();
    dismissCartError();
  }, [pathRest, dismissJustAdded, dismissCartError]);

  // Any drawer dismiss (X, backdrop, Escape, platform back, Continuer) must
  // also close a product lightbox still open underneath and leave the
  // customer on the page they were browsing — never strand the zoom modal
  // or eat an extra history entry that makes the next back leave the site.
  // Modal close is deferred so a popstate that just dismissed the drawer can
  // finish before the lightbox pops its own history entry.
  function dismissDrawerToGallery() {
    dismissNotice();
    setTimeout(() => closeActiveModal(), 0);
  }

  function goToCart() {
    dismissNotice();
    navigate(localizedPath('/cart', lang));
  }

  const cartTriggerLabel = followOrder ? t.gift.followTitle : t.cart.iconAria;
  const cartTriggerAria =
    !followOrder && cartCount > 0
      ? `${cartTriggerLabel}, ${formatCartItemCount(cartCount, t, lang)}`
      : cartTriggerLabel;
  const cartIcon = followOrder ? (
    <GiftIcon size={19} />
  ) : (
    <svg width="19" height="19" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2 2h1.2l.9 8.1a1.4 1.4 0 0 0 1.4 1.25h6.2a1.4 1.4 0 0 0 1.38-1.16l.82-4.7H4.4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="6.2" cy="13.4" r="1" fill="currentColor" />
      <circle cx="11" cy="13.4" r="1" fill="currentColor" />
    </svg>
  );

  return (
    <>
      <div className={[styles.wrap, className].filter(Boolean).join(' ')}>
        <button
          type="button"
          className={[styles.trigger, hasCartItems ? styles.triggerHasItems : ''].filter(Boolean).join(' ')}
          onClick={goToCart}
          aria-label={cartTriggerAria}
        >
          {cartIcon}
          {cartCount > 0 && (
            <span className={styles.badge} aria-hidden="true">
              {cartCount}
            </span>
          )}
        </button>
      </div>

      {showMobileFab &&
        createPortal(
          <button
            type="button"
            className={styles.fab}
            style={{ '--fab-lift': `${fabLift}px` } as CSSProperties}
            onClick={goToCart}
            aria-label={cartTriggerAria}
          >
            {followOrder ? (
              <GiftIcon size={24} />
            ) : (
              <svg width="24" height="24" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M2 2h1.2l.9 8.1a1.4 1.4 0 0 0 1.4 1.25h6.2a1.4 1.4 0 0 0 1.38-1.16l.82-4.7H4.4"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="6.2" cy="13.4" r="1" fill="currentColor" />
                <circle cx="11" cy="13.4" r="1" fill="currentColor" />
              </svg>
            )}
            <span className={styles.badge} aria-hidden="true">
              {cartCount}
            </span>
          </button>,
          document.body,
        )}

      {wantsOpen && !open && !hasActiveModal && <LoadingModal message={t.cart.drawerLoading} />}

      {open && (
        <LazyCartDrawer
          items={items}
          extraSets={extraSets}
          productsById={productsById}
          gallerySets={gallerySets}
          notice={notice}
          busy={pendingAdd !== null}
          loading={!drawerReady}
          showContinueShopping={showContinueShopping}
          creditHeldStock={activeCart?.kind === 'gift'}
          onRemove={removeFromCart}
          cartLocked={extraLocked}
          onClose={dismissDrawerToGallery}
          onGoToCart={goToCart}
        />
      )}
    </>
  );
}
