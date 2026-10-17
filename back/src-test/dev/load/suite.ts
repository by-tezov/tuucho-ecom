/**
 * Full customer load suite excluding Stripe and Mondial Relay external API.
 *
 * smoke / baseline cover:
 *   Guest GETs (health, gallery, public account lists)
 *   Auth register/login/refresh/logout + OTP/password-reset request
 *   Account profile/prefs/addresses/favorites/carts/orders/courier prefs/selection
 *   Contact + product-request (local email dumps)
 *   Account chat create/message/read/close
 *   Voucher validate + checkout/free (€0 via load voucher)
 *   Single-nail gallery + crawler SEO relay routes + product sitemap
 *   Composed sets: create, edit, cart, checkout/free, order, invoice
 *   Gift: signed-in offer, receiver PIN/choice/destination/confirm, gift cart checkout/free
 *   Guest checkout/free
 *
 * contention covers:
 *   One scarce variant + one limited voucher raced by most VUs
 *   Two VUs (two sessions) per account shopping and paying one cart
 *   Single-nail and crawler reads alongside
 *   The orchestrator then checks stock/voucher/loyalty/invoice invariants in SQL.
 *
 * Excluded:
 *   create-intent / finalize / payment-methods Stripe / Stripe webhook
 *   Ops Stripe capture/refund and Mondial Relay label/tracking HTTP
 *
 * Invoked by: npm run test -- --dev --load [--vu 25] [--duration 60] [--load-profile baseline|contention]
 * Profile:    PAM_LOAD_PROFILE=smoke|baseline|contention (or --load-profile)
 * VUs:        PAM_LOAD_VUS / --vu (default 25, baseline 50)
 * Duration:   PAM_LOAD_DURATION / --duration seconds (default 60, baseline 120)
 * Env:        PAM_LOAD_VOUCHER_CODES, PAM_LOAD_SCARCE_* from orchestrator prepareLoadFixtures
 */
import { sleep } from 'k6';
import type { Options } from 'k6/options';
import { resolveProfile } from './_lib/profiles.ts';
import { buildSetupData } from './_lib/setupData.ts';
import type { LoadSetupData } from './_lib/types.ts';
import { guestRead as guestReadScenario } from './scenarios/guest-read.ts';
import { authAccount as authAccountScenario } from './scenarios/auth-account.ts';
import { contactChat as contactChatScenario } from './scenarios/contact-chat.ts';
import { checkoutFree as checkoutFreeScenario } from './scenarios/checkout-free.ts';
import { nailBrowse as nailBrowseScenario } from './scenarios/nail-browse.ts';
import { compose as composeScenario } from './scenarios/compose.ts';
import { giftCycle as giftCycleScenario } from './scenarios/gift-cycle.ts';
import { guestCheckout as guestCheckoutScenario } from './scenarios/guest-checkout.ts';
import {
  scarceCheckout as scarceCheckoutScenario,
  twinCart as twinCartScenario,
} from './scenarios/contention.ts';

const resolved = resolveProfile(
  __ENV.PAM_LOAD_PROFILE || 'smoke',
  __ENV.PAM_LOAD_VUS,
  __ENV.PAM_LOAD_DURATION,
);

export const options: Options = resolved.options;

export function setup(): LoadSetupData {
  return buildSetupData(resolved.profile, resolved.total);
}

export function guestRead(): void {
  guestReadScenario();
  sleep(0.2);
}

export function authAccount(data: LoadSetupData): void {
  authAccountScenario(data);
  sleep(0.3);
}

export function contactChat(data: LoadSetupData): void {
  contactChatScenario(data);
  sleep(0.3);
}

export function checkoutFree(data: LoadSetupData): void {
  checkoutFreeScenario(data);
  sleep(0.4);
}

export function nailBrowse(data: LoadSetupData): void {
  nailBrowseScenario(data);
  sleep(0.2);
}

export function compose(data: LoadSetupData): void {
  composeScenario(data);
  sleep(0.4);
}

export function giftCycle(data: LoadSetupData): void {
  giftCycleScenario(data);
  sleep(0.4);
}

export function guestCheckout(data: LoadSetupData): void {
  guestCheckoutScenario(data);
  sleep(0.4);
}

export function scarceCheckout(data: LoadSetupData): void {
  scarceCheckoutScenario(data);
  sleep(0.1);
}

export function twinCart(data: LoadSetupData): void {
  twinCartScenario(data);
  sleep(0.1);
}
