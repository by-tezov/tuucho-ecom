/** Customer-facing product code. Uppercase A-Z and 0-9, dashes only between
 * segments, 1 to 20 characters. Example: AQ-YZ-367 or AA-BB-123-TEST.
 * Callers that accept a URL or a typed target fold case before testing. */
export const PRODUCT_UID_PATTERN = /^[A-Z0-9]+(-[A-Z0-9]+)*$/;
export const PRODUCT_UID_MAX_LENGTH = 20;

export function isProductUid(value: string): boolean {
  const uid = value.trim().toUpperCase();
  return uid.length >= 1 && uid.length <= PRODUCT_UID_MAX_LENGTH && PRODUCT_UID_PATTERN.test(uid);
}
