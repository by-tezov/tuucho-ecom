import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DefaultPaymentMethod, PaymentMethod, ShopPaymentMethods } from '../../../src/api/checkout';
import type { PaymentMethodCountries } from '../../../src/utils/checkoutOverflow';

const api = vi.hoisted(() => ({
  listPaymentMethods: vi.fn(),
  getShopPaymentMethods: vi.fn(),
  getPaymentMethod: vi.fn(),
  loadGuestCards: vi.fn(),
}));
const ephemeral = vi.hoisted(() => ({ cards: [] as PaymentMethod[] }));

vi.mock('../../../src/api/checkout', () => ({
  listPaymentMethods: api.listPaymentMethods,
  getShopPaymentMethods: api.getShopPaymentMethods,
  getPaymentMethod: api.getPaymentMethod,
}));
vi.mock('../../../src/state/guestCardVault', () => ({ loadGuestCards: api.loadGuestCards }));
vi.mock('../../../src/state/ephemeralCards', () => ({
  loadEphemeralCards: () => [...ephemeral.cards],
  addEphemeralCard: (card: PaymentMethod) => {
    ephemeral.cards = [...ephemeral.cards.filter((m) => m.id !== card.id), card];
    return [...ephemeral.cards];
  },
  removeEphemeralCard: (id: string) => {
    ephemeral.cards = ephemeral.cards.filter((m) => m.id !== id);
    return [...ephemeral.cards];
  },
}));

import { loadAuthPaymentBootstrap, loadGuestPaymentBootstrap } from '../../../src/state/cartPaymentBootstrap';
import { saveGuestState } from '../../../src/state/guestCart';

const ALL_ON: ShopPaymentMethods = {
  card: true,
  paypal: true,
  bancontact: true,
  googlePay: true,
  applePay: true,
};
const COUNTRIES: PaymentMethodCountries = {
  card: ['ALL'],
  paypal: ['ALL'],
  bancontact: ['BE'],
  googlePay: ['ALL'],
  applePay: ['ALL'],
};

function card(id: string, savedForFuture?: boolean): PaymentMethod {
  return {
    id,
    brand: 'visa',
    last4: '4242',
    expMonth: 1,
    expYear: 2030,
    cardholderName: null,
    ...(savedForFuture === undefined ? {} : { savedForFuture }),
  };
}

function givenShop(shop: ShopPaymentMethods, effectiveCountries: string[]) {
  api.getShopPaymentMethods.mockResolvedValue({
    shopPaymentMethods: shop,
    paymentMethodCountries: COUNTRIES,
    countryContext: { deliveryCountry: effectiveCountries[0] ?? null, geoCountry: null, effectiveCountries },
  });
}

function givenAccount(options: {
  methods?: PaymentMethod[];
  defaultPaymentMethod?: DefaultPaymentMethod | null;
  shop?: ShopPaymentMethods;
  googlePayEnabled?: boolean;
}) {
  api.listPaymentMethods.mockResolvedValue({
    paymentMethods: options.methods ?? [],
    defaultPaymentMethod: options.defaultPaymentMethod ?? null,
    paypalEnabled: true,
    bancontactEnabled: true,
    googlePayEnabled: options.googlePayEnabled ?? true,
    applePayEnabled: true,
    shopPaymentMethods: options.shop ?? ALL_ON,
  });
}

const authedRequest = <T>(fn: (token: string) => Promise<T>) => fn('token');

afterEach(() => {
  ephemeral.cards = [];
  for (const fn of Object.values(api)) fn.mockReset();
});

describe('loadAuthPaymentBootstrap initial selection', () => {
  it('keeps a saved card the customer already selected', async () => {
    givenShop(ALL_ON, ['FR']);
    givenAccount({
      methods: [card('pm_1'), card('pm_2')],
      defaultPaymentMethod: { type: 'card', id: 'pm_1' },
    });
    const result = await loadAuthPaymentBootstrap(authedRequest, 'pm_2', 'FR');
    expect(result.initialPaymentMethodId).toBe('pm_2');
  });

  it('falls back to the default card when nothing is selected', async () => {
    givenShop(ALL_ON, ['FR']);
    givenAccount({ methods: [card('pm_1')], defaultPaymentMethod: { type: 'card', id: 'pm_1' } });
    expect((await loadAuthPaymentBootstrap(authedRequest, null, 'FR')).initialPaymentMethodId).toBe('pm_1');
  });

  it('does not preselect a default wallet whose country rule excludes the destination', async () => {
    givenShop(ALL_ON, ['FR']);
    givenAccount({ defaultPaymentMethod: { type: 'bancontact' } });
    expect((await loadAuthPaymentBootstrap(authedRequest, null, 'FR')).initialPaymentMethodId).toBeNull();

    givenShop(ALL_ON, ['BE']);
    expect((await loadAuthPaymentBootstrap(authedRequest, null, 'BE')).initialPaymentMethodId).toBe(
      'bancontact',
    );
  });

  it('does not preselect a profile-hidden wallet, and keeps it when it is already the choice', async () => {
    givenShop(ALL_ON, ['FR']);
    givenAccount({ defaultPaymentMethod: { type: 'google_pay' }, googlePayEnabled: false });
    expect((await loadAuthPaymentBootstrap(authedRequest, null, 'FR')).initialPaymentMethodId).toBeNull();

    givenShop(ALL_ON, ['FR']);
    givenAccount({ googlePayEnabled: false });
    expect((await loadAuthPaymentBootstrap(authedRequest, 'google_pay', 'FR')).initialPaymentMethodId).toBe(
      'google_pay',
    );
  });

  it('keeps an explicitly chosen out-of-country wallet (overflow) but drops a shop-disabled one', async () => {
    givenShop(ALL_ON, ['FR']);
    givenAccount({});
    expect((await loadAuthPaymentBootstrap(authedRequest, 'bancontact', 'FR')).initialPaymentMethodId).toBe(
      'bancontact',
    );

    const noPaypal = { ...ALL_ON, paypal: false };
    givenShop(noPaypal, ['FR']);
    givenAccount({ shop: noPaypal });
    expect((await loadAuthPaymentBootstrap(authedRequest, 'paypal', 'FR')).initialPaymentMethodId).toBeNull();
  });

  it('hydrates a one-time card selected in this session into the session list', async () => {
    givenShop(ALL_ON, ['FR']);
    givenAccount({ methods: [card('pm_saved')] });
    api.getPaymentMethod.mockResolvedValue({ paymentMethod: card('pm_once', false) });
    const result = await loadAuthPaymentBootstrap(authedRequest, 'pm_once', 'FR');
    expect(result.sessionMethods.map((m) => m.id)).toEqual(['pm_once']);
    expect(result.initialPaymentMethodId).toBe('pm_once');
  });

  it('forgets a selected card the server no longer knows', async () => {
    ephemeral.cards = [card('pm_gone', false)];
    givenShop(ALL_ON, ['FR']);
    givenAccount({ methods: [card('pm_1')], defaultPaymentMethod: { type: 'card', id: 'pm_1' } });
    api.getPaymentMethod.mockRejectedValue(new Error('not_found'));
    const result = await loadAuthPaymentBootstrap(authedRequest, 'pm_gone', 'FR');
    expect(result.sessionMethods).toEqual([]);
    expect(result.initialPaymentMethodId).toBe('pm_1');
  });

  it('treats every method as off when the shop flags cannot be loaded', async () => {
    api.getShopPaymentMethods.mockRejectedValue(new Error('down'));
    givenAccount({
      shop: { card: false, paypal: false, bancontact: false, googlePay: false, applePay: false },
    });
    const result = await loadAuthPaymentBootstrap(authedRequest, null, 'be');
    expect(result.countryContext.effectiveCountries).toEqual(['BE']);
    expect(result.initialPaymentMethodId).toBeNull();
  });
});

describe('loadGuestPaymentBootstrap', () => {
  it('lists only remembered cards and drops a default whose method the shop disabled', async () => {
    givenShop({ ...ALL_ON, paypal: false }, ['FR']);
    api.loadGuestCards.mockResolvedValue({
      paymentMethods: [card('pm_saved'), card('pm_once', false)],
      defaultPaymentMethod: { type: 'paypal' },
    });
    const result = await loadGuestPaymentBootstrap('FR');
    expect(result.paymentMethods.map((m) => m.id)).toEqual(['pm_saved']);
    expect(result.defaultPaymentMethod).toBeNull();
    expect(result.initialPaymentMethodId).toBeNull();
  });

  it('restores the wallet the guest picked earlier', async () => {
    givenShop(ALL_ON, ['FR']);
    api.loadGuestCards.mockResolvedValue({ paymentMethods: [], defaultPaymentMethod: null });
    saveGuestState({ paymentMethodId: 'google_pay' });
    expect((await loadGuestPaymentBootstrap('FR')).initialPaymentMethodId).toBe('google_pay');
  });
});
