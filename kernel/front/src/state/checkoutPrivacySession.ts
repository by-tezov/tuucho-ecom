import { startCheckoutPrivacySession, touchCheckoutPrivacySession as touchSessionApi } from '../api/checkout';
import {
  clearCheckoutEphemeralPlain,
  lockCheckoutVault,
  unlockCheckoutVaultWithServerKey,
} from './checkoutEphemeralVault';
import {
  clearGuestCards,
  lockGuestCheckoutVault,
  unlockGuestCheckoutVaultWithServerKey,
} from './guestCardVault';
import {
  CHECKOUT_PRIVACY_SESSION_AUDIENCE_CHANGED_EVENT,
  CHECKOUT_PRIVACY_SESSION_REJECTED_EVENT,
  clearCheckoutPrivacyToken,
  getCheckoutPrivacyToken,
  setCheckoutPrivacyToken,
} from '../api/session/checkoutPrivacyToken';
import { clearGuestCheckoutDraft } from './guestCheckoutDraft';
import { clearAuthConsentDraft } from './authConsentDraft';

export const CHECKOUT_SESSION_EXPIRED_NOTICE_KEY = 'psn-checkout-session-expired-notice-v1';
// The idle TTL in minutes at the moment the notice fired — CHECKOUT_PRIVACY_
// SESSION_IDLE_TTL is configurable per env, so the modal must not hardcode
// "30 minutes"; this snapshot survives the reload that shows the notice.
export const CHECKOUT_SESSION_EXPIRED_NOTICE_MINUTES_KEY = 'psn-checkout-session-expired-notice-minutes-v1';
const DUPLICATE_PROBE_MS = 100;
const TOUCH_THROTTLE_MS = 10_000;
/** RGAA 13.1: a guest is warned this long before the idle expiry wipes what
 * they typed for checkout, with one action to keep going (any activity also
 * counts). Well over the 20 seconds the criterion asks for. */
const WARNING_LEAD_MS = 2 * 60 * 1000;
export const CHECKOUT_SESSION_WARNING_LEAD_MINUTES = WARNING_LEAD_MS / 60_000;

let accessToken: string | undefined;
let idleTimeoutMs = 30 * 60 * 1000;
let expiresAtMs = 0;
let expiryTimer: number | undefined;
let warningTimer: number | undefined;
let warningActive = false;
const warningListeners = new Set<() => void>();
let lastServerTouchAt = 0;
let initialization: Promise<void> | null = null;
let recovery: Promise<void> | null = null;
let channel: BroadcastChannel | null = null;
let channelResponderInstalled = false;
let rejectionListenerInstalled = false;
const instanceId = typeof crypto !== 'undefined' ? crypto.randomUUID() : String(Math.random());

function setWarning(next: boolean): void {
  if (warningActive === next) return;
  warningActive = next;
  for (const listener of warningListeners) listener();
}

function clearTimer(): void {
  if (expiryTimer !== undefined) window.clearTimeout(expiryTimer);
  expiryTimer = undefined;
  if (warningTimer !== undefined) window.clearTimeout(warningTimer);
  warningTimer = undefined;
}

function scheduleExpiry(): void {
  clearTimer();
  // Any (re)schedule follows activity or a fresh session: no warning pending.
  setWarning(false);
  if (!expiresAtMs || typeof window === 'undefined') return;
  const remaining = expiresAtMs - Date.now();
  expiryTimer = window.setTimeout(() => void expireAndRestart(), Math.max(0, remaining));
  warningTimer = window.setTimeout(
    () => {
      // Same audience as the expiry notice: a guest about to lose typed data.
      if (!accessToken && hasSensitiveCiphertext()) setWarning(true);
    },
    Math.max(0, remaining - WARNING_LEAD_MS),
  );
}

/** Live "the idle expiry is close" flag for Layout's warning dialog. */
export function subscribeCheckoutSessionWarning(listener: () => void): () => void {
  warningListeners.add(listener);
  return () => {
    warningListeners.delete(listener);
  };
}

export function isCheckoutSessionWarningActive(): boolean {
  return warningActive;
}

function hasSensitiveCiphertext(): boolean {
  return (
    window.sessionStorage.getItem('psn-guest-card-vault-v1') !== null ||
    window.sessionStorage.getItem('psn-checkout-ephemeral-vault-v1') !== null ||
    window.sessionStorage.getItem('psn-checkout-guest-draft') !== null ||
    window.sessionStorage.getItem('psn-auth-consent-draft-v1') !== null ||
    window.sessionStorage.getItem('pamsurin.authConsentDraft') !== null
  );
}

async function expireAndRestart(): Promise<void> {
  if (recovery) return recovery;
  recovery = (async () => {
    const notifyGuest = !accessToken && hasSensitiveCiphertext();
    clearCheckoutPrivacyToken();
    lockCheckoutVault();
    clearCheckoutEphemeralPlain();
    clearGuestCards();
    lockGuestCheckoutVault();
    clearGuestCheckoutDraft();
    clearAuthConsentDraft({ force: true });
    if (notifyGuest) {
      window.sessionStorage.setItem(CHECKOUT_SESSION_EXPIRED_NOTICE_KEY, '1');
      window.sessionStorage.setItem(
        CHECKOUT_SESSION_EXPIRED_NOTICE_MINUTES_KEY,
        String(Math.round(idleTimeoutMs / 60_000)),
      );
    }
    initialization = null;
    try {
      await initializeCheckoutPrivacySession(accessToken);
    } catch {
      // Sensitive state is already gone. A reload gives normal bootstrap one
      // clean retry without leaving the mounted cart on stale plaintext.
    }
    // Rebuild the already-mounted cart from the now-empty sensitive stores.
    window.location.reload();
  })();
  try {
    await recovery;
  } finally {
    recovery = null;
  }
}

/** Same cleanup as a real expiry, minus the "expired after 30 minutes"
 * notice and page reload: the token was rejected because the tab's audience
 * changed (login/logout boundary) or it never had one, not because the
 * shopper was idle. */
function resetAudienceSilently(): void {
  if (recovery) return;
  const currentAccessToken = accessToken;
  resetCheckoutPrivacySession();
  void initializeCheckoutPrivacySession(currentAccessToken);
}

function installRejectionListener(): void {
  if (rejectionListenerInstalled || typeof window === 'undefined') return;
  rejectionListenerInstalled = true;
  window.addEventListener(CHECKOUT_PRIVACY_SESSION_REJECTED_EVENT, () => void expireAndRestart());
  window.addEventListener(CHECKOUT_PRIVACY_SESSION_AUDIENCE_CHANGED_EVENT, resetAudienceSilently);
}

async function tokenWasCopiedFromLiveTab(token: string): Promise<boolean> {
  if (typeof BroadcastChannel === 'undefined') return false;
  channel ??= new BroadcastChannel('psn-checkout-privacy-session-v1');
  if (!channelResponderInstalled) {
    channelResponderInstalled = true;
    channel.addEventListener(
      'message',
      (event: MessageEvent<{ type?: string; token?: string; instanceId?: string }>) => {
        const message = event.data;
        if (
          message.type === 'probe' &&
          message.token === getCheckoutPrivacyToken() &&
          message.instanceId !== instanceId
        ) {
          channel?.postMessage({ type: 'present', token: message.token, instanceId });
        }
      },
    );
  }
  let duplicated = false;
  const listener = (event: MessageEvent<{ type?: string; token?: string; instanceId?: string }>) => {
    const message = event.data;
    if (message.type === 'present' && message.token === token && message.instanceId !== instanceId) {
      duplicated = true;
    }
  };
  channel.addEventListener('message', listener);
  channel.postMessage({ type: 'probe', token, instanceId });
  await new Promise<void>((resolve) => window.setTimeout(resolve, DUPLICATE_PROBE_MS));
  channel.removeEventListener('message', listener);
  return duplicated;
}

export function initializeCheckoutPrivacySession(nextAccessToken?: string): Promise<void> {
  installRejectionListener();
  accessToken = nextAccessToken;
  if (initialization) return initialization;
  initialization = (async () => {
    const hadSensitiveCiphertext = hasSensitiveCiphertext();
    const existing = getCheckoutPrivacyToken();
    if (existing && (await tokenWasCopiedFromLiveTab(existing))) {
      clearCheckoutPrivacyToken();
      clearGuestCards();
      lockGuestCheckoutVault();
      lockCheckoutVault();
      clearGuestCheckoutDraft();
      clearAuthConsentDraft({ force: true });
    }
    const result = await startCheckoutPrivacySession(accessToken);
    setCheckoutPrivacyToken(result.token);
    idleTimeoutMs = result.idleTimeoutMs;
    expiresAtMs = new Date(result.expiresAt).getTime();
    await Promise.all([
      unlockCheckoutVaultWithServerKey(result.vaultKey),
      unlockGuestCheckoutVaultWithServerKey(result.vaultKey),
    ]);
    if (result.expired) {
      clearCheckoutEphemeralPlain();
      clearGuestCards();
      clearGuestCheckoutDraft();
      clearAuthConsentDraft({ force: true });
    }
    lastServerTouchAt = Date.now();
    scheduleExpiry();
    if (result.expired && !accessToken && hadSensitiveCiphertext) {
      window.sessionStorage.setItem(CHECKOUT_SESSION_EXPIRED_NOTICE_KEY, '1');
      window.sessionStorage.setItem(
        CHECKOUT_SESSION_EXPIRED_NOTICE_MINUTES_KEY,
        String(Math.round(idleTimeoutMs / 60_000)),
      );
      window.location.reload();
    }
  })().catch((error) => {
    initialization = null;
    throw error;
  });
  return initialization;
}

/** Real user activity extends the local deadline immediately and sends a
 * throttled authoritative heartbeat to the API. */
export function touchCheckoutPrivacySession(): void {
  if (!getCheckoutPrivacyToken()) return;
  expiresAtMs = Date.now() + idleTimeoutMs;
  scheduleExpiry();
  if (Date.now() - lastServerTouchAt < TOUCH_THROTTLE_MS) return;
  lastServerTouchAt = Date.now();
  // A rejection here (expired or audience-changed) is already handled by
  // api/client.ts's interceptor dispatching to installRejectionListener
  // above — nothing case-specific to do with the error locally.
  void touchSessionApi(accessToken)
    .then((result) => {
      expiresAtMs = new Date(result.expiresAt).getTime();
      scheduleExpiry();
    })
    .catch(() => undefined);
}

export function resetCheckoutPrivacySession(): void {
  clearTimer();
  setWarning(false);
  clearCheckoutPrivacyToken();
  lockCheckoutVault();
  clearCheckoutEphemeralPlain();
  clearGuestCards();
  lockGuestCheckoutVault();
  clearGuestCheckoutDraft();
  clearAuthConsentDraft({ force: true });
  initialization = null;
  recovery = null;
  expiresAtMs = 0;
}
