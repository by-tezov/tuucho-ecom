import type pg from 'pg';
import {
  invoiceEmail,
  orderReceivedEmail,
  orderShippedEmail,
  sendMail,
} from '../../../messaging/application/email.js';
import { giftReceiverReceivedEmail } from '../../../messaging/application/giftReceiverOrderMail.js';
import { ensureInvoice } from '../../../invoicing/application/invoices.js';
import * as couriers from '../../../delivery/application/couriers.js';
import type { OrderItemRow, OrderRow, OrderStatus } from '../ordersFacade.js';
import { findUserById } from '../../../identity/application/users.js';
import { getUserPreference } from '../../../identity/application/userPreferences.js';
import { languageFromPreference } from '../../../../utils/language.js';
import { maybeIssueGuestOrderManageUrl, orderCheckoutLanguage } from '../guestOrderManage.js';
import { toPublicOrder } from '../../presentation/orderPresenter.js';
import { giftReceiverMailTarget, sameGiftMailAddress } from '../giftSnapshot.js';

/** Side effects shared by every successful status transition, regardless of
 * whether it came from `npm run order -- set-status` or carrier tracking. */
export async function applyOrderStatusEffects(
  pool: pg.Pool,
  status: OrderStatus,
  order: OrderRow,
  items: OrderItemRow[],
): Promise<void> {
  if (status === 'sent') {
    const user = order.user_id ? await findUserById(pool, order.user_id) : null;
    const recipientEmail = user?.email ?? order.guest_email;
    if (recipientEmail) {
      const language = user
        ? languageFromPreference(await getUserPreference(pool, user.id, 'language'))
        : orderCheckoutLanguage(order.language);
      const manageOrderUrl = await maybeIssueGuestOrderManageUrl(pool, order, recipientEmail, language);
      const trackingAvailable = order.courier_code
        ? ((await couriers.trackingAvailableByCode(pool, [order.courier_code])).get(order.courier_code) ??
          false)
        : false;
      const orderData = await toPublicOrder(order, items, language, trackingAvailable);
      await sendMail({
        to: recipientEmail,
        ...orderShippedEmail(orderData, language, manageOrderUrl),
      });
      const giftReceiver = await giftReceiverMailTarget(pool, order);
      if (giftReceiver && !sameGiftMailAddress(giftReceiver.email, recipientEmail)) {
        const receiverData = await toPublicOrder(order, items, giftReceiver.language, trackingAvailable);
        await sendMail({
          to: giftReceiver.email,
          ...orderShippedEmail(receiverData, giftReceiver.language, undefined, { forGiftReceiver: true }),
        });
      }
    }
  }

  if (status === 'received' && order.user_id) {
    const user = await findUserById(pool, order.user_id);
    if (user) {
      const language = languageFromPreference(await getUserPreference(pool, user.id, 'language'));
      await sendMail({ to: user.email, ...orderReceivedEmail(order.order_number, language) });
      const giftReceiver = await giftReceiverMailTarget(pool, order);
      if (giftReceiver && !sameGiftMailAddress(giftReceiver.email, user.email)) {
        await sendMail({
          to: giftReceiver.email,
          ...giftReceiverReceivedEmail(order.order_number, giftReceiver.language),
        });
      }
    }
  }

  // Guests have no account route from which to download or request an invoice.
  if (status === 'received' && !order.user_id && order.guest_email) {
    const invoice = await ensureInvoice(pool, order, items);
    const language = orderCheckoutLanguage(order.language);
    const manageOrderUrl = await maybeIssueGuestOrderManageUrl(pool, order, order.guest_email, language);
    await sendMail({
      to: order.guest_email,
      ...invoiceEmail(order.order_number, language, true, manageOrderUrl),
      attachments: [{ filename: `${invoice.invoiceNumber}.pdf`, path: invoice.absolutePath }],
    });
  }
}
