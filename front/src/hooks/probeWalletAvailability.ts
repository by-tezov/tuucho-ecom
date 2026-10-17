import { getStripePromise } from '../config/stripeClient';
import type { WalletAvailability } from './useWalletAvailability';

const PROBE_TIMEOUT_MS = 8_000;

const UNAVAILABLE: WalletAvailability = { googlePay: false, applePay: false, ready: true };

/**
 * One-shot Google Pay / Apple Pay probe for cart bootstrap (no React).
 * Same Express Checkout `always` path as useWalletAvailability.
 */
export function probeWalletAvailability(): Promise<WalletAvailability> {
  return new Promise((resolve) => {
    let settled = false;
    let timeoutId = 0;
    let host: HTMLDivElement | null = null;
    let unmountExpress: (() => void) | null = null;

    const finish = (next: WalletAvailability) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      unmountExpress?.();
      host?.remove();
      resolve(next);
    };

    void (async () => {
      try {
        const stripe = await getStripePromise();
        if (!stripe) {
          finish(UNAVAILABLE);
          return;
        }

        const elements = stripe.elements({
          mode: 'payment',
          amount: 100,
          currency: 'eur',
        });
        const expressCheckout = elements.create('expressCheckout', {
          paymentMethods: {
            googlePay: 'always',
            applePay: 'always',
            link: 'never',
            paypal: 'never',
            amazonPay: 'never',
            klarna: 'never',
          },
        });

        host = document.createElement('div');
        host.setAttribute('aria-hidden', 'true');
        host.style.cssText =
          'position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';
        document.body.appendChild(host);

        unmountExpress = () => {
          try {
            expressCheckout.unmount();
          } catch {
            /* already gone */
          }
        };

        expressCheckout.on('availablepaymentmethodschange', (event) => {
          const methods = event.paymentMethods;
          finish({
            googlePay: methods?.googlePay?.available === true,
            applePay: methods?.applePay?.available === true,
            ready: true,
          });
        });

        timeoutId = window.setTimeout(() => finish(UNAVAILABLE), PROBE_TIMEOUT_MS);
        expressCheckout.mount(host);
      } catch {
        finish(UNAVAILABLE);
      }
    })();
  });
}
