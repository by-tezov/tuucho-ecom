import { config } from '../../../config/env.js';
import { pool } from '../../../db/pool.js';
import {
  loadCopyVocabulary,
  resolveLocalizedCopy,
  type CopyVocabulary,
} from '../../catalog/application/productCopyResolution.js';
import { hasStoredModalHash } from '../../../media/photoHash.js';
import {
  formatIntegrityToken,
  parseOrderItemColors,
  parseOrderItemPhotos,
  type OrderItemRow,
  type OrderRow,
} from '../application/ordersFacade.js';
import { decryptJsonPii } from '../../../platform/security/piiCrypto.js';
import { localize, type Language } from '../../../utils/language.js';
import { readPluginSnapshot, totalsFromPluginSnapshot } from '../application/orderPluginSnapshot.js';

function publicGiftFromOrder(order: OrderRow) {
  const raw = order.gift_snapshot;
  if (!raw || typeof raw !== 'object') return null;
  const enc = (raw as { enc?: unknown }).enc;
  if (typeof enc !== 'string') return null;
  try {
    const snap = decryptJsonPii<{
      offerId: string;
      giverDisplayName: string;
      receiverName: string;
      maxSets: number | null;
      maxBudget: number | null;
      hideReceiverPrices: boolean;
    }>(enc);
    if (!snap) return null;
    return {
      offerId: snap.offerId,
      giverDisplayName: snap.giverDisplayName,
      receiverName: snap.receiverName,
      maxSets: snap.maxSets,
      maxBudget: snap.maxBudget,
      hideReceiverPrices: snap.hideReceiverPrices !== false,
    };
  } catch {
    return null;
  }
}

function toPublicOrderItem(row: OrderItemRow, language: Language, vocabulary: CopyVocabulary) {
  const photos = parseOrderItemPhotos(row.photos);
  // Trust the confirm-time modal hash on read paths. Re-hashing every photo
  // from disk on list/detail was an N×SHA-256 tax; import/checkout still
  // verify with modalPhotoMatches when writing the snapshot.
  const publicPhotos = photos.map((photo) => {
    const ok = hasStoredModalHash(photo.hash);
    return {
      position: photo.position,
      small: ok ? `${config.publicMediaUrl}/${photo.smallPath.replace(/^\/+/, '')}` : null,
      modal: ok ? `${config.publicMediaUrl}/${photo.modalPath.replace(/^\/+/, '')}` : null,
    };
  });
  const primary = publicPhotos[0];
  const photo =
    primary?.small ??
    (photos.length === 0 && row.photo_path
      ? `${config.publicMediaUrl}/${row.photo_path.replace(/^\/+/, '')}`
      : null);

  const colors = parseOrderItemColors(row.colors);
  return {
    id: row.id,
    productId: row.product_id,
    productUid: row.product_uid,
    productType: row.product_type,
    title: localize(row.title, language),
    // Orders placed before checkout resolved the snapshot still hold the
    // authored template; resolving an already-resolved string is a no-op.
    desc: row.desc ? resolveLocalizedCopy(row.desc, vocabulary, row.shape_key, row.length_key, language) : null,
    occasion: row.occasion ? localize(row.occasion, language) : null,
    colorMain: colors
      .filter((entry) => entry.role === 'main')
      .map((entry) => localize(entry.label, language)),
    colorSecondary: colors
      .filter((entry) => entry.role === 'secondary')
      .map((entry) => localize(entry.label, language)),
    shapeKey: row.shape_key,
    shapeLabel: row.shape_label ? localize(row.shape_label, language) : row.shape_key,
    lengthKey: row.length_key,
    lengthLabel: row.length_label ? localize(row.length_label, language) : row.length_key,
    photo,
    photos: publicPhotos,
    size: row.size,
    packKey: row.pack_key ?? '',
    packLabel: row.pack_label ? localize(row.pack_label, language) : row.pack_key || '',
    quantity: row.quantity,
    unitPrice: Number(row.unit_price),
    lineTotal: Number(row.line_total),
    origin: row.origin ?? 'user',
    locked: row.locked ?? false,
    ruleCode: row.rule_code ?? null,
    comment: row.comment ?? null,
    nails: (row.nails ?? []).map((nail) => ({
      productId: nail.product_id,
      productUid: nail.product_uid,
      title: localize(nail.title, language),
      shapeKey: nail.shape_key,
      shapeLabel: nail.shape_label ? localize(nail.shape_label, language) : nail.shape_key,
      lengthKey: nail.length_key,
      lengthLabel: nail.length_label ? localize(nail.length_label, language) : nail.length_key,
      finger: nail.finger,
      variationKey: nail.variation_key ?? '',
      variationLabel: nail.variation_label ? localize(nail.variation_label, language) : '',
      variationAxisLabel: nail.variation_axis_label ? localize(nail.variation_axis_label, language) : '',
      photo: nail.photo_path
        ? `${config.publicMediaUrl}/${nail.photo_path.replace(/^\/+/, '')}`
        : null,
      unitPrice: Number(nail.unit_price),
    })),
  };
}

/** Map the encrypted/storage-oriented order row to the documented account DTO. */
export async function toPublicOrder(
  order: OrderRow,
  items: OrderItemRow[],
  language: Language,
  trackingAvailable: boolean,
  revisionCount = 0,
) {
  const vocabulary = await loadCopyVocabulary(pool);
  const pluginTotals = totalsFromPluginSnapshot(readPluginSnapshot(order.plugin_snapshot), {
    voucherCode: order.voucher_code,
    voucherDiscount: order.voucher_code
      ? Number(order.voucher_item_discount) + Number(order.voucher_shipping_discount)
      : null,
    loyaltyCredit: Number(order.loyalty_credit ?? 0),
    loyaltyEarn: Number(order.loyalty_earn ?? 0),
    loyaltyEarnStatus: order.loyalty_earn_status ?? 'void',
  });
  return {
    id: order.id,
    orderNumber: order.order_number,
    status: order.status,
    recipientName: order.recipient_name,
    companyName: order.company_name,
    line1: order.line1,
    line2: order.line2,
    deliveryNotes: order.delivery_notes,
    postalCode: order.postal_code,
    city: order.city,
    countryCode: order.country_code,
    phone: order.phone,
    addressId: order.address_id,
    networkCode: order.network_code,
    pickupPoint: order.pickup_point,
    courierCode: order.courier_code,
    courierName: order.courier_name ? localize(order.courier_name, language) : null,
    trackingAvailable,
    packetKey: order.packet_key,
    express: order.express,
    shippingFee: Number(order.shipping_fee),
    shippingListFee: Number(order.shipping_list_fee ?? order.shipping_fee),
    rulesItemDiscount: Number(order.rules_item_discount ?? 0),
    cartRulesSnapshot: order.cart_rules_snapshot ?? {},
    extraLines: pluginTotals.extraLines.map((line) => ({ label: line.label, amount: line.amount })),
    voucherCode: pluginTotals.voucherCode,
    voucherDiscount: pluginTotals.voucherDiscount,
    loyaltyCredit: pluginTotals.loyaltyCredit,
    loyaltyEarn: pluginTotals.loyaltyEarn,
    loyaltyEarnStatus: pluginTotals.loyaltyEarnStatus,
    integrityToken: order.content_hash ? formatIntegrityToken(order.content_hash) : null,
    revisionCount,
    paymentCaptureStatus: order.payment_capture_status,
    paymentMethod: order.payment_method_type
      ? {
          type: order.payment_method_type,
          brand: order.payment_card_brand,
          last4: order.payment_card_last4,
        }
      : null,
    total: Number(order.total),
    confirmedAt: order.confirmed_at,
    statusUpdatedAt: order.status_updated_at,
    billingSameAsShipping: order.billing_same_as_shipping,
    billingAddressId: order.billing_address_id,
    billingRecipientName: order.billing_recipient_name,
    billingCompanyName: order.billing_company_name,
    billingLine1: order.billing_line1,
    billingLine2: order.billing_line2,
    billingPostalCode: order.billing_postal_code,
    billingCity: order.billing_city,
    billingCountryCode: order.billing_country_code,
    billingPhone: order.billing_phone,
    placedAsGuest: order.placed_as_guest === true,
    gift: publicGiftFromOrder(order),
    items: items.map((item) => toPublicOrderItem(item, language, vocabulary)),
  };
}
