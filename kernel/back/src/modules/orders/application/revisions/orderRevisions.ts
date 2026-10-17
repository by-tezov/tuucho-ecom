export { updateOrderBilling } from './orderBillingRevision.js';
export type { UpdateOrderBillingResult } from './orderBillingRevision.js';
export { acquireRevisionLock, extendRevisionLock, releaseRevisionLock } from './orderRevisionLocks.js';
export type {
  AcquireRevisionLockResult,
  ExtendRevisionLockResult,
  ReleaseRevisionLockResult,
} from './orderRevisionLocks.js';
export { updateOrderShipping } from './orderShippingRevision.js';
export type { UpdateOrderShippingResult } from './orderShippingRevision.js';
export {
  clearLockSql,
  clearRevisionLockColumns,
  hasRevisionLock,
  isLockActive,
  isLockStale,
  orderHasInvoice,
  revisionLockRefusalMessage,
  revisionLockStaleRefusalMessage,
  saveOrderSnapshot,
} from './orderRevisionSupport.js';
export type { OrderRevisionLockInfo } from './orderRevisionSupport.js';
