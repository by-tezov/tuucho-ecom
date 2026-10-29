import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuthSession } from '../state/AuthContext';
import * as authApi from '../api/cart';
import type { CartItem, CartSummary, Size } from '../api/cart';
import { fetchCartRules } from '../api/gallery';
import { deleteReceiverItem, putReceiverItem } from '../api/gift';
import { useLang } from '../assets/i18n';
import { loadGuestState, saveGuestState, type GuestCartLine } from '../state/guestCart';
import {
  extraSetPreviewUnits,
  extraSetsFromUnknown,
  extraSetLocked,
  extraSetUnitCount,
  paidCatalogueSetQuantity,
} from '../utils/cartExtra';
import { clearEphemeralAddresses } from '../state/ephemeralAddresses';
import { clearEphemeralCards } from '../state/ephemeralCards';
import { previewGiftLines, type PublicCartRule } from '../utils/cartRulesPreview';
import { useOptionalGiftReceiver } from './useGiftReceiver';
import { useCartCommentCommands } from './useCartCommentCommands';
import { usePendingAdd } from './usePendingAdd';
import { useGuestCartPrune } from './useGuestCartPrune';
import { useCartListCommands } from './useCartListCommands';
import { giftItemsToCart, sameLine } from '../utils/cartLines';
import {
  CartCommandsContext,
  CartDataContext,
  CartOverlayContext,
  type CartCommandsContextValue,
  type CartDataContextValue,
  type CartOverlayContextValue,
  type JustAddedItem,
} from './cartContext';

/** The cart state and commands behind hooks/useCart.tsx's three hooks. Only
 * the app entry points mount it (main.tsx, entry-server.tsx). */
export function CartProvider({ children }: { children: ReactNode }) {
  const { status, user, authedRequest } = useAuthSession();
  const { lang } = useLang();
  const gift = useOptionalGiftReceiver();
  const [items, setItems] = useState<CartItem[]>([]);
  const [extraSets, setExtraSetsState] = useState<unknown[]>([]);
  const [guestGiftRules, setGuestGiftRules] = useState<PublicCartRule[]>([]);
  const [carts, setCarts] = useState<CartSummary[]>([]);
  const [cartLimit, setCartLimit] = useState(10);
  const [loadedForStatus, setLoadedForStatus] = useState<'authenticated' | 'anonymous' | null>(null);
  const [justAdded, setJustAdded] = useState<JustAddedItem | null>(null);
  const [justRebought, setJustRebought] = useState(false);
  const [cartError, setCartError] = useState<JustAddedItem | null>(null);
  const itemsRef = useRef(items);
  const extraSetsRef = useRef(extraSets);
  const cartsRef = useRef(carts);
  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const mutationGenerationRef = useRef(0);
  const cartReadGenerationRef = useRef(0);
  const cartsReadGenerationRef = useRef(0);
  const sessionKeyRef = useRef(`${status}:${user?.id ?? ''}`);
  sessionKeyRef.current = `${status}:${user?.id ?? ''}`;

  /** Server mutations are ordered so a fast quantity/remove sequence reaches
   * the API in the same order the customer issued it. Every start/end also
   * invalidates reads that could have observed an intermediate cart. */
  const enqueueMutation = useCallback((work: () => Promise<unknown>): Promise<void> => {
    const sessionKey = sessionKeyRef.current;
    mutationGenerationRef.current += 1;
    const run = () => (sessionKeyRef.current === sessionKey ? work() : Promise.resolve());
    const queued = mutationQueueRef.current.then(run, run).then(() => undefined);
    mutationQueueRef.current = queued.catch(() => undefined);
    return queued.finally(() => {
      mutationGenerationRef.current += 1;
    });
  }, []);

  useEffect(() => {
    itemsRef.current = items;
    extraSetsRef.current = extraSets;
    cartsRef.current = carts;
  }, [carts, extraSets, items]);

  const setExtraSets = useCallback((next: unknown[]) => {
    extraSetsRef.current = next;
    setExtraSetsState(next);
  }, []);

  const activeCart = useMemo(() => carts.find((cart) => cart.isActive) ?? null, [carts]);
  const visibleItems = useMemo(() => {
    // Signed-in shop carts already carry server-synced `origin=rule` lines.
    // Guest carts and the gift-lock basket persist only chosen nails, so the
    // same public rules preview the locked free gifts the server will add
    // at Marc’s checkout (or at guest login merge).
    if (!gift.active && status !== 'anonymous') return items;
    const giftLines: CartItem[] = previewGiftLines(guestGiftRules, {
      setUnits: paidCatalogueSetQuantity(items),
      extraSets: extraSetPreviewUnits(extraSets),
    }).map(({ productId, quantity }) => ({
      productId,
      shapeKey: '',
      lengthKey: '',
      size: '',
      quantity,
      origin: 'rule',
      locked: true,
      packKey: '',
    }));
    return [...items, ...giftLines];
  }, [extraSets, gift.active, guestGiftRules, items, status]);

  // Guests keep only their chosen products in local storage. Fetching these
  // public rules lets the UI show the gift lines that the server will create
  // when that cart is merged during login; no rule-owned line is persisted or
  // trusted by the browser. Gift lock uses the same preview (Julie cannot
  // pick those accessories; they are not stored on gift_items).
  useEffect(() => {
    if (!gift.active && status !== 'anonymous') {
      setGuestGiftRules([]);
      return;
    }
    let cancelled = false;
    void fetchCartRules(lang)
      .then((rules) => {
        if (!cancelled) setGuestGiftRules(rules);
      })
      .catch(() => {
        if (!cancelled) setGuestGiftRules([]);
      });
    return () => {
      cancelled = true;
    };
  }, [gift.active, lang, status]);

  /** List summaries (`GET /account/carts`) + active cart lines (`GET /account/cart`)
   * only — other carts stay summary-only until activated. */
  const refreshCarts = useCallback(
    async (options?: { beforeApplyChange?: () => Promise<void> }) => {
      if (gift.active) {
        const nextItems = giftItemsToCart(gift.summary?.items ?? []);
        const nextExtra = extraSetsFromUnknown(gift.summary?.extra);
        const changed =
          JSON.stringify(nextItems) !== JSON.stringify(itemsRef.current) ||
          JSON.stringify(nextExtra) !== JSON.stringify(extraSetsRef.current) ||
          cartsRef.current.length > 0;
        if (changed) await options?.beforeApplyChange?.();
        itemsRef.current = nextItems;
        extraSetsRef.current = nextExtra;
        cartsRef.current = [];
        setItems(nextItems);
        setExtraSetsState(nextExtra);
        setCarts([]);
        return changed;
      }
      if (status === 'anonymous') {
        const guest = loadGuestState();
        const nextItems = guest.cart;
        const nextExtra = extraSetsFromUnknown(guest.extra);
        const changed =
          JSON.stringify(nextItems) !== JSON.stringify(itemsRef.current) ||
          JSON.stringify(nextExtra) !== JSON.stringify(extraSetsRef.current) ||
          cartsRef.current.length > 0;
        if (changed) await options?.beforeApplyChange?.();
        itemsRef.current = nextItems;
        extraSetsRef.current = nextExtra;
        cartsRef.current = [];
        setItems(nextItems);
        setExtraSetsState(nextExtra);
        setCarts([]);
        return changed;
      }
      if (status !== 'authenticated') {
        const changed =
          itemsRef.current.length > 0 || extraSetsRef.current.length > 0 || cartsRef.current.length > 0;
        if (changed) await options?.beforeApplyChange?.();
        itemsRef.current = [];
        extraSetsRef.current = [];
        cartsRef.current = [];
        setItems([]);
        setExtraSetsState([]);
        setCarts([]);
        return changed;
      }
      const readGeneration = ++cartsReadGenerationRef.current;
      const mutationGeneration = mutationGenerationRef.current;
      const sessionKey = sessionKeyRef.current;
      const [cartsResult, itemsResult] = await Promise.all([
        authedRequest((token) => authApi.listCarts(token)),
        authedRequest((token) => authApi.listCart(token)),
      ]);
      if (
        cartsReadGenerationRef.current !== readGeneration ||
        mutationGenerationRef.current !== mutationGeneration ||
        sessionKeyRef.current !== sessionKey
      )
        return false;
      const nextExtra = extraSetsFromUnknown(itemsResult.extra);
      const changed =
        JSON.stringify(cartsResult.carts) !== JSON.stringify(cartsRef.current) ||
        JSON.stringify(itemsResult.items) !== JSON.stringify(itemsRef.current) ||
        JSON.stringify(nextExtra) !== JSON.stringify(extraSetsRef.current);
      if (changed) await options?.beforeApplyChange?.();
      cartsRef.current = cartsResult.carts;
      itemsRef.current = itemsResult.items;
      extraSetsRef.current = nextExtra;
      setCarts(cartsResult.carts);
      setCartLimit(cartsResult.cartLimit ?? 10);
      setItems(itemsResult.items);
      setExtraSetsState(nextExtra);
      return changed;
    },
    [authedRequest, gift.active, gift.summary, status],
  );

  const refreshCart = useCallback(() => {
    if (gift.active) {
      return gift.refresh();
    }
    if (status === 'anonymous') {
      const guest = loadGuestState();
      setItems(guest.cart);
      setExtraSetsState(extraSetsFromUnknown(guest.extra));
      return Promise.resolve();
    }
    if (status !== 'authenticated') {
      setItems([]);
      setExtraSetsState([]);
      return Promise.resolve();
    }
    // Gift/rule lines are rebuilt server-side on every add/update/remove.
    // Callers that mutate the cart must wait on this so a leftover kit
    // cannot keep checkout open after the last paid line is gone.
    const readGeneration = ++cartReadGenerationRef.current;
    const mutationGeneration = mutationGenerationRef.current;
    const sessionKey = sessionKeyRef.current;
    return authedRequest((token) => authApi.listCart(token)).then((result) => {
      if (
        cartReadGenerationRef.current !== readGeneration ||
        mutationGenerationRef.current !== mutationGeneration ||
        sessionKeyRef.current !== sessionKey
      )
        return;
      setItems(result.items);
      setExtraSetsState(extraSetsFromUnknown(result.extra));
    });
  }, [authedRequest, gift, status]);

  useGuestCartPrune({ status, giftActive: gift.active, items, lang, refreshCart });

  useEffect(() => {
    if (!gift.active) return;
    const nextItems = giftItemsToCart(gift.summary?.items ?? []);
    const nextExtra = extraSetsFromUnknown(gift.summary?.extra);
    itemsRef.current = nextItems;
    extraSetsRef.current = nextExtra;
    cartsRef.current = [];
    setItems(nextItems);
    setExtraSetsState(nextExtra);
    setCarts([]);
  }, [gift.active, gift.summary]);

  useEffect(() => {
    if (gift.active) return;
    if (status === 'loading') return;
    let cancelled = false;
    void refreshCarts().then(
      () => {
        if (!cancelled) setLoadedForStatus(status);
      },
      () => {
        // The global backend-health UI owns request failures. Keep cartReady
        // false so the page never presents a failed load as an empty cart.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [gift.active, refreshCarts, status]);

  // Server discards one_time_available rows when the active cart has no user
  // lines; mirror that in the encrypted session vault so the UI cannot keep
  // offering not-remembered addresses/cards for the next cart.
  useEffect(() => {
    if (status !== 'authenticated' || loadedForStatus !== 'authenticated') return;
    const hasUserLines = items.some((item) => item.origin !== 'rule');
    if (hasUserLines) return;
    clearEphemeralAddresses();
    clearEphemeralCards();
  }, [items, loadedForStatus, status]);

  const cartReady = gift.active
    ? gift.ready && status !== 'loading'
    : status !== 'loading' && loadedForStatus === status;
  const cartCount = useMemo(() => {
    const lineQty = visibleItems
      .filter((item) => item.origin !== 'rule')
      .reduce((sum, item) => sum + item.quantity, 0);
    return lineQty + extraSetUnitCount(extraSets);
  }, [extraSets, visibleItems]);
  const hasCartItems = useMemo(
    () => cartCount > 0 || carts.some((cart) => cart.itemCount > 0),
    [cartCount, carts],
  );
  const isInCart = useCallback(
    (productId: string) => visibleItems.some((item) => item.productId === productId),
    [visibleItems],
  );
  const getCartLine = useCallback(
    (productId: string) => visibleItems.find((item) => item.productId === productId),
    [visibleItems],
  );
  const getCartLineFor = useCallback(
    (productId: string, shapeKey: string, lengthKey: string, size: Size | '') =>
      visibleItems.find((item) => sameLine(item, productId, shapeKey, lengthKey, size)),
    [visibleItems],
  );
  const dismissJustAdded = useCallback(() => {
    setJustAdded(null);
    setJustRebought(false);
  }, []);
  const dismissCartError = useCallback(() => {
    setCartError(null);
  }, []);

  const modalCloseRef = useRef<(() => void) | null>(null);
  const [hasActiveModal, setHasActiveModal] = useState(false);
  const registerModalClose = useCallback((close: (() => void) | null) => {
    modalCloseRef.current = close;
    setHasActiveModal(close !== null);
  }, []);
  const closeActiveModal = useCallback(() => {
    modalCloseRef.current?.();
  }, []);

  const { createCart, renameCart, activateCart, deleteCart, mergeIntoActive, moveToWishlist, rebuyOrder } =
    useCartListCommands({
      status,
      carts,
      authedRequest,
      enqueueMutation,
      refreshCarts,
      setItems,
      setJustAdded,
      setJustRebought,
      setCartError,
    });

  const commentCommands = useCartCommentCommands({
    status,
    gift,
    authedRequest,
    enqueueMutation,
    refreshCart,
    setItems,
  });

  const addToCartNow = useCallback(
    async (
      productId: string,
      shapeKey: string,
      lengthKey: string,
      size: Size,
      display: JustAddedItem,
      quantity = 1,
      maxQuantity = Infinity,
      // The cart page's own "add as new line" action (changing a line's
      // shape/size) also goes through this — false there, since the
      // customer is already looking at the full cart and doesn't need the
      // header drawer's "added to cart" notice popping up over it too.
      notify = true,
      packKey = '',
    ) => {
      // A second tab can skip the animated splash while AuthProvider and the
      // cart are still restoring their persisted session. Never turn a tap
      // in that short window into an authenticated request without a token
      // (or, worse, an optimistic line that was not saved anywhere).
      if (!cartReady) return;
      if (gift.active) {
        if (!gift.canMutate || !gift.token) return;
        const existing = items.find((item) => sameLine(item, productId, shapeKey, lengthKey, size));
        const room = maxQuantity - (existing?.quantity ?? 0);
        if (room <= 0) {
          if (notify) {
            setCartError(display);
            setJustAdded(null);
            setJustRebought(false);
          }
          return;
        }
        const toAdd = Math.min(quantity, room);
        const nextQty = (existing?.quantity ?? 0) + toAdd;
        try {
          await enqueueMutation(async () => {
            const summary = await putReceiverItem(gift.token!, {
              productId,
              shapeKey,
              lengthKey,
              size,
              packKey,
              quantity: nextQty,
            });
            gift.applySummary(summary);
            // Apply lines in this turn, same as the guest path. Waiting for the
            // summary effect leaves `justAdded` with an empty `items` array, so
            // the header drawer hydrates empty then unmounts before products
            // arrive.
            const nextItems = giftItemsToCart(summary.items);
            itemsRef.current = nextItems;
            setItems(nextItems);
          });
          if (notify) {
            setJustAdded(display);
            setJustRebought(false);
            setCartError(null);
          }
        } catch {
          if (notify) {
            setCartError(display);
            setJustAdded(null);
            setJustRebought(false);
          }
          await gift.refresh();
        }
        return;
      }
      if (status === 'anonymous') {
        const current = loadGuestState().cart;
        const existing = current.find((item) => sameLine(item, productId, shapeKey, lengthKey, size));
        const room = maxQuantity - (existing?.quantity ?? 0);
        if (room <= 0) {
          if (notify) {
            setCartError(display);
            setJustAdded(null);
            setJustRebought(false);
          }
          return;
        }
        const toAdd = Math.min(quantity, room);
        const next: GuestCartLine[] = existing
          ? current.map((item) =>
              item === existing
                ? { ...item, quantity: item.quantity + toAdd, packKey: packKey || item.packKey || '' }
                : item,
            )
          : [...current, { productId, shapeKey, lengthKey, size, quantity: toAdd, packKey }];
        saveGuestState({ cart: next });
        setItems(next);
        if (notify) {
          setJustAdded(display);
          setJustRebought(false);
          setCartError(null);
        }
        return;
      }
      // Room is checked against the same `items` state the rest of the app
      // treats as authoritative (getCartLineFor, cartCount, ...) — kept in
      // sync by the optimistic updates below and refreshCart(). Stock
      // itself can still shrink server-side between this check and the
      // request landing; that case is still caught below, same as before.
      const existingQuantity =
        items.find((item) => sameLine(item, productId, shapeKey, lengthKey, size))?.quantity ?? 0;
      const room = maxQuantity - existingQuantity;
      if (room <= 0) {
        if (notify) {
          setCartError(display);
          setJustAdded(null);
          setJustRebought(false);
        }
        return;
      }
      const toAdd = Math.min(quantity, room);
      // Optimistic — reconciled with the server's actual state via
      // refreshCart() either way below. The server is the one that
      // actually enforces stock (see account.routes.ts's POST /cart), so a
      // rejection here (e.g. the size sold out a moment ago) must roll this
      // back rather than leave a phantom line the customer never really
      // got — justAdded is likewise only shown once the add is confirmed,
      // not optimistically.
      setItems((current) => {
        const existing = current.find((item) => sameLine(item, productId, shapeKey, lengthKey, size));
        if (!existing) {
          return [...current, { productId, shapeKey, lengthKey, size, quantity: toAdd, packKey }];
        }
        return current.map((item) =>
          item === existing
            ? { ...item, quantity: item.quantity + toAdd, packKey: packKey || item.packKey || '' }
            : item,
        );
      });
      // Deliberately settles (never rejects) either way — a failure is
      // already communicated through cartError/refreshCart's rollback, not
      // through this promise; a caller awaiting it (e.g. the accessory
      // carousel's loading dialog) just needs to know when it's done, not
      // re-handle an error the cart state already shows.
      await enqueueMutation(() =>
        authedRequest((token) =>
          authApi.addToCart(token, productId, shapeKey, lengthKey, size, toAdd, packKey),
        ),
      )
        .then(() => {
          if (notify) {
            setJustAdded(display);
            setJustRebought(false);
            setCartError(null);
          }
          refreshCart();
        })
        .catch(() => {
          if (notify) setCartError(display);
          refreshCart();
        });
    },
    [authedRequest, cartReady, enqueueMutation, gift, items, refreshCart, status],
  );
  const { pendingAdd, addToCart, wrapNotifiedAdd } = usePendingAdd({
    cartReady,
    addToCartNow,
    setJustAdded,
    setJustRebought,
    setCartError,
  });
  const notifyCartAdded = useCallback((display: JustAddedItem) => {
    setJustRebought(false);
    setCartError(null);
    setJustAdded(display);
  }, []);

  const toggleCart = useCallback(
    (
      productId: string,
      shapeKey: string,
      lengthKey: string,
      size: Size,
      display: JustAddedItem,
      maxQuantity = Infinity,
    ) => {
      if (!cartReady) return;
      if (isInCart(productId)) {
        if (gift.active && gift.token) {
          if (!gift.canMutate) return;
          const linesToRemove = items.filter((item) => item.productId === productId);
          void enqueueMutation(async () => {
            let summary = gift.summary;
            for (const line of linesToRemove) {
              summary = await deleteReceiverItem(gift.token!, {
                productId: line.productId,
                shapeKey: line.shapeKey,
                lengthKey: line.lengthKey,
                size: line.size,
              });
            }
            if (summary) gift.applySummary(summary);
          }).then(
            () => undefined,
            () => void gift.refresh(),
          );
          return;
        }
        if (status === 'anonymous') {
          const next = loadGuestState().cart.filter((item) => item.productId !== productId);
          saveGuestState({ cart: next });
          setItems(next);
          return;
        }
        const linesToRemove = items.filter((item) => item.productId === productId);
        setItems((current) => current.filter((item) => item.productId !== productId));
        void enqueueMutation(() =>
          Promise.all(
            linesToRemove.map((line) =>
              authedRequest((token) =>
                authApi.removeFromCart(token, line.productId, line.shapeKey, line.lengthKey, line.size),
              ),
            ),
          ).then(() => undefined),
        ).then(refreshCart, refreshCart);
        return;
      }
      addToCart(productId, shapeKey, lengthKey, size, display, 1, maxQuantity);
    },
    [addToCart, authedRequest, cartReady, enqueueMutation, gift, isInCart, items, refreshCart, status],
  );

  const updateCartLine = useCallback(
    async (
      productId: string,
      shapeKey: string,
      lengthKey: string,
      size: Size | '',
      patch: Partial<{ shapeKey: string; lengthKey: string; size: Size; quantity: number; packKey: string }>,
    ) => {
      const lockedLine = items.find(
        (item) =>
          sameLine(item, productId, shapeKey, lengthKey, size) && (item.locked || item.origin === 'rule'),
      );
      if (lockedLine) return;

      if (gift.active && gift.token) {
        if (!gift.canMutate) return;
        const line = items.find((item) => sameLine(item, productId, shapeKey, lengthKey, size));
        if (!line) return;
        const changesSelection =
          patch.shapeKey !== undefined || patch.lengthKey !== undefined || patch.size !== undefined;
        const toShapeKey = patch.shapeKey ?? shapeKey;
        const toLengthKey = patch.lengthKey ?? lengthKey;
        const toSize = patch.size ?? size;
        const nextQuantity = patch.quantity ?? line.quantity;
        try {
          await enqueueMutation(async () => {
            if (nextQuantity <= 0) {
              gift.applySummary(
                await deleteReceiverItem(gift.token!, { productId, shapeKey, lengthKey, size }),
              );
              return;
            }
            if (changesSelection && !sameLine(line, productId, toShapeKey, toLengthKey, toSize)) {
              const destination = items.find((item) =>
                sameLine(item, productId, toShapeKey, toLengthKey, toSize),
              );
              const destQty = (destination?.quantity ?? 0) + nextQuantity;
              gift.applySummary(
                await putReceiverItem(gift.token!, {
                  productId,
                  shapeKey: toShapeKey,
                  lengthKey: toLengthKey,
                  size: toSize,
                  packKey: patch.packKey ?? line.packKey ?? '',
                  quantity: destQty,
                }),
              );
              gift.applySummary(
                await deleteReceiverItem(gift.token!, { productId, shapeKey, lengthKey, size }),
              );
              return;
            }
            gift.applySummary(
              await putReceiverItem(gift.token!, {
                productId,
                shapeKey: toShapeKey,
                lengthKey: toLengthKey,
                size: toSize,
                packKey: patch.packKey ?? line.packKey ?? '',
                quantity: nextQuantity,
              }),
            );
          });
        } catch {
          await gift.refresh();
        }
        return;
      }

      const changesSelection =
        patch.shapeKey !== undefined || patch.lengthKey !== undefined || patch.size !== undefined;
      const toShapeKey = patch.shapeKey ?? shapeKey;
      const toLengthKey = patch.lengthKey ?? lengthKey;
      const toSize = patch.size ?? size;

      if (status === 'anonymous') {
        const current = loadGuestState().cart;
        const line = current.find((item) => sameLine(item, productId, shapeKey, lengthKey, size));
        if (!line) return;
        let next: GuestCartLine[];
        if (changesSelection) {
          // "Replace" lets the customer pick a quantity for the new
          // selection instead of just inheriting the old line's.
          const movingQuantity = patch.quantity ?? line.quantity;
          const withoutSource = current.filter((item) => item !== line);
          const destination = withoutSource.find((item) =>
            sameLine(item, productId, toShapeKey, toLengthKey, toSize),
          );
          next = destination
            ? withoutSource.map((item) =>
                item === destination ? { ...item, quantity: item.quantity + movingQuantity } : item,
              )
            : [
                ...withoutSource,
                {
                  ...line,
                  shapeKey: toShapeKey,
                  lengthKey: toLengthKey,
                  size: toSize,
                  quantity: movingQuantity,
                },
              ];
        } else {
          next = current.map((item) =>
            item === line
              ? {
                  ...item,
                  quantity: patch.quantity ?? item.quantity,
                  packKey: patch.packKey ?? item.packKey ?? '',
                }
              : item,
          );
        }
        saveGuestState({ cart: next });
        setItems(next);
        return;
      }

      if (changesSelection) {
        setItems((current) => {
          const line = current.find((item) => sameLine(item, productId, shapeKey, lengthKey, size));
          if (!line) return current;
          // "Replace" lets the customer pick a quantity for the new
          // selection instead of just inheriting the old line's — the
          // server applies the same override (see account.routes.ts's
          // PATCH .../:shapeKey/:lengthKey/:size).
          const movingQuantity = patch.quantity ?? line.quantity;
          const withoutSource = current.filter((item) => item !== line);
          const destination = withoutSource.find((item) =>
            sameLine(item, productId, toShapeKey, toLengthKey, toSize),
          );
          return destination
            ? withoutSource.map((item) =>
                item === destination ? { ...item, quantity: item.quantity + movingQuantity } : item,
              )
            : [
                ...withoutSource,
                {
                  ...line,
                  shapeKey: toShapeKey,
                  lengthKey: toLengthKey,
                  size: toSize,
                  quantity: movingQuantity,
                },
              ];
        });
      } else {
        setItems((current) =>
          current.map((item) =>
            sameLine(item, productId, shapeKey, lengthKey, size)
              ? {
                  ...item,
                  quantity: patch.quantity ?? item.quantity,
                  packKey: patch.packKey ?? item.packKey ?? '',
                }
              : item,
          ),
        );
      }
      // The server re-validates shape/length/size/quantity against stock
      // and applies the same merge-on-collision semantics (see
      // account.routes.ts's PATCH .../:shapeKey/:lengthKey/:size) — a
      // rejection must snap the optimistic edit above back to whatever's
      // actually on file. Always re-list afterwards: gift qty tracks nail
      // qty, so an optimistic patch of this one line is not the full cart.
      // Settles either way (never rejects): failures are already
      // communicated by that rollback, not through this promise.
      try {
        await enqueueMutation(() =>
          authedRequest((token) =>
            authApi.updateCartItem(token, productId, shapeKey, lengthKey, size, patch),
          ),
        );
      } finally {
        await refreshCart();
      }
    },
    [authedRequest, enqueueMutation, gift, items, refreshCart, status],
  );

  const removeFromCart = useCallback(
    async (productId: string, shapeKey: string, lengthKey: string, size: Size | '') => {
      const lockedLine = items.find(
        (item) =>
          sameLine(item, productId, shapeKey, lengthKey, size) && (item.locked || item.origin === 'rule'),
      );
      if (lockedLine) return;

      if (gift.active && gift.token) {
        if (!gift.canMutate) return;
        try {
          await enqueueMutation(async () => {
            gift.applySummary(
              await deleteReceiverItem(gift.token!, { productId, shapeKey, lengthKey, size }),
            );
          });
        } catch {
          await gift.refresh();
        }
        return;
      }

      if (status === 'anonymous') {
        const next = loadGuestState().cart.filter(
          (item) => !sameLine(item, productId, shapeKey, lengthKey, size),
        );
        saveGuestState({ cart: next });
        setItems(next);
        return;
      }
      setItems((current) => current.filter((item) => !sameLine(item, productId, shapeKey, lengthKey, size)));
      // Always re-list: the server drops gift/rule lines when the last
      // qualifying nail is gone, and that is not visible in this one DELETE.
      // Settles either way — a failure rolls back through refreshCart, not
      // through this promise.
      try {
        await enqueueMutation(() =>
          authedRequest((token) => authApi.removeFromCart(token, productId, shapeKey, lengthKey, size)),
        );
      } finally {
        await refreshCart();
      }
    },
    [authedRequest, enqueueMutation, gift, items, refreshCart, status],
  );

  const extraUnitCount = extraSetUnitCount(extraSets);
  const extraLocked = extraSetLocked(extraSets);

  const dataValue = useMemo<CartDataContextValue>(
    () => ({
      items: visibleItems,
      extraSets,
      extraUnitCount,
      extraLocked,
      carts,
      cartLimit,
      activeCart,
      cartReady,
      cartCount,
      hasCartItems,
      isInCart,
      getCartLine,
      getCartLineFor,
    }),
    [
      visibleItems,
      extraSets,
      extraUnitCount,
      extraLocked,
      carts,
      cartLimit,
      activeCart,
      cartReady,
      cartCount,
      hasCartItems,
      isInCart,
      getCartLine,
      getCartLineFor,
    ],
  );

  const commandsValue = useMemo<CartCommandsContextValue>(
    () => ({
      toggleCart,
      addToCart,
      rebuyOrder,
      updateCartLine,
      removeFromCart,
      refreshCart,
      refreshCarts,
      createCart,
      renameCart,
      activateCart,
      deleteCart,
      mergeIntoActive,
      moveToWishlist,
      setExtraSets,
      wrapNotifiedAdd,
      notifyCartAdded,
      ...commentCommands,
    }),
    [
      toggleCart,
      addToCart,
      rebuyOrder,
      updateCartLine,
      removeFromCart,
      refreshCart,
      refreshCarts,
      createCart,
      renameCart,
      activateCart,
      deleteCart,
      mergeIntoActive,
      moveToWishlist,
      setExtraSets,
      wrapNotifiedAdd,
      notifyCartAdded,
      commentCommands,
    ],
  );
  const overlayValue = useMemo<CartOverlayContextValue>(
    () => ({
      justAdded,
      dismissJustAdded,
      justRebought,
      cartError,
      dismissCartError,
      pendingAdd,
      hasActiveModal,
      registerModalClose,
      closeActiveModal,
    }),
    [
      justAdded,
      dismissJustAdded,
      justRebought,
      cartError,
      dismissCartError,
      pendingAdd,
      hasActiveModal,
      registerModalClose,
      closeActiveModal,
    ],
  );

  return (
    <CartDataContext.Provider value={dataValue}>
      <CartCommandsContext.Provider value={commandsValue}>
        <CartOverlayContext.Provider value={overlayValue}>{children}</CartOverlayContext.Provider>
      </CartCommandsContext.Provider>
    </CartDataContext.Provider>
  );
}
