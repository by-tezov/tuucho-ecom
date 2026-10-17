import { test, expect } from 'patchright/test';
import { apiJson, createAddress, registerUser, testCourierCode } from '../../support/api.js';

type AddressList = { addresses?: Array<{ id: string; isDefault: boolean; kind: string }> };

test.describe('API address reference data and defaults', () => {
  test('countries and delivery networks: are public reference data', async ({ request }) => {
    // Both are read by the address form before the visitor has an account,
    // so neither may require a bearer token.
    const { body: countries } = await apiJson<{
      countries?: Array<{ code: string; label: string }>;
    }>(request, 'GET', '/account/address-countries', { expectedStatus: 200 });
    const codes = (countries.countries ?? []).map((country) => country.code);
    expect(codes).toContain('FR');
    for (const country of countries.countries ?? []) {
      expect(country.label).toBeTruthy();
    }

    const { body: networks } = await apiJson<{
      networks?: Array<{ code: string; name: string }>;
    }>(request, 'GET', '/account/delivery-networks', { expectedStatus: 200 });
    const networkCodes = (networks.networks ?? []).map((network) => network.code);
    expect(networkCodes).toContain('home');
    for (const network of networks.networks ?? []) {
      expect(network.name).toBeTruthy();
    }

    // Labels are localized from Accept-Language, not from a stored account
    // preference — the form runs before there is an account.
    const english = await request.get('/account/address-countries', {
      headers: { Accept: 'application/json', 'Accept-Language': 'en' },
    });
    expect(english.status()).toBe(200);
    const englishBody = (await english.json()) as { countries?: Array<{ code: string; label: string }> };
    expect((englishBody.countries ?? []).length).toBe((countries.countries ?? []).length);
    const frenchLabel = (countries.countries ?? []).find((country) => country.code === 'FR')?.label;
    const englishLabel = (englishBody.countries ?? []).find((country) => country.code === 'FR')?.label;
    expect(frenchLabel).toBeTruthy();
    expect(englishLabel).toBeTruthy();
  });

  test('set-default and unset-default: move the address-book default explicitly', async ({ request }) => {
    const { accessToken } = await registerUser(request);

    // The first saved address of a kind is forced default whatever the body
    // asked for, since an address book with no default is not a useful state
    // to land in by accident.
    const first = await createAddress(request, accessToken, { label: 'Première', isDefault: false });
    expect(first.isDefault).toBe(true);

    const second = await createAddress(request, accessToken, {
      label: 'Seconde',
      line1: '20 rue de Test',
    });
    expect(second.isDefault).toBe(false);

    await apiJson(request, 'POST', `/account/addresses/${second.id}/set-default`, {
      token: accessToken,
      expectedStatus: 200,
    });
    const { body: promoted } = await apiJson<AddressList>(request, 'GET', '/account/addresses', {
      token: accessToken,
      expectedStatus: 200,
    });
    const defaults = (promoted.addresses ?? []).filter((address) => address.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0]?.id).toBe(second.id);
    // Default first, then oldest first.
    expect(promoted.addresses?.[0]?.id).toBe(second.id);

    // Unsetting deliberately leaves zero defaults — the customer's explicit
    // choice, so checkout has to ask instead of silently picking one.
    await apiJson(request, 'POST', `/account/addresses/${second.id}/unset-default`, {
      token: accessToken,
      expectedStatus: 200,
    });
    const { body: cleared } = await apiJson<AddressList>(request, 'GET', '/account/addresses', {
      token: accessToken,
      expectedStatus: 200,
    });
    expect((cleared.addresses ?? []).some((address) => address.isDefault)).toBe(false);

    // Only the address that currently holds the badge can give it up, so a
    // repeat is the same 404 as addressing someone else's row.
    await apiJson(request, 'POST', `/account/addresses/${second.id}/unset-default`, {
      token: accessToken,
      expectedStatus: 404,
    });

    // Neither route may touch someone else's address.
    const other = await registerUser(request);
    for (const action of ['set-default', 'unset-default']) {
      const { body } = await apiJson<{ error?: { code?: string } }>(
        request,
        'POST',
        `/account/addresses/${second.id}/${action}`,
        { token: other.accessToken, expectedStatus: 404 },
      );
      expect(body.error?.code).toBe('not_found');
    }
  });

  test('deleting the default: promotes another address', async ({ request }) => {
    const { accessToken } = await registerUser(request);
    const first = await createAddress(request, accessToken, { label: 'Une' });
    const second = await createAddress(request, accessToken, { label: 'Deux', line1: '30 rue de Test' });
    await apiJson(request, 'POST', `/account/addresses/${second.id}/set-default`, {
      token: accessToken,
      expectedStatus: 200,
    });

    await apiJson(request, 'DELETE', `/account/addresses/${second.id}`, {
      token: accessToken,
      expectedStatus: 200,
    });
    const { body } = await apiJson<AddressList>(request, 'GET', '/account/addresses', {
      token: accessToken,
      expectedStatus: 200,
    });
    const remaining = body.addresses ?? [];
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(first.id);
    // Unlike an explicit unset, deleting the default hands the badge on.
    expect(remaining[0]?.isDefault).toBe(true);
  });

  test('the courier default: can be cleared without disabling the courier', async ({ request }) => {
    const { accessToken } = await registerUser(request);

    const { body: none } = await apiJson<{ courierCode?: string | null }>(
      request,
      'GET',
      '/account/default-courier',
      { token: accessToken, expectedStatus: 200 },
    );
    expect(none.courierCode).toBeNull();

    await apiJson(request, 'PUT', '/account/default-courier', {
      token: accessToken,
      data: { courierCode: testCourierCode },
      expectedStatus: 200,
    });
    const { body: set } = await apiJson<{ courierCode?: string | null }>(
      request,
      'GET',
      '/account/default-courier',
      { token: accessToken, expectedStatus: 200 },
    );
    expect(set.courierCode).toBe(testCourierCode);

    await apiJson(request, 'POST', '/account/default-courier/unset-default', {
      token: accessToken,
      expectedStatus: 200,
    });
    const { body: unset } = await apiJson<{ courierCode?: string | null }>(
      request,
      'GET',
      '/account/default-courier',
      { token: accessToken, expectedStatus: 200 },
    );
    expect(unset.courierCode).toBeNull();
    // Clearing the preference is not an opt-out: the courier stays offered.
    const { body: disabled } = await apiJson<{ courierCodes?: string[] }>(
      request,
      'GET',
      '/account/disabled-couriers',
      { token: accessToken, expectedStatus: 200 },
    );
    expect(disabled.courierCodes).toEqual([]);

    // Unsetting when nothing is set stays a success.
    await apiJson(request, 'POST', '/account/default-courier/unset-default', {
      token: accessToken,
      expectedStatus: 200,
    });

    const { body: unknown } = await apiJson<{ error?: { code?: string } }>(
      request,
      'PUT',
      '/account/default-courier',
      { token: accessToken, data: { courierCode: 'no-such-courier' }, expectedStatus: 404 },
    );
    expect(unknown.error?.code).toBe('courier_not_found');
  });
});
