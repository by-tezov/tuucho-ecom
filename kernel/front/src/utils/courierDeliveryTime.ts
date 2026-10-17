import type { Courier, CourierDeliveryTime } from '../api/account';

/** The estimate to show for a courier, given where the parcel is going.
 * Undefined covers a missing destination country or a courier that declared
 * no estimate for that country. */
export function courierDeliveryTime(
  courier: Courier,
  countryCode?: string | null,
): CourierDeliveryTime | undefined {
  if (!countryCode) return undefined;
  return courier.deliveryTimes?.[countryCode];
}
