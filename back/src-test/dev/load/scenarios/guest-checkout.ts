import { check } from 'k6';
import { uniqueEmail } from '../_lib/auth.ts';
import { apiBaseUrl, CHECKOUT_SESSION_HEADER, postJson, startCheckoutSession } from '../_lib/http.ts';
import { pickFromPool, type LoadSetupData } from '../_lib/types.ts';

/** A visitor who never signs in: guest session, then a zero-total order paid
 * by the VU's own voucher. */
export function guestCheckout(data: LoadSetupData): void {
  const baseUrl = apiBaseUrl();
  const voucherCode = pickFromPool(data.checkoutUsers).voucherCode;
  const pick = data.catalogs[(__VU + __ITER) % data.catalogs.length];
  if (!voucherCode || !pick) return;

  const session = startCheckoutSession(baseUrl);
  check(session, { guest_session_start: (value) => Boolean(value) });
  if (!session) return;
  postJson(
    baseUrl,
    '/checkout/guest/free',
    'guest_checkout_free',
    {
      items: [
        {
          productId: pick.productId,
          shapeKey: pick.shapeKey,
          lengthKey: pick.lengthKey,
          size: pick.size,
          packKey: '',
          quantity: 1,
        },
      ],
      address: {
        recipientName: 'Ada Load',
        line1: '10 rue de Load',
        postalCode: '75001',
        city: 'Paris',
        countryCode: 'FR',
        phone: '+33601020304',
      },
      courierCode: pick.courierCode,
      express: false,
      email: uniqueEmail('guest'),
      gdprConsent: { accepted: true },
      language: 'fr',
      voucherCode,
    },
    { status: 201, body: (body) => Boolean((body as { order?: { id?: string } }).order?.id) },
    undefined,
    { [CHECKOUT_SESSION_HEADER]: session },
  );
}
