/** Public application facade for the returned-parcel workflow. */
export {
  getOrderReturnFinancialPreview,
  getOrderReturnReview,
  markOrderReturnReview,
  type MarkOrderReturnReviewResult,
  type OrderReturnFinancialPreviewResult,
} from './orderReturnReviewQueries.js';
export { resolveOrderReturnReview, type ResolveOrderReturnResult } from './orderReturnResolution.js';
export {
  dismissOrderReturnReview,
  sendOrderReturnResolutionEmail,
  type DismissOrderReturnResult,
} from './orderReturnReviewWorkflow.js';
export type {
  OrderReturnDetectionSource,
  OrderReturnRefundMode,
  OrderReturnStockInput,
  OrderReturnType,
  ResolveOrderReturnInput,
} from './orderReturnReviewStore.js';
