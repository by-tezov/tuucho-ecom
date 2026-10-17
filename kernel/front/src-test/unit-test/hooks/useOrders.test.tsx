import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Order } from '@/api/orders';
import { OrdersProvider, useOrders, useOrdersPageData } from '@/hooks/useOrders';

const testState = vi.hoisted(() => ({
  auth: {
    status: 'authenticated' as 'loading' | 'authenticated' | 'anonymous',
    user: { id: 'account-a' } as { id: string } | null,
    authedRequest: async <T,>(request: (token: string) => Promise<T>) => request('token'),
  },
  listOrders: vi.fn(),
  listGuestOrders: vi.fn(),
}));

vi.mock('@/state/AuthContext', () => ({ useAuthSession: () => testState.auth }));
vi.mock('@/assets/i18n', () => ({ useLang: () => ({ lang: 'fr' }) }));
vi.mock('@/api/orders', () => ({
  listOrders: testState.listOrders,
  listGuestOrders: testState.listGuestOrders,
  cancelOrder: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function Probe() {
  const { activeOrders, loading } = useOrders();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="orders">{activeOrders.map((order) => order.id).join(',')}</span>
    </div>
  );
}

function PageProbe() {
  const { loading } = useOrdersPageData();
  return <span data-testid="page-loading">{String(loading)}</span>;
}

function View({ children }: { children: ReactNode }) {
  return <OrdersProvider>{children}</OrdersProvider>;
}

beforeEach(() => {
  testState.listOrders.mockReset();
  testState.listGuestOrders.mockReset();
  testState.listGuestOrders.mockResolvedValue({ orders: [] });
});

afterEach(() => {
  testState.auth.status = 'authenticated';
  testState.auth.user = { id: 'account-a' };
});

describe('OrdersProvider request ownership', () => {
  it('shows loading while an already-cached orders page revalidates on entry', async () => {
    testState.listOrders.mockResolvedValue({ orders: [] });
    const view = render(
      <View>
        <Probe />
      </View>,
    );
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));

    testState.listOrders.mockClear();
    const active = deferred<{ orders: Order[] }>();
    const history = deferred<{ orders: Order[] }>();
    testState.listOrders.mockImplementation((_token: string, scope: string) =>
      scope === 'active' ? active.promise : history.promise,
    );

    view.rerender(
      <View>
        <PageProbe />
      </View>,
    );

    expect(screen.getByTestId('page-loading')).toHaveTextContent('true');
    await waitFor(() => expect(testState.listOrders).toHaveBeenCalledTimes(2));
    active.resolve({ orders: [] });
    history.resolve({ orders: [] });
    await waitFor(() => expect(screen.getByTestId('page-loading')).toHaveTextContent('false'));
  });

  it('keeps the page loading until orders and guest-order candidates are collected', async () => {
    const guestOrders = deferred<{ orders: [] }>();
    testState.listOrders.mockResolvedValue({ orders: [] });
    testState.listGuestOrders.mockReturnValue(guestOrders.promise);

    render(
      <View>
        <Probe />
      </View>,
    );

    await waitFor(() => expect(testState.listOrders).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('loading')).toHaveTextContent('true');

    guestOrders.resolve({ orders: [] });
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
  });

  it('settles loading after a request failure', async () => {
    testState.listOrders
      .mockRejectedValueOnce(new Error('network'))
      .mockRejectedValueOnce(new Error('network'));
    render(
      <View>
        <Probe />
      </View>,
    );
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('orders')).toBeEmptyDOMElement();
  });

  it('ignores an authenticated response that completes after logout', async () => {
    const active = deferred<{ orders: Order[] }>();
    const history = deferred<{ orders: Order[] }>();
    testState.listOrders.mockImplementation((_token: string, scope: string) =>
      scope === 'active' ? active.promise : history.promise,
    );
    const { rerender } = render(
      <View>
        <Probe />
      </View>,
    );
    await waitFor(() => expect(testState.listOrders).toHaveBeenCalledTimes(2));

    testState.auth.status = 'anonymous';
    testState.auth.user = null;
    rerender(
      <View>
        <Probe />
      </View>,
    );
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));

    active.resolve({ orders: [{ id: 'old-account-order' } as Order] });
    history.resolve({ orders: [] });
    await Promise.all([active.promise, history.promise]);
    expect(screen.getByTestId('orders')).toBeEmptyDOMElement();
  });
});
