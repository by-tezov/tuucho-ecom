import { describe, expect, it } from 'vitest';
import { addressDeliveryNetworks, courierCompatible, courierMatch } from '../../../src/utils/courierMatch';
import { courierDeliveryTime } from '../../../src/utils/courierDeliveryTime';
import { courierBadge } from '../../../src/utils/courierBadge';
import { pickupPointName } from '../../../src/utils/pickupPoint';
import type { Courier } from '../../../src/api/account';

const courier = {
  code: 'mondial_relay',
  name: 'Mondial Relay',
  countries: ['FR', 'BE'],
  networks: ['relay', 'home'],
  deliveryTimes: { FR: { custodyDays: 3 } },
} as Courier;

describe('courierMatch', () => {
  it('prefers pickup networks when a point is present', () => {
    expect(
      addressDeliveryNetworks({
        networkCodes: ['home'],
        pickupPoints: { relay: { id: 'P1', name: 'Shop' } as never },
      }),
    ).toEqual(['relay']);
    expect(
      courierMatch(courier, {
        countryCode: 'FR',
        networkCodes: ['home'],
        pickupPoints: { relay: { id: 'P1', name: 'Shop' } as never },
      }),
    ).toEqual({ countryOk: true, networkOk: true });
    expect(
      courierCompatible(courier, {
        countryCode: 'DE',
        networkCodes: ['home'],
      }),
    ).toBe(false);
  });
});

describe('courierDeliveryTime and badge', () => {
  it('reads the country estimate and builds stable letters', () => {
    expect(courierDeliveryTime(courier, 'FR')).toEqual({ custodyDays: 3 });
    expect(courierDeliveryTime(courier, null)).toBeUndefined();
    expect(courierBadge({ code: 'mondial_relay', name: 'Mondial Relay' }).letters).toBe('MR');
    expect(courierBadge({ code: 'chrono', name: 'Chronopost' }).letters).toBe('CH');
  });
});

describe('pickupPointName', () => {
  it('returns the first named point', () => {
    expect(pickupPointName({ relay: { id: '1', name: '  Boutique  ' } as never })).toBe('Boutique');
    expect(pickupPointName({})).toBeNull();
  });
});
