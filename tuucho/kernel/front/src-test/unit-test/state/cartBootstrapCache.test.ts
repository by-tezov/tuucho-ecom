import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CartBootstrapData } from '@/state/cartBootstrapCache';

type CartBootstrapModule = typeof import('@/state/cartBootstrapCache');
let cache: CartBootstrapModule;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  cache = await import('@/state/cartBootstrapCache');
});

afterEach(() => {
  vi.useRealTimers();
});

function snapshot(): CartBootstrapData {
  return {
    generation: 'g1',
    revision: 0,
    delivery: {
      addresses: [
        { id: 'addr-home', kind: 'livraison', isDefault: true },
        { id: 'addr-work', kind: 'livraison', isDefault: false },
        { id: 'addr-bill', kind: 'facturation', isDefault: false },
      ],
      selection: {
        addressId: 'addr-work',
        billingAddressId: 'addr-bill',
        sameAsBilling: false,
        paymentMethodId: 'pm_1',
      },
    },
    payment: {
      paymentMethods: [{ id: 'pm_1' }, { id: 'pm_2' }],
      sessionMethods: [{ id: 'pm_1' }],
      defaultPaymentMethod: { type: 'card', id: 'pm_1' },
      initialPaymentMethodId: 'pm_1',
    },
    walletAvailability: {},
    guestCheckoutReady: true,
  } as unknown as CartBootstrapData;
}

describe('cart bootstrap cache', () => {
  it('serves the snapshot only for the same generation and audience while the tab is warm', () => {
    cache.writeCartBootstrapCache('g1', 'user', snapshot());
    expect(cache.readCartBootstrapCache('g1', 'user')).not.toBeNull();
    expect(cache.readCartBootstrapCache('g2', 'user')).toBeNull();
    expect(cache.readCartBootstrapCache('g1', 'anon')).toBeNull();
  });

  it('starts cold again after the idle TTL, even if activity resumes later', () => {
    cache.writeCartBootstrapCache('g1', 'user', snapshot());
    vi.advanceTimersByTime(1_001);
    expect(cache.readCartBootstrapCache('g1', 'user')).toBeNull();
    cache.touchCartSpaActivity();
    expect(cache.readCartBootstrapCache('g1', 'user')).toBeNull();
  });

  it('drops the snapshot on logout', () => {
    cache.writeCartBootstrapCache('g1', 'user', snapshot());
    cache.invalidateCartBootstrapCache('order');
    expect(cache.readCartBootstrapCache('g1', 'user')).toBeNull();
    cache.writeCartBootstrapCache('g1', 'user', snapshot());
    cache.invalidateCartBootstrapCache('logout');
    expect(cache.readCartBootstrapCache('g1', 'user')).toBeNull();
  });

  it('never repaints an address or card the customer deleted in this tab', () => {
    cache.writeCartBootstrapCache('g1', 'user', snapshot());
    cache.markCheckoutEntityDeleted('addr-work');
    cache.markCheckoutEntityDeleted('addr-bill');
    cache.markCheckoutEntityDeleted('pm_1');

    const cached = cache.readCartBootstrapCache('g1', 'user');
    expect(cached?.delivery.addresses.map((a) => a.id)).toEqual(['addr-home']);
    expect(cached?.delivery.selection).toMatchObject({
      addressId: 'addr-home',
      billingAddressId: null,
      sameAsBilling: true,
      paymentMethodId: null,
    });
    expect(cached?.payment.paymentMethods.map((m) => m.id)).toEqual(['pm_2']);
    expect(cached?.payment.sessionMethods).toEqual([]);
    expect(cached?.payment.defaultPaymentMethod).toBeNull();
    expect(cached?.payment.initialPaymentMethodId).toBeNull();

    // A revalidate that raced the delete is scrubbed too.
    expect(cache.scrubDeletedCheckoutEntities(snapshot()).payment.paymentMethods.map((m) => m.id)).toEqual([
      'pm_2',
    ]);
  });
});
