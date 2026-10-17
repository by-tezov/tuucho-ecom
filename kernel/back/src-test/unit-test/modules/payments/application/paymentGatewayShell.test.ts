import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getPaymentGateway,
  getPaymentGatewayForMethod,
  registerPaymentGateway,
  resetShells,
} from '@tuucho/plugin-sdk';

test('charge paths see no Stripe client until the gateway is registered', () => {
  resetShells();
  assert.equal(getPaymentGateway('tuucho-payment-stripe'), undefined);
  assert.equal(getPaymentGatewayForMethod('card'), undefined);
  registerPaymentGateway({ id: 'tuucho-payment-stripe', methods: ['card', 'paypal'] });
  assert.equal(getPaymentGateway('tuucho-payment-stripe')?.id, 'tuucho-payment-stripe');
  assert.equal(getPaymentGatewayForMethod('card')?.id, 'tuucho-payment-stripe');
  resetShells();
  assert.equal(getPaymentGatewayForMethod('card'), undefined);
});
