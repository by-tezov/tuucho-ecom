import type { PaymentMethod } from '../../contract/checkout.js';
import type pg from 'pg';
import { listPaymentGateways } from '@tuucho/plugin-sdk';

export type PublicPaymentMethod = PaymentMethod;

/** Opaque handle from the registered payment gateway. Kernel never constructs a card SDK. */
export type PaymentClient = unknown;

function gateway() {
  return listPaymentGateways().find((registered) => typeof registered.getClient === 'function');
}

function requireGateway() {
  const registered = gateway();
  if (!registered) throw new Error('stripe_unavailable');
  return registered;
}

/** Client from the registered payment gateway, or undefined if none is on.
 * The kernel payment-method shell never constructs a card SDK instance. */
export function getStripe(): PaymentClient | undefined {
  return gateway()?.getClient?.();
}

export function isStripeConfigured(): boolean {
  return Boolean(getStripe());
}

function callGateway<T>(name: string, ...args: unknown[]): T {
  const registered = requireGateway();
  const fn = (registered as unknown as Record<string, unknown>)[name];
  if (typeof fn !== 'function') throw new Error('stripe_unavailable');
  return (fn as (...callArgs: unknown[]) => T)(...args);
}

export function constructWebhookEvent(raw: Buffer, signature: string): any {
  return callGateway('constructWebhookEvent', raw, signature);
}

export function retrievePaymentIntent(stripe: PaymentClient, id: string, params?: object): Promise<any> {
  return callGateway('retrievePaymentIntent', stripe, id, params);
}

export function cancelPaymentIntent(
  stripe: PaymentClient,
  id: string,
  params?: object,
  opts?: object,
): Promise<any> {
  return callGateway('cancelPaymentIntent', stripe, id, params, opts);
}

export function capturePaymentIntent(
  stripe: PaymentClient,
  id: string,
  params?: object,
  opts?: object,
): Promise<any> {
  return callGateway('capturePaymentIntent', stripe, id, params, opts);
}

export function createRefund(stripe: PaymentClient, params: object, opts?: object): Promise<any> {
  return callGateway('createRefund', stripe, params, opts);
}

export function listRefunds(stripe: PaymentClient, params: object): Promise<any> {
  return callGateway('listRefunds', stripe, params);
}

export function retrieveRemotePaymentMethod(stripe: PaymentClient, id: string): Promise<any> {
  return callGateway('retrieveRemotePaymentMethod', stripe, id);
}

export function attachRemotePaymentMethod(stripe: PaymentClient, id: string, params: object): Promise<any> {
  return callGateway('attachRemotePaymentMethod', stripe, id, params);
}

export function detachRemotePaymentMethod(stripe: PaymentClient, id: string): Promise<any> {
  return callGateway('detachRemotePaymentMethod', stripe, id);
}

export function updateRemotePaymentMethod(stripe: PaymentClient, id: string, params: object): Promise<any> {
  return callGateway('updateRemotePaymentMethod', stripe, id, params);
}

export function createRemoteCustomer(stripe: PaymentClient, params: object): Promise<any> {
  return callGateway('createRemoteCustomer', stripe, params);
}

export function deleteRemoteCustomer(stripe: PaymentClient, id: string): Promise<any> {
  return callGateway('deleteRemoteCustomer', stripe, id);
}

export function retrieveBalance(stripe: PaymentClient): Promise<any> {
  return callGateway('retrieveBalance', stripe);
}

export async function getOrCreateCustomerId(pool: pg.Pool, stripe: unknown, userId: string): Promise<string> {
  const fn = gateway()?.getOrCreateCustomerId;
  if (!fn) throw new Error('stripe_unavailable');
  return fn(pool, stripe, userId) as Promise<string>;
}

export async function createCheckoutIntent(
  stripe: unknown,
  customerId: string,
  amountEuros: number,
  metadata: Record<string, string>,
  paymentMethodTypes?: string[],
  idempotencyKey?: string,
  setupFutureUsage?: boolean,
): Promise<{ id: string; clientSecret: string }> {
  const fn = gateway()?.createAccountIntent;
  if (!fn) throw new Error('stripe_unavailable');
  return fn(stripe, customerId, amountEuros, metadata, paymentMethodTypes, idempotencyKey, setupFutureUsage) as Promise<{
    id: string;
    clientSecret: string;
  }>;
}

export async function createGuestCheckoutIntent(
  stripe: unknown,
  amountEuros: number,
  metadata: Record<string, string>,
  paymentMethodTypes?: string[],
  idempotencyKey?: string,
  setupFutureUsage?: boolean,
): Promise<{ id: string; clientSecret: string }> {
  const fn = gateway()?.createGuestIntent;
  if (!fn) throw new Error('stripe_unavailable');
  return fn(stripe, amountEuros, metadata, paymentMethodTypes, idempotencyKey, setupFutureUsage) as Promise<{
    id: string;
    clientSecret: string;
  }>;
}

export async function createSetupIntent(stripe: unknown, customerId: string): Promise<string> {
  const fn = gateway()?.createSetupIntent;
  if (!fn) throw new Error('stripe_unavailable');
  return fn(stripe, customerId) as Promise<string>;
}

export async function listPaymentMethods(stripe: unknown, customerId: string): Promise<PublicPaymentMethod[]> {
  const fn = gateway()?.listPaymentMethods;
  if (!fn) throw new Error('stripe_unavailable');
  return fn(stripe, customerId) as Promise<PublicPaymentMethod[]>;
}

export async function getPaymentMethod(
  stripe: unknown,
  customerId: string,
  paymentMethodId: string,
): Promise<PublicPaymentMethod | null> {
  const fn = gateway()?.getPaymentMethod;
  if (!fn) throw new Error('stripe_unavailable');
  return fn(stripe, customerId, paymentMethodId) as Promise<PublicPaymentMethod | null>;
}

export async function detachPaymentMethod(
  stripe: unknown,
  customerId: string,
  paymentMethodId: string,
): Promise<boolean> {
  const fn = gateway()?.detachPaymentMethod;
  if (!fn) throw new Error('stripe_unavailable');
  return fn(stripe, customerId, paymentMethodId) as Promise<boolean>;
}
