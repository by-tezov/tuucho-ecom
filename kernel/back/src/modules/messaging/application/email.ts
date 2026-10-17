import { config } from '../../../config/env.js';
import { orderEmailItemGroups } from './orderEmailCustomSet.js';
import type { Language } from '../../../utils/language.js';
import { emailStrings } from './emailStrings.js';
import { giftReceiverOrderMail } from './giftReceiverOrderMail.js';
import { genericNoticeHtml, renderEmailTemplate, SPY_FOOTER, spyNoticeHtml } from './emailTemplates.js';
import type { MailMessage } from './emailDispatch.js';
export { resolveSpyRecipients, spyTo } from './spyChannels.js';
export {
  authOtpEmail,
  deletionReminderEmail,
  deletionRequestedEmail,
  emailChangeSecurityNoticeEmail,
  emailConfirmationEmail,
  invoiceEmail,
  orderReceivedEmail,
  passwordResetEmail,
  productRequestResponseEmail,
  unconnectedContactReplyEmail,
} from './accountEmails.js';
export { sendChatMail, sendMail } from './emailDispatch.js';
export type { ChatMailMessage, MailMessage } from './emailDispatch.js';

/** @deprecated Use `spyTo(channelId)` — who/whether lives in `tuucho-mail-spy`. */
export { spyTo as spyRecipient } from './spyChannels.js';

export interface ContactMessageData {
  email: string;
  identity: string | null;
  userId: string | null;
  firstName: string | null;
  lastName: string | null;
  message: string;
  attachmentNames?: string[];
}

/** Plain-text by design: customer input is only ever rendered as text in the
 * recipient's mailbox, never interpolated into HTML. Always sent to staff
 * resolved by `tuucho-mail-spy` (`contact.inbound`), never to an end customer, so unlike the
 * order emails below this stays a fixed French literal rather than joining
 * the EMAIL_STRINGS i18n set — six unused translations would be dead weight. */
export function contactMessageEmail(data: ContactMessageData): Omit<MailMessage, 'to'> {
  const sender = data.userId ? 'Compte connecté' : 'Visiteur';
  // Anonymous visitors supply their own identity. Signed-in messages instead
  // carry only the authoritative account fields, derived server-side.
  const senderDetails = data.userId
    ? `ID utilisateur : ${data.userId}\nPrénom : ${data.firstName ?? 'Non renseigné'}\nNom : ${data.lastName ?? 'Non renseigné'}`
    : `Identité : ${data.identity ?? 'Non renseignée'}\nID utilisateur : Non connecté`;
  const attachmentLines =
    data.attachmentNames && data.attachmentNames.length > 0
      ? `\n\nPièces jointes :\n${data.attachmentNames.map((name) => `- ${name}`).join('\n')}`
      : '';
  return {
    subject: `Nouveau message de contact : ${sender}`,
    replyTo: data.email,
    text: `Nouveau message envoyé depuis le formulaire de contact Shop.\n\nEmail : ${data.email}\n${senderDetails}\n\nMessage :\n${data.message}${attachmentLines}`,
    kind: 'contact',
  };
}

export function loyaltyExpiryReminderEmail(
  language: Language,
  atRisk: string,
  expiresAt: string,
): Omit<MailMessage, 'to'> {
  const strings = emailStrings(language).loyaltyExpiryReminder;
  const body = strings.body(atRisk, expiresAt);
  const accountUrl = `${config.frontendBaseUrl}/account/loyalty`;
  return {
    subject: strings.subject(expiresAt),
    text: `${strings.title}\n\n${body}\n\n${strings.ctaLabel} :\n${accountUrl}\n\n${strings.footer}`,
    html: genericNoticeHtml({
      language,
      title: strings.title,
      paragraphs: [body],
      ctaUrl: accountUrl,
      ctaLabel: strings.ctaLabel,
    }),
  };
}

/** Matches account.routes.ts's toPublicOrder shape — kept minimal (just
 * what the email needs) rather than importing orders.service.ts's DB row
 * types, to avoid this service reaching back into that one. shapeLabel/photo
 * are optional since operation.routes.ts's toAdminOrder (used for the
 * shipped email) doesn't localize/expose either. */
import { formatOrderLines } from './orderEmailLines.js';
import type { OrderEmailData } from './orderEmailData.js';

export type { OrderEmailData };

interface OrderTotalsLabels {
  subtotalLabel: string;
  shippingLabel: string;
  totalLabel: string;
  expressSuffix: string;
  rulesDiscountLabel: string;
  freeShippingLabel: string;
  loyaltyCreditLabel?: string;
  loyaltyEarnLabel?: string;
}

function orderSubtotal(order: OrderEmailData): number {
  return order.items.reduce((sum, item) => sum + item.lineTotal, 0);
}

function formatOrderTotals(order: OrderEmailData, labels: OrderTotalsLabels): string {
  const shippingDetail = order.courierName
    ? `${order.courierName}${order.express ? labels.expressSuffix : ''}`
    : labels.shippingLabel;
  const listFee = order.shippingListFee ?? order.shippingFee;
  const shippingAmount =
    order.shippingFee === 0 && listFee > 0
      ? `${labels.freeShippingLabel} (était ${listFee.toFixed(2)} €)`
      : `${order.shippingFee.toFixed(2)} €`;
  const rulesLine =
    (order.rulesItemDiscount ?? 0) > 0
      ? `\n${labels.rulesDiscountLabel} : −${(order.rulesItemDiscount ?? 0).toFixed(2)} €`
      : '';
  const extraLines = (order.extraLines ?? [])
    .map((line) => `\n${line.label} : ${line.amount.toFixed(2)} €`)
    .join('');
  const voucherLine =
    extraLines || !order.voucherCode
      ? ''
      : `\n${order.voucherCode} : −${(order.voucherDiscount ?? 0).toFixed(2)} €`;
  const loyaltyLine =
    extraLines || !((order.loyaltyCredit ?? 0) > 0)
      ? ''
      : `\n${labels.loyaltyCreditLabel ?? 'Loyalty'} : −${(order.loyaltyCredit ?? 0).toFixed(2)} €`;
  const loyaltyEarnLine =
    (order.loyaltyEarn ?? 0) > 0
      ? `\n${labels.loyaltyEarnLabel ?? 'Loyalty earn'} : +${(order.loyaltyEarn ?? 0).toFixed(2)} €`
      : '';
  return `${labels.subtotalLabel} : ${orderSubtotal(order).toFixed(2)} €\n${labels.shippingLabel} (${shippingDetail}) : ${shippingAmount}${rulesLine}${extraLines}${voucherLine}${loyaltyLine}\n${labels.totalLabel} : ${order.total.toFixed(2)} €${loyaltyEarnLine}`;
}

function formatOrderAddress(order: OrderEmailData): string {
  const line2 = order.line2 ? `${order.line2}\n` : '';
  const nameLines = [order.companyName, order.recipientName].filter(Boolean).join('\n');
  return `${nameLines}\n${order.line1}\n${line2}${order.postalCode} ${order.city}, ${order.countryCode}`;
}

function formatOrderBillingAddress(order: OrderEmailData): string {
  const line2 = order.billingLine2 ? `${order.billingLine2}\n` : '';
  const nameLines = [order.billingCompanyName, order.billingRecipientName].filter(Boolean).join('\n');
  return `${nameLines}\n${order.billingLine1}\n${line2}${order.billingPostalCode} ${order.billingCity}, ${order.billingCountryCode}`;
}

function showBillingAddress(order: OrderEmailData): boolean {
  return order.billingSameAsShipping === false && !!order.billingLine1;
}

function mailBillingBlock(order: OrderEmailData, options: OrderEmailRenderOptions, heading: string): string {
  if (options.forGiftReceiver === true || !showBillingAddress(order)) return '';
  return `\n\n${heading} :\n${formatOrderBillingAddress(order)}`;
}

/** Shared HTML-template context (items/totals/address) — every builder below
 * merges this with its own i18n strings, rather than repeating the same
 * field mapping three times. `language` is only used to attach each
 * section's localized header label (see EmailStrings.itemGroupLabels) —
 * pass `'fr'` for the always-French spy/internal copies. */
export interface OrderEmailRenderOptions {
  hidePrices?: boolean;
  omitAccountCta?: boolean;
  /** Gift recipient: products only, gift wording, no prices or integrity code. */
  forGiftReceiver?: boolean;
}

function orderTemplateContext(
  order: OrderEmailData,
  language: Language,
  options: OrderEmailRenderOptions = {},
) {
  const forReceiver = options.forGiftReceiver === true;
  const itemGroups = orderEmailItemGroups(
    order.items,
    language,
    emailStrings(language).itemGroupLabels,
    forReceiver,
  );
  return {
    orderNumber: order.orderNumber,
    itemGroups,
    hidePrices: forReceiver || options.hidePrices === true,
    subtotal: orderSubtotal(order),
    shippingFee: order.shippingFee,
    shippingListFee: order.shippingListFee ?? order.shippingFee,
    shippingIsFree: order.shippingFee === 0 && (order.shippingListFee ?? 0) > 0,
    rulesItemDiscount: order.rulesItemDiscount ?? 0,
    total: order.total,
    courierName: order.courierName,
    express: order.express,
    extraLines: order.extraLines ?? [],
    voucherCode: order.voucherCode ?? null,
    voucherDiscount: order.voucherDiscount ?? null,
    loyaltyCredit: order.loyaltyCredit ?? 0,
    loyaltyEarn: order.loyaltyEarn ?? 0,
    recipientName: order.recipientName,
    companyName: order.companyName,
    line1: order.line1,
    line2: order.line2,
    postalCode: order.postalCode,
    city: order.city,
    countryCode: order.countryCode,
    showBillingAddress: !forReceiver && showBillingAddress(order),
    billingRecipientName: order.billingRecipientName ?? null,
    billingCompanyName: order.billingCompanyName ?? null,
    billingLine1: order.billingLine1 ?? null,
    billingLine2: order.billingLine2 ?? null,
    billingPostalCode: order.billingPostalCode ?? null,
    billingCity: order.billingCity ?? null,
    billingCountryCode: order.billingCountryCode ?? null,
  };
}

export function orderConfirmationEmail(
  order: OrderEmailData,
  language: Language,
  isGuest: boolean,
  manageOrderUrl?: string,
  options: OrderEmailRenderOptions = {},
): Omit<MailMessage, 'to'> {
  const forReceiver = options.forGiftReceiver === true;
  const confirmation = emailStrings(language).orderConfirmation;
  const strings = forReceiver
    ? { ...confirmation, ...giftReceiverOrderMail(language).confirmation }
    : confirmation;
  const hidePrices = forReceiver || options.hidePrices === true;
  const omitAccountCta = forReceiver || options.omitAccountCta === true;
  const useManageCta = !omitAccountCta && (Boolean(manageOrderUrl) || isGuest);
  const ctaUrl = omitAccountCta
    ? null
    : useManageCta
      ? (manageOrderUrl ?? `${config.frontendBaseUrl}/account/manage-order`)
      : `${config.frontendBaseUrl}/orders`;
  const ctaSuggestion = omitAccountCta
    ? null
    : useManageCta
      ? strings.guestAccountSuggestion
      : strings.loginSuggestion;
  const ctaLabel = omitAccountCta
    ? null
    : useManageCta
      ? strings.guestAccountLinkLabel
      : strings.loginLinkLabel;
  const invoiceNotice = omitAccountCta ? null : isGuest ? strings.guestInvoiceNotice : strings.invoiceNotice;
  const loyaltyEarn = hidePrices ? 0 : (order.loyaltyEarn ?? 0);
  const loyaltyEarnNotice =
    loyaltyEarn > 0
      ? (isGuest ? strings.loyaltyEarnNoticeGuest : strings.loyaltyEarnNotice)(loyaltyEarn.toFixed(2))
      : null;
  const html = renderEmailTemplate('orderConfirmationCustomer', language, {
    ...orderTemplateContext(order, language, options),
    ordersUrl: ctaUrl,
    title: strings.title,
    intro: strings.intro,
    itemsHeading: strings.itemsHeading,
    subtotalLabel: strings.subtotalLabel,
    shippingLabel: strings.shippingLabel,
    totalLabel: strings.totalLabel,
    expressSuffix: strings.expressSuffix,
    rulesDiscountLabel: strings.rulesDiscountLabel,
    freeShippingLabel: strings.freeShippingLabel,
    giftFreeLabel: strings.giftFreeLabel,
    loyaltyCreditLabel: strings.loyaltyCreditLabel,
    loyaltyEarnLabel: strings.loyaltyEarnLabel,
    loyaltyEarnNotice,
    addressHeading: strings.addressHeading,
    billingAddressHeading: strings.billingAddressHeading,
    invoiceNotice,
    loginSuggestion: ctaSuggestion,
    loginLinkLabel: ctaLabel,
    integrityLabel: strings.integrityLabel,
    integrityToken: forReceiver ? null : (order.integrityToken ?? null),
    footer: strings.footer,
  });
  const integrityLine = forReceiver || !order.integrityToken ? '' : `\n\n${strings.integrityLabel} ${order.integrityToken}`;
  const earnLine = loyaltyEarnNotice ? `\n\n${loyaltyEarnNotice}` : '';
  const billingBlock = mailBillingBlock(order, options, strings.billingAddressHeading);
  const totalsBlock = hidePrices ? '' : `\n\n${formatOrderTotals(order, strings)}${earnLine}`;
  const noticeBlock = invoiceNotice ? `\n\n${invoiceNotice}` : '';
  const ctaBlock =
    ctaSuggestion && ctaLabel && ctaUrl ? `\n\n${ctaSuggestion}\n${ctaLabel} :\n${ctaUrl}` : '';
  return {
    subject: strings.subject(order.orderNumber),
    text: `${strings.title}\n\n${strings.intro}\n\n${order.orderNumber}\n\n${formatOrderLines(order, language, hidePrices)}${totalsBlock}\n\n${strings.addressHeading} :\n${formatOrderAddress(order)}${billingBlock}${noticeBlock}${integrityLine}${ctaBlock}`,
    html,
  };
}

/** Second, simpler copy of every order confirmation sent to staff
 * resolved by `tuucho-mail-spy` (`order_confirmation`) so a new sale is noticed
 * right away — see sendOrderConfirmation in account.routes.ts. Deliberately
 * NOT sent for the shipped/status-evolution email, only confirmations.
 * Always French (an internal notification, not customer-facing) and skips
 * the "log into the website" suggestion, which only makes sense for the
 * customer. */
export function orderConfirmationSpyEmail(
  order: OrderEmailData,
  customerEmail: string,
  userId: string | null,
): Omit<MailMessage, 'to'> {
  const labels = emailStrings('fr').orderConfirmation;
  const userIdLabel = userId ?? 'invité (aucun compte)';
  const loyaltyEarn = order.loyaltyEarn ?? 0;
  const loyaltyEarnNotice =
    loyaltyEarn > 0
      ? (userId ? labels.loyaltyEarnNotice : labels.loyaltyEarnNoticeGuest)(loyaltyEarn.toFixed(2))
      : null;
  const html = renderEmailTemplate('orderConfirmationSpy', 'fr', {
    ...orderTemplateContext(order, 'fr'),
    title: 'Nouvelle commande',
    customerEmail,
    userId: userIdLabel,
    subtotalLabel: labels.subtotalLabel,
    shippingLabel: labels.shippingLabel,
    totalLabel: labels.totalLabel,
    expressSuffix: labels.expressSuffix,
    rulesDiscountLabel: labels.rulesDiscountLabel,
    freeShippingLabel: labels.freeShippingLabel,
    loyaltyCreditLabel: labels.loyaltyCreditLabel,
    loyaltyEarnLabel: labels.loyaltyEarnLabel,
    loyaltyEarnNotice,
    giftFreeLabel: labels.giftFreeLabel,
    footer: SPY_FOOTER,
  });
  return {
    subject: `Nouvelle commande ${order.orderNumber} : Shop`,
    text: `Nouvelle commande reçue.\n\nClient : ${customerEmail}\nID utilisateur : ${userIdLabel}\nCommande : ${order.orderNumber}\n\n${formatOrderLines(order, 'fr')}\n\n${formatOrderTotals(order, labels)}`,
    html,
    kind: 'spy',
  };
}

/** Full, updated recap after a customer changes the shipping or billing
 * address. This is deliberately a distinct notice from confirmation: it
 * preserves the original confirmation as a historical record. */
export function orderUpdatedEmail(
  order: OrderEmailData,
  language: Language,
  options: OrderEmailRenderOptions = {},
): Omit<MailMessage, 'to'> {
  const forReceiver = options.forGiftReceiver === true;
  const updated = emailStrings(language).orderUpdated;
  const strings = forReceiver ? { ...updated, ...giftReceiverOrderMail(language).updated } : updated;
  const labels = emailStrings(language).orderConfirmation;
  const hidePrices = forReceiver || options.hidePrices === true;
  const omitAccountCta = forReceiver || options.omitAccountCta === true;
  const loyaltyEarn = hidePrices ? 0 : (order.loyaltyEarn ?? 0);
  const loyaltyEarnNotice = loyaltyEarn > 0 ? labels.loyaltyEarnNotice(loyaltyEarn.toFixed(2)) : null;
  const html = renderEmailTemplate('orderConfirmationCustomer', language, {
    ...orderTemplateContext(order, language, options),
    ordersUrl: omitAccountCta ? null : `${config.frontendBaseUrl}/orders`,
    title: strings.title,
    intro: strings.intro,
    itemsHeading: forReceiver
      ? giftReceiverOrderMail(language).confirmation.itemsHeading
      : labels.itemsHeading,
    subtotalLabel: labels.subtotalLabel,
    shippingLabel: labels.shippingLabel,
    totalLabel: labels.totalLabel,
    expressSuffix: labels.expressSuffix,
    rulesDiscountLabel: labels.rulesDiscountLabel,
    freeShippingLabel: labels.freeShippingLabel,
    giftFreeLabel: labels.giftFreeLabel,
    loyaltyCreditLabel: labels.loyaltyCreditLabel,
    loyaltyEarnLabel: labels.loyaltyEarnLabel,
    loyaltyEarnNotice,
    addressHeading: labels.addressHeading,
    billingAddressHeading: labels.billingAddressHeading,
    invoiceNotice: strings.notice,
    loginSuggestion: omitAccountCta ? null : labels.loginSuggestion,
    loginLinkLabel: omitAccountCta ? null : labels.loginLinkLabel,
    integrityLabel: labels.integrityLabel,
    integrityToken: forReceiver ? null : (order.integrityToken ?? null),
    footer: labels.footer,
  });
  const integrityLine = forReceiver || !order.integrityToken ? '' : `\n\n${labels.integrityLabel} ${order.integrityToken}`;
  const billingBlock = mailBillingBlock(order, options, labels.billingAddressHeading);
  const totalsBlock = hidePrices ? '' : `\n\n${formatOrderTotals(order, labels)}`;
  return {
    subject: strings.subject(order.orderNumber),
    text: `${strings.title}\n\n${strings.intro}\n\n${order.orderNumber}\n\n${formatOrderLines(order, language, hidePrices)}${totalsBlock}\n\n${labels.addressHeading} :\n${formatOrderAddress(order)}${billingBlock}\n\n${strings.notice}${integrityLine}`,
    html,
  };
}

export function orderStatusUpdateEmail(
  orderNumber: string,
  status: 'in_preparation' | 'to_send',
  language: Language,
  manageOrderUrl?: string,
): Omit<MailMessage, 'to'> {
  const preparing = status === 'in_preparation';
  const copy: Record<Language, { preparing: string; sending: string; cta: string }> = {
    fr: {
      preparing: 'Votre commande est en préparation.',
      sending: 'Votre commande est prête à être envoyée.',
      cta: 'Voir mes commandes',
    },
    en: {
      preparing: 'Your order is being prepared.',
      sending: 'Your order is ready to be sent.',
      cta: 'View my orders',
    },
  };
  const message = preparing ? copy[language].preparing : copy[language].sending;
  const ctaUrl = manageOrderUrl ?? `${config.frontendBaseUrl}/orders`;
  const ctaLabel = manageOrderUrl
    ? emailStrings(language).orderConfirmation.guestAccountLinkLabel
    : copy[language].cta;
  return {
    subject: `${orderNumber} : Shop`,
    text: `${message}\n\n${orderNumber}\n\n${ctaLabel} :\n${ctaUrl}`,
    html: genericNoticeHtml({
      language,
      title: 'Shop',
      paragraphs: [message, orderNumber],
      ctaUrl,
      ctaLabel,
    }),
  };
}

/** Owner copy for an address amendment. The customer email remains the
 * localized detailed recap above; internal notifications stay French. */
export function orderUpdatedSpyEmail(
  order: OrderEmailData,
  customerEmail: string,
  userId: string,
): Omit<MailMessage, 'to'> {
  const labels = emailStrings('fr').orderConfirmation;
  const loyaltyEarn = order.loyaltyEarn ?? 0;
  const loyaltyEarnNotice = loyaltyEarn > 0 ? labels.loyaltyEarnNotice(loyaltyEarn.toFixed(2)) : null;
  const html = renderEmailTemplate('orderConfirmationSpy', 'fr', {
    ...orderTemplateContext(order, 'fr'),
    title: 'Commande modifiée',
    customerEmail,
    userId,
    subtotalLabel: labels.subtotalLabel,
    shippingLabel: labels.shippingLabel,
    totalLabel: labels.totalLabel,
    expressSuffix: labels.expressSuffix,
    rulesDiscountLabel: labels.rulesDiscountLabel,
    freeShippingLabel: labels.freeShippingLabel,
    giftFreeLabel: labels.giftFreeLabel,
    loyaltyCreditLabel: labels.loyaltyCreditLabel,
    loyaltyEarnLabel: labels.loyaltyEarnLabel,
    loyaltyEarnNotice,
    footer: SPY_FOOTER,
  });
  return {
    subject: `Commande ${order.orderNumber} modifiée : Shop`,
    text: `Adresse de commande modifiée.\n\nClient : ${customerEmail}\nID utilisateur : ${userId}\nCommande : ${order.orderNumber}\n\n${formatOrderLines(order, 'fr')}\n\n${formatOrderTotals(order, labels)}`,
    html,
    kind: 'spy',
  };
}

/** Sent when an admin (via `npm run order -- set-status`) moves the order
 * to `sent`. */
export function orderShippedEmail(
  order: OrderEmailData,
  language: Language,
  manageOrderUrl?: string,
  options: OrderEmailRenderOptions = {},
): Omit<MailMessage, 'to'> {
  const forReceiver = options.forGiftReceiver === true;
  const shipped = emailStrings(language).orderShipped;
  const strings = forReceiver ? { ...shipped, ...giftReceiverOrderMail(language).shipped } : shipped;
  const hidePrices = forReceiver || options.hidePrices === true;
  const omitAccountCta = forReceiver || options.omitAccountCta === true;
  const ctaUrl = omitAccountCta ? null : (manageOrderUrl ?? config.frontendBaseUrl);
  const ctaLabel = omitAccountCta
    ? null
    : manageOrderUrl
      ? emailStrings(language).orderConfirmation.guestAccountLinkLabel
      : strings.siteLinkLabel;
  const html = renderEmailTemplate('orderShipped', language, {
    ...orderTemplateContext(order, language, options),
    title: strings.title,
    intro: strings.intro,
    itemsHeading: strings.itemsHeading,
    totalLabel: strings.totalLabel,
    addressHeading: strings.addressHeading,
    billingAddressHeading: strings.billingAddressHeading,
    siteUrl: ctaUrl,
    siteLinkLabel: ctaLabel,
    footer: strings.footer,
  });
  const billingBlock = mailBillingBlock(order, options, strings.billingAddressHeading);
  const totalsBlock = hidePrices ? '' : `\n\n${strings.totalLabel} : ${order.total.toFixed(2)} €`;
  const ctaBlock = ctaLabel && ctaUrl ? `\n\n${ctaLabel} :\n${ctaUrl}` : '';
  return {
    subject: strings.subject(order.orderNumber),
    text: `${strings.title}\n\n${strings.intro}\n\n${order.orderNumber}\n\n${formatOrderLines(order, language, hidePrices)}${totalsBlock}\n\n${strings.addressHeading} :\n${formatOrderAddress(order)}${billingBlock}${ctaBlock}`,
    html,
  };
}

/** Customer self-cancel confirmation while payment was still only authorized. */
export function orderCancelledEmail(order: OrderEmailData, language: Language): Omit<MailMessage, 'to'> {
  const strings = emailStrings(language).orderCancelled;
  const ordersUrl = `${config.frontendBaseUrl}/orders`;
  return {
    subject: strings.subject(order.orderNumber),
    text: `${strings.title}\n\n${strings.intro}\n\n${order.orderNumber}\n\n${strings.body}\n\n${ordersUrl}`,
    html: genericNoticeHtml({
      language,
      title: strings.title,
      paragraphs: [strings.intro, order.orderNumber, strings.body],
      ctaUrl: ordersUrl,
      ctaLabel: strings.loginLinkLabel,
    }),
  };
}

/** Internal copy when an account owner cancels an uncaptured order. This is
 * deliberately French, like the other owner notifications. */
export function orderCancelledSpyEmail(
  order: OrderEmailData,
  customerEmail: string,
  userId: string,
): Omit<MailMessage, 'to'> {
  const total = `${order.total.toFixed(2)} €`;
  return {
    subject: `Commande annulée : ${order.orderNumber}`,
    text:
      `Commande annulée par le client avant encaissement.\n\n` +
      `Client : ${customerEmail}\nID utilisateur : ${userId}\nCommande : ${order.orderNumber}\nMontant : ${total}\n\n` +
      'Aucun paiement n’a été effectué ; toute autorisation de paiement a été levée.',
    html: spyNoticeHtml({
      title: 'Commande annulée',
      fields: [
        { label: 'Client', value: customerEmail },
        { label: 'ID utilisateur', value: userId },
        { label: 'Commande', value: order.orderNumber },
        { label: 'Montant', value: total },
      ],
      lines: [
        'Annulée par le client avant encaissement. Aucun paiement n’a été effectué ; toute autorisation a été levée.',
      ],
    }),
    kind: 'spy',
  };
}

export interface PaymentFailedEmailData {
  userEmail: string | null;
  userId: string | null;
  amount: number;
  currency: string;
  failureMessage: string | null;
  failureCode: string | null;
}

/** Spy-only — see notifyPaymentFailed in account.routes.ts, fired from the
 * Stripe webhook's payment_intent.payment_failed branch. No customer email:
 * a declined payment is never something to notify the customer about by
 * email, Stripe/the checkout form already told them in the browser. Always
 * French, same convention as every other spy/ops notification — this is a
 * heads-up for the site owner, not customer-facing. */
export function paymentFailedSpyEmail(data: PaymentFailedEmailData): Omit<MailMessage, 'to'> {
  const who = data.userEmail
    ? `${data.userEmail} (${data.userId})`
    : 'Client inconnu (métadonnées manquantes)';
  const reason = data.failureMessage
    ? `${data.failureMessage}${data.failureCode ? ` [${data.failureCode}]` : ''}`
    : 'Raison inconnue';
  const amount = `${data.amount.toFixed(2)} ${data.currency.toUpperCase()}`;
  return {
    subject: `Paiement échoué : ${amount}`,
    text: `Une tentative de paiement a échoué.\n\nClient : ${who}\nMontant : ${amount}\nRaison : ${reason}`,
    html: spyNoticeHtml({
      title: 'Paiement échoué',
      fields: [
        { label: 'Client', value: who },
        { label: 'Montant', value: amount },
        { label: 'Raison', value: reason },
      ],
    }),
    kind: 'spy',
  };
}

export interface PaymentAuthorizationExpiredEmailData {
  userEmail: string | null;
  userId: string | null;
  amount: number;
  currency: string;
  paymentMethodType: string | null;
  orderNumber: string | null;
  orderId: string | null;
}

/** Spy-only — auth hold expired before ops capture (charge.expired /
 * payment_intent.canceled with reason expired). Customer already sees
 * paymentCaptureStatus=expired on the order card; this is the owner
 * heads-up. Always French. */
export function paymentAuthorizationExpiredSpyEmail(
  data: PaymentAuthorizationExpiredEmailData,
): Omit<MailMessage, 'to'> {
  const who = data.userEmail
    ? `${data.userEmail} (${data.userId ?? 'id inconnu'})`
    : data.userId
      ? `Email inconnu (${data.userId})`
      : 'Client inconnu';
  const amount = `${data.amount.toFixed(2)} ${data.currency.toUpperCase()}`;
  const method =
    data.paymentMethodType === 'paypal'
      ? 'PayPal'
      : data.paymentMethodType === 'bancontact'
        ? 'Bancontact'
        : data.paymentMethodType === 'card'
          ? 'Carte'
          : data.paymentMethodType === 'free'
            ? 'Gratuit'
            : (data.paymentMethodType ?? 'Inconnu');
  const order =
    data.orderNumber != null
      ? data.orderId
        ? `${data.orderNumber} (${data.orderId})`
        : data.orderNumber
      : (data.orderId ?? 'Commande introuvable');
  return {
    subject: `Autorisation expirée : ${amount}${data.orderNumber ? ` (${data.orderNumber})` : ''}`,
    text:
      `Une autorisation de paiement a expiré avant capture (fonds non débités).\n\n` +
      `Client : ${who}\nCommande : ${order}\nMontant : ${amount}\nMoyen : ${method}`,
    html: spyNoticeHtml({
      title: 'Autorisation de paiement expirée',
      fields: [
        { label: 'Client', value: who },
        { label: 'Commande', value: order },
        { label: 'Montant', value: amount },
        { label: 'Moyen de paiement', value: method },
      ],
      lines: [
        'Les fonds n’ont pas été débités. La commande reste à traiter côté ops (annulation / restock).',
      ],
    }),
    kind: 'spy',
  };
}

/** Nail ref (product_uid) + title, not just the raw productId — see
 * notifyCartAbandoned in account.routes.ts, which looks these up from
 * products specifically for this email (cart.service.ts stays
 * relational-only; this is the one place that data gets enriched, and only
 * for the site owner's own eyes). */
interface CartLineSummary {
  productId: string;
  nailRef: string;
  title: string;
  shapeKey: string;
  size: string;
  quantity: number;
}

export interface CartAbandonmentEmailData {
  userEmail: string;
  userId: string;
  removedItem: CartLineSummary;
}

function formatCartLine(item: CartLineSummary): string {
  return `- ${item.title} (${item.nailRef}), ${item.shapeKey}, taille ${item.size}, x${item.quantity}`;
}

/** Spy-only — fires when removing a cart line leaves the active cart empty
 * (see notifyCartAbandoned in account.routes.ts). */
export function cartAbandonedSpyEmail(data: CartAbandonmentEmailData): Omit<MailMessage, 'to'> {
  return {
    subject: `Panier vidé : ${data.userEmail}`,
    text: `Un client a vidé son panier (dernier article supprimé).\n\nClient : ${data.userEmail}\nID utilisateur : ${data.userId}\n\nDernier article retiré :\n${formatCartLine(data.removedItem)}`,
    html: spyNoticeHtml({
      title: 'Panier vidé',
      fields: [
        { label: 'Client', value: data.userEmail },
        { label: 'ID utilisateur', value: data.userId },
        { label: 'Dernier article (supprimé)', value: formatCartLine(data.removedItem) },
      ],
    }),
    kind: 'spy',
  };
}

export interface ProductRequestEmailData {
  /** Ops handle (`npm run product-request -- set-status`). */
  publicId: string;
  /** Where the answer goes — the account's own address when signed in, the
   * one typed in the modal otherwise. Set as replyTo below, so answering is
   * a plain "reply" from the mailbox. */
  email: string;
  userId: string | null;
  productUid: string;
  title: string;
  /** Localized shape name when the product still offers that shape, the raw
   * key otherwise (see /contact/product-request). */
  shapeLabel: string;
  lengthKey: string;
  size: string;
  quantity: number;
  /** Optional customer note; omitted from the mail when empty. */
  comment?: string;
}

/** Spy notification — a visitor asked for a size that's out of stock to be
 * made for them. The durable record is `product_requests` (`requested`);
 * this mail is the owner's ping, with replyTo so answering is a plain reply. */
export function productRequestSpyEmail(data: ProductRequestEmailData): Omit<MailMessage, 'to'> {
  const variant = `${data.shapeLabel} · ${data.lengthKey} · taille ${data.size}`;
  const comment = data.comment?.trim();
  const fields = [
    { label: 'Demande', value: data.publicId },
    { label: 'Client', value: data.email },
    { label: 'ID utilisateur', value: data.userId ?? 'Non connecté' },
    { label: 'Article', value: data.title },
    { label: 'Référence', value: data.productUid },
    { label: 'Variante', value: variant },
    { label: 'Quantité souhaitée', value: String(data.quantity) },
    ...(comment ? [{ label: 'Commentaire', value: comment }] : []),
  ];
  return {
    subject: `Demande de fabrication ${data.publicId} : ${data.productUid} (taille ${data.size} ×${data.quantity})`,
    replyTo: data.email,
    text: `Un client demande la fabrication d'un article épuisé.\n\nDemande : ${data.publicId}\nClient : ${data.email}\nID utilisateur : ${data.userId ?? 'Non connecté'}\n\nArticle : ${data.title}\nRéférence : ${data.productUid}\nVariante : ${variant}\nQuantité souhaitée : ${data.quantity}${comment ? `\nCommentaire : ${comment}` : ''}`,
    html: spyNoticeHtml({
      title: 'Demande de fabrication',
      fields,
    }),
    kind: 'spy',
  };
}

export interface AccountCreatedEmailData {
  email: string;
  userId: string;
}

/** Fires on every successful registration — see /auth/register. Low-traffic
 * site, so a spy email per signup is cheap noise in exchange for spotting
 * abuse (bulk fake accounts, etc.) right away. */
export function accountCreatedSpyEmail(data: AccountCreatedEmailData): Omit<MailMessage, 'to'> {
  return {
    subject: `Nouveau compte : ${data.email}`,
    text: `Un nouveau compte a été créé.\n\nEmail : ${data.email}\nID utilisateur : ${data.userId}`,
    html: spyNoticeHtml({
      title: 'Nouveau compte créé',
      fields: [
        { label: 'Email', value: data.email },
        { label: 'ID utilisateur', value: data.userId },
      ],
    }),
    kind: 'spy',
  };
}

export interface AccountDeletionRequestedEmailData {
  email: string;
  userId: string;
  deletionScheduledFor: string;
}

/** Fires on POST /account/request-deletion (the customer-initiated soft
 * delete), not on the later automated hard-delete cron (accountDeletion
 * .service.ts) — the request is the timely, actionable moment for abuse
 * detection; the eventual hard delete days later is not. */
export function accountDeletionRequestedSpyEmail(
  data: AccountDeletionRequestedEmailData,
): Omit<MailMessage, 'to'> {
  return {
    subject: `Suppression de compte demandée : ${data.email}`,
    text: `Une suppression de compte a été demandée.\n\nEmail : ${data.email}\nID utilisateur : ${data.userId}\nSuppression prévue le : ${data.deletionScheduledFor}`,
    html: spyNoticeHtml({
      title: 'Suppression de compte demandée',
      fields: [
        { label: 'Email', value: data.email },
        { label: 'ID utilisateur', value: data.userId },
        { label: 'Suppression prévue le', value: data.deletionScheduledFor },
      ],
    }),
    kind: 'spy',
  };
}

export interface EmailChangedEmailData {
  oldEmail: string;
  newEmail: string;
  userId: string;
}

/** Fires alongside emailChangeSecurityNoticeEmail (see /account/change-email)
 * — the customer-facing "lock your account" notice and this spy copy are
 * sent from the same request. */
export function emailChangedSpyEmail(data: EmailChangedEmailData): Omit<MailMessage, 'to'> {
  return {
    subject: `Changement d’email demandé : ${data.oldEmail}`,
    text: `Un changement d'adresse email a été demandé.\n\nAncien email : ${data.oldEmail}\nNouvel email : ${data.newEmail}\nID utilisateur : ${data.userId}`,
    html: spyNoticeHtml({
      title: 'Changement d’adresse email demandé',
      fields: [
        { label: 'Ancien email', value: data.oldEmail },
        { label: 'Nouvel email', value: data.newEmail },
        { label: 'ID utilisateur', value: data.userId },
      ],
    }),
    kind: 'spy',
  };
}

export interface LoginEmailData {
  email: string;
  userId: string;
  ip: string | null;
  location: string | null;
  device: string | null;
}

/** Fires on every successful login — see /auth/login. Reuses the same
 * geo-IP location already resolved for the recent-logins block (see
 * token.service.ts's createRefreshToken/IssuedRefreshToken) rather than
 * looking it up a second time. */
export function loginSpyEmail(data: LoginEmailData): Omit<MailMessage, 'to'> {
  const where = [data.location ?? data.ip ?? 'Lieu inconnu', data.device].filter(Boolean).join(' · ');
  return {
    subject: `Connexion : ${data.email}`,
    text: `Une connexion a eu lieu.\n\nEmail : ${data.email}\nID utilisateur : ${data.userId}\n${where}`,
    html: spyNoticeHtml({
      title: 'Connexion au compte',
      fields: [
        { label: 'Email', value: data.email },
        { label: 'ID utilisateur', value: data.userId },
        { label: 'Depuis', value: where },
      ],
    }),
    kind: 'spy',
  };
}

export interface RateLimitedEmailData {
  kindLabel: string;
  method: string | null;
  path: string | null;
  ip: string | null;
  userAgent: string | null;
  userId: string | null;
  userEmail: string | null;
  reason: string | null;
  retryAfterSec: number | null;
  suppressedCount: number;
}

/** Owner heads-up when a per-IP limiter, per-user send cap, or login lockout
 * trips — see rateLimitSpy.service.ts. Cooldown may fold several hits into
 * one mail (`suppressedCount`). Always French, same as every other spy. */
export function rateLimitedSpyEmail(data: RateLimitedEmailData): Omit<MailMessage, 'to'> {
  const route =
    data.method && data.path ? `${data.method} ${data.path}` : (data.path ?? data.method ?? 'Route inconnue');
  const who = data.userEmail
    ? `${data.userEmail}${data.userId ? ` (${data.userId})` : ''}`
    : data.userId
      ? data.userId
      : 'Inconnu';
  const fields: { label: string; value: string }[] = [
    { label: 'Limite', value: data.kindLabel },
    { label: 'Requête', value: route },
    { label: 'IP', value: data.ip ?? 'Inconnue' },
    { label: 'Client', value: who },
  ];
  if (data.userAgent) fields.push({ label: 'User-Agent', value: data.userAgent });
  if (data.reason) fields.push({ label: 'Raison', value: data.reason });
  if (data.retryAfterSec != null && data.retryAfterSec > 0) {
    fields.push({ label: 'Retry-After', value: `${data.retryAfterSec}s` });
  }
  if (data.suppressedCount > 0) {
    fields.push({
      label: 'Hits supplémentaires (depuis le dernier e-mail)',
      value: String(data.suppressedCount),
    });
  }
  const textLines = [
    `Une limite a été atteinte (${data.kindLabel}).`,
    '',
    `Requête : ${route}`,
    `IP : ${data.ip ?? 'Inconnue'}`,
    `Client : ${who}`,
  ];
  if (data.userAgent) textLines.push(`User-Agent : ${data.userAgent}`);
  if (data.reason) textLines.push(`Raison : ${data.reason}`);
  if (data.retryAfterSec != null && data.retryAfterSec > 0) {
    textLines.push(`Retry-After : ${data.retryAfterSec}s`);
  }
  if (data.suppressedCount > 0) {
    textLines.push(`Hits supplémentaires : ${data.suppressedCount}`);
  }
  return {
    subject: `Limite atteinte : ${data.kindLabel} (${route})`,
    text: textLines.join('\n'),
    html: spyNoticeHtml({
      title: 'Limite atteinte',
      fields,
    }),
    kind: 'spy',
  };
}
