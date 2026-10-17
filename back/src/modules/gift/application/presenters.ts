import type { GiftDestination, GiftItem } from '../../../contract/gift.js';
import type { GalleryItem } from '../../../types.js';
import type { FilterOptionsResult } from '../../catalog/application/filterOptionsCache.js';
import {
  accessorySpendCeiling,
  leftoverClaimedByAccessories,
  remainingBudget,
  remainingSlots,
  roundMoney,
  totalSetQuantity,
  isNailGiftItem,
  isAccessoryGiftItem,
} from '../domain/remaining.js';
import type { GiftOfferRow, GiftDestinationRow } from '../infrastructure/giftOfferRepo.js';
import type { AdminGiftOfferListRow } from '../infrastructure/giftAdminOfferRepo.js';
import type { GiftItemRow } from '../infrastructure/giftItemRepo.js';
import { giftQrDataUri } from '../infrastructure/giftQr.js';
import { giftReceiverUrl } from '../infrastructure/giftUrls.js';

export function remainingFrom(
  offer: GiftOfferRow,
  items: ReadonlyArray<{ productType: string; unitPrice: number; quantity: number }>,
) {
  const nails = items.filter(isNailGiftItem);
  const accessories = items.filter(isAccessoryGiftItem);
  const quantity = totalSetQuantity(nails);
  const merchandise = roundMoney(nails.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));
  const accessoryMerchandise = roundMoney(
    accessories.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
  );
  const leftoverUsed = leftoverClaimedByAccessories(offer.maxAccessoryBudget, accessoryMerchandise);
  return {
    quantity,
    merchandise,
    remainingSlots: remainingSlots(offer.maxSets, quantity),
    remainingBudget: remainingBudget(offer.maxBudget, roundMoney(merchandise + leftoverUsed)),
    accessoryMerchandise,
    remainingAccessoryBudget: remainingBudget(
      accessorySpendCeiling(offer.maxBudget, offer.maxAccessoryBudget, merchandise),
      accessoryMerchandise,
    ),
  };
}

export function publicGiftItem(item: GiftItemRow, hidePrices: boolean): GiftItem {
  return {
    productId: item.productId,
    productUid: item.productUid,
    productType: item.productType,
    shapeKey: item.shapeKey,
    lengthKey: item.lengthKey,
    size: item.size,
    packKey: item.packKey,
    quantity: item.quantity,
    ...(hidePrices
      ? {}
      : { unitPrice: item.unitPrice, lineTotal: roundMoney(item.unitPrice * item.quantity) }),
  };
}

export function stripGalleryPrices(item: GalleryItem): GalleryItem {
  const copy = { ...item };
  delete copy.price;
  return copy;
}

export function receiverFilterOptions(
  options: FilterOptionsResult,
  hidePrices: boolean,
  remaining: number | null,
): FilterOptionsResult {
  if (hidePrices) return { ...options, priceRange: null };
  if (remaining == null || !options.priceRange) return options;
  return {
    ...options,
    priceRange: {
      min: options.priceRange.min,
      max: Math.min(options.priceRange.max, remaining),
    },
  };
}

export function clocksOf(offer: GiftOfferRow) {
  return {
    offerExpiresAt: offer.offerExpiresAt?.toISOString() ?? null,
    holdExpiresAt: offer.holdExpiresAt?.toISOString() ?? null,
    payByAt: offer.payByAt?.toISOString() ?? null,
    receiverVisibleUntil: offer.receiverVisibleUntil?.toISOString() ?? null,
  };
}

/** Admin list row: decrypted PII, no capability tokens. */
export function presentAdminGiftOffer(row: AdminGiftOfferListRow) {
  return {
    id: row.id,
    status: row.status,
    giverEmail: row.giverEmail,
    giverDisplayName: row.giverDisplayName,
    receiverName: row.receiverName,
    receiverEmail: row.receiverEmail,
    maxSets: row.maxSets,
    maxBudget: row.maxBudget,
    allowAccessories: row.allowAccessories,
    maxAccessoryBudget: row.maxAccessoryBudget,
    clocks: {
      offerExpiresAt: row.offerExpiresAt?.toISOString() ?? null,
      holdExpiresAt: row.holdExpiresAt?.toISOString() ?? null,
      payByAt: row.payByAt?.toISOString() ?? null,
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function publicDestination(destination: GiftDestinationRow | undefined): GiftDestination | null {
  if (!destination) return null;
  return {
    recipientName: destination.recipientName,
    companyName: destination.companyName,
    line1: destination.line1,
    line2: destination.line2,
    deliveryNotes: destination.deliveryNotes,
    postalCode: destination.postalCode,
    city: destination.city,
    countryCode: destination.countryCode,
    phone: destination.phone,
    courierCode: destination.courierCode,
    networkCodes: destination.networkCodes,
    pickupPoints: destination.pickupPoints,
  };
}

export async function shareCardPayload(offer: GiftOfferRow): Promise<{
  receiverUrl: string;
  receiverToken: string;
  qrDataUri: string;
} | null> {
  const receiverUrl = giftReceiverUrl(offer.receiverToken, offer.language);
  return {
    receiverUrl,
    receiverToken: offer.receiverToken,
    qrDataUri: await giftQrDataUri(receiverUrl),
  };
}
