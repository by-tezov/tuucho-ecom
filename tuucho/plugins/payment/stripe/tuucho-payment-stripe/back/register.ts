import type { PluginRegisterFn } from '@tuucho/plugin-sdk';
import {
  createCheckoutIntent,
  createGuestCheckoutIntent,
  createSetupIntent,
  createStripeFromEnv,
  detachPaymentMethod,
  getOrCreateCustomerId,
  getPaymentMethod,
  listPaymentMethods,
} from './src/stripeClient.js';
import * as stripeOps from './src/stripeOps.js';

const METHODS = ['card', 'paypal', 'bancontact', 'google_pay', 'apple_pay'];

const register: PluginRegisterFn = async (api) => {
  api.registerPaymentGateway({
    id: api.pluginId,
    methods: METHODS,
    capabilities: ['saved-methods', 'webhooks', 'manual-capture'],
    getClient: () => createStripeFromEnv(),
    getOrCreateCustomerId,
    createAccountIntent: createCheckoutIntent,
    createGuestIntent: createGuestCheckoutIntent,
    createSetupIntent,
    listPaymentMethods,
    getPaymentMethod,
    detachPaymentMethod,
    constructWebhookEvent: stripeOps.constructWebhookEvent,
    retrievePaymentIntent: stripeOps.retrievePaymentIntent,
    cancelPaymentIntent: stripeOps.cancelPaymentIntent,
    capturePaymentIntent: stripeOps.capturePaymentIntent,
    createRefund: stripeOps.createRefund,
    listRefunds: stripeOps.listRefunds,
    retrieveRemotePaymentMethod: stripeOps.retrieveRemotePaymentMethod,
    attachRemotePaymentMethod: stripeOps.attachRemotePaymentMethod,
    detachRemotePaymentMethod: stripeOps.detachRemotePaymentMethod,
    updateRemotePaymentMethod: stripeOps.updateRemotePaymentMethod,
    createRemoteCustomer: stripeOps.createRemoteCustomer,
    deleteRemoteCustomer: stripeOps.deleteRemoteCustomer,
    retrieveBalance: stripeOps.retrieveBalance,
  });
};

export { register };
export default register;
