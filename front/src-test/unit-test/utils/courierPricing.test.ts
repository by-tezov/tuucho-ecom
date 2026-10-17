import { describe, expect, it } from 'vitest';
import type { Courier } from '../../../src/api/account';
import { pickCourierTier, resolvePacketPrice } from '../../../src/utils/courierPricing';

const courier: Courier = {
  code: 'test',
  name: 'Test courier',
  sortOrder: 1,
  countries: ['FR', 'BE'],
  networks: ['home'],
  packets: [
    { packetKey: 'small', maxQuantity: 2, price: 4, expressPrice: null },
    { packetKey: 'large', maxQuantity: 6, price: { FR: 7, BE: 9 }, expressPrice: null },
  ],
};

describe('courier pricing preview', () => {
  it('selects the first packet tier that fits and rejects overflow', () => {
    expect(pickCourierTier(courier, 2)?.packetKey).toBe('small');
    expect(pickCourierTier(courier, 3)?.packetKey).toBe('large');
    expect(pickCourierTier(courier, 7)).toBeUndefined();
  });

  it('keeps per-country prices pending until a supported destination exists', () => {
    expect(resolvePacketPrice({ FR: 7, BE: 9 }, null)).toBeNull();
    expect(resolvePacketPrice({ FR: 7, BE: 9 }, 'FR')).toBe(7);
    expect(resolvePacketPrice({ FR: 7, BE: 9 }, 'DE')).toBeNull();
    expect(resolvePacketPrice(5, 'DE')).toBe(5);
  });
});
