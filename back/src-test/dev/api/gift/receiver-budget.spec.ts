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
  waitForMail,
} from '../../support/mail.js';
import {
  accessoryProductId,
  accessoryPutBody,
  confirmReceiver,
  countOrdersForOffer,
  createGiftOffer,
  createOfferBody,
  extractGiftGiverToken,
  giftHoldState,
  JULIE_DESTINATION,
  oosNailVariant,
  putJulieDestination,
  putReceiverItem,
  type GiftErrorBody,
  type GiftPortal,
} from '../../support/gift.js';


test.describe('API gift receiver budget', () => {
  let _voucherCode: string;

  test.beforeAll(async () => {
    _voucherCode = await createZeroingVoucher('gift');
  });

  test('receiver prices, constraints, accessories, stock: confirm is not an order', async ({ request }) => {
    const sinceMs = Date.now() - 1_000;

    const hiddenBody = createOfferBody({ hideReceiverPrices: true, maxBudget: 120 });
    await createGiftOffer(request, hiddenBody);
    const hiddenMail = await waitForMail({
      kind: 'user',
      toIncludes: String(hiddenBody.giverEmail),
      subjectIncludes: 'Carte cadeau',
      sinceMs,
    });
    const hiddenGiverToken = extractGiftGiverToken(hiddenMail.html);
    const { body: hiddenPortal } = await apiJson<GiftPortal>(
      request,
      'GET',
      `/gift/giver/${hiddenGiverToken}`,
      { expectedStatus: 200 },
    );
    const hiddenReceiver = hiddenPortal.shareCard!.receiverToken!;

    const { body: hiddenFeed } = await apiJson<{
      items?: Array<{
        price?: number;
        available?: Record<string, Record<string, Record<string, number>>>;
      }>;
    }>(request, 'GET', `/gift/${hiddenReceiver}/gallery/feed?limit=4`, { expectedStatus: 200 });
    expect((hiddenFeed.items ?? []).length).toBeGreaterThan(0);
    expect(hiddenFeed.items!.every((item) => item.price === undefined)).toBe(true);
    expect(
      hiddenFeed.items!.every((item) =>
        Object.values(item.available ?? {}).some((lengths) =>
          Object.values(lengths).some((sizes) => Object.values(sizes).some((qty) => qty > 0)),
        ),
      ),
    ).toBe(true);

    const { body: hiddenFilters } = await apiJson<{ options?: { priceRange?: unknown } }>(
      request,
      'GET',
      `/gift/${hiddenReceiver}/gallery/filters`,
      { expectedStatus: 200 },
    );
    expect(hiddenFilters.options?.priceRange).toBeNull();

    const missingBudget = { ...createOfferBody() };
    delete missingBudget.maxBudget;
    const { body: requiredBudget } = await createGiftOffer(request, missingBudget, { expectedStatus: 400 });
    expect(requiredBudget.error?.code).toBe('invalid_request');

    const { body: publicCeilings } = await apiJson<{
      minBudget?: number;
      maxBudgetCeiling?: number;
      maxAccessoryBudgetCeiling?: number;
    }>(request, 'GET', '/gift/settings', { expectedStatus: 200 });
    expect(publicCeilings.minBudget).toBeGreaterThan(0);
    expect(publicCeilings.maxBudgetCeiling).toBeGreaterThan(0);
    expect(publicCeilings.maxAccessoryBudgetCeiling).toBeGreaterThan(0);
    const minBudget = publicCeilings.minBudget!;

    const missingStyle = { ...createOfferBody() };
    delete missingStyle.shareCardStyle;
    const { body: requiredStyle } = await createGiftOffer(request, missingStyle, { expectedStatus: 400 });
    expect(requiredStyle.error?.code).toBe('invalid_request');

    const { body: unknownStyle } = await createGiftOffer(
      request,
      createOfferBody({ shareCardStyle: 'not-a-theme' }),
      { expectedStatus: 400 },
    );
    expect(unknownStyle.error?.code).toBe('invalid_request');

    const legacy = await createGiftOffer(request, createOfferBody({ shareCardStyle: 'birthday' }));
    expect(legacy.body.status).toBe('selecting');

    const { body: zeroBudget } = await createGiftOffer(
      request,
      createOfferBody({ maxBudget: 0 }),
      { expectedStatus: 400 },
    );
    expect(zeroBudget.error?.code).toBe('invalid_request');

    const { body: tooManyCommentLines } = await createGiftOffer(
      request,
      createOfferBody({ giverComment: 'a\nb\nc\nd\ne\nf\ng' }),
      { expectedStatus: 400 },
    );
    expect(tooManyCommentLines.error?.code).toBe('invalid_request');

    const { body: ceiling } = await createGiftOffer(
      request,
      createOfferBody({ maxBudget: publicCeilings.maxBudgetCeiling! + 1 }),
      { expectedStatus: 400 },
    );
    expect(ceiling.error?.code).toBe('gift_budget_ceiling');
    expect(ceiling.error?.max).toBe(publicCeilings.maxBudgetCeiling);
    expect(ceiling.error?.field).toBe('maxBudget');

    const { body: accessoryCeiling } = await createGiftOffer(
      request,
      createOfferBody({
        allowAccessories: true,
        maxAccessoryBudget: publicCeilings.maxAccessoryBudgetCeiling! + 1,
      }),
      { expectedStatus: 400 },
    );
    expect(accessoryCeiling.error?.code).toBe('gift_budget_ceiling');
    expect(accessoryCeiling.error?.max).toBe(publicCeilings.maxAccessoryBudgetCeiling);
    expect(accessoryCeiling.error?.field).toBe('maxAccessoryBudget');

    const { body: floor } = await createGiftOffer(
      request,
      createOfferBody({ maxBudget: 0.01 }),
      { expectedStatus: 400 },
    );
    expect(floor.error?.code).toBe('gift_budget_floor');
    expect(floor.error?.min).toBe(minBudget);
    expect(floor.error?.field).toBe('maxBudget');

    const shownBody = createOfferBody({ hideReceiverPrices: false, maxBudget: 120 });
    const shownCreated = await createGiftOffer(request, shownBody);
    const shownMail = await waitForMail({
      kind: 'user',
      toIncludes: String(shownBody.giverEmail),
      subjectIncludes: 'Carte cadeau',
      sinceMs,
    });
    const shownGiver = extractGiftGiverToken(shownMail.html);
    const { body: shownPortal } = await apiJson<GiftPortal>(
      request,
      'GET',
      `/gift/giver/${shownGiver}`,
      { expectedStatus: 200 },
    );
    const shownReceiver = shownPortal.shareCard!.receiverToken!;
    const { body: shownFeed } = await apiJson<{ items?: Array<{ price?: number }> }>(
      request,
      'GET',
      `/gift/${shownReceiver}/gallery/feed?limit=4`,
      { expectedStatus: 200 },
    );
    expect(shownFeed.items!.some((item) => typeof item.price === 'number')).toBe(true);

    const { body: couriers } = await apiJson<{
      couriers?: Array<{ packets?: Array<Record<string, unknown>> }>;
    }>(request, 'GET', `/gift/${shownReceiver}/couriers`, { expectedStatus: 200 });
    const packets = couriers.couriers?.flatMap((courier) => courier.packets ?? []) ?? [];
    expect(packets.length).toBeGreaterThan(0);
    expect(packets.every((packet) => packet.price === undefined && packet.amount === undefined)).toBe(true);

    const { body: lockSession } = await apiJson<{ lockToken?: string; idleTimeoutMs?: number }>(
      request,
      'POST',
      `/gift/${shownReceiver}/session`,
      { expectedStatus: 200 },
    );
    expect(lockSession.lockToken).toBeTruthy();
    expect(lockSession.idleTimeoutMs).toBe(43_200_000);

    expect(shownPortal.remaining?.remainingBudget).toBe(120);
    expect(shownPortal.remaining?.remainingAccessoryBudget).toBe(120);

    const accessoryId = await accessoryProductId();
    const leftoverAccBody = createOfferBody({ hideReceiverPrices: false, maxBudget: 120 });
    await createGiftOffer(request, leftoverAccBody);
    const leftoverAccMail = await waitForMail({
      kind: 'user',
      toIncludes: String(leftoverAccBody.giverEmail),
      subjectIncludes: 'Carte cadeau',
      sinceMs,
    });
    const { body: leftoverAccPortal } = await apiJson<GiftPortal>(
      request,
      'GET',
      `/gift/giver/${extractGiftGiverToken(leftoverAccMail.html)}`,
      { expectedStatus: 200 },
    );
    expect(leftoverAccPortal.remaining?.remainingAccessoryBudget).toBe(120);
    const leftoverReceiver = leftoverAccPortal.shareCard!.receiverToken!;
    const { body: leftoverAccessory } = await apiJson<GiftPortal>(
      request,
      'PUT',
      `/gift/${leftoverReceiver}/items`,
      { data: accessoryPutBody(accessoryId), expectedStatus: 200 },
    );
    expect(leftoverAccessory.items?.some((item) => item.productId === accessoryId)).toBe(true);
    const leftoverAccPrice = leftoverAccessory.items?.find((item) => item.productId === accessoryId)?.unitPrice;
    expect(typeof leftoverAccPrice).toBe('number');
    expect(leftoverAccessory.remaining?.remainingAccessoryBudget).toBeCloseTo(120 - leftoverAccPrice!, 2);
    expect(leftoverAccessory.remaining?.remainingBudget).toBeCloseTo(120 - leftoverAccPrice!, 2);

    const accessoryBody = createOfferBody({
      hideReceiverPrices: false,
      maxBudget: 120,
      allowAccessories: true,
      maxAccessoryBudget: 8,
      giverComment: 'Pour toi',
    });
    await createGiftOffer(request, accessoryBody);
    const accessoryMail = await waitForMail({
      kind: 'user',
      toIncludes: String(accessoryBody.giverEmail),
      subjectIncludes: 'Carte cadeau',
      sinceMs,
    });
    const { body: accessoryPortal } = await apiJson<GiftPortal>(
      request,
      'GET',
      `/gift/giver/${extractGiftGiverToken(accessoryMail.html)}`,
      { expectedStatus: 200 },
    );
    expect(accessoryPortal.giverComment).toBe('Pour toi');
    expect(accessoryPortal.allowAccessories).toBe(true);
    expect(accessoryPortal.remaining?.remainingBudget).toBe(120);
    expect(accessoryPortal.remaining?.remainingAccessoryBudget).toBe(128);
    const accessoryReceiver = accessoryPortal.shareCard!.receiverToken!;
    const { body: accessoryOk } = await apiJson<GiftPortal>(request, 'PUT', `/gift/${accessoryReceiver}/items`, {
      data: accessoryPutBody(accessoryId),
      expectedStatus: 200,
    });
    expect(accessoryOk.items?.some((item) => item.productId === accessoryId)).toBe(true);

    const tinyAccBody = createOfferBody({
      hideReceiverPrices: false,
      maxBudget: minBudget,
      allowAccessories: true,
      maxAccessoryBudget: 0.01,
    });
    await createGiftOffer(request, tinyAccBody);
    const tinyAccMail = await waitForMail({
      kind: 'user',
      toIncludes: String(tinyAccBody.giverEmail),
      subjectIncludes: 'Carte cadeau',
      sinceMs,
    });
    const { body: tinyAccPortal } = await apiJson<GiftPortal>(
      request,
      'GET',
      `/gift/giver/${extractGiftGiverToken(tinyAccMail.html)}`,
      { expectedStatus: 200 },
    );
    const tinyAccReceiver = tinyAccPortal.shareCard!.receiverToken!;
    const variant = await pickPurchasableVariant(request);
    await putReceiverItem(request, tinyAccReceiver, variant, 1);
    const { body: accessoryBudget } = await apiJson<GiftErrorBody>(
      request,
      'PUT',
      `/gift/${tinyAccReceiver}/items`,
      { data: accessoryPutBody(accessoryId), expectedStatus: 409 },
    );
    expect(accessoryBudget.error?.code).toBe('gift_accessory_budget_exceeded');

    const pooledBody = createOfferBody({
      hideReceiverPrices: false,
      maxBudget: 45,
      allowAccessories: true,
      maxAccessoryBudget: 5,
    });
    await createGiftOffer(request, pooledBody);
    const pooledMail = await waitForMail({
      kind: 'user',
      toIncludes: String(pooledBody.giverEmail),
      subjectIncludes: 'Carte cadeau',
      sinceMs,
    });
    const { body: pooledPortal } = await apiJson<GiftPortal>(
      request,
      'GET',
      `/gift/giver/${extractGiftGiverToken(pooledMail.html)}`,
      { expectedStatus: 200 },
    );
    expect(pooledPortal.remaining?.remainingBudget).toBe(45);
    expect(pooledPortal.remaining?.remainingAccessoryBudget).toBe(50);

    const oos = await oosNailVariant();
    const { body: oosBody } = await putReceiverItem(request, shownReceiver, oos, 2, 409);
    expect(oosBody.error?.code).toBe('gift_stock_unavailable');

    const tinyBody = createOfferBody({ maxBudget: minBudget });
    await createGiftOffer(request, tinyBody);
    const tinyMail = await waitForMail({
      kind: 'user',
      toIncludes: String(tinyBody.giverEmail),
      subjectIncludes: 'Carte cadeau',
      sinceMs,
    });
    const { body: tinyPortal } = await apiJson<GiftPortal>(
      request,
      'GET',
      `/gift/giver/${extractGiftGiverToken(tinyMail.html)}`,
      { expectedStatus: 200 },
    );
    const tinyReceiver = tinyPortal.shareCard!.receiverToken!;
    const { body: tinyFeed } = await apiJson<{ items?: unknown[]; totalCount?: number }>(
      request,
      'GET',
      `/gift/${tinyReceiver}/gallery/feed?limit=4`,
      { expectedStatus: 200 },
    );
    expect(tinyFeed.totalCount ?? 0).toBeGreaterThan(0);
    const { body: budget } = await putReceiverItem(
      request,
      tinyReceiver,
      variant,
      2,
      409,
    );
    expect(budget.error?.code).toBe('gift_budget_exceeded');

    await putReceiverItem(request, shownReceiver, variant, 1);
    await putJulieDestination(request, shownReceiver);
    const confirmed = await confirmReceiver(request, shownReceiver);
    expect(confirmed.status).toBe('awaiting_payment');
    expect(confirmed.clocks?.holdExpiresAt).toBeTruthy();
    expect(confirmed.clocks?.payByAt).toBeTruthy();
    expect(await countOrdersForOffer(shownCreated.body.offerId!)).toBe(0);
    const hold = await giftHoldState(shownCreated.body.offerId!);
    expect(hold?.purpose).toBe('gift');
    expect(hold?.state).toBe('held');

    const again = await confirmReceiver(request, shownReceiver);
    expect(again.status).toBe('awaiting_payment');

    const { body: frozenAfterConfirm } = await putReceiverItem(request, shownReceiver, variant, 1, 409);
    expect(frozenAfterConfirm.error?.code).toBe('gift_frozen');
    const { body: frozenDestination } = await apiJson<GiftErrorBody>(
      request,
      'PUT',
      `/gift/${shownReceiver}/destination`,
      { data: JULIE_DESTINATION, expectedStatus: 409 },
    );
    expect(frozenDestination.error?.code).toBe('gift_frozen');
  });

});
