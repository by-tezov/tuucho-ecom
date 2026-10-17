import {
  test,
  expect,
} from 'patchright/test';
import {
  apiJson,
  createAddress,
  createZeroingVoucher,
  registerUser,
  testCourierCode,
  uniqueEmail,
} from '../../support/api.js';
import {
  waitForMail,
} from '../../support/mail.js';
import {
  createGiftOffer,
  createOfferBody,
  extractGiftGiverToken,
  seedReceiverChoice,
  type GiftErrorBody,
  type GiftPortal,
} from '../../support/gift.js';


test.describe('API gift signed-in flow', () => {
  let voucherCode: string;

  test.beforeAll(async () => {
    voucherCode = await createZeroingVoucher('gift');
  });

  test('signed-in matching email: starts selecting; mismatch is 400; other-account email has no receiverUrl', async ({
    request,
  }) => {
    const marc = await registerUser(request);
    const sinceMs = Date.now() - 1_000;

    const { body: mismatch } = await createGiftOffer(
      request,
      createOfferBody({ giverEmail: uniqueEmail('other') }),
      { token: marc.accessToken, expectedStatus: 400 },
    );
    expect(mismatch.error?.code).toBe('invalid_request');

    const signedIn = await createGiftOffer(request, createOfferBody({ giverEmail: marc.email }), {
      token: marc.accessToken,
    });
    expect(signedIn.body.status).toBe('selecting');
    expect(signedIn.body.checkEmail).toBe(false);
    expect(signedIn.body.receiverUrl).toContain('/gift/');
    expect(signedIn.body.cartId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const shareMail = await waitForMail({
      kind: 'user',
      toIncludes: marc.email,
      subjectIncludes: 'Carte cadeau',
      sinceMs,
    });
    expect(shareMail.html).not.toContain(signedIn.body.receiverUrl);

    const signedGiverToken = extractGiftGiverToken(shareMail.html);
    const { body: ownerPortal } = await apiJson<GiftPortal>(
      request,
      'GET',
      `/gift/giver/${signedGiverToken}`,
      { token: marc.accessToken, giftPin: false, expectedStatus: 200 },
    );
    expect(ownerPortal.receiverName).toBe('Julie');
    const { body: stillPin } = await apiJson<GiftErrorBody>(
      request,
      'GET',
      `/gift/giver/${signedGiverToken}`,
      { giftPin: false, expectedStatus: 401 },
    );
    expect(stillPin.error?.code).toBe('gift_pin_required');
    const { body: stillPinPay } = await apiJson<GiftErrorBody>(
      request,
      'POST',
      `/gift/giver/${signedGiverToken}/open-pay`,
      { giftPin: false, expectedStatus: 401 },
    );
    expect(stillPinPay.error?.code).toBe('gift_pin_required');

    const guestSinceMs = Date.now();
    const guestSameAccount = await createGiftOffer(request, createOfferBody({ giverEmail: marc.email }));
    expect(guestSameAccount.body.checkEmail).toBe(true);
    const guestShareMail = await waitForMail({
      kind: 'user',
      toIncludes: marc.email,
      subjectIncludes: 'Carte cadeau',
      sinceMs: guestSinceMs,
    });
    const guestGiverToken = extractGiftGiverToken(guestShareMail.html);
    const { body: emailOwnerPortal } = await apiJson<GiftPortal>(
      request,
      'GET',
      `/gift/giver/${guestGiverToken}`,
      { token: marc.accessToken, giftPin: false, expectedStatus: 200 },
    );
    expect(emailOwnerPortal.receiverName).toBe('Julie');

    const existing = await registerUser(request);
    const pending = await createGiftOffer(request, createOfferBody({ giverEmail: existing.email }));
    expect(pending.body.status).toBe('selecting');
    expect(pending.body.receiverUrl).toBeNull();
  });


  test('giver unlock-cart requires a confirmed offer, then GET cart shows unlocked lines: voucher/validate is scoped to the gift cart', async ({
    request,
  }) => {
    const marc = await registerUser(request);
    const sinceMs = Date.now() - 1_000;

    await createGiftOffer(request, createOfferBody({ giverEmail: marc.email }), {
      token: marc.accessToken,
    });
    const shareMail = await waitForMail({
      kind: 'user',
      toIncludes: marc.email,
      subjectIncludes: 'Carte cadeau',
      sinceMs,
    });
    const giverToken = extractGiftGiverToken(shareMail.html);

    const { body: stillSelecting } = await apiJson<GiftErrorBody>(
      request,
      'POST',
      `/gift/giver/${giverToken}/unlock-cart`,
      { token: marc.accessToken, expectedStatus: 409 },
    );
    expect(stillSelecting.error?.code).toBe('gift_frozen');

    const { body: giverPortal } = await apiJson<GiftPortal>(request, 'GET', `/gift/giver/${giverToken}`, {
      token: marc.accessToken,
      giftPin: false,
      expectedStatus: 200,
    });
    await seedReceiverChoice(request, giverPortal.shareCard!.receiverToken!);

    await apiJson(request, 'POST', `/gift/giver/${giverToken}/unlock-cart`, {
      token: marc.accessToken,
      expectedStatus: 200,
    });

    const { body: giverCart } = await apiJson<{
      cart?: { id?: string; kind?: string };
      items?: Array<{ productId?: string; origin?: string; locked?: boolean }>;
    }>(request, 'GET', `/gift/giver/${giverToken}/cart`, { token: marc.accessToken, expectedStatus: 200 });
    expect(giverCart.cart?.kind).toBe('gift');
    const userItems = giverCart.items?.filter((item) => item.origin === 'user') ?? [];
    expect(userItems.length).toBeGreaterThan(0);
    expect(userItems.every((item) => item.locked === false)).toBe(true);

    const address = await createAddress(request, marc.accessToken, { savedForFuture: false });
    // The giver pays through the account checkout once the gift cart is active.
    await apiJson(request, 'POST', `/account/carts/${giverCart.cart!.id}/activate`, {
      token: marc.accessToken,
      expectedStatus: 200,
    });
    const { body: validated } = await apiJson<{
      success?: boolean;
      voucher?: { code?: string };
      total?: number;
    }>(request, 'POST', '/account/checkout/voucher/validate', {
      token: marc.accessToken,
      data: { addressId: address.id, code: voucherCode, courierCode: testCourierCode, express: false },
      expectedStatus: 200,
    });
    expect(validated.voucher?.code).toBe(voucherCode);
    expect(validated.total).toBe(0);
  });

});
