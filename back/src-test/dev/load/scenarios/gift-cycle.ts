import http from 'k6/http';
import { check } from 'k6';
import { loadPassword, uniqueEmail } from '../_lib/auth.ts';
import {
  apiBaseUrl,
  CHECKOUT_SESSION_HEADER,
  getJson,
  postJson,
  putJson,
  startCheckoutSession,
  successEnvelope,
} from '../_lib/http.ts';
import { pickFromPool, type LoadSetupData } from '../_lib/types.ts';

const PIN = '2468';

/** The load server raises GIFT_MAX_OPEN_PROMISES_PER_GIVER to its maximum;
 * a VU still moves to a fresh giver account well before reaching it, since
 * an ordered gift keeps its cart. */
const OFFERS_PER_GIVER = 40;

interface Giver {
  email: string;
  token: string;
  addressId: string;
  offers: number;
}

/** Per-VU state: k6 gives every VU its own copy of module scope. */
let giver: Giver | undefined;

function setupHeaders(token?: string): Record<string, string> {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** Registration and the giver's address are account setup, not the gift
 * flow under test: tagged `phase: setup` so password hashing stays out of
 * the VU latency thresholds. */
function freshGiver(baseUrl: string): Giver | undefined {
  const email = uniqueEmail('gift');
  const registered = http.post(
    `${baseUrl}/auth/register`,
    JSON.stringify({ email, password: loadPassword(), gdprConsent: { accepted: true }, language: 'fr' }),
    { headers: setupHeaders(), tags: { name: 'gift_giver_register', phase: 'setup' } },
  );
  const token = String((registered.json() as { accessToken?: string } | null)?.accessToken ?? '');
  const address = http.post(
    `${baseUrl}/account/addresses`,
    JSON.stringify({
      kind: 'livraison',
      label: 'Load giver',
      recipientName: 'Load Giver',
      line1: '10 rue de Load',
      postalCode: '75001',
      city: 'Paris',
      countryCode: 'FR',
      phone: '+33601020304',
      networkCodes: ['home'],
      isDefault: true,
    }),
    { headers: setupHeaders(token), tags: { name: 'gift_giver_address', phase: 'setup' } },
  );
  const addressId = String((address.json() as { address?: { id?: string } } | null)?.address?.id ?? '');
  const ok = check(null, { gift_giver_ready: () => Boolean(token && addressId) });
  return ok ? { email, token, addressId, offers: 0 } : undefined;
}

/** A signed-in giver offers a set, the receiver unlocks with the PIN, picks
 * one set and a destination and confirms; the giver then pays with the VU's
 * own voucher. */
export function giftCycle(data: LoadSetupData): void {
  const baseUrl = apiBaseUrl();
  const voucherCode = pickFromPool(data.checkoutUsers).voucherCode;
  const pick = data.catalogs[(__VU + __ITER) % data.catalogs.length];
  if (!voucherCode || !pick) return;
  if (!giver || giver.offers >= OFFERS_PER_GIVER) giver = freshGiver(baseUrl);
  if (!giver) return;
  giver.offers += 1;

  const created = postJson(
    baseUrl,
    '/gift/offers',
    'gift_offer_create',
    {
      giverEmail: giver.email,
      giverDisplayName: 'Load',
      receiverName: 'Julie',
      giverComment: 'Pour toi',
      maxBudget: 120,
      hideReceiverPrices: true,
      language: 'fr',
      gdprConsent: { accepted: true },
      accessPin: PIN,
      shareCardStyle: 'anniversaire',
    },
    { status: 201 },
    giver.token,
  );
  const body = created.body as { offerId?: string; receiverUrl?: string } | null;
  const receiverToken = body?.receiverUrl?.match(/\/gift\/([A-Fa-f0-9]{64})/)?.[1];
  if (!body?.offerId || !receiverToken) return;

  const unlocked = postJson(
    baseUrl,
    `/gift/${receiverToken}/pin`,
    'gift_receiver_pin',
    { pin: PIN },
    {
      status: 200,
    },
  );
  const pinToken = (unlocked.body as { pinToken?: string } | null)?.pinToken;
  if (!pinToken) return;
  const receiver = { 'X-Gift-Pin-Token': pinToken };
  getJson(baseUrl, `/gift/${receiverToken}`, 'gift_receiver_summary', successEnvelope, undefined, receiver);
  getJson(
    baseUrl,
    `/gift/${receiverToken}/gallery/feed?limit=24`,
    'gift_receiver_feed',
    (value) => Array.isArray((value as { items?: unknown })?.items),
    undefined,
    receiver,
  );
  const chosen = putJson(
    baseUrl,
    `/gift/${receiverToken}/items`,
    'gift_receiver_item',
    {
      productId: pick.productId,
      shapeKey: pick.shapeKey,
      lengthKey: pick.lengthKey,
      size: pick.size,
      quantity: 1,
    },
    { status: 200 },
    undefined,
    receiver,
  );
  if (!chosen.ok) return;
  putJson(
    baseUrl,
    `/gift/${receiverToken}/destination`,
    'gift_receiver_destination',
    {
      recipientName: 'Julie Load',
      line1: '12 rue des Fleurs',
      postalCode: '75011',
      city: 'Paris',
      countryCode: 'FR',
      phone: '+33601020305',
      courierCode: pick.courierCode,
      networkCodes: ['home'],
      pickupPoints: {},
    },
    { status: 200 },
    undefined,
    receiver,
  );
  const confirmed = postJson(
    baseUrl,
    `/gift/${receiverToken}/confirm`,
    'gift_receiver_confirm',
    {},
    { status: 200 },
    undefined,
    receiver,
  );
  if (!confirmed.ok) return;

  const mine = getJson(baseUrl, '/gift/mine', 'gift_giver_mine', successEnvelope, giver.token);
  const giverToken = (
    (mine.body as { offers?: Array<{ id?: string; giverToken?: string }> } | null)?.offers ?? []
  ).find((offer) => offer.id === body.offerId)?.giverToken;
  check(giverToken, { gift_giver_token: (value) => Boolean(value) });
  if (!giverToken) return;
  const cart = {
    addressId: giver.addressId,
    courierCode: pick.courierCode,
    express: false,
    voucherCode,
    applyLoyalty: false,
  };
  putJson(baseUrl, `/gift/giver/${giverToken}/cart`, 'gift_giver_cart', cart, { status: 200 }, giver.token);
  // The giver pays through the account checkout once the gift cart is active.
  const giftCart = getJson(
    baseUrl,
    `/gift/giver/${giverToken}/cart`,
    'gift_giver_cart_read',
    (value) => Boolean((value as { cart?: { id?: string } } | null)?.cart?.id),
    giver.token,
  );
  const giftCartId = (giftCart.body as { cart?: { id?: string } } | null)?.cart?.id;
  if (!giftCartId) return;
  postJson(
    baseUrl,
    `/account/carts/${giftCartId}/activate`,
    'gift_cart_activate',
    {},
    { status: 200 },
    giver.token,
  );
  const session = startCheckoutSession(baseUrl, giver.token);
  if (!session) return;
  postJson(
    baseUrl,
    '/account/checkout/free',
    'gift_giver_checkout_free',
    cart,
    { status: 201, body: (value) => Boolean((value as { order?: { id?: string } }).order?.id) },
    giver.token,
    { [CHECKOUT_SESSION_HEADER]: session },
  );
  getJson(
    baseUrl,
    `/gift/${receiverToken}/status`,
    'gift_receiver_status',
    successEnvelope,
    undefined,
    receiver,
  );
}
