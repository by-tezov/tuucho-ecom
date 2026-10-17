import { test, expect } from 'patchright/test';
import { apiJson, createZeroingVoucher, pickPurchasableVariant, registerAdmin } from '../../support/api.js';
import { waitForMail } from '../../support/mail.js';
import {
  createGiftOffer,
  createOfferBody,
  extractGiftGiverToken,
  TEST_GIFT_PIN,
  putReceiverItem,
  seedReceiverChoice,
  type GiftErrorBody,
  type GiftPortal,
} from '../../support/gift.js';
import { expectGiftShareCardMail } from '../../support/gift-qr.js';

test.describe('API gift settings', () => {
  let adminToken: string;
  let _voucherCode: string;

  test.beforeAll(async ({ request }) => {
    const admin = await registerAdmin(request);
    adminToken = admin.accessToken;
    _voucherCode = await createZeroingVoucher('gift');
  });

  test('public settings and an emitted token: stay usable', async ({ request }) => {
    const { body: enabledSettings } = await apiJson<{
      enabled?: boolean;
      maxSetsCeiling?: number;
      maxBudgetCeiling?: number;
      maxAccessoryBudgetCeiling?: number;
      receiverTokenTtlDays?: number;
      stockHoldTtlDays?: number;
      giverPayTtlDays?: number;
    }>(request, 'GET', '/gift/settings', {
      expectedStatus: 200,
    });
    expect(enabledSettings.enabled).toBe(true);
    expect(enabledSettings.maxSetsCeiling).toBeGreaterThan(0);
    expect(enabledSettings.maxBudgetCeiling).toBe(150);
    expect(enabledSettings.maxAccessoryBudgetCeiling).toBe(10);
    expect(enabledSettings.receiverTokenTtlDays).toBe(30);
    expect(enabledSettings.stockHoldTtlDays).toBe(7);
    expect(enabledSettings.giverPayTtlDays).toBe(15);

    const sinceMs = Date.now() - 1_000;
    const body = createOfferBody();
    const created = await createGiftOffer(request, body);
    expect(created.body.status).toBe('selecting');
    expect(created.body.checkEmail).toBe(true);
    expect(created.body.receiverUrl).toBeNull();
    expect(created.body.cartId).toBeNull();

    const shareMail = await waitForMail({
      kind: 'user',
      toIncludes: String(body.giverEmail),
      subjectIncludes: 'Carte cadeau',
      sinceMs,
    });
    const giverToken = extractGiftGiverToken(shareMail.html);
    expect(shareMail.html).toContain(`/gift/giver/${giverToken}`);
    expect(shareMail.html).toContain('Si le bouton ne fonctionne pas, tu peux utiliser ce lien');

    const { body: giverPinBlocked } = await apiJson<GiftErrorBody>(
      request,
      'GET',
      `/gift/giver/${giverToken}`,
      { giftPin: false, expectedStatus: 401 },
    );
    expect(giverPinBlocked.error?.code).toBe('gift_pin_required');

    const { body: confirmed } = await apiJson<GiftPortal>(request, 'GET', `/gift/giver/${giverToken}`, {
      expectedStatus: 200,
    });
    expect(confirmed.status).toBe('selecting');
    expect(confirmed.receiverName).toBe('Julie');
    expect(confirmed.maxAccessoryBudget ?? null).toBeNull();
    expect(confirmed.shareCard?.receiverUrl).toBeTruthy();
    expect(confirmed.shareCard?.qrDataUri).toMatch(/^data:image\/png;base64,/);
    const receiverToken = confirmed.shareCard!.receiverToken!;
    expect(giverToken).toMatch(/^[a-f0-9]{64}$/i);
    expect(receiverToken).toMatch(/^[a-f0-9]{64}$/i);
    expect(giverToken.toLowerCase()).not.toBe(receiverToken.toLowerCase());
    await apiJson(request, 'GET', `/gift/${giverToken}`, { expectedStatus: 404 });
    await apiJson(request, 'GET', `/gift/giver/${receiverToken}`, { expectedStatus: 404 });

    await expectGiftShareCardMail(shareMail, {
      pin: TEST_GIFT_PIN,
      receiverUrl: confirmed.shareCard!.receiverUrl!,
    });

    const { body: pinBlocked } = await apiJson<GiftErrorBody>(request, 'GET', `/gift/${receiverToken}`, {
      giftPin: false,
      expectedStatus: 401,
    });
    expect(pinBlocked.error?.code).toBe('gift_pin_required');
    const { body: badPin } = await apiJson<GiftErrorBody>(request, 'POST', `/gift/${receiverToken}/pin`, {
      data: { pin: '0000' },
      expectedStatus: 401,
    });
    expect(badPin.error?.code).toBe('gift_pin_invalid');

    const { body: live } = await apiJson<GiftPortal>(request, 'GET', `/gift/${receiverToken}`, {
      expectedStatus: 200,
    });
    expect(live.status).toBe('selecting');
    expect(live.items?.every((item) => item.unitPrice === undefined)).toBe(true);

    await seedReceiverChoice(request, receiverToken);
    const { status: payStatus } = await apiJson(request, 'POST', `/gift/giver/${giverToken}/open-pay`, {
      expectedStatus: [200, 201],
    });
    expect([200, 201]).toContain(payStatus);

    const variant = await pickPurchasableVariant(request);
    const { body: frozen } = await putReceiverItem(request, receiverToken, variant, 1, 409);
    expect(frozen.error?.code).toBe('gift_frozen');
    const { body: paying } = await apiJson<GiftPortal>(request, 'GET', `/gift/${receiverToken}`, {
      expectedStatus: 200,
    });
    expect(paying.status).toBe('awaiting_payment');
  });

  test('admin active offers: they are listed without tokens, and env settings are exposed', async ({ request }) => {
    const offerBody = createOfferBody();
    const created = await createGiftOffer(request, offerBody);
    expect(created.body.id ?? created.body.offerId).toBeTruthy();

    const { body: listed } = await apiJson<{
      success?: boolean;
      offers?: Array<{
        id?: string;
        status?: string;
        giverEmail?: string;
        giverDisplayName?: string;
        receiverName?: string;
        receiverEmail?: string | null;
        giverToken?: string;
        receiverToken?: string;
      }>;
      pagination?: { total?: number; pageSize?: number };
    }>(request, 'GET', '/admin/gift/offers', {
      token: adminToken,
      expectedStatus: 200,
    });
    expect(listed.success).toBe(true);
    const match = listed.offers?.find((row) => row.giverEmail === offerBody.giverEmail);
    expect(match?.status).toBe('selecting');
    expect(match?.giverDisplayName).toBe('Marc');
    expect(match?.receiverName).toBe('Julie');
    expect(match?.receiverEmail ?? null).toBeNull();
    expect(match).not.toHaveProperty('giverToken');
    expect(match).not.toHaveProperty('receiverToken');
    expect(JSON.stringify(listed)).not.toMatch(/giver_token|receiver_token/i);

    const sinceMs = Date.now() - 1_000;
    const shareMail = await waitForMail({
      kind: 'user',
      toIncludes: String(offerBody.giverEmail),
      subjectIncludes: 'Carte cadeau',
      sinceMs,
    });
    const giverToken = extractGiftGiverToken(shareMail.html);
    const { body: giverPortal } = await apiJson<GiftPortal>(request, 'GET', `/gift/giver/${giverToken}`, {
      expectedStatus: 200,
    });
    const receiverToken = giverPortal.shareCard!.receiverToken!;
    const receiverEmail = 'julie.admin-list@example.com';
    await seedReceiverChoice(request, receiverToken, 1, receiverEmail);
    const { body: afterConfirm } = await apiJson<{
      offers?: Array<{
        giverEmail?: string;
        receiverEmail?: string | null;
        status?: string;
      }>;
    }>(request, 'GET', '/admin/gift/offers', {
      token: adminToken,
      expectedStatus: 200,
    });
    const confirmed = afterConfirm.offers?.find((row) => row.giverEmail === offerBody.giverEmail);
    expect(confirmed?.status).toBe('awaiting_payment');
    expect(confirmed?.giverEmail).toBe(offerBody.giverEmail);
    expect(confirmed?.receiverEmail).toBe(receiverEmail);
  });

  test('receiver confirm refuses a missing email', async ({ request }) => {
    const offerBody = createOfferBody();
    await createGiftOffer(request, offerBody);
    const sinceMs = Date.now() - 1_000;
    const shareMail = await waitForMail({
      kind: 'user',
      toIncludes: String(offerBody.giverEmail),
      subjectIncludes: 'Carte cadeau',
      sinceMs,
    });
    const giverToken = extractGiftGiverToken(shareMail.html);
    const { body: giverPortal } = await apiJson<GiftPortal>(request, 'GET', `/gift/giver/${giverToken}`, {
      expectedStatus: 200,
    });
    const receiverToken = giverPortal.shareCard!.receiverToken!;
    const variant = await pickPurchasableVariant(request);
    await putReceiverItem(request, receiverToken, variant, 1);
    const { body: refused } = await apiJson<GiftErrorBody>(
      request,
      'POST',
      `/gift/${receiverToken}/confirm`,
      { data: {}, expectedStatus: 400 },
    );
    expect(refused.error?.code).toBe('invalid_request');
  });
});
