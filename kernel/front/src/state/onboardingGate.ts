/**
 * Shop onboarding (post-splash slides). Guest completion lives in
 * localStorage; signed-in accounts also store `onboarding.v1` on the
 * server. Replay is a client-only force-show that does not clear the
 * account flag.
 *
 * Shared gallery deep links (`/gallery?product=<uid>`) defer the tour so
 * the opened product stays visible; leaving that gallery visit re-enables
 * auto-open when the visitor has not completed onboarding yet.
 */

import { useSyncExternalStore } from 'react';
import { stripLangPrefix } from '../config/i18nRoutes';

export const ONBOARDING_STORAGE_KEY = 'psn-onboarding-v1';
export const ONBOARDING_STORAGE_COMPLETED = 'completed';

const listeners = new Set<() => void>();
let replayRequested = false;
/** True after landing via `?product=` until the visitor leaves that gallery. */
let shareProductDeferActive = false;

function publish(): void {
  for (const listener of listeners) listener();
}

export function isLocalOnboardingCompleted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === ONBOARDING_STORAGE_COMPLETED;
  } catch {
    return false;
  }
}

export function markLocalOnboardingCompleted(): void {
  try {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, ONBOARDING_STORAGE_COMPLETED);
  } catch {
    // Private mode / quota — in-memory + account write still cover this session.
  }
  publish();
}

export function requestOnboardingReplay(): void {
  replayRequested = true;
  publish();
}

export function consumeOnboardingReplay(): boolean {
  if (!replayRequested) return false;
  replayRequested = false;
  publish();
  return true;
}

export function isOnboardingReplayRequested(): boolean {
  return replayRequested;
}

/** Mark this tab as mid share-product landing (lightbox wins over the tour). */
export function noteProductShareLanding(): void {
  if (shareProductDeferActive) return;
  shareProductDeferActive = true;
  publish();
}

/**
 * Keep deferral while the visitor stays on gallery after a `?product=` land;
 * clear it as soon as they navigate elsewhere so the tour can open.
 */
export function syncProductShareOnboardingDeferral(pathname: string, search: string): void {
  const hasProduct = new URLSearchParams(search).has('product');
  const { rest } = stripLangPrefix(pathname);
  const onGallery = rest === '/gallery' || rest.startsWith('/gallery/');

  if (hasProduct) {
    noteProductShareLanding();
    return;
  }
  if (shareProductDeferActive && !onGallery) {
    shareProductDeferActive = false;
    publish();
  }
}

export function isOnboardingDeferredForProductShare(): boolean {
  return shareProductDeferActive;
}

export function subscribeOnboardingGate(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getReplaySnapshot(): boolean {
  return replayRequested;
}

function getShareDeferSnapshot(): boolean {
  return shareProductDeferActive;
}

/** True while a forced replay is pending (Account “Revoir la présentation”). */
export function useOnboardingReplayRequested(): boolean {
  return useSyncExternalStore(subscribeOnboardingGate, getReplaySnapshot, () => false);
}

/** True while a shared `?product=` visit should keep the tour closed. */
export function useOnboardingDeferredForProductShare(): boolean {
  return useSyncExternalStore(subscribeOnboardingGate, getShareDeferSnapshot, () => false);
}
