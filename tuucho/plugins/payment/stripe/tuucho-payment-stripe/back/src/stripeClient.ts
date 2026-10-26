import type { PaymentMethod } from '@kernel/back/contract/checkout';
import Stripe from 'stripe';
import type pg from 'pg';
import { getPluginSecret } from '@tuucho/plugin-sdk';
import { findUserById, setStripeCustomerId } from '@kernel/back/modules/identity/application/users';

let stripeClient: Stripe | undefined;

function usableSecretKey(value: string | undefined): value is string {
  return typeof value === 'string' && /^sk_(?:test|live)_[A-Za-z0-9]+$/.test(value.trim());
}

/** Stripe SDK lives in this plugin. The kernel payment-method shell only
 * receives the client through `registerPaymentGateway({ getClient })`.
 * A missing key or the example placeholder does not open a client. */
export function createStripeFromEnv(): Stripe | undefined {
  const secretKey = getPluginSecret('tuucho-payment-stripe', 'secretKey')?.trim();
  if (!usableSecretKey(secretKey)) return undefined;
  if (!stripeClient) {
    stripeClient = new Stripe(secretKey, {
      timeout: 12_000,
      maxNetworkRetries: 1,
    });
  }
  return stripeClient;
}

/** Lazily creates a Stripe Customer on this user's first checkout or first
 * "add card" action — most users never reach either, so there's no reason
 * to create one (and clutter the dashboard) at registration. */
export async function getOrCreateCustomerId(pool: pg.Pool, stripe: Stripe, userId: string): Promise<string> {
  const user = await findUserById(pool, userId);
  if (!user) throw new Error(`getOrCreateCustomerId: user ${userId} not found`);
  if (user.stripe_customer_id) return user.stripe_customer_id;

  const customer = await stripe.customers.create({ email: user.email, metadata: { userId } });
  await setStripeCustomerId(pool, userId, customer.id);
  return customer.id;
}

/** Sizes a PaymentIntent for the (already-priced) cart total.
 *
 * Two shapes, chosen by `paymentMethodTypes`:
 * - Left undefined (the default/card path, and `method: google_pay` /
 *   `apple_pay`): automatic_payment_methods is what makes Apple Pay/Google
 *   Pay available to the front's ExpressCheckoutElement — no separate
 *   wallet-specific PaymentIntent type needed, stays in sync with the
 *   Dashboard without a code change. Saved-card checkout confirms directly
 *   against a chosen pm_… (see listPaymentMethods below); wallet checkout
 *   confirms through Express Checkout Element with no pm id and never
 *   setup_future_usage.
 * - `['paypal']` (see account.routes.ts's /checkout/create-intent `method`
 *   param): explicit, not automatic — PayPal specifically needs its own
 *   PaymentIntent confirmed through an actual mounted Payment Element (not
 *   Express Checkout Element, which talks to PayPal's own SDK directly and
 *   forces a real PayPal login even in Stripe test mode; Stripe's
 *   documented Payment Intents + PayPal integration uses Payment Element,
 *   which goes through Stripe's own test-mode simulation instead — see
 *   CartCheckoutSection.tsx's PayPalConfirmForm).
 * - `['bancontact']`: same explicit Payment Element path as PayPal, but
 *   Bancontact does not support manual capture — Stripe settles at confirm
 *   (`capture_method: 'automatic'` → PI `succeeded` → order already
 *   `captured`). Card / PayPal / wallets stay on manual capture below.
 *
 * Card, PayPal, and wallet paths use `capture_method: 'manual'`: checkout
 * only authorizes; ops capture later via set-status (`in_preparation`
 * unless `--no-payment`, or `to_send`). PayPal holds last ~10 days (Stripe
 * may re-auth once ≈ 20 days when settled to Stripe); expired holds become
 * `payment_capture_status=expired`. Bancontact is the exception (automatic).
 *
 * Saving a *new* card during checkout uses `method: 'new_card'`: a card-only
 * PaymentIntent with `setup_future_usage: on_session`, confirmed in the pay
 * sheet (real order amount, no prior SetupIntent). The customer may opt out
 * of remembering it (`allow_redisplay: limited`) — then it stays usable for
 * this PaymentIntent / later refunds but never appears in
 * listPaymentMethods. Profile "add card" still uses createSetupIntent. */
export async function createCheckoutIntent(
  stripe: Stripe,
  customerId: string,
  amountEuros: number,
  metadata: Record<string, string>,
  paymentMethodTypes?: string[],
  idempotencyKey?: string,
  setupFutureUsage?: boolean,
): Promise<{ id: string; clientSecret: string }> {
  const useAutomaticCapture = paymentMethodTypes?.includes('bancontact') === true;
  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: Math.round(amountEuros * 100),
      currency: 'eur',
      customer: customerId,
      metadata,
      capture_method: useAutomaticCapture ? 'automatic' : 'manual',
      ...(setupFutureUsage ? { setup_future_usage: 'on_session' as const } : {}),
      ...(paymentMethodTypes
        ? { payment_method_types: paymentMethodTypes }
        : { automatic_payment_methods: { enabled: true } }),
    },
    idempotencyKey ? { idempotencyKey } : undefined,
  );
  return { id: paymentIntent.id, clientSecret: paymentIntent.client_secret! };
}

/** Guest-checkout sibling of createCheckoutIntent — no Stripe Customer at
 * all: there is nothing in our DB to attach one to (no persisted guest
 * identity), and this PaymentIntent is always a one-off, never a saved or
 * reusable payment method. Otherwise identical: automatic capture only for
 * Bancontact, same automatic/PayPal/Bancontact payment_method_types branching. */
export async function createGuestCheckoutIntent(
  stripe: Stripe,
  amountEuros: number,
  metadata: Record<string, string>,
  paymentMethodTypes?: string[],
  idempotencyKey?: string,
  setupFutureUsage?: boolean,
): Promise<{ id: string; clientSecret: string }> {
  const useAutomaticCapture = paymentMethodTypes?.includes('bancontact') === true;
  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: Math.round(amountEuros * 100),
      currency: 'eur',
      metadata,
      capture_method: useAutomaticCapture ? 'automatic' : 'manual',
      ...(setupFutureUsage ? { setup_future_usage: 'on_session' as const } : {}),
      ...(paymentMethodTypes
        ? { payment_method_types: paymentMethodTypes }
        : { automatic_payment_methods: { enabled: true } }),
    },
    idempotencyKey ? { idempotencyKey } : undefined,
  );
  return { id: paymentIntent.id, clientSecret: paymentIntent.client_secret! };
}

/** For the standalone "add a card" flow on the payment-methods management
 * page (no charge involved) — a plain SetupIntent, no Customer Session
 * needed since that page renders its own saved-card list via
 * listPaymentMethods below rather than through Payment Element's built-in
 * display. Explicitly card-only (not automatic_payment_methods) — this
 * modal exists to save a reusable card, never to link a redirect-based
 * method like PayPal, matching listPaymentMethods/detachPaymentMethod
 * below, which are card-only too. */
export async function createSetupIntent(stripe: Stripe, customerId: string): Promise<string> {
  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ['card'],
  });
  return setupIntent.client_secret!;
}

/** A saved card as the API publishes it. The API contract owns the shape, so
 * the front is typed against this same declaration. */
export type PublicPaymentMethod = PaymentMethod;

export async function listPaymentMethods(stripe: Stripe, customerId: string): Promise<PublicPaymentMethod[]> {
  const result = await stripe.paymentMethods.list({ customer: customerId, type: 'card' });
  // `limited` = checkout one-time use (see AddCardModal's optional
  // "remember" checkbox). Those stay attached so a later refund can still
  // resolve the PaymentIntent's payment_method, but must never appear in
  // the customer's saved-card UI. Legacy cards without an explicit
  // allow_redisplay (null/`unspecified`) keep showing — they were saved
  // before this distinction existed.
  return result.data
    .filter((pm) => pm.allow_redisplay !== 'limited')
    .map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand ?? 'unknown',
      last4: pm.card?.last4 ?? '',
      expMonth: pm.card?.exp_month ?? 0,
      expYear: pm.card?.exp_year ?? 0,
      cardholderName: pm.billing_details.name ?? null,
    }));
}

/** Any attached card owned by this customer, including one-time
 * (`allow_redisplay: limited`) cards that listPaymentMethods hides.
 * Used by checkout right after SetupIntent so the radio list can show a
 * card that isn't (and won't become) a saved method. */
export async function getPaymentMethod(
  stripe: Stripe,
  customerId: string,
  paymentMethodId: string,
): Promise<PublicPaymentMethod | null> {
  const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
  if (pm.customer !== customerId) return null;
  if (pm.type !== 'card') return null;
  return {
    id: pm.id,
    brand: pm.card?.brand ?? 'unknown',
    last4: pm.card?.last4 ?? '',
    expMonth: pm.card?.exp_month ?? 0,
    expYear: pm.card?.exp_year ?? 0,
    cardholderName: pm.billing_details.name ?? null,
  };
}

/** Ownership check baked in (fetch-then-compare, same shape as this
 * codebase's `where id = $1 and user_id = $2` DB pattern) — returns false
 * rather than throwing when the payment method doesn't belong to this
 * customer, so the route can map it to a plain 404 like everywhere else. */
export async function detachPaymentMethod(
  stripe: Stripe,
  customerId: string,
  paymentMethodId: string,
): Promise<boolean> {
  const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
  if (pm.customer !== customerId) return false;
  await stripe.paymentMethods.detach(paymentMethodId);
  return true;
}
