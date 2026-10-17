import {
  test,
  expect,
} from 'patchright/test';
import {
  apiJson,
  createZeroingVoucher,
} from '../../support/api.js';
import {
  waitForMail,
} from '../../support/mail.js';
import {
  createGiftOffer,
  createOfferBody,
  expireGiftHold,
  extractGiftGiverToken,
  forceOfferTimestamp,
  processGiftCron,
  seedReceiverChoice,
  type GiftErrorBody,
  type GiftPortal,
} from '../../support/gift.js';


test.describe('API gift cancel expire', () => {
  let _voucherCode: string;

  test.beforeAll(async () => {
    _voucherCode = await createZeroingVoucher('gift');
  });

  test('cancel: expire, hold release, pay-by cancel, then gift_gone', async ({ request }) => {
    const sinceMs = Date.now() - 1_000;
    const pendingBody = createOfferBody();
    const pending = await createGiftOffer(request, pendingBody);
    const pendingMail = await waitForMail({
      kind: 'user',
      toIncludes: String(pendingBody.giverEmail),
      subjectIncludes: 'Carte cadeau',
      sinceMs,
    });
    const pendingGiver = extractGiftGiverToken(pendingMail.html);
    await forceOfferTimestamp(pending.body.offerId!, 'offer_expires_at', new Date(Date.now() - 60_000));
    const cron1 = await processGiftCron();
    expect(Number(cron1.expired ?? 0)).toBeGreaterThanOrEqual(1);
    const { body: expiredPortal } = await apiJson<GiftPortal>(request, 'GET', `/gift/giver/${pendingGiver}`, {
      expectedStatus: 200,
    });
    expect(expiredPortal.status).toBe('expired');

    const cancelBody = createOfferBody();
    const cancelCreated = await createGiftOffer(request, cancelBody);
    const cancelMail = await waitForMail({
      kind: 'user',
      toIncludes: String(cancelBody.giverEmail),
      subjectIncludes: 'Carte cadeau',
      sinceMs,
    });
    const cancelGiver = extractGiftGiverToken(cancelMail.html);
    const { body: cancelPortal } = await apiJson<GiftPortal>(
      request,
      'GET',
      `/gift/giver/${cancelGiver}`,
      { expectedStatus: 200 },
    );
    const { body: cancelled } = await apiJson<{ status?: string }>(
      request,
      'POST',
      `/gift/giver/${cancelGiver}/cancel`,
      { expectedStatus: 200 },
    );
    expect(cancelled.status).toBe('cancelled');
    const { body: stillVisible } = await apiJson<GiftPortal>(
      request,
      'GET',
      `/gift/${cancelPortal.shareCard!.receiverToken}`,
      { expectedStatus: 200 },
    );
    expect(stillVisible.status).toBe('cancelled');

    await forceOfferTimestamp(
      cancelCreated.body.offerId!,
      'receiver_visible_until',
      new Date(Date.now() - 60_000),
    );
    const { body: gone } = await apiJson<GiftErrorBody>(
      request,
      'GET',
      `/gift/${cancelPortal.shareCard!.receiverToken}`,
      { expectedStatus: 410 },
    );
    expect(gone.error?.code).toBe('gift_gone');

    const holdBody = createOfferBody();
    const holdCreated = await createGiftOffer(request, holdBody);
    const holdMail = await waitForMail({
      kind: 'user',
      toIncludes: String(holdBody.giverEmail),
      subjectIncludes: 'Carte cadeau',
      sinceMs,
    });
    const holdGiver = extractGiftGiverToken(holdMail.html);
    const { body: holdPortal } = await apiJson<GiftPortal>(
      request,
      'GET',
      `/gift/giver/${holdGiver}`,
      { expectedStatus: 200 },
    );
    await seedReceiverChoice(request, holdPortal.shareCard!.receiverToken!);
    await expireGiftHold(holdCreated.body.offerId!);
    await processGiftCron();
    const { body: stillPayable } = await apiJson<GiftPortal>(request, 'GET', `/gift/giver/${holdGiver}`, {
      expectedStatus: 200,
    });
    expect(['awaiting_payment', 'paying']).toContain(stillPayable.status);
    await apiJson(request, 'POST', `/gift/giver/${holdGiver}/open-pay`, {
      expectedStatus: [200, 201],
    });

    const payBody = createOfferBody();
    const payCreated = await createGiftOffer(request, payBody);
    const payMail = await waitForMail({
      kind: 'user',
      toIncludes: String(payBody.giverEmail),
      subjectIncludes: 'Carte cadeau',
      sinceMs,
    });
    const payGiver = extractGiftGiverToken(payMail.html);
    const { body: payPortal } = await apiJson<GiftPortal>(
      request,
      'GET',
      `/gift/giver/${payGiver}`,
      { expectedStatus: 200 },
    );
    await seedReceiverChoice(request, payPortal.shareCard!.receiverToken!);
    await forceOfferTimestamp(payCreated.body.offerId!, 'pay_by_at', new Date(Date.now() - 60_000));
    await processGiftCron();
    const { body: unpaid } = await apiJson<GiftPortal>(request, 'GET', `/gift/giver/${payGiver}`, {
      expectedStatus: 200,
    });
    expect(unpaid.status).toBe('cancelled');
  });

});
