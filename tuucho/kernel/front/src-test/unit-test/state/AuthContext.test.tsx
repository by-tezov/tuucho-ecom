import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/errors';
import type { AuthSession, AuthUser } from '@/api/identity';
import type { GuestCartMergeChoice } from '@/state/guestSync';

const identity = vi.hoisted(() => ({
  startAuthBootstrap: vi.fn(),
  refreshSession: vi.fn(),
  waitForInFlightRefresh: vi.fn(async () => {}),
  login: vi.fn(),
  logout: vi.fn(),
  manageGuestOrder: vi.fn(),
  impersonateUser: vi.fn(),
  getProfile: vi.fn(),
  markAuthSessionPresent: vi.fn(),
  markAuthSessionAbsent: vi.fn(),
}));
const sync = vi.hoisted(() => ({
  mergeGuestStateIntoAccount: vi.fn(),
  completeGuestCartMerge: vi.fn(),
  parkGuestCartAsUnconnected: vi.fn(),
}));
const sideEffects = vi.hoisted(() => ({
  initializeCheckoutPrivacySession: vi.fn(async () => {}),
  resetCheckoutPrivacySession: vi.fn(),
  clearAuthConsentDraft: vi.fn(),
  clearEphemeralAddresses: vi.fn(),
  clearEphemeralCards: vi.fn(),
  clearRememberedGuestCheckout: vi.fn(async () => {}),
  invalidateProductCache: vi.fn(),
  invalidateCartBootstrapCache: vi.fn(),
  updateLanguagePreference: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/api/identity', () => ({
  ...identity,
  isGoogleSignInNeedsConsent: () => false,
  isAppleSignInNeedsConsent: () => false,
  isFacebookSignInNeedsConsent: () => false,
  isSocialSignInNeedsAccountChoice: () => false,
}));
vi.mock('@/api/account', () => ({
  updateLanguagePreference: sideEffects.updateLanguagePreference,
}));
vi.mock('@/state/guestSync', () => sync);
vi.mock('@/state/checkoutPrivacySession', () => ({
  initializeCheckoutPrivacySession: sideEffects.initializeCheckoutPrivacySession,
  resetCheckoutPrivacySession: sideEffects.resetCheckoutPrivacySession,
}));
vi.mock('@/state/authConsentDraft', () => ({
  clearAuthConsentDraft: sideEffects.clearAuthConsentDraft,
}));
vi.mock('@/state/ephemeralAddresses', () => ({
  clearEphemeralAddresses: sideEffects.clearEphemeralAddresses,
}));
vi.mock('@/state/ephemeralCards', () => ({
  clearEphemeralCards: sideEffects.clearEphemeralCards,
}));
vi.mock('@/state/guestCardVault', () => ({
  clearRememberedGuestCheckout: sideEffects.clearRememberedGuestCheckout,
}));
vi.mock('@/state/productCache', () => ({
  invalidateProductCache: sideEffects.invalidateProductCache,
}));
vi.mock('@/state/cartBootstrapCache', () => ({
  invalidateCartBootstrapCache: sideEffects.invalidateCartBootstrapCache,
}));
vi.mock('@/state/giftLockSession', () => ({ clearGiftLockSession: vi.fn() }));
vi.mock('@/state/adminSessionLand', () => ({ clearAdminBrowserSession: vi.fn() }));
vi.mock('@/assets/i18n', () => ({ useLang: () => ({ t: {}, lang: 'fr' }) }));
vi.mock('@/assets/i18n/languagePreference', () => ({
  preferredLanguage: () => 'fr',
  activeLanguage: () => 'fr',
}));
// The merge-dialog floor is a real LoadingModal delay; tests only care about ordering.
vi.mock('@/utils/withMinDuration', () => ({ delay: async () => {} }));
vi.mock('@/components/cart/LoginMergeDialog', () => ({
  LoginMergeDialog: (props: {
    onConfirm: (mode: 'new' | 'merge', targetCartId?: string) => Promise<void>;
    onDiscard: () => Promise<void>;
  }) => (
    <div role="dialog">
      <button type="button" onClick={() => void props.onConfirm('merge', 'cart-1').catch(() => {})}>
        merge
      </button>
      <button type="button" onClick={() => void props.onDiscard().catch(() => {})}>
        close
      </button>
    </div>
  ),
}));

import {
  AuthProvider,
  useAuthCommands,
  useAuthPrompt,
  useAuthSession,
  type AuthCommandsContextValue,
  type AuthPromptContextValue,
  type AuthSessionContextValue,
} from '@/state/AuthContext';

function user(id: string, role: AuthUser['role'] = 'user'): AuthUser {
  return {
    id,
    email: `${id}@example.test`,
    emailVerified: true,
    pendingEmail: null,
    firstName: null,
    lastName: null,
    phone: null,
    status: 'active',
    role,
    deletionScheduledFor: null,
  } as AuthUser;
}

function session(id: string, token: string, extra: Partial<AuthSession> = {}): AuthSession {
  return { user: user(id), accessToken: token, accessTokenExpiresAt: '2099-01-01T00:00:00Z', ...extra };
}

const choice = { carts: [], cartLimit: 10, items: [], extra: [] } as unknown as GuestCartMergeChoice;

const ctx: {
  session?: AuthSessionContextValue;
  commands?: AuthCommandsContextValue;
  prompt?: AuthPromptContextValue;
} = {};

function Probe() {
  ctx.session = useAuthSession();
  ctx.commands = useAuthCommands();
  ctx.prompt = useAuthPrompt();
  return (
    <output data-testid="state">
      {ctx.session.status}:{ctx.session.user?.id ?? '-'}
    </output>
  );
}

function renderAuth() {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

const stateText = () => screen.getByTestId('state').textContent;

async function signedInAs(id: string, token: string) {
  identity.startAuthBootstrap.mockResolvedValue(session(id, token));
  renderAuth();
  await waitFor(() => expect(stateText()).toBe(`authenticated:${id}`));
}

beforeEach(() => {
  identity.startAuthBootstrap.mockResolvedValue(null);
  identity.logout.mockResolvedValue({ success: true });
  sync.mergeGuestStateIntoAccount.mockResolvedValue({ status: 'done' });
  sync.completeGuestCartMerge.mockResolvedValue(undefined);
  sync.parkGuestCartAsUnconnected.mockResolvedValue(undefined);
});

afterEach(() => {
  for (const group of [identity, sync]) for (const fn of Object.values(group)) fn.mockReset();
  identity.waitForInFlightRefresh.mockImplementation(async () => {});
});

describe('AuthProvider bootstrap', () => {
  it('settles anonymous when no session can be restored', async () => {
    renderAuth();
    await waitFor(() => expect(stateText()).toBe('anonymous:-'));
    expect(identity.markAuthSessionAbsent).toHaveBeenCalled();
  });

  it('restores a remembered session and drops anonymous caches', async () => {
    await signedInAs('u1', 'at-1');
    expect(sideEffects.invalidateProductCache).toHaveBeenCalledWith('login');
    expect(sideEffects.initializeCheckoutPrivacySession).toHaveBeenCalledWith('at-1');
  });

  it('never lets a late silent refresh overwrite an explicit login', async () => {
    let finishBootstrap!: (value: AuthSession | null) => void;
    identity.startAuthBootstrap.mockReturnValue(new Promise((resolve) => (finishBootstrap = resolve)));
    identity.login.mockResolvedValue(session('fresh', 'at-fresh'));
    renderAuth();

    await act(() => ctx.commands!.login('fresh@example.test', 'pw', false));
    expect(stateText()).toBe('authenticated:fresh');

    await act(async () => finishBootstrap(session('remembered', 'at-old')));
    expect(stateText()).toBe('authenticated:fresh');
  });
});

describe('authedRequest', () => {
  it('rejects without calling the API when signed out', async () => {
    renderAuth();
    await waitFor(() => expect(stateText()).toBe('anonymous:-'));
    const call = vi.fn();
    await expect(ctx.session!.authedRequest(call)).rejects.toMatchObject({ code: 'unauthorized' });
    expect(call).not.toHaveBeenCalled();
  });

  it('refreshes once on an expired token and retries with the new one', async () => {
    await signedInAs('u1', 'at-1');
    identity.refreshSession.mockResolvedValue(session('u1', 'at-2'));
    const call = vi.fn(async (token: string) => {
      if (token === 'at-1') throw new ApiError('unauthorized', 401);
      return token;
    });
    await expect(ctx.session!.authedRequest(call)).resolves.toBe('at-2');
    expect(identity.refreshSession).toHaveBeenCalledTimes(1);
  });

  it('does not refresh on other errors', async () => {
    await signedInAs('u1', 'at-1');
    const failure = new ApiError('forbidden', 403);
    await expect(ctx.session!.authedRequest(async () => Promise.reject(failure))).rejects.toBe(failure);
    expect(identity.refreshSession).not.toHaveBeenCalled();
  });

  it('signs out locally when the refresh itself fails', async () => {
    await signedInAs('u1', 'at-1');
    identity.refreshSession.mockRejectedValue(new ApiError('unauthorized', 401));
    await act(async () => {
      await expect(
        ctx.session!.authedRequest(async () => Promise.reject(new ApiError('unauthorized', 401))),
      ).rejects.toBeInstanceOf(ApiError);
    });
    expect(stateText()).toBe('anonymous:-');
  });

  it('stays signed in when the endpoint still answers 401 after a good refresh', async () => {
    await signedInAs('admin', 'at-1');
    identity.refreshSession.mockResolvedValue(session('admin', 'at-2'));
    await act(async () => {
      await expect(
        ctx.session!.authedRequest(async () => Promise.reject(new ApiError('unauthorized', 401))),
      ).rejects.toBeInstanceOf(ApiError);
    });
    expect(stateText()).toBe('authenticated:admin');
  });
});

describe('login with a guest cart', () => {
  it('imports remembered guest checkout details only for a brand-new account', async () => {
    renderAuth();
    await waitFor(() => expect(stateText()).toBe('anonymous:-'));
    identity.login.mockResolvedValue(session('u1', 'at-1'));
    await act(() => ctx.commands!.login('u1@example.test', 'pw', false));
    expect(sync.mergeGuestStateIntoAccount).toHaveBeenLastCalledWith('at-1', {
      attachRememberedCheckout: false,
    });

    identity.login.mockResolvedValue(session('u2', 'at-2', { created: true }));
    await act(() => ctx.commands!.login('u2@example.test', 'pw', false));
    expect(sync.mergeGuestStateIntoAccount).toHaveBeenLastCalledWith('at-2', {
      attachRememberedCheckout: true,
    });
  });

  it('holds the session anonymous until the customer resolves the merge dialog', async () => {
    renderAuth();
    await waitFor(() => expect(stateText()).toBe('anonymous:-'));
    identity.login.mockResolvedValue(session('u1', 'at-1'));
    sync.mergeGuestStateIntoAccount.mockResolvedValue({ status: 'needs_cart_choice', choice });

    await act(() => ctx.commands!.login('u1@example.test', 'pw', false));
    expect(stateText()).toBe('anonymous:-');
    expect(ctx.prompt!.hasPendingGuestMerge).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'merge' }));
    await waitFor(() => expect(stateText()).toBe('authenticated:u1'));
    expect(sync.completeGuestCartMerge).toHaveBeenCalledWith('at-1', choice, 'merge', 'cart-1', undefined);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('parks the guest lines when the chosen import fails', async () => {
    renderAuth();
    await waitFor(() => expect(stateText()).toBe('anonymous:-'));
    identity.login.mockResolvedValue(session('u1', 'at-1'));
    sync.mergeGuestStateIntoAccount.mockResolvedValue({ status: 'needs_cart_choice', choice });
    sync.completeGuestCartMerge.mockRejectedValue(new ApiError('cart_limit', 409));
    await act(() => ctx.commands!.login('u1@example.test', 'pw', false));

    fireEvent.click(screen.getByRole('button', { name: 'merge' }));
    await waitFor(() => expect(stateText()).toBe('authenticated:u1'));
    expect(sync.parkGuestCartAsUnconnected).toHaveBeenCalledWith('at-1', choice);
  });

  it('keeps the dialog open when parking on close fails, so the customer can retry', async () => {
    renderAuth();
    await waitFor(() => expect(stateText()).toBe('anonymous:-'));
    identity.login.mockResolvedValue(session('u1', 'at-1'));
    sync.mergeGuestStateIntoAccount.mockResolvedValue({ status: 'needs_cart_choice', choice });
    sync.parkGuestCartAsUnconnected.mockRejectedValue(new Error('500'));
    await act(() => ctx.commands!.login('u1@example.test', 'pw', false));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'close' }));
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(stateText()).toBe('anonymous:-');
  });
});

describe('logout', () => {
  it('drops every per-session secret even when the server call fails', async () => {
    await signedInAs('u1', 'at-1');
    identity.logout.mockRejectedValue(new Error('offline'));
    await act(async () => {
      await ctx.commands!.logout().catch(() => {});
    });
    expect(stateText()).toBe('anonymous:-');
    expect(sideEffects.resetCheckoutPrivacySession).toHaveBeenCalled();
    expect(sideEffects.clearEphemeralAddresses).toHaveBeenCalled();
    expect(sideEffects.clearEphemeralCards).toHaveBeenCalled();
    expect(sideEffects.clearAuthConsentDraft).toHaveBeenCalledWith({ force: true });
    expect(sideEffects.invalidateCartBootstrapCache).toHaveBeenCalledWith('logout');
  });
});

describe('manage guest order link', () => {
  it('signs out the current account before claiming the link, and parks a conflicting guest cart', async () => {
    await signedInAs('remembered', 'at-old');
    identity.manageGuestOrder.mockResolvedValue(session('guest', 'at-guest'));
    sync.mergeGuestStateIntoAccount.mockResolvedValue({ status: 'needs_cart_choice', choice });

    await act(async () => {
      await expect(ctx.commands!.completeManageGuestOrder('link-token')).resolves.toEqual({
        alreadyManaged: false,
      });
    });
    expect(identity.logout).toHaveBeenCalledWith('at-old');
    expect(identity.logout.mock.invocationCallOrder[0]).toBeLessThan(
      identity.manageGuestOrder.mock.invocationCallOrder[0]!,
    );
    expect(sync.parkGuestCartAsUnconnected).toHaveBeenCalledWith('at-guest', choice);
    expect(stateText()).toBe('authenticated:guest');
  });

  it('reports an already-managed link without signing anyone in', async () => {
    renderAuth();
    await waitFor(() => expect(stateText()).toBe('anonymous:-'));
    identity.manageGuestOrder.mockResolvedValue({ success: true, alreadyManaged: true });
    await act(async () => {
      await expect(ctx.commands!.completeManageGuestOrder('link-token')).resolves.toEqual({
        alreadyManaged: true,
      });
    });
    expect(stateText()).toBe('anonymous:-');
  });
});

describe('impersonation', () => {
  it('is refused for a non-admin', async () => {
    await signedInAs('u1', 'at-1');
    await expect(ctx.commands!.impersonate('x@example.test')).rejects.toMatchObject({ code: 'forbidden' });
    expect(identity.impersonateUser).not.toHaveBeenCalled();
  });

  it('switches to the customer and back to the administrator', async () => {
    identity.startAuthBootstrap.mockResolvedValue({
      ...session('boss', 'at-admin'),
      user: user('boss', 'admin'),
    });
    renderAuth();
    await waitFor(() => expect(stateText()).toBe('authenticated:boss'));

    identity.impersonateUser.mockResolvedValue(session('customer', 'at-customer'));
    await act(() => ctx.commands!.impersonate('customer@example.test'));
    expect(stateText()).toBe('authenticated:customer');
    expect(ctx.session!.isImpersonating).toBe(true);

    act(() => ctx.commands!.stopImpersonating());
    expect(stateText()).toBe('authenticated:boss');
    const call = vi.fn(async (token: string) => token);
    await expect(ctx.session!.authedRequest(call)).resolves.toBe('at-admin');
  });
});

describe('auth prompt', () => {
  it('maps register to the unified connect view and never opens once signed in', async () => {
    renderAuth();
    await waitFor(() => expect(stateText()).toBe('anonymous:-'));
    act(() => ctx.prompt!.promptAuth('register', 'a@example.test'));
    expect(ctx.prompt).toMatchObject({ authPromptMode: 'login', authPromptEmail: 'a@example.test' });
    act(() => ctx.prompt!.dismissAuthPrompt());

    identity.login.mockResolvedValue(session('u1', 'at-1'));
    await act(() => ctx.commands!.login('u1@example.test', 'pw', false));
    act(() => ctx.prompt!.promptAuth('login'));
    expect(ctx.prompt!.authPromptMode).toBeNull();
  });
});
