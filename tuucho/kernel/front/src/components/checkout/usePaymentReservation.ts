import { useCallback, useEffect, useState } from 'react';
import { useLang } from '../../assets/i18n';
import { useAuthSession } from '../../state/AuthContext';
import { announce } from '../../state/liveAnnouncer';
import * as authApi from '../../api/checkout';
import type { PreparedPaymentIntent } from './checkoutContracts';

/** How long before the stock hold expires the confirmation warns and offers to
 * extend it: far more than the 20 seconds RGAA 13.1 asks for. */
export const RESERVATION_WARNING_LEAD_MS = 2 * 60 * 1000;

function paymentIntentIdFromSecret(clientSecret: string | null): string | null {
  if (!clientSecret) return null;
  const id = clientSecret.split('_secret_')[0];
  return id?.startsWith('pi_') ? id : null;
}

export interface PaymentReservation {
  /** Inside the warning window: show PaymentReservationNotice's extend offer. */
  warning: boolean;
  /** The hold ran out: the intent was cancelled and the stock released. */
  expired: boolean;
  extending: boolean;
  extendFailed: boolean;
  extend: () => Promise<void>;
  releaseAndClose: () => void;
}

/** Owns the one server-side stock hold created for a confirmation dialog.
 * It intentionally does not create an intent; callers still create it only
 * after the customer chose to pay.
 *
 * Time limit handling (RGAA 13.1): RESERVATION_WARNING_LEAD_MS before the
 * server expiry it raises `warning`, and `extend()` asks the API for a fresh
 * TTL (the server decides, and refuses past its extension limit). At expiry it
 * releases the hold and raises `expired`; the dialog then stays open on that
 * message until the customer closes it. It never closes itself. */
export function usePaymentReservation(
  paymentIntent: PreparedPaymentIntent,
  onCancel: () => void,
): PaymentReservation {
  const { t } = useLang();
  const { status, authedRequest } = useAuthSession();
  const paymentIntentId = paymentIntentIdFromSecret(paymentIntent.clientSecret);
  const [expiresAt, setExpiresAt] = useState(() => new Date(paymentIntent.reservationExpiresAt).getTime());
  const [warning, setWarning] = useState(false);
  const [expired, setExpired] = useState(false);
  const [extending, setExtending] = useState(false);
  const [extendFailed, setExtendFailed] = useState(false);

  // A new intent (card → PayPal) is a new reservation with its own expiry.
  useEffect(() => {
    setExpiresAt(new Date(paymentIntent.reservationExpiresAt).getTime());
    setWarning(false);
    setExpired(false);
    setExtendFailed(false);
  }, [paymentIntent.reservationExpiresAt]);

  const cancelIntent = useCallback(
    (id: string) =>
      status === 'anonymous'
        ? authApi.cancelGuestCheckout(id)
        : authedRequest((token) => authApi.cancelCheckout(token, id)),
    [authedRequest, status],
  );
  const release = useCallback(() => {
    if (paymentIntentId) void cancelIntent(paymentIntentId).catch(() => {});
  }, [cancelIntent, paymentIntentId]);
  const releaseAndClose = useCallback(() => {
    release();
    onCancel();
  }, [onCancel, release]);

  useEffect(() => {
    if (expired) return;
    const remaining = expiresAt - Date.now();
    const warningTimer = window.setTimeout(
      () => setWarning(true),
      Math.max(0, remaining - RESERVATION_WARNING_LEAD_MS),
    );
    const expiryTimer = window.setTimeout(
      () => {
        setWarning(false);
        setExpired(true);
        release();
      },
      Math.max(0, remaining),
    );
    return () => {
      window.clearTimeout(warningTimer);
      window.clearTimeout(expiryTimer);
    };
  }, [expired, expiresAt, release]);

  const extend = useCallback(async () => {
    if (!paymentIntentId || extending || expired) return;
    setExtending(true);
    setExtendFailed(false);
    try {
      const result =
        status === 'anonymous'
          ? await authApi.extendGuestCheckout(paymentIntentId)
          : await authedRequest((token) => authApi.extendCheckout(token, paymentIntentId));
      setExpiresAt(new Date(result.reservationExpiresAt).getTime());
      setWarning(false);
      announce(t.cart.paymentReservationExtended);
    } catch {
      setExtendFailed(true);
    } finally {
      setExtending(false);
    }
  }, [authedRequest, expired, extending, paymentIntentId, status, t]);

  return { warning, expired, extending, extendFailed, extend, releaseAndClose };
}
