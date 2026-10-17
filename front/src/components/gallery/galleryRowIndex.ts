/** Which virtualized row holds this product in the current column count. */
export function galleryRowIndexForProduct(
  items: readonly { productUid: string }[],
  productUid: string,
  columnCount: number,
): number | null {
  if (columnCount < 1) return null;
  const index = items.findIndex((item) => item.productUid === productUid);
  if (index < 0) return null;
  return Math.floor(index / columnCount);
}
