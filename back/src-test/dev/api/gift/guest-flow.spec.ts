import {
  test,
  expect,
} from 'patchright/test';
import {
  apiJson,
  createAddress,
  createZeroingVoucher,
  pickPurchasableVariant,
  registerUser,
  testCourierCode,
} from '../../support/api.js';
import {
  waitForMail,
} from '../../support/mail.js';
import {
  countGiftCarts,
  countOrdersForOffer,
  createGiftOffer,
  createOfferBody,
  extractGiftGiverToken,
  forceOfferTimestamp,
  JULIE_DESTINATION,
  putReceiverItem,
  seedReceiverChoice,
  type GiftErrorBody,
  type GiftPortal,
} from '../../support/gift.js';


test.describe('API gift guest flow', () => {
  let voucherCode: string;

  test.beforeAll(async () => {
    voucherCode = await createZeroingVoucher('gift');
  });

  test('open-pay on an empty selecting offer: creates the user and activates the gift cart', async ({
    request,
  }) => {
    const body = createOfferBody();
    const sinceMs = Date.now() - 1_000;
    await createGiftOffer(request, body);
    const shareMail = await waitForMail({
      kind: 'user',
      toIncludes: String(body.giverEmail),
      subjectIncludes: 'Carte cadeau',
      sinceMs,
    });
    const giverToken = extractGiftGiverToken(shareMail.html);
    const { body: denied } = await apiJson<GiftErrorBody>(
      request,
      'POST',
      `/gift/giver/${giverToken}/open-pay`,
      { giftPin: false, expectedStatus: 401 },
    );
    expect(denied.error?.code).toBe('gift_pin_required');
    const { body: opened } = await apiJson<{
      created?: boolean;
      cartId?: string;
      accessToken?: string;
    }>(request, 'POST', `/gift/giver/${giverToken}/open-pay`, { expectedStatus: [200, 201] });
    expect(opened.created).toBe(true);
    expect(opened.cartId).toBeTruthy();
    const { body: shopCarts } = await apiJson<{
      carts?: Array<{
        id?: string;
        kind?: string;
        isActive?: boolean;
        itemCount?: number;
        gift?: { status?: string };
      }>;
    }>(request, 'GET', '/account/carts', { token: opened.accessToken, expectedStatus: 200 });
    const giftCart = (shopCarts.carts ?? []).find((row) => row.id === opened.cartId);
    expect(giftCart).toMatchObject({ kind: 'gift', isActive: true, itemCount: 0 });
    expect(giftCart?.gift?.status).toBe('selecting');
  });


  test('gift carts: appear on the shop list; activate works; open-pay plus free checkout binds the order', async ({
    request,
  }) => {
    const marc = await registerUser(request);
    const first = await createGiftOffer(request, createOfferBody({ giverEmail: marc.email }), {
      token: marc.accessToken,
    });
    const second = await createGiftOffer(
      request,
      createOfferBody({ giverEmail: marc.email, receiverName: 'Lea' }),
      { token: marc.accessToken },
    );
    const { body: mine } = await apiJson<{ offers?: Array<{ giverToken?: string; id?: string }> }>(
      request,
      'GET',
      '/gift/mine',
      { token: marc.accessToken, expectedStatus: 200 },
    );
    expect(mine.offers?.length).toBeGreaterThanOrEqual(2);
    expect(mine.offers?.every((row) => !('receiverToken' in row) && Boolean(row.giverToken))).toBe(true);

    const firstToken = mine.offers!.find((row) => row.id === first.body.offerId)!.giverToken!;
    const { body: firstPortal } = await apiJson<GiftPortal>(request, 'GET', `/gift/giver/${firstToken}`, {
      expectedStatus: 200,
    });
    await seedReceiverChoice(request, firstPortal.shareCard!.receiverToken!);

    const secondToken = mine.offers!.find((row) => row.id === second.body.offerId)!.giverToken!;
    const { body: secondPortal } = await apiJson<GiftPortal>(request, 'GET', `/gift/giver/${secondToken}`, {
      expectedStatus: 200,
    });
    await seedReceiverChoice(request, secondPortal.shareCard!.receiverToken!);

    expect(await countGiftCarts(String(marc.user.id))).toBe(2);
    const { body: shopCarts } = await apiJson<{
      carts?: Array<{ kind?: string; id?: string; gift?: { offerId?: string; status?: string } }>;
    }>(request, 'GET', '/account/carts', { token: marc.accessToken, expectedStatus: 200 });
    const giftCarts = (shopCarts.carts ?? []).filter((row) => row.kind === 'gift');
    expect(giftCarts.length).toBe(2);
    expect(giftCarts.every((row) => Boolean(row.gift?.offerId) && Boolean(row.gift?.status))).toBe(true);

    const { body: giftCart } = await apiJson<{ cart?: { id?: string; kind?: string; isActive?: boolean } }>(
      request,
      'GET',
      `/gift/giver/${firstToken}/cart`,
      { token: marc.accessToken, expectedStatus: 200 },
    );
    expect(giftCart.cart?.kind).toBe('gift');
    const { body: activated } = await apiJson<{ cart?: { id?: string; isActive?: boolean; kind?: string } }>(
      request,
      'POST',
      `/account/carts/${giftCart.cart!.id}/activate`,
      { token: marc.accessToken, expectedStatus: 200 },
    );
    expect(activated.cart?.kind).toBe('gift');
    expect(activated.cart?.isActive).toBe(true);

    const { body: deleted } = await apiJson<GiftErrorBody>(
      request,
      'DELETE',
      `/account/carts/${giftCart.cart!.id}`,
      { token: marc.accessToken, expectedStatus: 400 },
    );
    expect(deleted.error?.code).toBe('invalid_request');

    const { body: renamed } = await apiJson<{ cart?: { id?: string; kind?: string; name?: string } }>(
      request,
      'PATCH',
      `/account/carts/${giftCart.cart!.id}`,
      { token: marc.accessToken, data: { name: 'Cadeau Julie' }, expectedStatus: 200 },
    );
    expect(renamed.cart?.kind).toBe('gift');
    expect(renamed.cart?.name).toBe('Cadeau Julie');

    const shopCartId = (shopCarts.carts ?? []).find((row) => row.kind !== 'gift')?.id;
    if (shopCartId) {
      const { body: merged } = await apiJson<GiftErrorBody>(
        request,
        'POST',
        `/account/carts/${shopCartId}/merge`,
        {
          token: marc.accessToken,
          data: { sourceCartId: giftCart.cart!.id },
          expectedStatus: 400,
        },
      );
      expect(merged.error?.code).toBe('invalid_request');
    }

    const guestBody = createOfferBody();
    const guestCreated = await createGiftOffer(request, guestBody);
    const guestMail = await waitForMail({
      kind: 'user',
      toIncludes: String(guestBody.giverEmail),
      subjectIncludes: 'Carte cadeau',
      sinceMs: Date.now() - 2_000,
    });
    const guestGiver = extractGiftGiverToken(guestMail.html);
    const { body: guestPortal } = await apiJson<GiftPortal>(
      request,
      'GET',
      `/gift/giver/${guestGiver}`,
      { expectedStatus: 200 },
    );
    await seedReceiverChoice(request, guestPortal.shareCard!.receiverToken!);

    const { body: opened } = await apiJson<{
      accessToken?: string;
      created?: boolean;
      user?: { id?: string };
    }>(request, 'POST', `/gift/giver/${guestGiver}/open-pay`, { expectedStatus: [200, 201] });
    expect(opened.created).toBe(true);
    const giverToken = opened.accessToken!;

    const frozenVariant = await pickPurchasableVariant(request);
    const { body: frozenPay } = await putReceiverItem(
      request,
      guestPortal.shareCard!.receiverToken!,
      frozenVariant,
      1,
      409,
    );
    expect(frozenPay.error?.code).toBe('gift_frozen');

    const { body: addresses } = await apiJson<{ addresses?: Array<{ line1?: string }> }>(
      request,
      'GET',
      '/account/addresses',
      { token: giverToken, expectedStatus: 200 },
    );
    expect((addresses.addresses ?? []).some((row) => row.line1 === JULIE_DESTINATION.line1)).toBe(false);

    const address = await createAddress(request, giverToken, {
      savedForFuture: false,
      recipientName: 'Marc Giver',
    });
    await apiJson(request, 'PUT', `/gift/giver/${guestGiver}/cart`, {
      token: giverToken,
      data: {
        addressId: address.id,
        courierCode: testCourierCode,
        voucherCode,
        applyLoyalty: false,
        express: false,
      },
      expectedStatus: 200,
    });
    const { body: guestGiftCart } = await apiJson<{ cart?: { id?: string } }>(
      request,
      'GET',
      `/gift/giver/${guestGiver}/cart`,
      { token: giverToken, expectedStatus: 200 },
    );
    await apiJson(request, 'POST', `/account/carts/${guestGiftCart.cart!.id}/activate`, {
      token: giverToken,
      expectedStatus: 200,
    });
    const { body: ordered } = await apiJson<{
      order?: {
        id?: string;
        gift?: { offerId?: string; giverDisplayName?: string; receiverName?: string };
      };
    }>(request, 'POST', '/account/checkout/free', {
      token: giverToken,
      data: {
        addressId: address.id,
        courierCode: testCourierCode,
        express: false,
        voucherCode,
        applyLoyalty: false,
      },
      expectedStatus: 201,
    });
    expect(ordered.order?.gift).toMatchObject({
      offerId: guestCreated.body.offerId,
      giverDisplayName: 'Marc',
      receiverName: 'Julie',
      hideReceiverPrices: true,
    });
    expect(await countOrdersForOffer(guestCreated.body.offerId!)).toBe(1);

    const { body: publicOrder } = await apiJson<{
      order?: { gift?: { offerId?: string; hideReceiverPrices?: boolean } };
    }>(request, 'GET', `/account/orders/${ordered.order!.id}`, { token: giverToken, expectedStatus: 200 });
    expect(publicOrder.order?.gift).toMatchObject({
      offerId: guestCreated.body.offerId,
      hideReceiverPrices: true,
    });

    const { body: statusAfter } = await apiJson<{
      status?: string;
      paymentReceived?: boolean;
      orderStatus?: string | null;
    }>(request, 'GET', `/gift/${guestPortal.shareCard!.receiverToken}/status`, {
      expectedStatus: 200,
    });
    expect(statusAfter.status).toBe('ordered');
    expect(statusAfter.paymentReceived).toBe(true);
    expect(statusAfter.orderStatus).toBeTruthy();

    const { body: alreadyOrdered } = await apiJson<GiftErrorBody>(
      request,
      'POST',
      `/gift/giver/${guestGiver}/cancel`,
      { expectedStatus: 409 },
    );
    expect(alreadyOrdered.error?.code).toBe('gift_already_ordered');

    await forceOfferTimestamp(
      guestCreated.body.offerId!,
      'receiver_visible_until',
      new Date(Date.now() - 60_000),
    );
    const { body: goneAfterOrder } = await apiJson<GiftErrorBody>(
      request,
      'GET',
      `/gift/${guestPortal.shareCard!.receiverToken}`,
      { expectedStatus: 410 },
    );
    expect(goneAfterOrder.error?.code).toBe('gift_gone');

    const { body: afterPay } = await apiJson<{ carts?: Array<{ kind?: string }> }>(
      request,
      'GET',
      '/account/carts',
      { token: giverToken, expectedStatus: 200 },
    );
    expect((afterPay.carts ?? []).every((cart) => cart.kind !== 'gift')).toBe(true);
  });

});
