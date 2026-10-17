import type { PickupPoint } from '../api/account';

/** The public name of the pickup point an address stands for, or null for a
 * plain postal address. Read from the network-keyed map rather than from the
 * address label: the name belongs to the relay/locker itself, so it is
 * rendered as the address's first line and never typed (or edited) by the
 * customer, who names the address freely through `label` instead.
 *
 * One address may be registered with several delivery networks, but they all
 * describe the same physical point — the first name found is that point's. */
export function pickupPointName(pickupPoints: Record<string, PickupPoint> | undefined): string | null {
  for (const point of Object.values(pickupPoints ?? {})) {
    const name = point.name?.trim();
    if (name) return name;
  }
  return null;
}
