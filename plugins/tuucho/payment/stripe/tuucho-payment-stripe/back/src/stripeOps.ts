import type Stripe from 'stripe';
import { config } from '@kernel/back/config/env';
import { createStripeFromEnv } from './stripeClient.js';

function asStripe(stripe: unknown): Stripe {
  if (stripe && typeof stripe === 'object' && 'paymentIntents' in stripe) {
    return stripe as Stripe;
  }
  const created = createStripeFromEnv();
  if (!created) throw new Error('stripe_unavailable');
  return created;
}

export function constructWebhookEvent(raw: Buffer, signature: string): Stripe.Event {
  const stripe = createStripeFromEnv();
  const secret = config.stripe.webhookSecret;
  if (!stripe || !secret) throw new Error('stripe_unavailable');
  return stripe.webhooks.constructEvent(raw, signature, secret);
}

export function retrievePaymentIntent(stripe: unknown, id: string, params?: Stripe.PaymentIntentRetrieveParams) {
  return asStripe(stripe).paymentIntents.retrieve(id, params);
}

export function cancelPaymentIntent(
  stripe: unknown,
  id: string,
  params?: Stripe.PaymentIntentCancelParams,
  opts?: Stripe.RequestOptions,
) {
  return asStripe(stripe).paymentIntents.cancel(id, params, opts);
}

export function capturePaymentIntent(
  stripe: unknown,
  id: string,
  params?: Stripe.PaymentIntentCaptureParams,
  opts?: Stripe.RequestOptions,
) {
  return asStripe(stripe).paymentIntents.capture(id, params, opts);
}

export function createRefund(stripe: unknown, params: Stripe.RefundCreateParams, opts?: Stripe.RequestOptions) {
  return asStripe(stripe).refunds.create(params, opts);
}

export function listRefunds(stripe: unknown, params: Stripe.RefundListParams) {
  return asStripe(stripe).refunds.list(params);
}

export function retrieveRemotePaymentMethod(stripe: unknown, id: string) {
  return asStripe(stripe).paymentMethods.retrieve(id);
}

export function attachRemotePaymentMethod(stripe: unknown, id: string, params: Stripe.PaymentMethodAttachParams) {
  return asStripe(stripe).paymentMethods.attach(id, params);
}

export function detachRemotePaymentMethod(stripe: unknown, id: string) {
  return asStripe(stripe).paymentMethods.detach(id);
}

export function updateRemotePaymentMethod(stripe: unknown, id: string, params: Stripe.PaymentMethodUpdateParams) {
  return asStripe(stripe).paymentMethods.update(id, params);
}

export function createRemoteCustomer(stripe: unknown, params: Stripe.CustomerCreateParams) {
  return asStripe(stripe).customers.create(params);
}

export function deleteRemoteCustomer(stripe: unknown, id: string) {
  return asStripe(stripe).customers.del(id);
}

export function retrieveBalance(stripe: unknown) {
  return asStripe(stripe).balance.retrieve();
}
