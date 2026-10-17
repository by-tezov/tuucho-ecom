/** True when any shape/length/size still has a purchasable quantity. */
export function galleryItemHasPurchasableStock(
  available: Record<string, Record<string, Partial<Record<string, number>>>>,
): boolean {
  for (const lengths of Object.values(available)) {
    for (const sizes of Object.values(lengths)) {
      for (const qty of Object.values(sizes)) {
        if ((qty ?? 0) > 0) return true;
      }
    }
  }
  return false;
}
