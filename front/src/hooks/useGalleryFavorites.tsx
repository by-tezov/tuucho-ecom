import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuthSession } from '../state/AuthContext';
import * as authApi from '../api/favorites';
import { loadGuestState, saveGuestState } from '../state/guestCart';

/** A remembered variant is stored as one composite string so the favorites
 * map stays a flat `Record<productId, string>` on both the guest and the
 * account side. */
export interface FavoriteVariant {
  shapeKey: string;
  lengthKey: string;
  /** Single nails with variations: the option last viewed; `''` otherwise. */
  variationKey: string;
}

/** `<shape>::<length>` or, with a variation option, `<shape>::<length>::<option>`. */
function encodeVariant(shapeKey: string, lengthKey: string, variationKey = ''): string {
  return variationKey ? `${shapeKey}::${lengthKey}::${variationKey}` : `${shapeKey}::${lengthKey}`;
}

/** Cached per encoded value: memoized gallery cards receive a stable identity. */
const decodedVariants = new Map<string, FavoriteVariant>();

function decodeVariant(value: string | undefined): FavoriteVariant | undefined {
  if (value === undefined) return undefined;
  let decoded = decodedVariants.get(value);
  if (!decoded) {
    const [shapeKey = '', lengthKey = '', variationKey = ''] = value.split('::');
    decoded = { shapeKey, lengthKey, variationKey };
    decodedVariants.set(value, decoded);
  }
  return decoded;
}

interface GalleryFavoritesContextValue {
  favoriteIds: string[];
  isFavorite: (id: string) => boolean;
  /** Anonymous: favorited locally (see state/guestCart.ts), merged into the
   * account on login by GuestSyncBridge.tsx — no login prompt. The
   * shape/length are the variant active when the heart was clicked, so a
   * freshly favorited item remembers it from the start (see
   * FavoriteButton.tsx/GalleryCard.tsx). */
  toggleFavorite: (id: string, shapeKey: string, lengthKey: string, variationKey?: string) => void;
  /** Which variant was last viewed for a favorited item — a favorited item
   * is the one case where the same item renders twice at once (its
   * favorites-strip card and its main-grid card), so this keeps the two in
   * sync. */
  getFavoriteVariant: (id: string) => FavoriteVariant | undefined;
  setFavoriteVariant: (id: string, shapeKey: string, lengthKey: string, variationKey?: string) => void;
}

const GalleryFavoritesContext = createContext<GalleryFavoritesContextValue | null>(null);

export function GalleryFavoritesProvider({ children }: { children: ReactNode }) {
  const { status, user, authedRequest } = useAuthSession();
  // id -> "<shapeKey>::<lengthKey>". Account-backed once authenticated; localStorage-backed
  // (see state/guestCart.ts) while anonymous, merged into the account on
  // login by GuestSyncBridge.tsx.
  const [favoriteVariants, setFavoriteVariantsState] = useState<Record<string, string>>({});
  const favoriteVariantsRef = useRef(favoriteVariants);
  const mutationVersionRef = useRef(new Map<string, number>());
  const mutationQueueRef = useRef(new Map<string, Promise<void>>());
  const loadGenerationRef = useRef(0);
  const accountIdRef = useRef<string | null>(user?.id ?? null);
  accountIdRef.current = user?.id ?? null;

  const replaceFavorites = useCallback((next: Record<string, string>) => {
    favoriteVariantsRef.current = next;
    setFavoriteVariantsState(next);
  }, []);
  const updateFavorite = useCallback((id: string, variant: string | null) => {
    const current = favoriteVariantsRef.current;
    const next = { ...current };
    if (variant === null) delete next[id];
    else next[id] = variant;
    favoriteVariantsRef.current = next;
    setFavoriteVariantsState(next);
  }, []);

  const enqueueAccountMutation = useCallback(
    (id: string, variant: string | null) => {
      const accountId = accountIdRef.current;
      const version = (mutationVersionRef.current.get(id) ?? 0) + 1;
      mutationVersionRef.current.set(id, version);
      const previous = mutationQueueRef.current.get(id) ?? Promise.resolve();
      const queued = previous
        .catch(() => undefined)
        .then(async () => {
          // Queued work from a just-logged-out account must never run using
          // the next account's access token.
          if (!accountId || accountIdRef.current !== accountId) return;
          try {
            if (variant === null) {
              await authedRequest((token) => authApi.removeFavorite(token, id));
            } else {
              const decoded = decodeVariant(variant)!;
              await authedRequest((token) =>
                authApi.upsertFavorite(token, id, decoded.shapeKey, decoded.lengthKey, decoded.variationKey),
              );
            }
          } catch {
            // Never roll an older failure back over a newer click. For the
            // final failed mutation, reconcile just this id from the server.
            if (accountIdRef.current !== accountId || mutationVersionRef.current.get(id) !== version) return;
            try {
              const result = await authedRequest((token) => authApi.listFavorites(token));
              if (accountIdRef.current !== accountId || mutationVersionRef.current.get(id) !== version)
                return;
              const server = result.favorites.find((favorite) => favorite.productId === id);
              updateFavorite(
                id,
                server ? encodeVariant(server.shapeKey, server.lengthKey, server.variationKey) : null,
              );
            } catch {
              // Keep the optimistic value when reconciliation is unavailable;
              // a later provider load will recover the authoritative state.
            }
          }
        });
      mutationQueueRef.current.set(id, queued);
      void queued.finally(() => {
        if (mutationQueueRef.current.get(id) === queued) mutationQueueRef.current.delete(id);
      });
    },
    [authedRequest, updateFavorite],
  );

  useEffect(() => {
    const loadGeneration = ++loadGenerationRef.current;
    const accountId = user?.id ?? null;
    const mutationsAtStart = new Map(mutationVersionRef.current);
    if (status === 'anonymous') {
      replaceFavorites(loadGuestState().favorites);
      return;
    }
    if (status !== 'authenticated') {
      replaceFavorites({});
      return;
    }
    let cancelled = false;
    authedRequest((token) => authApi.listFavorites(token))
      .then((result) => {
        if (cancelled) return;
        if (loadGenerationRef.current !== loadGeneration) return;
        if (accountIdRef.current !== accountId) return;
        // A list response started before a click must not erase that optimistic
        // click. The click's serialized mutation will settle its own product.
        if (
          mutationsAtStart.size !== mutationVersionRef.current.size ||
          [...mutationVersionRef.current].some(([id, version]) => mutationsAtStart.get(id) !== version)
        )
          return;
        replaceFavorites(
          Object.fromEntries(
            result.favorites.map((f) => [
              f.productId,
              encodeVariant(f.shapeKey, f.lengthKey, f.variationKey),
            ]),
          ),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [status, user?.id, authedRequest, replaceFavorites]);

  const favoriteIds = useMemo(() => Object.keys(favoriteVariants), [favoriteVariants]);
  const isFavorite = useCallback((id: string) => id in favoriteVariants, [favoriteVariants]);
  const getFavoriteVariant = useCallback(
    (id: string) => decodeVariant(favoriteVariants[id]),
    [favoriteVariants],
  );

  const setFavoriteVariant = useCallback(
    (id: string, shapeKey: string, lengthKey: string, variationKey = '') => {
      const encoded = encodeVariant(shapeKey, lengthKey, variationKey);
      if (!(id in favoriteVariantsRef.current)) return;
      if (favoriteVariantsRef.current[id] === encoded) return;
      updateFavorite(id, encoded);
      if (status === 'anonymous') saveGuestState({ favorites: favoriteVariantsRef.current });
      else if (status === 'authenticated') enqueueAccountMutation(id, encoded);
    },
    [status, enqueueAccountMutation, updateFavorite],
  );

  const toggleFavorite = useCallback(
    (id: string, shapeKey: string, lengthKey: string, variationKey = '') => {
      const encoded = encodeVariant(shapeKey, lengthKey, variationKey);
      const wasFavorite = id in favoriteVariantsRef.current;
      if (status === 'anonymous') {
        updateFavorite(id, wasFavorite ? null : encoded);
        saveGuestState({ favorites: favoriteVariantsRef.current });
        return;
      }
      if (status !== 'authenticated') return;
      updateFavorite(id, wasFavorite ? null : encoded);
      enqueueAccountMutation(id, wasFavorite ? null : encoded);
    },
    [status, enqueueAccountMutation, updateFavorite],
  );

  const value = useMemo(
    () => ({ favoriteIds, isFavorite, toggleFavorite, getFavoriteVariant, setFavoriteVariant }),
    [favoriteIds, isFavorite, toggleFavorite, getFavoriteVariant, setFavoriteVariant],
  );

  return <GalleryFavoritesContext.Provider value={value}>{children}</GalleryFavoritesContext.Provider>;
}

export function useGalleryFavorites(): GalleryFavoritesContextValue {
  const context = useContext(GalleryFavoritesContext);
  if (!context) throw new Error('useGalleryFavorites must be used within GalleryFavoritesProvider');
  return context;
}
