import type { Address, Courier, PickupPoint } from '../api/account';
import { isWorldwideCountryList } from './checkoutOverflow';

/** Networks that actually describe this address for courier matching.
 * A pickup/locker row may still carry `home` from guest checkout (the
 * guest payload always offered home as well). Home delivery cannot serve
 * a relay point, so pickup-point keys win when present. */
export function addressDeliveryNetworks(
  address: Pick<Address, 'networkCodes'> & { pickupPoints?: Record<string, PickupPoint> },
): string[] {
  const pickupNetworks = Object.keys(address.pickupPoints ?? {}).filter((code) => {
    const point = address.pickupPoints?.[code];
    return !!point?.id;
  });
  return pickupNetworks.length > 0 ? pickupNetworks : address.networkCodes;
}

/** Whether a courier can actually deliver to an address — country served
 * and at least one shared delivery network (an address can belong to more
 * than one network at once, so this is an overlap check, not equality).
 * Shared between CartPage's own gray-out-with-reason UI and
 * AccountAddressesPage's default-address/default-courier conflict check. */
export function courierMatch(
  courier: Courier,
  address: Pick<Address, 'countryCode' | 'networkCodes'> & { pickupPoints?: Record<string, PickupPoint> },
): { countryOk: boolean; networkOk: boolean } {
  const networks = addressDeliveryNetworks(address);
  return {
    countryOk: isWorldwideCountryList(courier.countries) || courier.countries.includes(address.countryCode),
    networkOk: courier.networks.some((code) => networks.includes(code)),
  };
}

export function courierCompatible(
  courier: Courier,
  address: Pick<Address, 'countryCode' | 'networkCodes'> & { pickupPoints?: Record<string, PickupPoint> },
): boolean {
  const { countryOk, networkOk } = courierMatch(courier, address);
  return countryOk && networkOk;
}
