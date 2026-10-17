import {
  test,
  expect,
} from 'patchright/test';
import { getGiftSettings } from '../../../../src/modules/gift/application/giftSettings.js';
import { pool } from '../../../../src/db/pool.js';
import {
  apiJson,
  createZeroingVoucher,
  registerUser,
} from '../../support/api.js';
import {
  waitForMail,
} from '../../support/mail.js';
import {
  createGiftOffer,
  createOfferBody,
  extractGiftGiverToken,
  TEST_GIFT_PIN,
  loadGiverPortal,
  seedOpenGiftCarts,
  type GiftErrorBody,
} from '../../support/gift.js';


test.describe('API gift pin throttle', () => {
  let _voucherCode: string;

  test.beforeAll(async () => {
    _voucherCode = await createZeroingVoucher('gift');
  });

  test('pin: unlock throttles after the free-failure allowance, and the open-promise ceiling blocks a new offer', async ({
    request,
  }) => {
    const sinceMs = Date.now() - 1_000;

    const throttleBody = createOfferBody();
    await createGiftOffer(request, throttleBody);
    const throttleMail = await waitForMail({
      kind: 'user',
      toIncludes: String(throttleBody.giverEmail),
      subjectIncludes: 'Carte cadeau',
      sinceMs,
    });
    const throttlePortal = await loadGiverPortal(request, extractGiftGiverToken(throttleMail.html));
    const throttleReceiver = throttlePortal.shareCard!.receiverToken!;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const { body: wrongPin } = await apiJson<GiftErrorBody>(
        request,
        'POST',
        `/gift/${throttleReceiver}/pin`,
        { data: { pin: '0000' }, expectedStatus: 401 },
      );
      expect(wrongPin.error?.code).toBe('gift_pin_invalid');
      expect(wrongPin.error?.failedCount).toBeUndefined();
      expect(wrongPin.error?.retryAfterSec).toBeUndefined();
    }

    const { body: enteredBackoff } = await apiJson<GiftErrorBody>(
      request,
      'POST',
      `/gift/${throttleReceiver}/pin`,
      { data: { pin: '0001' }, expectedStatus: 429 },
    );
    expect(enteredBackoff.error?.code).toBe('gift_pin_throttled');
    expect(enteredBackoff.error?.retryAfterSec).toBeGreaterThanOrEqual(2);
    expect(enteredBackoff.error?.failedCount).toBeUndefined();

    const { body: throttled } = await apiJson<GiftErrorBody>(
      request,
      'POST',
      `/gift/${throttleReceiver}/pin`,
      { data: { pin: TEST_GIFT_PIN }, expectedStatus: 429 },
    );
    expect(throttled.error?.code).toBe('gift_pin_throttled');
    expect(throttled.error?.retryAfterSec).toBeGreaterThan(0);

    const dana = await registerUser(request);
    const ceiling = (await getGiftSettings(pool)).maxOpenPromisesPerGiver;
    await seedOpenGiftCarts(String(dana.user.id), ceiling);
    const { body: blocked } = await createGiftOffer(
      request,
      createOfferBody({ giverEmail: dana.email }),
      { token: dana.accessToken, expectedStatus: 400 },
    );
    expect(blocked.error?.code).toBe('invalid_request');
  });
});
