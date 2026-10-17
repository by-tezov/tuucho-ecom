import type Stripe from 'stripe';
import { pool } from '../../../db/pool.js';
import * as orders from './ordersFacade.js';
import type { OrderItemRow, OrderRow } from './ordersFacade.js';
import * as couriers from '../../delivery/application/couriers.js';
import {
  orderConfirmationEmail,
  orderConfirmationSpyEmail,
  orderUpdatedEmail,
  orderUpdatedSpyEmail,
  orderCancelledEmail,
  orderCancelledSpyEmail,
  paymentFailedSpyEmail,
  paymentAuthorizationExpiredSpyEmail,
  sendMail,
  spyRecipient,
} from '../../messaging/application/email.js';
import { giftReceiverCancelledEmail } from '../../messaging/application/giftReceiverOrderMail.js';
import { paymentAuthorizationExpiringSpyEmail } from '../../messaging/application/paymentAuthExpiryEmail.js';
import { maybeIssueGuestOrderManageUrl, orderCheckoutLanguage } from './guestOrderManage.js';
import { findUserById } from '../../identity/application/users.js';
import { getUserPreference } from '../../identity/application/userPreferences.js';
import { languageFromPreference, type Language } from '../../../utils/language.js';
import { toPublicOrder } from '../presentation/orderPresenter.js';
import { giftReceiverMailTarget, sameGiftMailAddress } from './giftSnapshot.js';

/** Release a declined payment's reservation and send the optional owner copy. */
export async function notifyPaymentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  await orders.releaseReservationForPaymentIntent(pool, paymentIntent.id);
  const recipient = spyRecipient('payment_failed');
  if (!recipient) return;
  const metadata = paymentIntent.metadata as Record<string, string | undefined>;
  const userId = metadata.userId;
  const user = userId ? await findUserById(pool, userId) : undefined;
  void sendMail({
    to: recipient,
    ...paymentFailedSpyEmail({
      userEmail: user?.email ?? metadata.guestEmail ?? null,
      userId: userId ?? null,
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency,
      failureMessage: paymentIntent.last_payment_error?.message ?? null,
      failureCode: paymentIntent.last_payment_error?.code ?? null,
    }),
  }).catch((error) => {
    console.error('[checkout] payment-failed spy notification failed', error);
  });
}

/** Notify the owner once when a pre-capture authorization expires. */
export async function notifyPaymentAuthorizationExpired(order: OrderRow): Promise<void> {
  const recipient = spyRecipient('payment_authorization_expired');
  if (!recipient) return;
  const user = order.user_id ? await findUserById(pool, order.user_id) : null;
  void sendMail({
    to: recipient,
    ...paymentAuthorizationExpiredSpyEmail({
      userEmail: user?.email ?? order.guest_email,
      userId: order.user_id,
      amount: Number(order.total),
      currency: 'eur',
      paymentMethodType: order.payment_method_type,
      orderNumber: order.order_number,
      orderId: order.id,
    }),
  }).catch((error) => {
    console.error('[checkout] payment-authorization-expired spy notification failed', error);
  });
}

/** Proactive owner alert: PAYMENT_AUTH_EXPIRY_SPY_BEFORE ahead of an
 * authorization hold's *estimated* expiry (see
 * orders/application/paymentAuthExpirySpy.ts for how that estimate is built
 * and deduplicated). Never captures, cancels, or decides anything about the
 * payment — a heads-up only. */
export async function notifyPaymentAuthorizationExpiring(
  order: OrderRow,
  estimatedExpiresAt: Date,
): Promise<void> {
  const recipient = spyRecipient('payment_authorization_expiring');
  if (!recipient) return;
  const user = order.user_id ? await findUserById(pool, order.user_id) : null;
  void sendMail({
    to: recipient,
    ...paymentAuthorizationExpiringSpyEmail({
      userEmail: user?.email ?? order.guest_email,
      userId: order.user_id,
      amount: Number(order.total),
      currency: 'eur',
      paymentMethodType: order.payment_method_type,
      orderNumber: order.order_number,
      orderId: order.id,
      estimatedExpiresAt: estimatedExpiresAt.toISOString(),
    }),
  }).catch((error) => {
    console.error('[checkout] payment-authorization-expiring spy notification failed', error);
  });
}

/** Deliver the customer confirmation and optional owner copy after commit.
 * Gift orders also mail the recipient (prices omitted when the offer hides them). */
export async function sendOrderConfirmation(
  userId: string | undefined,
  order: OrderRow,
  items: OrderItemRow[],
  guestLanguage?: Language,
): Promise<void> {
  const recipientEmail = userId ? (await findUserById(pool, userId))?.email : order.guest_email;
  if (!recipientEmail) return;
  const language = userId
    ? languageFromPreference(await getUserPreference(pool, userId, 'language'))
    : (guestLanguage ?? orderCheckoutLanguage(order.language));
  const trackingAvailable = order.courier_code
    ? ((await couriers.trackingAvailableByCode(pool, [order.courier_code])).get(order.courier_code) ?? false)
    : false;
  const orderData = await toPublicOrder(order, items, language, trackingAvailable);
  const manageOrderUrl = await maybeIssueGuestOrderManageUrl(pool, order, recipientEmail, language);
  try {
    await sendMail({
      to: recipientEmail,
      ...orderConfirmationEmail(orderData, language, !userId, manageOrderUrl),
    });
  } catch (error) {
    console.error(`[order] confirmation delivery failed for ${order.order_number}`, error);
  }
  const giftReceiver = await giftReceiverMailTarget(pool, order);
  if (giftReceiver && !sameGiftMailAddress(giftReceiver.email, recipientEmail)) {
    const receiverData = await toPublicOrder(order, items, giftReceiver.language, trackingAvailable);
    try {
      await sendMail({
        to: giftReceiver.email,
        ...orderConfirmationEmail(receiverData, giftReceiver.language, false, undefined, {
          forGiftReceiver: true,
        }),
      });
    } catch (error) {
      console.error(`[order] gift receiver confirmation failed for ${order.order_number}`, error);
    }
  }
  const owner = spyRecipient('order_confirmation');
  if (owner) {
    void sendMail({
      to: owner,
      ...orderConfirmationSpyEmail(orderData, recipientEmail, userId ?? null),
    }).catch((error) => {
      console.error('[order] spy copy delivery failed', error);
    });
  }
}

export async function sendOrderCancellation(
  userId: string,
  order: OrderRow,
  items: OrderItemRow[],
): Promise<void> {
  const user = await findUserById(pool, userId);
  if (!user) return;
  const language = languageFromPreference(await getUserPreference(pool, userId, 'language'));
  const trackingAvailable = order.courier_code
    ? ((await couriers.trackingAvailableByCode(pool, [order.courier_code])).get(order.courier_code) ?? false)
    : false;
  const orderData = await toPublicOrder(order, items, language, trackingAvailable);
  try {
    await sendMail({ to: user.email, ...orderCancelledEmail(orderData, language) });
  } catch (error) {
    console.error('[order] cancellation customer email delivery failed', error);
  }
  const giftReceiver = await giftReceiverMailTarget(pool, order);
  if (giftReceiver && !sameGiftMailAddress(giftReceiver.email, user.email)) {
    try {
      await sendMail({
        to: giftReceiver.email,
        ...giftReceiverCancelledEmail(order.order_number, giftReceiver.language),
      });
    } catch (error) {
      console.error('[order] gift receiver cancellation email failed', error);
    }
  }
  const recipient = spyRecipient('order_cancelled');
  if (!recipient) return;
  void sendMail({
    to: recipient,
    ...orderCancelledSpyEmail(orderData, user.email, user.id),
  }).catch((error) => {
    console.error('[order] cancellation spy copy delivery failed', error);
  });
}

/** Send the revised recap after the immutable revision has committed. */
export async function sendOrderUpdate(userId: string, order: OrderRow, items: OrderItemRow[]): Promise<void> {
  const user = await findUserById(pool, userId);
  if (!user) return;
  const language = languageFromPreference(await getUserPreference(pool, userId, 'language'));
  const trackingAvailable = order.courier_code
    ? ((await couriers.trackingAvailableByCode(pool, [order.courier_code])).get(order.courier_code) ?? false)
    : false;
  const orderData = await toPublicOrder(order, items, language, trackingAvailable);
  await sendMail({ to: user.email, ...orderUpdatedEmail(orderData, language) });
  const giftReceiver = await giftReceiverMailTarget(pool, order);
  if (giftReceiver && !sameGiftMailAddress(giftReceiver.email, user.email)) {
    const receiverData = await toPublicOrder(order, items, giftReceiver.language, trackingAvailable);
    await sendMail({
      to: giftReceiver.email,
      ...orderUpdatedEmail(receiverData, giftReceiver.language, { forGiftReceiver: true }),
    });
  }
  const recipient = spyRecipient('order_updated');
  if (!recipient) return;
  void sendMail({
    to: recipient,
    ...orderUpdatedSpyEmail(orderData, user.email, user.id),
  }).catch((error) => {
    console.error('[order] address-update spy copy delivery failed', error);
  });
}
