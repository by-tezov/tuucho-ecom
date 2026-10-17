import { authHeaders, requestJson as request } from './client';
import { apiFetch } from './http';
import { preferredLanguage } from '../assets/i18n/languagePreference';
import type { GalleryItem } from '../data/types';
import type { Lang } from '../assets/i18n';
import type { Courier } from './account';
import type { CartComposition, CompositionWriteBody, Size } from './cart';
import {
  buildQuery,
  fetchProductsByIds,
  type FilterOptionsResult,
  type GalleryFeedParams,
  type GalleryFeedResult,
  type ProductById,
} from './gallery';
import { ApiError } from './errors';
import { markAuthSessionPresent, type AuthUser } from './identity';
import { galleryItemAsProduct } from '../utils/galleryItemAsProduct';
import { readGiftPinGrant, writeGiftPinGrant, type GiftPinRole } from './session/giftPinSession';

/** Payload shapes come from the backend contract (`npm run sync:contract`
 * in pamsurin-back). Do not redeclare them here. */
import type {
  AdminGiftEnter,
  AdminGiftOffer,
  GiftClocks,
  GiftDestination,
  GiftItem,
  GiftPublicSettings,
  GiftShareCardStyle,
  GiftStatus,
  GiftSummary,
} from './contract/gift';

export type {
  AdminGiftEnter,
  AdminGiftOffer,
  GiftClocks,
  GiftDestination,
  GiftItem,
  GiftPublicSettings,
  GiftShareCardStyle,
  GiftStatus,
  GiftSummary,
};

function giftPinHeaders(role: GiftPinRole, token: string, extra?: HeadersInit): HeadersInit {
  const pin = readGiftPinGrant(role, token);
  return {
    ...(pin ? { 'X-Gift-Pin-Token': pin } : {}),
    ...(extra ?? {}),
  };
}
export function receiverFollowsOrder(status: GiftStatus | null | undefined): boolean {
  return status != null && status !== 'selecting';
}
export function getGiftPublicSettings(): Promise<GiftPublicSettings> {
  return request('/gift/settings');
}

export function listAdminGiftOffers(
  accessToken: string,
  page = 1,
  pageSize = 20,
): Promise<{
  success: true;
  offers: AdminGiftOffer[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return request(`/admin/gift/offers?${params}`, {
    headers: authHeaders(accessToken),
  });
}

export function enterAdminGiftOffer(
  accessToken: string,
  offerId: string,
  role: AdminGiftEnter['role'],
): Promise<{ success: true } & AdminGiftEnter> {
  return request(`/admin/gift/offers/${encodeURIComponent(offerId)}/enter`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ role }),
  });
}

export function createGiftOffer(
  body: {
    giverEmail: string;
    giverDisplayName: string;
    receiverName: string;
    giverComment: string;
    shareCardStyle: GiftShareCardStyle;
    maxBudget: number;
    allowAccessories?: boolean;
    maxAccessoryBudget?: number | null;
    hideReceiverPrices?: boolean;
    language: Lang;
    accessPin: string;
    gdprConsent?: { accepted: boolean };
  },
  accessToken?: string,
): Promise<{
  success: true;
  checkEmail: boolean;
  status: GiftStatus;
  offerId: string;
  receiverUrl: string | null;
  cartId: string | null;
}> {
  return request('/gift/offers', {
    method: 'POST',
    ...(accessToken ? { headers: authHeaders(accessToken) } : {}),
    body: JSON.stringify(body),
  });
}

export async function unlockGiftPin(
  role: GiftPinRole,
  token: string,
  pin: string,
): Promise<{ success: true; pinToken: string; expiresAt: string }> {
  const path =
    role === 'giver'
      ? `/gift/giver/${encodeURIComponent(token)}/pin`
      : `/gift/${encodeURIComponent(token)}/pin`;
  const result = await request<{ success: true; pinToken: string; expiresAt: string }>(path, {
    method: 'POST',
    body: JSON.stringify({ pin }),
  });
  writeGiftPinGrant(role, token, result.pinToken);
  return result;
}

export function getGiverPortal(token: string, accessToken?: string): Promise<GiftSummary> {
  return request(`/gift/giver/${encodeURIComponent(token)}`, {
    headers: giftPinHeaders('giver', token, accessToken ? authHeaders(accessToken) : undefined),
  });
}

export function openGiftPay(
  token: string,
  accessToken?: string,
): Promise<{
  success: true;
  created: boolean;
  cartId: string;
  offerId: string;
  user: AuthUser;
  accessToken: string;
  accessTokenExpiresAt: string;
}> {
  return request<{
    success: true;
    created: boolean;
    cartId: string;
    offerId: string;
    user: AuthUser;
    accessToken: string;
    accessTokenExpiresAt: string;
  }>(`/gift/giver/${encodeURIComponent(token)}/open-pay`, {
    method: 'POST',
    headers: giftPinHeaders('giver', token, accessToken ? authHeaders(accessToken) : undefined),
  }).then((session) => {
    // Same hint as login / manage-guest-order: without it, a later cold
    // load treats the visitor as anonymous and skips POST /auth/refresh,
    // dropping a session cookie that would otherwise survive the tab.
    markAuthSessionPresent();
    return session;
  });
}

export function unlockGiftCart(token: string, accessToken: string): Promise<{ success: true }> {
  return request(`/gift/giver/${encodeURIComponent(token)}/unlock-cart`, {
    method: 'POST',
    headers: giftPinHeaders('giver', token, authHeaders(accessToken)),
  });
}

export function cancelGiftOffer(
  token: string,
  accessToken?: string,
): Promise<{ success: true; status: GiftStatus }> {
  return request(`/gift/giver/${encodeURIComponent(token)}/cancel`, {
    method: 'POST',
    headers: giftPinHeaders('giver', token, accessToken ? authHeaders(accessToken) : undefined),
  });
}

/** Gift cart status block's "Prolonger" button: pushes the offer expiry
 * back by two weeks. Refused with `gift_extend_limit` once the offer is
 * already parked as far out as the backend allows. */
export function extendGiftOffer(
  token: string,
  accessToken?: string,
): Promise<{ success: true; offerExpiresAt: string | null; canExtend: boolean }> {
  return request(`/gift/giver/${encodeURIComponent(token)}/extend`, {
    method: 'POST',
    headers: giftPinHeaders('giver', token, accessToken ? authHeaders(accessToken) : undefined),
  });
}

export function patchGiftShareCard(
  token: string,
  patch: { receiverName: string; giverComment: string; shareCardStyle: GiftShareCardStyle },
  accessToken?: string,
): Promise<{
  success: true;
  receiverName: string;
  giverComment: string;
  shareCardStyle: GiftShareCardStyle;
}> {
  return request(`/gift/giver/${encodeURIComponent(token)}/share-card`, {
    method: 'PATCH',
    headers: giftPinHeaders('giver', token, accessToken ? authHeaders(accessToken) : undefined),
    body: JSON.stringify(patch),
  });
}

/** Unlike every other call in this file, the response body is a raw file,
 * not JSON — fetches directly instead of going through request<T>() (which
 * always parses the body as JSON and would silently lose the file), then
 * triggers the browser's native download via a throwaway blob URL. Same
 * shape as `downloadInvoice` in `api/orders.ts`. Purely a download, no
 * email side effect — see emailGiftShareCard below for the modal's other
 * choice. */
export async function downloadGiftShareCard(
  token: string,
  format: 'pdf' | 'jpg',
  accessToken?: string,
): Promise<void> {
  const response = await apiFetch(
    `/gift/giver/${encodeURIComponent(token)}/share-card/download?format=${format}`,
    {
      credentials: 'include',
      headers: {
        ...giftPinHeaders('giver', token, accessToken ? authHeaders(accessToken) : undefined),
        'Accept-Language': preferredLanguage(),
      },
    },
  );
  if (!response.ok) {
    let code = 'unknown_error';
    try {
      const body = (await response.json()) as { error?: { code?: string } };
      code = body.error?.code ?? code;
    } catch {
      // Non-JSON error body — fall through with the generic code.
    }
    throw new ApiError(code, response.status);
  }

  const blob = await response.blob();
  const filename =
    response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ??
    `carte-cadeau.${format === 'jpg' ? 'jpg' : 'pdf'}`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** The download modal's "Recevoir par email" choice — same share-card files
 * as offer creation, sent to the giver's own account email. */
export function emailGiftShareCard(token: string, accessToken?: string): Promise<{ success: true }> {
  return request(`/gift/giver/${encodeURIComponent(token)}/share-card/email`, {
    method: 'POST',
    headers: giftPinHeaders('giver', token, accessToken ? authHeaders(accessToken) : undefined),
  });
}

export function getReceiverSummary(token: string, init?: RequestInit): Promise<GiftSummary> {
  return request(`/gift/${encodeURIComponent(token)}`, {
    ...init,
    headers: giftPinHeaders('receiver', token, init?.headers),
  });
}

/** Scoped-down check for a tab that's locked but sitting on a normal (non-
 * gift) page: sends only the lock token minted by startGiftLockSession, not
 * the receiver token, since all this needs is "does the lock still make
 * sense" — never items/addresses/pricing. `status` is null once the lock
 * session itself has expired server-side (same TTL as the local one). */
export function getGiftLockStatus(lockToken: string): Promise<{ success: true; status: GiftStatus | null }> {
  return request(`/gift/lock/${encodeURIComponent(lockToken)}/status`);
}

export function startGiftLockSession(token: string): Promise<{
  success: true;
  lockToken: string;
  expiresAt: string;
  idleTimeoutMs: number;
}> {
  return request(`/gift/${encodeURIComponent(token)}/session`, {
    method: 'POST',
    headers: giftPinHeaders('receiver', token),
  });
}

export async function getReceiverGalleryFeed(
  token: string,
  lang: Lang,
  params: GalleryFeedParams = {},
): Promise<GalleryFeedResult> {
  const query = buildQuery({
    cursor: params.cursor,
    limit: params.limit,
    occasion: params.occasion?.length ? params.occasion.join(',') : undefined,
    shape: params.shape?.length ? params.shape.join(',') : undefined,
    length: params.length?.length ? params.length.join(',') : undefined,
    size: params.size?.length ? params.size.join(',') : undefined,
    ids: params.ids?.length ? params.ids.join(',') : undefined,
    stock: params.stock,
    minPrice: params.minPrice,
    maxPrice: params.maxPrice,
  });
  const result = await request<{
    success: true;
    items: GalleryItem[];
    nextCursor: string | null;
    totalCount: number;
  }>(`/gift/${encodeURIComponent(token)}/gallery/feed${query}`, {
    headers: giftPinHeaders('receiver', token, { 'Accept-Language': lang }),
  });
  return { items: result.items, nextCursor: result.nextCursor, totalCount: result.totalCount };
}

export async function getReceiverGalleryFilters(token: string, lang: Lang): Promise<FilterOptionsResult> {
  const result = await request<{ success: true; options: FilterOptionsResult }>(
    `/gift/${encodeURIComponent(token)}/gallery/filters`,
    { headers: giftPinHeaders('receiver', token, { 'Accept-Language': lang }) },
  );
  return result.options;
}

export async function getReceiverProductByUid(
  token: string,
  uid: string,
  lang: Lang,
): Promise<GalleryItem | null> {
  try {
    const result = await request<{ success: true; item: GalleryItem }>(
      `/gift/${encodeURIComponent(token)}/gallery/set/${encodeURIComponent(uid)}`,
      { headers: giftPinHeaders('receiver', token, { 'Accept-Language': lang }) },
    );
    return result.item;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.code === 'not_found')) return null;
    throw error;
  }
}

async function getReceiverProductsByIds(token: string, ids: string[], lang: Lang): Promise<ProductById[]> {
  if (ids.length === 0) return [];
  const feed = await getReceiverGalleryFeed(token, lang, { ids, limit: ids.length });
  return feed.items.map(galleryItemAsProduct);
}

/** Gift catalogue is nails only. Cart-rule free gifts are shop accessories;
 * fill those ids from public `/gallery/products` so the drawer/cart can
 * preview the same locked lines a guest cart shows. */
export async function getReceiverCartProductsByIds(
  token: string,
  ids: string[],
  lang: Lang,
): Promise<ProductById[]> {
  if (ids.length === 0) return [];
  // Gift feed is nails-only; public `/gallery/products` fills accessory / rule
  // ids. Overlap both requests: extras for ids the gift feed already returned
  // are ignored below.
  const [fromGift, fromPublic] = await Promise.all([
    getReceiverProductsByIds(token, ids, lang),
    fetchProductsByIds(ids, lang),
  ]);
  const found = new Set(fromGift.map((product) => product.id));
  const extras = fromPublic.filter((product) => !found.has(product.id));
  return [...fromGift, ...extras];
}

export function createReceiverComposition(
  token: string,
  body: CompositionWriteBody,
): Promise<{ success: true; composition: CartComposition }> {
  return request(`/gift/${encodeURIComponent(token)}/compositions`, {
    method: 'POST',
    headers: giftPinHeaders('receiver', token),
    body: JSON.stringify(body),
  });
}

export function updateReceiverComposition(
  token: string,
  id: string,
  body: CompositionWriteBody,
): Promise<{ success: true; composition: CartComposition }> {
  return request(`/gift/${encodeURIComponent(token)}/compositions/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: giftPinHeaders('receiver', token),
    body: JSON.stringify(body),
  });
}

export function deleteReceiverComposition(token: string, id: string): Promise<{ success: true }> {
  return request(`/gift/${encodeURIComponent(token)}/compositions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: giftPinHeaders('receiver', token),
  });
}

export function putReceiverItem(
  token: string,
  body: {
    productId: string;
    shapeKey?: string;
    lengthKey?: string;
    size?: string;
    packKey?: string;
    quantity: number;
  },
): Promise<GiftSummary> {
  return request(`/gift/${encodeURIComponent(token)}/items`, {
    method: 'PUT',
    headers: giftPinHeaders('receiver', token),
    body: JSON.stringify(body),
  });
}

export function deleteReceiverItem(
  token: string,
  body: { productId: string; shapeKey?: string; lengthKey?: string; size?: Size | string },
): Promise<GiftSummary> {
  return request(`/gift/${encodeURIComponent(token)}/items`, {
    method: 'DELETE',
    headers: giftPinHeaders('receiver', token),
    body: JSON.stringify(body),
  });
}

export function putReceiverDestination(token: string, body: GiftDestination): Promise<GiftSummary> {
  return request(`/gift/${encodeURIComponent(token)}/destination`, {
    method: 'PUT',
    headers: giftPinHeaders('receiver', token),
    body: JSON.stringify(body),
  });
}

export function confirmReceiverChoice(token: string, email: string): Promise<GiftSummary> {
  return request(`/gift/${encodeURIComponent(token)}/confirm`, {
    method: 'POST',
    headers: giftPinHeaders('receiver', token),
    body: JSON.stringify({ email }),
  });
}

export function getReceiverCouriers(token: string): Promise<{
  success: true;
  couriers: Courier[];
}> {
  return request(`/gift/${encodeURIComponent(token)}/couriers`, {
    headers: giftPinHeaders('receiver', token),
  });
}

export function getReceiverAddressCountries(token: string): Promise<{
  success: true;
  countries: Array<{ code: string; label: string }>;
}> {
  return request(`/gift/${encodeURIComponent(token)}/address-countries`, {
    headers: giftPinHeaders('receiver', token),
  });
}
