import {
  test,
  expect,
} from 'patchright/test';
import {
  apiJson,
  createZeroingVoucher,
  pickPurchasableVariant,
} from '../../support/api.js';
import {
  E2E_PRODUCT_UIDS,
} from '../../support/catalog.js';
import {
  waitForMail,
} from '../../support/mail.js';
import {
  createGiftOffer,
  createOfferBody,
  extractGiftGiverToken,
  JULIE_DESTINATION,
  loadGiverPortal,
  putJulieDestination,
  putReceiverItem,
  type GiftErrorBody,
  type GiftPortal,
} from '../../support/gift.js';


test.describe('API gift receiver delivery', () => {
  let _voucherCode: string;

  test.beforeAll(async () => {
    _voucherCode = await createZeroingVoucher('gift');
  });

  test('receiver items GET/DELETE, destination GET, country lists, and gallery set detail: honor price hiding', async ({
    request,
  }) => {
    const sinceMs = Date.now() - 1_000;

    const hiddenBody = createOfferBody({ hideReceiverPrices: true, maxBudget: 120 });
    await createGiftOffer(request, hiddenBody);
    const hiddenMail = await waitForMail({
      kind: 'user',
      toIncludes: String(hiddenBody.giverEmail),
      subjectIncludes: 'Carte cadeau',
      sinceMs,
    });
    const hiddenPortal = await loadGiverPortal(request, extractGiftGiverToken(hiddenMail.html));
    const hiddenReceiver = hiddenPortal.shareCard!.receiverToken!;

    const { body: emptyItems } = await apiJson<GiftPortal>(request, 'GET', `/gift/${hiddenReceiver}/items`, {
      expectedStatus: 200,
    });
    expect(emptyItems.items ?? []).toEqual([]);

    const variant = await pickPurchasableVariant(request);
    await putReceiverItem(request, hiddenReceiver, variant, 1);
    const { body: withItem } = await apiJson<GiftPortal>(request, 'GET', `/gift/${hiddenReceiver}/items`, {
      expectedStatus: 200,
    });
    expect(withItem.items?.some((item) => item.productId === variant.productId)).toBe(true);
    expect(withItem.items?.every((item) => item.unitPrice === undefined)).toBe(true);

    const { body: afterDelete } = await apiJson<GiftPortal>(request, 'DELETE', `/gift/${hiddenReceiver}/items`, {
      data: {
        productId: variant.productId,
        shapeKey: variant.shapeKey,
        lengthKey: variant.lengthKey,
        size: variant.size,
      },
      expectedStatus: 200,
    });
    expect(afterDelete.items?.some((item) => item.productId === variant.productId)).toBe(false);

    const { body: noDestination } = await apiJson<{ destination?: unknown }>(
      request,
      'GET',
      `/gift/${hiddenReceiver}/destination`,
      { expectedStatus: 200 },
    );
    expect(noDestination.destination).toBeNull();

    await putJulieDestination(request, hiddenReceiver);
    const { body: withDestination } = await apiJson<{
      destination?: { line1?: string; city?: string };
    }>(request, 'GET', `/gift/${hiddenReceiver}/destination`, { expectedStatus: 200 });
    expect(withDestination.destination?.line1).toBe(JULIE_DESTINATION.line1);
    expect(withDestination.destination?.city).toBe(JULIE_DESTINATION.city);

    const { body: addressCountries } = await apiJson<{ countries?: Array<{ code?: string; label?: string }> }>(
      request,
      'GET',
      `/gift/${hiddenReceiver}/address-countries`,
      { expectedStatus: 200 },
    );
    expect(addressCountries.countries?.some((country) => country.code === 'FR')).toBe(true);

    const { body: phoneCountries } = await apiJson<{ countries?: Array<{ code?: string }> }>(
      request,
      'GET',
      `/gift/${hiddenReceiver}/phone-countries`,
      { expectedStatus: 200 },
    );
    expect((phoneCountries.countries ?? []).length).toBeGreaterThan(0);

    const { body: hiddenSet } = await apiJson<{ item?: { price?: number; productUid?: string } }>(
      request,
      'GET',
      `/gift/${hiddenReceiver}/gallery/set/${E2E_PRODUCT_UIDS.A1}`,
      { expectedStatus: 200 },
    );
    expect(hiddenSet.item?.productUid).toBe(E2E_PRODUCT_UIDS.A1);
    expect(hiddenSet.item?.price).toBeUndefined();

    const { body: badUid } = await apiJson<GiftErrorBody>(
      request,
      'GET',
      `/gift/${hiddenReceiver}/gallery/set/not-a-uid`,
      { expectedStatus: 400 },
    );
    expect(badUid.error?.code).toBe('invalid_request');
    const { body: unknownUid } = await apiJson<GiftErrorBody>(
      request,
      'GET',
      `/gift/${hiddenReceiver}/gallery/set/ZZ-ZZ-999`,
      { expectedStatus: 404 },
    );
    expect(unknownUid.error?.code).toBe('not_found');

    const shownBody = createOfferBody({ hideReceiverPrices: false, maxBudget: 120 });
    await createGiftOffer(request, shownBody);
    const shownMail = await waitForMail({
      kind: 'user',
      toIncludes: String(shownBody.giverEmail),
      subjectIncludes: 'Carte cadeau',
      sinceMs,
    });
    const shownPortal = await loadGiverPortal(request, extractGiftGiverToken(shownMail.html));
    const shownReceiver = shownPortal.shareCard!.receiverToken!;
    const { body: shownSet } = await apiJson<{ item?: { price?: number } }>(
      request,
      'GET',
      `/gift/${shownReceiver}/gallery/set/${E2E_PRODUCT_UIDS.A1}`,
      { expectedStatus: 200 },
    );
    expect(typeof shownSet.item?.price).toBe('number');
  });

});
