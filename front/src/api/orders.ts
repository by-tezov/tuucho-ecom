/** Customer order history, tracking, revision and invoice API. */
import { preferredLanguage } from '../assets/i18n/languagePreference';
import { authHeaders, requestJson as request } from './client';
import { ApiError } from './errors';
import { apiFetch } from './http';

/** Payload shapes come from the backend contract (`npm run sync:contract`
 * in pamsurin-back). Do not redeclare them here. */
import type {
  GuestOrderCandidate,
  Order,
  OrderCompositionNail,
  OrderItem,
  OrderItemPhoto,
  OrderRevision,
  OrderRevisionBillingSnapshot,
  OrderRevisionKind,
  OrderRevisionLock,
  OrderRevisionShippingSnapshot,
  OrderStatus,
  OrderTracking,
  TrackingEvent,
} from './contract/orders';

export type {
  GuestOrderCandidate,
  Order,
  OrderCompositionNail,
  OrderItem,
  OrderItemPhoto,
  OrderRevision,
  OrderRevisionBillingSnapshot,
  OrderRevisionKind,
  OrderRevisionLock,
  OrderRevisionShippingSnapshot,
  OrderStatus,
  OrderTracking,
  TrackingEvent,
};

export function listOrders(
  accessToken: string,
  scope: 'active' | 'history',
  options: { limit?: number; cursor?: string | null } = {},
): Promise<{
  success: true;
  orders: Order[];
  pagination: { limit: number; nextCursor: string | null; hasMore: boolean };
}> {
  const params = new URLSearchParams({ scope });
  if (options.limit != null) params.set('limit', String(options.limit));
  if (options.cursor) params.set('cursor', options.cursor);
  return request(`/account/orders?${params}`, { headers: authHeaders(accessToken) });
}
export function listGuestOrders(
  accessToken: string,
): Promise<{ success: true; orders: GuestOrderCandidate[] }> {
  return request('/account/guest-orders', { headers: authHeaders(accessToken) });
}

export function claimGuestOrder(
  accessToken: string,
  id: string,
  integrityToken: string,
): Promise<{ success: true }> {
  return request(`/account/guest-orders/${id}/claim`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ integrityToken }),
  });
}

export function dismissGuestOrder(accessToken: string, id: string): Promise<{ success: true }> {
  return request(`/account/guest-orders/${id}/dismiss`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
}

/** Only called once the customer opens the tracking modal (see
 * TrackPackageModal.tsx) — the underlying carrier call is rate-limited
 * server-side, so this must never be prefetched alongside the order list. */
export function getOrderTracking(
  accessToken: string,
  id: string,
): Promise<{ success: true; tracking: OrderTracking }> {
  return request(`/account/orders/${id}/tracking`, { headers: authHeaders(accessToken) });
}
export function listOrderRevisions(
  accessToken: string,
  orderId: string,
): Promise<{ success: true; revisions: OrderRevision[] }> {
  return request(`/account/orders/${orderId}/revisions`, { headers: authHeaders(accessToken) });
}

/** Prices the cart and opens a Stripe PaymentIntent for that amount — no
 * order exists yet at this point (see pamsurin-back's settlePaymentIntent
 * doc comment). clientSecret feeds Stripe's Elements provider.
 * - omitted method + paymentMethodId: saved/one-time card (confirmCardPayment)
 * - `'paypal'`: PayPal-only PaymentIntent (Payment Element)
 * - `'bancontact'`: Bancontact-only PaymentIntent (Payment Element, direct capture)
 * - `'google_pay'` / `'apple_pay'`: card/wallet PaymentIntent, no pm id
 *   (Express Checkout Element); never saved */

export function cancelOrder(accessToken: string, orderId: string): Promise<{ success: true; order: Order }> {
  return request(`/account/orders/${orderId}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
}
/** Opens (or refreshes) the customer edit lock for a pre-to_send order. */
export function acquireOrderRevisionLock(
  accessToken: string,
  orderId: string,
): Promise<{ success: true; lock: OrderRevisionLock; order: Order }> {
  return request(`/account/orders/${orderId}/revisions/lock`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
}

export function extendOrderRevisionLock(
  accessToken: string,
  orderId: string,
  lockToken: string,
): Promise<{ success: true; lock: OrderRevisionLock; order: Order }> {
  return request(`/account/orders/${orderId}/revisions/lock/extend`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ lockToken }),
  });
}

export function releaseOrderRevisionLock(
  accessToken: string,
  orderId: string,
  lockToken: string,
): Promise<{ success: true }> {
  return request(`/account/orders/${orderId}/revisions/lock?lockToken=${encodeURIComponent(lockToken)}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
}

/** Applies a billing-address amendment under an edit lock. */
export function updateOrderBilling(
  accessToken: string,
  orderId: string,
  input: { lockToken: string; sameAsShipping: boolean; billingAddressId?: string },
): Promise<{ success: true; changed: boolean; order: Order }> {
  return request(`/account/orders/${orderId}/billing`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });
}

/** Shipping-address amendment under lock — same courier; refuses price changes. */
export function updateOrderShipping(
  accessToken: string,
  orderId: string,
  input: { lockToken: string; addressId: string },
): Promise<{ success: true; changed: boolean; order: Order }> {
  return request(`/account/orders/${orderId}/shipping`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });
}

/** Unlike every other call in this file, the response body is a raw PDF,
 * not JSON — fetches directly instead of going through request<T>() (which
 * always parses the body as JSON and would silently lose the file), then
 * triggers the browser's native download via a throwaway blob URL. Purely
 * a download, no email side effect — see emailInvoice below for the "Ma
 * Facture" modal's other choice. */
export async function downloadInvoice(accessToken: string, orderId: string): Promise<void> {
  const response = await apiFetch(`/account/orders/${orderId}/invoice`, {
    credentials: 'include',
    headers: { ...authHeaders(accessToken), 'Accept-Language': preferredLanguage() },
  });
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
    response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'facture.pdf';
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** The "Ma Facture" modal's "Recevoir par email" choice — same idempotent
 * invoice as downloadInvoice, sent as an attachment to the customer's own
 * account email instead of downloaded. Reusable as a "resend" with no
 * separate flow needed. */
export function emailInvoice(accessToken: string, orderId: string): Promise<{ success: true }> {
  return request(`/account/orders/${orderId}/invoice/email`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
}
