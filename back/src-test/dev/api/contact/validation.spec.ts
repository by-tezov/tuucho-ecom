import { test, expect } from 'patchright/test';
import { apiJson, loginUser, pickPurchasableVariant, registerUser, uniqueEmail } from '../../support/api.js';
import { E2E_PRODUCT_UIDS, E2E_TITLES, E2E_USER_LIBRARY_USERS } from '../../support/catalog.js';
import { testPassword } from '../../support/env.js';

test.describe('API contact validation', () => {
  test('the visitor contact form: requires an address, an identity and a message', async ({ request }) => {
    const email = uniqueEmail('contact-validation');
    for (const broken of [
      {},
      { email, identity: 'Ada Lovelace' },
      { email, message: 'Bonjour' },
      { identity: 'Ada Lovelace', message: 'Bonjour' },
      { email: 'not-an-email', identity: 'Ada Lovelace', message: 'Bonjour' },
      { email, identity: 'Ada Lovelace', message: '   ' },
    ]) {
      const { body } = await apiJson<{ error?: { code?: string } }>(request, 'POST', '/contact', {
        data: broken,
        expectedStatus: 400,
      });
      expect(body.error?.code).toBe('invalid_request');
    }
  });

  test('a product: request resolves its product server-side and refuses the rest', async ({ request }) => {
    const variant = await pickPurchasableVariant(request);
    const base = {
      productId: variant.productId,
      shapeKey: variant.shapeKey,
      lengthKey: variant.lengthKey,
      size: variant.size,
    };

    for (const broken of [
      {},
      { ...base, size: 'XXL', email: uniqueEmail('pr') },
      { ...base, productId: 'not-a-uuid', email: uniqueEmail('pr') },
      { ...base, quantity: 0, email: uniqueEmail('pr') },
      { ...base, comment: 42, email: uniqueEmail('pr') },
      // Signed out, the address is the only way back to the customer.
      base,
    ]) {
      const { body } = await apiJson<{ error?: { code?: string } }>(
        request,
        'POST',
        '/contact/product-request',
        { data: broken, expectedStatus: 400 },
      );
      expect(body.error?.code).toBe('invalid_request');
    }

    // A well-formed uuid that is not a visible product is a 404, so the
    // endpoint cannot be used to probe the catalogue.
    const { body: unknown } = await apiJson<{ error?: { code?: string } }>(
      request,
      'POST',
      '/contact/product-request',
      {
        data: {
          ...base,
          productId: '00000000-0000-4000-8000-000000000000',
          email: uniqueEmail('pr-unknown'),
        },
        expectedStatus: 404,
      },
    );
    expect(unknown.error?.code).toBe('not_found');

    // Signed out with an address, the request is accepted.
    await apiJson(request, 'POST', '/contact/product-request', {
      data: { ...base, email: uniqueEmail('pr-guest') },
      expectedStatus: 201,
    });

    // Signed in, the token wins over whatever the body claims.
    const customer = await registerUser(request);
    await apiJson(request, 'POST', '/contact/product-request', {
      token: customer.accessToken,
      data: { ...base, email: 'someone-else@pamsurin.test', quantity: 2 },
      expectedStatus: 201,
    });
  });

  test('a private creation: is not requestable by another customer', async ({ request }) => {
    const recipientToken = await loginUser(
      request,
      E2E_USER_LIBRARY_USERS.A.email,
      testPassword,
    );
    const personal = await pickPurchasableVariant(request, {
      token: recipientToken,
      title: E2E_TITLES[E2E_PRODUCT_UIDS.USER_A],
    });
    expect(personal.productUid).toBe(E2E_PRODUCT_UIDS.USER_A);

    // Its owner may ask for another size of their own creation…
    await apiJson(request, 'POST', '/contact/product-request', {
      token: recipientToken,
      data: {
        productId: personal.productId,
        shapeKey: personal.shapeKey,
        lengthKey: personal.lengthKey,
        size: personal.size,
      },
      expectedStatus: 201,
    });

    // …but for anyone else the product simply does not resolve.
    const stranger = await registerUser(request);
    const { body } = await apiJson<{ error?: { code?: string } }>(
      request,
      'POST',
      '/contact/product-request',
      {
        token: stranger.accessToken,
        data: {
          productId: personal.productId,
          shapeKey: personal.shapeKey,
          lengthKey: personal.lengthKey,
          size: personal.size,
        },
        expectedStatus: 404,
      },
    );
    expect(body.error?.code).toBe('not_found');
  });
});
