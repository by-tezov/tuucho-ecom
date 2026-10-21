import { getEmailCatalog } from '@tuucho/plugin-sdk';
import type { Language } from '../../../utils/language.js';
import type { EmailStrings } from './emailStringTypes.js';

export type {
  EmailStrings,
  LoyaltyExpiryReminderStrings,
  OrderCancelledStrings,
  OrderConfirmationStrings,
  OrderItemGroupLabels,
  OrderShippedStrings,
  OrderUpdatedStrings,
} from './emailStringTypes.js';

export function emailStrings(language: Language): EmailStrings {
  if (language === 'fr') {
    return getEmailCatalog<EmailStrings>('fr') ?? EMAIL_STRINGS.en;
  }
  return EMAIL_STRINGS.en;
}

export const EMAIL_STRINGS: { en: EmailStrings } = {
  en: {
    orderConfirmation: {
      subject: (orderNumber) => `Order confirmation ${orderNumber} : Shop`,
      title: 'Your order is confirmed!',
      intro: 'Thank you for your order. Here is your summary.',
      itemsHeading: 'Items ordered',
      subtotalLabel: 'Subtotal',
      shippingLabel: 'Shipping',
      totalLabel: 'Total',
      expressSuffix: ' (Express)',
      rulesDiscountLabel: 'Volume discount',
      freeShippingLabel: 'Free',
      giftFreeLabel: 'Free',
      addressHeading: 'Shipping address',
      billingAddressHeading: 'Billing address',
      invoiceNotice:
        'Your invoice will be available once your order is received : we will email you as soon as it is ready.',
      guestInvoiceNotice: "You will receive your invoice by email once your order's reception is confirmed.",
      loginSuggestion:
        "If this email doesn't display correctly, log into your account on the website to see your order details.",
      loginLinkLabel: 'View my orders',
      guestAccountSuggestion:
        'You ordered without creating an account. Use Manage my order to follow this order (link valid 24 hours).',
      guestAccountLinkLabel: 'Manage my order',
      integrityLabel: 'Integrity code:',
      loyaltyCreditLabel: 'Loyalty credit',
      loyaltyEarnLabel: 'Loyalty to earn',
      loyaltyEarnNotice: (amount) =>
        `You will earn €${amount} in loyalty credit once reception is confirmed.`,
      loyaltyEarnNoticeGuest: (amount) =>
        `You will earn €${amount} in loyalty credit once reception is confirmed. To use it, create an account (or sign in) with the same email address and link this order.`,
      footer: 'This is an automated message from Shop, please do not reply.',
    },
    orderShipped: {
      subject: (orderNumber) => `Your order ${orderNumber} has shipped : Shop`,
      title: 'Your order is on its way!',
      intro: 'Good news: your order has just been shipped.',
      itemsHeading: 'Items shipped',
      totalLabel: 'Total',
      addressHeading: 'Shipping address',
      billingAddressHeading: 'Billing address',
      siteLinkLabel: 'Visit Shop',
      footer: 'This is an automated message from Shop, please do not reply.',
    },
    orderCancelled: {
      subject: (orderNumber) => `Order cancellation ${orderNumber} : Shop`,
      title: 'Your order has been cancelled : no payment was taken',
      intro: 'We confirm that your order has been cancelled.',
      body: 'No payment was taken and you will not be charged. The payment authorization has been released.',
      loginLinkLabel: 'View my orders',
      footer: 'This email was sent automatically by Shop : please do not reply.',
    },
    orderUpdated: {
      subject: (orderNumber) => `Your order ${orderNumber} has been updated : Shop`,
      title: 'Your order has been updated',
      intro: 'We confirm that your order address has changed. Here is your updated summary.',
      notice: 'This summary replaces the address information in your previous order email.',
    },
    loyaltyExpiryReminder: {
      subject: (expiresAt) => `Reminder : use your loyalty credit before ${expiresAt}`,
      title: 'Your loyalty credit expires soon',
      body: (atRisk, expiresAt) =>
        `You still have €${atRisk} to spend before the ${expiresAt} settlement. After that date, unused credit is lost.`,
      ctaLabel: 'View my wallet',
      footer: 'This is an automated message from Shop, please do not reply.',
    },
    itemGroupLabels: {
      nail: 'Pieces',
      customSet: 'Composed sets',
      accessory: 'Accessories',
      gift: 'Free gifts',
    },
  },
};
