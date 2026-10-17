import { test, expect } from 'patchright/test';
import { apiJson, registerAdmin } from '../../support/api.js';

type ShippingCatalog = {
  addressCountries?: Array<{ code: string; enabled: boolean }>;
  couriers?: Array<{
    code: string;
    enabled: boolean;
    countries: Array<{ code: string; enabled: boolean }>;
  }>;
};

test.describe('API admin shipping catalog', () => {
  test('reads and safely: toggles country, courier, and courier-country availability', async ({ request }) => {
    const admin = await registerAdmin(request);
    const { body: catalog } = await apiJson<ShippingCatalog & { success: boolean }>(
      request,
      'GET',
      '/admin/shipping-catalog',
      { token: admin.accessToken, expectedStatus: 200 },
    );
    expect(catalog.success).toBe(true);

    const colissimo = catalog.couriers?.find((entry) => entry.code === 'colissimo-home');
    if (colissimo) {
      const codes = colissimo.countries.map((entry) => entry.code).sort();
      expect(codes).toEqual(['BE', 'FR']);
      expect(codes).not.toContain('LU');
    }

    const country = catalog.addressCountries?.find((entry) => entry.code === 'FR') ?? catalog.addressCountries?.[0];
    const courier = catalog.couriers?.find((entry) => entry.code === 'mondial-relay-home') ?? catalog.couriers?.[0];
    const courierCountry = courier?.countries.find((entry) => entry.code === country?.code) ?? courier?.countries[0];
    expect(country).toBeTruthy();
    expect(courier).toBeTruthy();
    expect(courierCountry).toBeTruthy();

    await apiJson(request, 'PATCH', '/admin/address-countries/FR', {
      token: admin.accessToken,
      data: {},
      expectedStatus: 400,
    });
    await apiJson(request, 'PATCH', '/admin/couriers/not-a-courier', {
      token: admin.accessToken,
      data: { enabled: false },
      expectedStatus: 404,
    });

    let countryChanged = false;
    let courierChanged = false;
    let courierCountryChanged = false;
    try {
      const nextCountryEnabled = !country!.enabled;
      const { body: countryUpdate } = await apiJson<{ enabled?: boolean }>(
        request,
        'PATCH',
        `/admin/address-countries/${country!.code}`,
        { token: admin.accessToken, data: { enabled: nextCountryEnabled }, expectedStatus: 200 },
      );
      countryChanged = true;
      expect(countryUpdate.enabled).toBe(nextCountryEnabled);

      const nextCourierEnabled = !courier!.enabled;
      const { body: courierUpdate } = await apiJson<{ enabled?: boolean }>(
        request,
        'PATCH',
        `/admin/couriers/${courier!.code}`,
        { token: admin.accessToken, data: { enabled: nextCourierEnabled }, expectedStatus: 200 },
      );
      courierChanged = true;
      expect(courierUpdate.enabled).toBe(nextCourierEnabled);

      const nextCourierCountryEnabled = !courierCountry!.enabled;
      const { body: courierCountryUpdate } = await apiJson<{ enabled?: boolean }>(
        request,
        'PATCH',
        `/admin/couriers/${courier!.code}/countries/${courierCountry!.code}`,
        {
          token: admin.accessToken,
          data: { enabled: nextCourierCountryEnabled },
          expectedStatus: 200,
        },
      );
      courierCountryChanged = true;
      expect(courierCountryUpdate.enabled).toBe(nextCourierCountryEnabled);
    } finally {
      if (courierCountryChanged) {
        await apiJson(request, 'PATCH', `/admin/couriers/${courier!.code}/countries/${courierCountry!.code}`, {
          token: admin.accessToken,
          data: { enabled: courierCountry!.enabled },
          expectedStatus: 200,
        });
      }
      if (courierChanged) {
        await apiJson(request, 'PATCH', `/admin/couriers/${courier!.code}`, {
          token: admin.accessToken,
          data: { enabled: courier!.enabled },
          expectedStatus: 200,
        });
      }
      if (countryChanged) {
        await apiJson(request, 'PATCH', `/admin/address-countries/${country!.code}`, {
          token: admin.accessToken,
          data: { enabled: country!.enabled },
          expectedStatus: 200,
        });
      }
    }
  });
});
