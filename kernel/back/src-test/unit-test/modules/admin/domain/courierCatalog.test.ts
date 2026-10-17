import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CourierCatalogError,
  parseCountryLabels,
  parseCourierCatalogWrite,
  parseMeasurementWrite,
} from '../../../../../src/modules/admin/domain/courierCatalog.js';

const locales = {
  en: 'English',
  fr: 'Français',
};

const existing = { countries: ['FR', 'BE'], packets: ['solo', 'duo'] };

describe('courier catalog document', () => {
  it('reads a grouped courier JSON and ignores enable flags', () => {
    const parsed = parseCourierCatalogWrite(
      {
        code: 'mondial-relay-home',
        enabled: false,
        countries: { default: false, FR: true },
        networks: ['$home'],
        sortOrder: 2,
        trackingAvailable: true,
        name: locales,
        description: { ...locales, fr: '' },
        deliveryTime: { default: { min: 3, max: 5 }, BE: { min: 3, max: 6 } },
        packets: [
          { key: 'solo', maxQuantity: 1, price: 4.99 },
          { key: 'duo', maxQuantity: 2, price: { FR: 5.45, BE: 6.1 }, expressPrice: 1.5 },
        ],
      },
      existing,
    );
    assert.equal(parsed.countries[0]?.custodyDays, null);
    assert.equal(parsed.countries[1]?.maxDays, 6);
    assert.equal(parsed.packets[0]?.sortOrder, 0);
    assert.equal(parsed.packets[0]?.prices[1]?.price, 4.99);
    assert.equal(parsed.packets[1]?.prices[1]?.expressPrice, 1.5);
  });

  it('applies one hold-day value to every country', () => {
    const parsed = parseCourierCatalogWrite(
      {
        sortOrder: 1,
        trackingAvailable: true,
        name: locales,
        description: locales,
        deliveryTime: { FR: { min: 3, max: 5 }, BE: { min: 3, max: 5 } },
        custodyTime: 5,
        packets: [
          { key: 'solo', maxQuantity: 1, price: 4.1 },
          { key: 'duo', maxQuantity: 2, price: { default: 4, BE: 4.45 } },
        ],
      },
      existing,
    );
    assert.deepEqual(
      parsed.countries.map((country) => country.custodyDays),
      [5, 5],
    );
    assert.equal(parsed.packets[1]?.prices[0]?.price, 4);
  });

  it('rejects a packet that is not already on the courier', () => {
    assert.throws(
      () =>
        parseCourierCatalogWrite(
          {
            sortOrder: 1,
            trackingAvailable: false,
            name: locales,
            description: locales,
            deliveryTime: { min: 2, max: 4 },
            packets: [{ key: 'nouveau', maxQuantity: 1, price: 4 }],
          },
          existing,
        ),
      (error: unknown) => error instanceof CourierCatalogError && error.status === 400,
    );
  });

  it('ignores extra product languages beyond en and fr', () => {
    const parsed = parseCourierCatalogWrite(
      {
        sortOrder: 1,
        name: { ...locales, th: 'ไทย' },
        description: locales,
        deliveryTime: { min: 2, max: 4 },
        packets: [
          { key: 'solo', maxQuantity: 1, price: 4 },
          { key: 'duo', maxQuantity: 2, price: 5 },
        ],
      },
      existing,
    );
    assert.equal(parsed.name.en, 'English');
    assert.equal(parsed.name.fr, 'Français');
    assert.equal('th' in parsed.name, false);
  });

  it('reads a country label object and a parcel document', () => {
    assert.equal(parseCountryLabels(locales).fr, 'Français');
    const packets = parseMeasurementWrite(
      { '1': { weight: 120, size: { length: 18, width: 8, depth: 4 } } },
      [1],
    );
    assert.equal(packets[0]?.weight, 120);
    assert.equal(packets[0]?.depth, 4);
  });
});
