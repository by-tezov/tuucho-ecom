export interface GiftSetPriceRange {
  min: number;
  max: number;
}

/**
 * How many nail sets a gift budget could buy, counted at the cheapest public
 * set currently in stock (`GET /gift/settings.setPriceRange`).
 *
 * The giver picks a number of euros with no idea what a set costs, so the
 * budget field restates it as a count. One number, always the ceiling: the
 * receiver may spend it on fewer, dearer sets, which "up to" already says.
 * A lower bound taken from the dearest set said nothing more ("up to 2" and
 * "1 to 2" are the same sentence) and jumped between the two wordings on a
 * one-euro change, so it is deliberately not computed.
 *
 * Shipping is not deducted: the offer's budget covers merchandise only (the
 * giver pays delivery at checkout), so dividing by a set price is the same
 * arithmetic the gift cart later applies.
 *
 * Returns `null` when there is nothing to say, and `0` when the budget does
 * not even cover the cheapest set.
 */
export function giftSetsEstimate(
  budget: number,
  priceRange: GiftSetPriceRange | null | undefined,
  setsCeiling = 0,
): number | null {
  if (!priceRange) return null;
  if (!Number.isFinite(budget) || budget <= 0) return null;
  const cheapest = Math.min(priceRange.min, priceRange.max);
  if (!(cheapest > 0)) return null;

  const sets = Math.floor(budget / cheapest);
  return setsCeiling > 0 ? Math.min(sets, Math.floor(setsCeiling)) : sets;
}
