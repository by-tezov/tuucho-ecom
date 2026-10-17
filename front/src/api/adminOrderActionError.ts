import type { Strings } from '../assets/i18n/types';
import { ApiError } from './errors';

/** Maps admin order lifecycle API failures to operator-facing copy. */
export function adminOrderActionError(reason: unknown, t: Strings['admin']): string {
  if (!(reason instanceof ApiError)) return t.actionError;

  const detail = reason.serverMessage;

  switch (reason.code) {
    case 'shipping_packet_missing':
      return t.orderActionShippingPacketMissing;
    case 'invalid_transition':
      return detail ? t.orderActionInvalidTransitionDetail(detail) : t.orderActionInvalidTransition;
    case 'order_revision_locked':
      return detail ?? t.orderActionRevisionLocked;
    case 'order_revision_lock_stale':
      return detail ?? t.orderActionRevisionLockStale;
    case 'payment_capture_failed':
      return detail ? t.orderActionPaymentCaptureFailed(detail) : t.orderActionPaymentCaptureFailedGeneric;
    case 'stripe_not_configured':
      return t.needReviewOrderStripeNotConfigured;
    case 'stripe_state_invalid':
      return t.needReviewOrderStripeStateInvalid;
    case 'stripe_action_failed':
      return t.needReviewOrderStripeActionFailed;
    case 'stripe_refund_pending':
      return t.needReviewOrderStripeRefundPending;
    case 'label_configuration_missing':
      return detail
        ? t.orderActionLabelConfigurationMissing(detail)
        : t.orderActionLabelConfigurationMissingGeneric;
    case 'label_generation_failed':
      return detail ? t.orderActionLabelGenerationFailed(detail) : t.orderActionLabelGenerationFailedGeneric;
    case 'pickup_point_missing':
      return t.orderActionPickupPointMissing;
    case 'label_unsupported':
      return t.orderActionLabelUnsupported;
    case 'invalid_request':
      if (detail?.toLowerCase().includes('packet')) return t.orderActionShippingPacketMissing;
      return detail ?? t.orderActionInvalidRequest;
    case 'not_found':
      return t.orderActionNotFound;
    default:
      return detail ?? t.actionError;
  }
}
