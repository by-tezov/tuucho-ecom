export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function totalSetQuantity(items: ReadonlyArray<{ quantity: number }>): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

export function remainingSlots(maxSets: number | null, quantity: number): number | null {
  if (maxSets == null) return null;
  return maxSets - quantity;
}

export function remainingBudget(maxBudget: number | null, merchandise: number): number | null {
  if (maxBudget == null) return null;
  return roundMoney(maxBudget - merchandise);
}

export function isNailGiftItem(item: { productType: string }): boolean {
  return item.productType === 'nail' || item.productType === 'composition';
}

export function isAccessoryGiftItem(item: { productType: string }): boolean {
  return item.productType === 'accessory';
}

export function leftoverNailBudget(maxBudget: number | null, nailMerchandise: number): number {
  if (maxBudget == null) return 0;
  return Math.max(0, roundMoney(maxBudget - nailMerchandise));
}

function dedicatedAccessoryBudget(maxAccessoryBudget: number | null): number {
  return maxAccessoryBudget == null ? 0 : maxAccessoryBudget;
}

export function accessorySpendCeiling(
  maxBudget: number | null,
  maxAccessoryBudget: number | null,
  nailMerchandise: number,
): number {
  return roundMoney(
    dedicatedAccessoryBudget(maxAccessoryBudget) + leftoverNailBudget(maxBudget, nailMerchandise),
  );
}

export function leftoverClaimedByAccessories(
  maxAccessoryBudget: number | null,
  accessoryMerchandise: number,
): number {
  return Math.max(0, roundMoney(accessoryMerchandise - dedicatedAccessoryBudget(maxAccessoryBudget)));
}

export type GiftConstraintCode =
  'gift_sets_exceeded' | 'gift_budget_exceeded' | 'gift_accessory_budget_exceeded';

export function giftConstraintViolation(
  offer: {
    maxSets: number | null;
    maxBudget: number | null;
    maxAccessoryBudget: number | null;
  },
  items: ReadonlyArray<{ productType: string; unitPrice: number; quantity: number }>,
): GiftConstraintCode | null {
  const nails = items.filter(isNailGiftItem);
  const accessories = items.filter(isAccessoryGiftItem);
  const quantity = nails.reduce((sum, item) => sum + item.quantity, 0);
  const nailMerchandise = roundMoney(nails.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));
  if (offer.maxSets != null && quantity > offer.maxSets) return 'gift_sets_exceeded';
  if (offer.maxBudget != null && nailMerchandise - offer.maxBudget > 1e-9) return 'gift_budget_exceeded';
  const accessoryMerchandise = roundMoney(
    accessories.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
  );
  const ceiling = accessorySpendCeiling(offer.maxBudget, offer.maxAccessoryBudget, nailMerchandise);
  if (accessoryMerchandise - ceiling > 1e-9) return 'gift_accessory_budget_exceeded';
  return null;
}
