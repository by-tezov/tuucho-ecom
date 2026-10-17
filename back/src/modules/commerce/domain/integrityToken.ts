/** Renders an order's content hash as the short, groups-of-four token a
 * customer can read out. Pure formatting, shared by the order presenter, the
 * admin screens and the invoice renderer, so it belongs to the commerce
 * vocabulary rather than to the order flow. */
export function formatIntegrityToken(hash: string): string {
  const prefix = hash.slice(0, 16).toUpperCase();
  return prefix.match(/.{1,4}/g)!.join('-');
}
