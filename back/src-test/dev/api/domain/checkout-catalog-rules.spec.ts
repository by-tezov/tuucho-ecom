import { test, expect } from 'patchright/test';
import { expandPriceOverCountries } from '../../../../src/modules/operations/application/courierFieldExpand.js';
import {
  courierCountryCatalogReady,
  courierCountryCatalogBlockReason,
} from '../../../../src/modules/delivery/domain/courierCountryCatalog.js';
import { parseCourierLiveDefaults } from '../../../../scripts/courierLiveState.js';
import { parseCountryAllowlist } from '../../../../scripts/paymentMethodCountries.js';
import {
  evaluateCartRules,
  parseFreeShippingAboveParams,
} from '../../../../src/modules/commerce/application/cartRules.js';

test.describe('Checkout catalog domain rules', () => {
  test('partial packet price: maps keep only priced countries', () => {
    const vocab = new Set(['FR', 'BE', 'LU']);
    const expanded = expandPriceOverCountries(
      { FR: 5.99, BE: 11.99 },
      ['FR', 'BE', 'LU'],
      'packets[0].price',
      vocab,
    );
    expect(expanded).toEqual({ FR: 5.99, BE: 11.99 });
  });

  test('courier country readiness: requires every packet tier priced', () => {
    const courier = {
      countries: [{ code: 'FR' }, { code: 'BE' }, { code: 'LU' }],
      deliveryTimes: {
        FR: { custodyDays: null },
        BE: { custodyDays: null },
        LU: { custodyDays: null },
      },
      packets: [{ price: { FR: 5.99, BE: 11.99 }, expressPrice: null }],
    };
    expect(courierCountryCatalogReady(courier, 'FR')).toBe(true);
    expect(courierCountryCatalogReady(courier, 'BE')).toBe(true);
    expect(courierCountryCatalogReady(courier, 'LU')).toBe(false);
    expect(courierCountryCatalogBlockReason(courier, 'LU')).toBe('packet_price_missing');
  });

  test('parseCourierLiveDefaults: reads shop and country toggles', () => {
    expect(
      parseCourierLiveDefaults(
        'mondial-relay-point=1:FR,BE|colissimo-home=1:FR,BE|chronopost-home=0:',
      ),
    ).toEqual([
      { code: 'mondial-relay-point', enabled: true, enabledCountries: ['FR', 'BE'] },
      { code: 'colissimo-home', enabled: true, enabledCountries: ['FR', 'BE'] },
      { code: 'chronopost-home', enabled: false, enabledCountries: [] },
    ]);
  });

  test('parseCountryAllowlist: treats ALL as global', () => {
    expect(parseCountryAllowlist('ALL', 'PAYMENT_METHOD_COUNTRIES_CARD')).toEqual(['ALL']);
    expect(parseCountryAllowlist('BE,ALL', 'PAYMENT_METHOD_COUNTRIES_BANCONTACT')).toEqual(['ALL']);
    expect(parseCountryAllowlist('BE', 'PAYMENT_METHOD_COUNTRIES_BANCONTACT')).toEqual(['BE']);
  });

  test('free_shipping_above thresholds: are per delivery country', () => {
    const rules = [
      {
        id: '1',
        code: 'ship-franco',
        kind: 'free_shipping_above' as const,
        enabled: true,
        priority: 30,
        forbid_voucher: false,
        params: { thresholdsByCountry: { FR: 65, BE: 75 } },
      },
    ];
    const base = {
      rules,
      nailLines: [{ quantity: 1, lineTotal: 70 }],
      merchandiseSubtotal: 70,
      shippingListFee: 5.9,
      giftLines: [] as Array<{ productId: string; productUid: string; quantity: number; ruleCode: string }>,
    };
    expect(evaluateCartRules({ ...base, countryCode: 'FR' }).shippingFee).toBe(0);
    expect(evaluateCartRules({ ...base, countryCode: 'BE' }).shippingFee).toBe(5.9);
    expect(evaluateCartRules({ ...base, countryCode: 'DE' }).shippingFee).toBe(5.9);
    expect(parseFreeShippingAboveParams({ thresholdsByCountry: { fr: 65 } })).toEqual({
      thresholdsByCountry: { FR: 65 },
    });
    expect(() => parseFreeShippingAboveParams({ thresholdsByCourier: { 'mondial-relay-home': 65 } })).toThrow(
      'invalid_params',
    );
  });
});
