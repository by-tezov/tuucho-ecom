import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import * as authApi from '../api/account';
import { useAuthSession, type AuthContextValue, type AuthStatus } from '../state/AuthContext';
import {
  getContrastPreference,
  getContrastPreferenceRevision,
  getServerThemeSnapshot,
  getThemePreference,
  getThemePreferenceRevision,
  getThemeSnapshot,
  setContrastPreference as writeContrastPreference,
  setThemePreference as writeThemePreference,
  subscribeThemePreference,
} from './themePreference';
import { ThemeContext, type ThemeContextValue } from './themeContext';
import type { ContrastPreference, ThemePreference } from './types';

interface AccountPreferenceAdapter<Preference extends string> {
  getLocal: () => Preference;
  getRevision: () => number;
  load: (accessToken: string) => Promise<Preference | null>;
  save: (accessToken: string, preference: Preference) => Promise<void>;
  writeLocal: (preference: Preference) => void;
}

const themePreferenceAdapter: AccountPreferenceAdapter<ThemePreference> = {
  getLocal: getThemePreference,
  getRevision: getThemePreferenceRevision,
  load: async (accessToken) => (await authApi.getThemePreference(accessToken)).theme,
  save: async (accessToken, preference) => {
    await authApi.updateThemePreference(accessToken, preference);
  },
  writeLocal: writeThemePreference,
};

const contrastPreferenceAdapter: AccountPreferenceAdapter<ContrastPreference> = {
  getLocal: getContrastPreference,
  getRevision: getContrastPreferenceRevision,
  load: async (accessToken) => (await authApi.getContrastPreference(accessToken)).contrast,
  save: async (accessToken, preference) => {
    await authApi.updateContrastPreference(accessToken, preference);
  },
  writeLocal: writeContrastPreference,
};

interface AccountPreferenceSession {
  accountId: string | null;
  authedRequest: AuthContextValue['authedRequest'];
  status: AuthStatus;
}

/** Reconciles one browser appearance preference with its account value.
 * Keeping this generic prevents theme and contrast from acquiring subtly
 * different stale-read or write-order behaviour as the appearance model grows. */
function useAccountPreference<Preference extends string>(
  { accountId, authedRequest, status }: AccountPreferenceSession,
  adapter: AccountPreferenceAdapter<Preference>,
): (preference: Preference) => void {
  const accountIdRef = useRef<string | null>(accountId);
  const reconcileBaselineRef = useRef({ accountId, preferenceRevision: adapter.getRevision() });
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());

  accountIdRef.current = accountId;
  if (reconcileBaselineRef.current.accountId !== accountId) {
    reconcileBaselineRef.current = { accountId, preferenceRevision: adapter.getRevision() };
  }

  /** Serialize writes for one account. A first-login seed cannot finish after
   * and overwrite a newer explicit selection. */
  const persistPreference = useCallback(
    (preference: Preference): Promise<void> => {
      if (status !== 'authenticated' || !accountId) return Promise.resolve();

      const write = async () => {
        if (accountIdRef.current !== accountId) return;
        await authedRequest((token) => adapter.save(token, preference));
      };
      const pending = persistQueueRef.current.catch(() => undefined).then(write);
      persistQueueRef.current = pending.catch(() => undefined);
      return pending;
    },
    [accountId, adapter, authedRequest, status],
  );

  const setPreference = useCallback(
    (preference: Preference) => {
      adapter.writeLocal(preference);
      void persistPreference(preference).catch(() => {
        // The browser choice remains authoritative. A later selection or
        // restored session retries account persistence.
      });
    },
    [adapter, persistPreference],
  );

  // The account value wins on an undisturbed session restore. A local choice
  // made while the GET is in flight advances the preference-specific revision
  // and cannot be overwritten by that stale response.
  useEffect(() => {
    if (status !== 'authenticated' || !accountId) return;
    let cancelled = false;
    const revisionAtStart = reconcileBaselineRef.current.preferenceRevision;

    void authedRequest((token) => adapter.load(token))
      .then((remotePreference) => {
        if (cancelled || accountIdRef.current !== accountId) return;
        if (adapter.getRevision() !== revisionAtStart) return;
        if (remotePreference) {
          adapter.writeLocal(remotePreference);
          return;
        }
        void persistPreference(adapter.getLocal()).catch(() => undefined);
      })
      .catch(() => {
        // Keep the local cache; the next selection or restored session retries.
      });

    return () => {
      cancelled = true;
    };
  }, [accountId, adapter, authedRequest, persistPreference, status]);

  return setPreference;
}

/** Owns React appearance state and account persistence. DOM/storage mechanics
 * stay in themePreference.ts, so consumers only depend on this small context. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { status, user, authedRequest } = useAuthSession();
  const snapshot = useSyncExternalStore(subscribeThemePreference, getThemeSnapshot, getServerThemeSnapshot);
  const session = { status, accountId: user?.id ?? null, authedRequest };
  const setPreference = useAccountPreference(session, themePreferenceAdapter);
  const setContrastPreference = useAccountPreference(session, contrastPreferenceAdapter);

  const value = useMemo<ThemeContextValue>(
    () => ({ ...snapshot, setPreference, setContrastPreference }),
    [setContrastPreference, setPreference, snapshot],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
