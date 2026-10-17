/** Favorite persistence API. */
import { authHeaders, requestJson as request } from './client';

/** Payload shapes come from the backend contract (`npm run sync:contract`
 * in pamsurin-back). Do not redeclare them here. */
import type { Favorite } from './contract/favorites';

export type { Favorite };

export function listFavorites(accessToken: string): Promise<{ success: true; favorites: Favorite[] }> {
  return request('/account/favorites', { headers: authHeaders(accessToken) });
}

/** Upsert — also used to persist a shape-tab switch on an already-favorited
 * item, not just the initial favoriting (see useGalleryFavorites.tsx). */
export function upsertFavorite(
  accessToken: string,
  productId: string,
  shapeKey: string,
  lengthKey: string,
  variationKey = '',
): Promise<{ success: true }> {
  return request('/account/favorites', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ productId, shapeKey, lengthKey, variationKey }),
  });
}

export function removeFavorite(
  accessToken: string,
  productId: string,
): Promise<{ success: true; deleted: boolean }> {
  return request(`/account/favorites/${encodeURIComponent(productId)}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
}
