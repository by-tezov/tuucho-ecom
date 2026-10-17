/** Sample InvoiceData / OrderEmailData / email args for `npm run test`.
 * `keys*` use `{{field}}` placeholders on string slots; money/qty stay
 * numeric (PDFKit formats them) — see KEYS.txt written by template-invoice. */
import type { InvoiceData, InvoiceItem } from '../src/modules/invoicing/infrastructure/invoicePdf.js';
import type {
  AccountCreatedEmailData,
  AccountDeletionRequestedEmailData,
  CartAbandonmentEmailData,
  ContactMessageData,
  EmailChangedEmailData,
  LoginEmailData,
  OrderEmailData,
  PaymentFailedEmailData,
  PaymentAuthorizationExpiredEmailData,
  ProductRequestEmailData,
  RateLimitedEmailData,
} from '../src/modules/messaging/application/email.js';
import type { PaymentAuthorizationExpiringEmailData } from '../src/modules/messaging/application/paymentAuthExpiryEmail.js';
import type { GiftCreatedSpyData } from '../src/modules/gift/infrastructure/giftMail.js';
import type { GiftShareCardPdfInput } from '../src/modules/gift/infrastructure/giftShareCardPdf.js';
import type { GiftShareCardStyle } from '../src/modules/gift/domain/shareCardStyle.js';

function ph(name: string): string {
  return `{{${name}}}`;
}

function keysItem(index: number, unitPrice: number, quantity: number): InvoiceItem {
  return {
    productId: ph(`items.${index}.productId`),
    productUid: ph(`items.${index}.productUid`),
    title: ph(`items.${index}.title`),
    shapeKey: ph(`items.${index}.shapeKey`),
    shapeLabel: ph(`items.${index}.shapeLabel`),
    lengthKey: ph(`items.${index}.lengthKey`),
    lengthLabel: ph(`items.${index}.lengthLabel`),
    size: ph(`items.${index}.size`),
    quantity,
    unitPrice,
    lineTotal: unitPrice * quantity,
  };
}

function realisticItem(
  index: number,
  title: string,
  shapeLabel: string,
  lengthLabel: string,
  size: string,
  unitPrice: number,
  quantity: number,
): InvoiceItem {
  const nail = `AQ-YZ-${300 + index}`;
  return {
    productId: `set-${index}`,
    productUid: nail,
    title,
    shapeKey: 'coffin',
    shapeLabel,
    lengthKey: 'medium',
    lengthLabel,
    size,
    quantity,
    unitPrice,
    lineTotal: unitPrice * quantity,
    origin: 'user',
    locked: false,
  };
}

function keysAccessoryItem(index: number, unitPrice: number, quantity: number): InvoiceItem {
  return {
    productId: ph(`items.${index}.productId`),
    productUid: ph(`items.${index}.productUid`),
    title: ph(`items.${index}.title`),
    shapeKey: '',
    shapeLabel: '',
    packKey: ph(`items.${index}.packKey`),
    packLabel: ph(`items.${index}.packLabel`),
    size: '',
    quantity,
    unitPrice,
    lineTotal: unitPrice * quantity,
    origin: 'user',
    locked: false,
  };
}

function realisticAccessoryItem(
  index: number,
  title: string,
  packLabel: string,
  unitPrice: number,
  quantity: number,
): InvoiceItem {
  return {
    productId: `acc-${index}`,
    productUid: `ACC-${300 + index}`,
    title,
    shapeKey: '',
    shapeLabel: '',
    packKey: packLabel,
    packLabel,
    size: '',
    quantity,
    unitPrice,
    lineTotal: unitPrice * quantity,
    origin: 'user',
    locked: false,
  };
}

function keysFreeItem(index: number, quantity: number): InvoiceItem {
  return {
    productId: ph(`items.${index}.productId`),
    productUid: ph(`items.${index}.productUid`),
    title: ph(`items.${index}.title`),
    shapeKey: '',
    shapeLabel: '',
    size: '',
    quantity,
    unitPrice: 0,
    lineTotal: 0,
    origin: 'rule',
    locked: true,
  };
}

function realisticFreeItem(index: number, title: string, quantity: number): InvoiceItem {
  return {
    productId: `gift-${index}`,
    productUid: `GF-${300 + index}`,
    title,
    shapeKey: '',
    shapeLabel: '',
    size: '',
    quantity,
    unitPrice: 0,
    lineTotal: 0,
    origin: 'rule',
    locked: true,
  };
}

function baseAddress(keys: boolean) {
  if (keys) {
    return {
      recipientName: ph('recipientName'),
      companyName: ph('companyName'),
      line1: ph('line1'),
      line2: ph('line2'),
      postalCode: ph('postalCode'),
      city: ph('city'),
      countryCode: ph('countryCode'),
      billingRecipientName: ph('billingRecipientName'),
      billingCompanyName: ph('billingCompanyName'),
      billingLine1: ph('billingLine1'),
      billingLine2: ph('billingLine2'),
      billingPostalCode: ph('billingPostalCode'),
      billingCity: ph('billingCity'),
      billingCountryCode: ph('billingCountryCode'),
    };
  }
  return {
    recipientName: 'Camille Dupont',
    companyName: null as string | null,
    line1: '12 rue des Lilas',
    line2: 'Apt 4B',
    postalCode: '75011',
    city: 'Paris',
    countryCode: 'FR',
    billingRecipientName: 'Camille Dupont',
    billingCompanyName: 'Studio Nail Art SAS',
    billingLine1: '8 avenue de la République',
    billingLine2: null as string | null,
    billingPostalCode: '69003',
    billingCity: 'Lyon',
    billingCountryCode: 'FR',
  };
}

export type InvoiceFixtureScenario = 'standard' | 'accessory' | 'free' | 'gift';

function nailSamples(keys: boolean, count: number): InvoiceItem[] {
  if (keys) {
    return Array.from({ length: count }, (_, i) => keysItem(i, 18.5 + (i % 5), 1 + (i % 2)));
  }
  const samples = [
    ['Floral blush', 'Cercueil', 'Mi-longues', 'M', 28],
    ['Nude chrome', 'Amande', 'Courtes', 'S', 26],
    ['French tip rose', 'Carré', 'Longues', 'L', 24],
    ['Galaxy glitter', 'Stiletto', 'Extra longues', 'XS', 32],
    ['Matte burgundy', 'Cercueil', 'Mi-longues', 'M', 27],
  ] as const;
  return Array.from({ length: count }, (_, i) => {
    const [title, shape, length, size, price] = samples[i % samples.length]!;
    return realisticItem(i, `${title} #${i + 1}`, shape, length, size, price, 1 + (i % 2));
  });
}

function buildInvoiceItems(
  keys: boolean,
  multipage: boolean,
  scenario: InvoiceFixtureScenario,
): InvoiceItem[] {
  const nails = nailSamples(keys, scenario === 'standard' ? (multipage ? 36 : 3) : 2);
  if (scenario === 'standard') return nails;
  if (scenario === 'accessory') {
    return keys
      ? [...nails, keysAccessoryItem(nails.length, 6.5, 1), keysAccessoryItem(nails.length + 1, 4, 2)]
      : [
          ...nails,
          realisticAccessoryItem(nails.length, 'Lime professionnelle', 'x2', 6.5, 1),
          realisticAccessoryItem(nails.length + 1, 'Colle extra forte', '', 4, 2),
        ];
  }
  if (scenario === 'free') {
    return keys
      ? [...nails, keysFreeItem(nails.length, 2)]
      : [...nails, realisticFreeItem(nails.length, 'Mini stickers', 2)];
  }
  return nails;
}

function giftAddress(keys: boolean) {
  const address = baseAddress(keys);
  if (keys) return address;
  return {
    ...address,
    recipientName: 'Julie Martin',
    companyName: null,
    line1: '5 rue des Fleurs',
    line2: null,
    postalCode: '33000',
    city: 'Bordeaux',
    countryCode: 'FR',
    billingRecipientName: 'Marc Dupont',
    billingCompanyName: null,
    billingLine1: '12 rue des Lilas',
    billingLine2: 'Apt 4B',
    billingPostalCode: '75011',
    billingCity: 'Paris',
    billingCountryCode: 'FR',
  };
}

export function buildInvoiceData(options: {
  keys: boolean;
  multipage: boolean;
  voucher: boolean;
  scenario?: InvoiceFixtureScenario;
}): InvoiceData {
  const { keys, multipage, voucher } = options;
  const scenario = options.scenario ?? 'standard';
  const items = buildInvoiceItems(keys, multipage, scenario);
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const shippingFee = 4.9;
  const voucherDiscount = voucher ? 5 : null;
  const total = Math.max(0, subtotal + shippingFee - (voucherDiscount ?? 0));
  const address = scenario === 'gift' ? giftAddress(keys) : baseAddress(keys);

  return {
    invoiceNumber: keys ? ph('invoiceNumber') : 'FACT-000042',
    orderNumber: keys ? ph('orderNumber') : 'CMD-2026-0042',
    orderDate: keys ? new Date('2026-01-15T12:00:00Z') : new Date('2026-03-18T14:30:00Z'),
    integrityToken: keys ? ph('integrityToken') : 'a1b2-c3d4-e5f6',
    ...address,
    items,
    subtotal,
    shippingFee,
    shippingListFee: shippingFee,
    rulesItemDiscount: 0,
    courierName: keys ? ph('courierName') : 'Mondial Relay domicile',
    express: false,
    voucherCode: voucher ? (keys ? ph('voucherCode') : 'BIENVENUE5') : null,
    voucherDiscount,
    loyaltyCredit: null,
    total,
    paymentCaptureStatus: 'captured',
    paymentMethodType: 'card',
    paymentCardBrand: keys ? ph('paymentCardBrand') : 'visa',
    paymentCardLast4: keys ? ph('paymentCardLast4') : '4242',
    gift:
      scenario === 'gift'
        ? {
            giverDisplayName: keys ? ph('gift.giverDisplayName') : 'Marc Dupont',
            receiverName: keys ? ph('gift.receiverName') : 'Julie Martin',
            maxSets: 3,
            maxBudget: 120,
          }
        : null,
  };
}

function orderItems(keys: boolean, withMany: boolean): OrderEmailData['items'] {
  const invoiceItems = buildInvoiceItems(keys, withMany, 'standard');
  return invoiceItems.map((item) => ({
    productId: item.productId,
    productUid: item.productUid,
    title: item.title,
    shapeKey: item.shapeKey,
    shapeLabel: item.shapeLabel,
    lengthKey: item.lengthKey,
    lengthLabel: item.lengthLabel,
    packKey: item.packKey,
    packLabel: item.packLabel,
    size: item.size,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal,
  }));
}

export function buildOrderEmailData(keys: boolean, voucher: boolean): OrderEmailData {
  const items = orderItems(keys, false);
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const shippingFee = 4.9;
  const voucherDiscount = voucher ? 5 : null;
  return {
    orderNumber: keys ? ph('orderNumber') : 'CMD-2026-0042',
    total: Math.max(0, subtotal + shippingFee - (voucherDiscount ?? 0)),
    courierName: keys ? ph('courierName') : 'Mondial Relay domicile',
    express: false,
    shippingFee,
    voucherCode: voucher ? (keys ? ph('voucherCode') : 'BIENVENUE5') : null,
    voucherDiscount,
    integrityToken: keys ? ph('integrityToken') : 'a1b2-c3d4-e5f6',
    recipientName: keys ? ph('recipientName') : 'Camille Dupont',
    companyName: keys ? ph('companyName') : null,
    line1: keys ? ph('line1') : '12 rue des Lilas',
    line2: keys ? ph('line2') : 'Apt 4B',
    postalCode: keys ? ph('postalCode') : '75011',
    city: keys ? ph('city') : 'Paris',
    countryCode: keys ? ph('countryCode') : 'FR',
    billingSameAsShipping: false,
    billingRecipientName: keys ? ph('billingRecipientName') : 'Camille Dupont',
    billingCompanyName: keys ? ph('billingCompanyName') : 'Studio Nail Art SAS',
    billingLine1: keys ? ph('billingLine1') : '8 avenue de la République',
    billingLine2: keys ? ph('billingLine2') : null,
    billingPostalCode: keys ? ph('billingPostalCode') : '69003',
    billingCity: keys ? ph('billingCity') : 'Lyon',
    billingCountryCode: keys ? ph('billingCountryCode') : 'FR',
    items,
  };
}

const FRONT_URL = 'https://example.pamsurin.fr';

export function passwordResetArgs(keys: boolean): string {
  return keys
    ? `${FRONT_URL}/account/reset-password?token=${ph('token')}`
    : `${FRONT_URL}/account/reset-password?token=demo-reset-token`;
}

export function emailConfirmationArgs(keys: boolean): { link: string; otp: string } {
  return {
    link: keys
      ? `${FRONT_URL}/account/confirm-email?token=${ph('token')}`
      : `${FRONT_URL}/account/confirm-email?token=demo-confirm-token`,
    otp: keys ? ph('otp') : '483920',
  };
}

export function emailChangeSecurityArgs(keys: boolean): { newEmail: string; lockUrl: string } {
  return {
    newEmail: keys ? ph('newEmail') : 'camille.nouveau@example.com',
    lockUrl: keys
      ? `${FRONT_URL}/account/security-lock?token=${ph('lockToken')}`
      : `${FRONT_URL}/account/security-lock?token=demo-lock-token`,
  };
}

export function deletionRequestedArgs(keys: boolean): string {
  return keys ? ph('scheduledForDate') : '22 août 2026';
}

export function deletionReminderArgs(keys: boolean): { daysLeft: number; scheduledForDate: string } {
  return {
    daysLeft: keys ? 5 : 5,
    scheduledForDate: keys ? ph('scheduledForDate') : '22 août 2026',
  };
}

export function invoiceEmailArgs(keys: boolean): string {
  return keys ? ph('orderNumber') : 'CMD-2026-0042';
}

export function contactMessageData(keys: boolean): ContactMessageData {
  return {
    email: keys ? ph('email') : 'camille.dupont@example.com',
    identity: keys ? ph('identity') : 'Camille Dupont',
    message: keys ? ph('message') : 'Bonjour, j’aimerais savoir si vous livrez en Belgique.',
    userId: null,
    firstName: null,
    lastName: null,
  };
}

export function accountCreatedSpyData(keys: boolean): AccountCreatedEmailData {
  return {
    email: keys ? ph('email') : 'camille.dupont@example.com',
    userId: keys ? ph('userId') : '11111111-2222-3333-4444-555555555555',
  };
}

export function accountDeletionSpyData(keys: boolean): AccountDeletionRequestedEmailData {
  return {
    email: keys ? ph('email') : 'camille.dupont@example.com',
    userId: keys ? ph('userId') : '11111111-2222-3333-4444-555555555555',
    deletionScheduledFor: keys ? ph('deletionScheduledFor') : '2026-08-22T12:00:00.000Z',
  };
}

export function emailChangedSpyData(keys: boolean): EmailChangedEmailData {
  return {
    oldEmail: keys ? ph('oldEmail') : 'camille.dupont@example.com',
    newEmail: keys ? ph('newEmail') : 'camille.nouveau@example.com',
    userId: keys ? ph('userId') : '11111111-2222-3333-4444-555555555555',
  };
}

export function loginSpyData(keys: boolean): LoginEmailData {
  return {
    email: keys ? ph('email') : 'camille.dupont@example.com',
    userId: keys ? ph('userId') : '11111111-2222-3333-4444-555555555555',
    ip: keys ? ph('ip') : '203.0.113.10',
    location: keys ? ph('location') : 'Paris, FR',
    device: keys ? ph('device') : 'Chrome · Linux',
  };
}

export function paymentFailedSpyData(keys: boolean): PaymentFailedEmailData {
  return {
    userEmail: keys ? ph('userEmail') : 'camille.dupont@example.com',
    userId: keys ? ph('userId') : '11111111-2222-3333-4444-555555555555',
    amount: keys ? 42.5 : 42.5,
    currency: keys ? 'eur' : 'eur',
    failureMessage: keys ? ph('failureMessage') : 'Your card was declined.',
    failureCode: keys ? ph('failureCode') : 'card_declined',
  };
}

export function paymentAuthorizationExpiredSpyData(keys: boolean): PaymentAuthorizationExpiredEmailData {
  return {
    userEmail: keys ? ph('userEmail') : 'camille.dupont@example.com',
    userId: keys ? ph('userId') : '11111111-2222-3333-4444-555555555555',
    amount: keys ? 42.5 : 42.5,
    currency: keys ? 'eur' : 'eur',
    paymentMethodType: keys ? ph('paymentMethodType') : 'paypal',
    orderNumber: keys ? ph('orderNumber') : 'PS-2026-0042',
    orderId: keys ? ph('orderId') : 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  };
}

export function paymentAuthorizationExpiringSpyData(keys: boolean): PaymentAuthorizationExpiringEmailData {
  return {
    userEmail: keys ? ph('userEmail') : 'camille.dupont@example.com',
    userId: keys ? ph('userId') : '11111111-2222-3333-4444-555555555555',
    amount: keys ? 42.5 : 42.5,
    currency: keys ? 'eur' : 'eur',
    paymentMethodType: keys ? ph('paymentMethodType') : 'card',
    orderNumber: keys ? ph('orderNumber') : 'PS-2026-0042',
    orderId: keys ? ph('orderId') : 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    estimatedExpiresAt: keys ? '2026-09-19T10:00:00.000Z' : '2026-09-19T10:00:00.000Z',
  };
}

export function cartAbandonedSpyData(keys: boolean): CartAbandonmentEmailData {
  return {
    userEmail: keys ? ph('userEmail') : 'camille.dupont@example.com',
    userId: keys ? ph('userId') : '11111111-2222-3333-4444-555555555555',
    removedItem: {
      productId: keys ? ph('removedItem.productId') : 'set-1',
      nailRef: keys ? ph('removedItem.nailRef') : 'AQ-YZ-301',
      title: keys ? ph('removedItem.title') : 'Floral blush',
      shapeKey: keys ? ph('removedItem.shapeKey') : 'coffin',
      size: keys ? ph('removedItem.size') : 'M',
      quantity: 1,
    },
  };
}

export function giftGiverMailArgs(keys: boolean): {
  giverToken: string;
  receiverToken: string;
  language: 'fr';
  giverDisplayName: string;
  receiverName: string;
  giverComment: string;
  validUntil: Date;
} {
  return {
    giverToken: keys ? ph('giverToken') : 'demo-giver-token',
    receiverToken: keys ? ph('receiverToken') : 'demo-receiver-token',
    language: 'fr',
    giverDisplayName: keys ? ph('giverDisplayName') : 'Marc',
    receiverName: keys ? ph('receiverName') : 'Julie',
    giverComment: keys ? ph('giverComment') : 'Joyeux anniversaire, choisis ce qui te plaît.',
    validUntil: keys ? new Date('2026-10-01T12:00:00.000Z') : new Date('2026-10-01T12:00:00.000Z'),
  };
}

export const GIFT_SHARE_CARD_FIXTURE_COPIES = ['keys', 'short', 'mid', 'full', 'wrap'] as const;
export type GiftShareCardFixtureCopy = (typeof GIFT_SHARE_CARD_FIXTURE_COPIES)[number];

const GIFT_SHARE_CARD_COMMENTS: Record<Exclude<GiftShareCardFixtureCopy, 'keys'>, string> = {
  short: 'Pour toi.',
  mid: 'Joyeux anniversaire.\nChoisis ce qui te plaît.\nJe t’embrasse.',
  full: [
    'Joyeux anniversaire, ma belle.',
    'Choisis les sets qui te font vraiment plaisir.',
    'Sans te presser, prends le temps qu’il faut.',
    'La taille qui te va, celle que tu aimes.',
    'Je t’embrasse fort et je pense à toi.',
    'À très vite, j’ai hâte de te voir.',
  ].join('\n'),
  wrap: 'Joyeux anniversaire, choisis les sets qui te font vraiment plaisir sans te presser, la taille qui te va, et amuse-toi bien avec tout ça.',
};

export function buildGiftShareCardData(options: {
  copy: GiftShareCardFixtureCopy;
  style: GiftShareCardStyle;
}): GiftShareCardPdfInput {
  const names = giftGiverMailArgs(options.copy === 'keys');
  return {
    receiverUrl: `${FRONT_URL}/fr/gift/${names.receiverToken}`,
    giverDisplayName: names.giverDisplayName,
    receiverName: names.receiverName,
    giverComment: options.copy === 'keys' ? names.giverComment : GIFT_SHARE_CARD_COMMENTS[options.copy],
    style: options.style,
    language: 'fr',
    expiresAt: new Date('2026-10-01T12:00:00.000Z'),
  };
}

export function productRequestSpyData(keys: boolean): ProductRequestEmailData {
  return {
    publicId: keys ? ph('publicId') : 'PR-0042',
    email: keys ? ph('email') : 'camille.dupont@example.com',
    userId: keys ? ph('userId') : '11111111-2222-3333-4444-555555555555',
    productUid: keys ? ph('productUid') : 'AQ-YZ-301',
    title: keys ? ph('title') : 'Floral blush',
    shapeLabel: keys ? ph('shapeLabel') : 'Cercueil',
    lengthKey: keys ? ph('lengthKey') : 'medium',
    size: keys ? ph('size') : 'M',
    quantity: 1,
    comment: keys ? ph('comment') : 'Merci de me prévenir si vous pouvez le refaire.',
  };
}

export function productRequestResponseData(
  keys: boolean,
  accepted: boolean,
): {
  publicId: string;
  token: string;
  title: string;
  size: string;
  quantity: number;
  price: number;
  message: string;
  accepted: boolean;
} {
  return {
    publicId: keys ? ph('publicId') : 'PR-0042',
    token: keys ? ph('token') : 'demo-request-token',
    title: keys ? ph('title') : 'Floral blush',
    size: keys ? ph('size') : 'M',
    quantity: 1,
    price: keys ? 28 : 28,
    message: keys
      ? ph('message')
      : accepted
        ? 'La taille M est de nouveau disponible. Tu peux commander depuis le lien ci-dessous.'
        : 'Cette taille ne pourra pas être reproduite pour le moment.',
    accepted,
  };
}

export function loyaltyExpiryArgs(keys: boolean): { atRisk: string; expiresAt: string } {
  return {
    atRisk: keys ? ph('atRisk') : '12.50',
    expiresAt: keys ? ph('expiresAt') : '22 octobre 2026',
  };
}

export function orderReturnArgs(keys: boolean): {
  orderNumber: string;
  refundAmountCents: number;
  courierRetainedCents: number;
} {
  return {
    orderNumber: keys ? ph('orderNumber') : 'CMD-2026-0042',
    refundAmountCents: 4290,
    courierRetainedCents: 490,
  };
}

export function contactReplyArgs(keys: boolean): string {
  return keys ? ph('message') : 'Merci pour ton message. Oui, nous livrons en Belgique.';
}

export function chatReplyPreview(keys: boolean): string {
  return keys ? ph('body') : 'Bonjour, ta commande a bien été mise à jour. Tu peux me répondre ici.';
}

export function giftCreatedSpyData(keys: boolean): GiftCreatedSpyData {
  return {
    offerId: keys ? ph('offerId') : 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    giverEmail: keys ? ph('giverEmail') : 'marc.dupont@example.com',
    giverDisplayName: keys ? ph('giverDisplayName') : 'Marc',
    giverUserId: keys ? ph('giverUserId') : '11111111-2222-3333-4444-555555555555',
    receiverName: keys ? ph('receiverName') : 'Julie',
    giverComment: keys ? ph('giverComment') : 'Joyeux anniversaire, choisis ce qui te plaît.',
    maxBudget: keys ? 120 : 120,
    allowAccessories: true,
    maxAccessoryBudget: keys ? 40 : 40,
    hideReceiverPrices: true,
    language: 'fr',
    offerExpiresAt: keys ? new Date('2026-10-01T12:00:00.000Z') : new Date('2026-10-01T12:00:00.000Z'),
    shareCardStyle: keys ? 'pamsurin' : 'pamsurin',
    signedIn: true,
  };
}

/** Shared by every `spy.rate_limit_*` admin kind — one template, different labels. */
export function rateLimitedSpyData(keys: boolean): RateLimitedEmailData {
  return {
    kindLabel: keys ? ph('kindLabel') : 'auth (IP)',
    method: keys ? ph('method') : 'POST',
    path: keys ? ph('path') : '/auth/register',
    ip: keys ? ph('ip') : '203.0.113.10',
    userAgent: keys ? ph('userAgent') : 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
    userId: keys ? ph('userId') : '11111111-2222-3333-4444-555555555555',
    userEmail: keys ? ph('userEmail') : 'camille.dupont@example.com',
    reason: keys ? ph('reason') : 'day',
    retryAfterSec: keys ? 42 : 42,
    suppressedCount: keys ? 7 : 7,
  };
}

export function orderConfirmationSpyMeta(keys: boolean): { customerEmail: string; userId: string } {
  return {
    customerEmail: keys ? ph('customerEmail') : 'camille.dupont@example.com',
    userId: keys ? ph('userId') : '11111111-2222-3333-4444-555555555555',
  };
}
