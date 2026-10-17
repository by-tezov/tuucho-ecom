import type { Courier, CourierPacket } from '../api/account';

/** Select the first server-ordered packet tier that can carry the cart.
 * `totalQuantity` is customer-added nail-set count; accessories count as 0. */
export function pickCourierTier(courier: Courier, totalQuantity: number): CourierPacket | undefined {
  return courier.packets.find((packet) => packet.maxQuantity >= totalQuantity);
}

/** Resolve scalar or per-country packet pricing once a destination exists. */
export function resolvePacketPrice(
  price: number | Record<string, number> | undefined,
  countryCode: string | null | undefined,
): number | null {
  if (price == null || !countryCode) return null;
  if (typeof price === 'number') return price;
  const value = price[countryCode];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
