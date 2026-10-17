import { describe, expect, it } from 'vitest';
import { adminOrderActionError } from '@/api/adminOrderActionError';
import { ApiError } from '@/api/errors';
import { en } from '@/assets/i18n/strings.en';

const t = en.admin;

function failure(code: string, serverMessage?: string): ApiError {
  return new ApiError(code, 409, undefined, serverMessage);
}

describe('adminOrderActionError', () => {
  it('uses generic copy for anything that is not an API error', () => {
    expect(adminOrderActionError(new TypeError('NetworkError'), t)).toBe(t.actionError);
    expect(adminOrderActionError(undefined, t)).toBe(t.actionError);
  });

  it('maps lifecycle codes to dedicated operator copy', () => {
    expect(adminOrderActionError(failure('shipping_packet_missing'), t)).toBe(
      t.orderActionShippingPacketMissing,
    );
    expect(adminOrderActionError(failure('pickup_point_missing'), t)).toBe(t.orderActionPickupPointMissing);
    expect(adminOrderActionError(failure('label_unsupported'), t)).toBe(t.orderActionLabelUnsupported);
    expect(adminOrderActionError(failure('not_found', 'ignored'), t)).toBe(t.orderActionNotFound);
    expect(adminOrderActionError(failure('stripe_refund_pending'), t)).toBe(
      t.needReviewOrderStripeRefundPending,
    );
  });

  it('includes the server detail when the copy has a slot for it', () => {
    expect(adminOrderActionError(failure('invalid_transition', 'paid -> paid'), t)).toBe(
      t.orderActionInvalidTransitionDetail('paid -> paid'),
    );
    expect(adminOrderActionError(failure('invalid_transition'), t)).toBe(t.orderActionInvalidTransition);
    expect(adminOrderActionError(failure('payment_capture_failed', 'card_declined'), t)).toBe(
      t.orderActionPaymentCaptureFailed('card_declined'),
    );
    expect(adminOrderActionError(failure('payment_capture_failed'), t)).toBe(
      t.orderActionPaymentCaptureFailedGeneric,
    );
  });

  it('recognises a packet problem reported as a plain invalid_request', () => {
    expect(adminOrderActionError(failure('invalid_request', 'Packet size required'), t)).toBe(
      t.orderActionShippingPacketMissing,
    );
    expect(adminOrderActionError(failure('invalid_request', 'Bad weight'), t)).toBe('Bad weight');
    expect(adminOrderActionError(failure('invalid_request'), t)).toBe(t.orderActionInvalidRequest);
  });

  it('shows the server detail for unknown codes, generic copy otherwise', () => {
    expect(adminOrderActionError(failure('brand_new_code', 'Explained by server'), t)).toBe(
      'Explained by server',
    );
    expect(adminOrderActionError(failure('brand_new_code'), t)).toBe(t.actionError);
  });
});
