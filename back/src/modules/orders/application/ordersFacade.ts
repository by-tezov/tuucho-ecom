/** Compatibility facade for order checkout and lifecycle transactions.
 * Implementations live under `src/modules/orders/application/`. Keep this file
 * as re-exports so existing import paths continue to work.
 */

export { ORDER_STATUSES, parseOrderItemColors, parseOrderItemPhotos } from '../domain/order.js';
export type {
  AdminOrderListRow,
  AdminOrderRow,
  OrderItemColorSnapshot,
  OrderItemPhotoSnapshot,
  OrderItemRow,
  OrderRow,
  OrderStatus,
} from '../domain/order.js';

export type {
  CheckoutFailureReason,
  GuestAddressInput,
  GuestLineInput,
  PriceCheckoutResult,
} from './pricing/checkoutPricing.js';
export { priceCart, priceGuestCheckout } from './pricing/checkoutPricing.js';

export type {
  ExtendReservationResult,
  PaymentSettlementReservation,
  ReserveCartResult,
} from './reservation/checkoutReservation.js';
export {
  attachPaymentIntentToReservation,
  extendReservationForPaymentIntent,
  findPaymentSettlementReservation,
  releaseReservation,
  releaseReservationForPaymentIntent,
  reserveCart,
  reserveGuestCart,
} from './reservation/checkoutReservation.js';

export { computeOrderContentHash, formatIntegrityToken } from './orderIntegrity.js';
export type { OrderRevisionKind, OrderRevisionRequestedBy } from '../domain/orderRevision.js';

export {
  acquireRevisionLock,
  extendRevisionLock,
  releaseRevisionLock,
  revisionLockRefusalMessage,
  revisionLockStaleRefusalMessage,
  updateOrderBilling,
  updateOrderShipping,
} from './revisions/orderRevisions.js';
export type {
  AcquireRevisionLockResult,
  ExtendRevisionLockResult,
  OrderRevisionLockInfo,
  ReleaseRevisionLockResult,
  UpdateOrderBillingResult,
  UpdateOrderShippingResult,
} from './revisions/orderRevisions.js';

export type {
  ConfirmOrderResult,
  NeedReviewOrderInput,
  OrderPaymentMethodSnapshot,
  OrderPaymentMethodType,
  PaymentCaptureStatus,
} from './placement/orderConfirmation.js';
export {
  confirmGuestOrder,
  confirmOrder,
  createNeedReviewOrderFromReservation,
  findSettledOrderByPaymentIntent,
} from './placement/orderConfirmation.js';

export {
  attachUnlinkedGuestOrdersForEmail,
  backfillGuestEmailLookups,
  claimGuestOrder,
  clampOrderListLimit,
  decodeOrderListCursor,
  dismissGuestOrder,
  encodeOrderListCursor,
  getForUser,
  listClaimableGuestOrders,
  listForUser,
  listRevisionsForUser,
  revisionCountsByOrderId,
  ORDER_LIST_LIMIT_DEFAULT,
  ORDER_LIST_LIMIT_MAX,
  ORDER_LIST_LIMIT_MIN,
} from './queries/customerOrderQueries.js';
export type {
  ClaimGuestOrderResult,
  GuestOrderCandidate,
  ListOrderRevisionsResult,
  OrderRevisionRow,
} from './queries/customerOrderQueries.js';

export {
  getAdminOrderAttentionCounts,
  getAdminOrderById,
  getById,
  listAdminOrdersForUserPage,
  listAdminOrdersPage,
  listAllOrders,
  verifyAdminOrder,
} from './queries/adminOrderQueries.js';
export type {
  AdminOrderAttentionCounts,
  AdminUserOrderSummary,
  VerifyAdminOrderResult,
} from './queries/adminOrderQueries.js';
export { deleteAll, deleteByOrderNumber } from './orderDeletion.js';
export type { DeleteAllOrdersResult, DeleteOrderResult } from './orderDeletion.js';

export type {
  CancelOrderResult,
  EnsurePaymentCapturedResult,
  NeedReviewResolution,
  ResolveNeedReviewOrderResult,
  SetStatusResult,
  StripeResolutionAudit,
} from './status/orderLifecycle.js';
export {
  cancelOrder,
  ensurePaymentCaptured,
  markPaymentAuthorizationExpired,
  releasePaymentAuthorization,
  resolveNeedReviewOrder,
  setStatus,
} from './status/orderLifecycle.js';
