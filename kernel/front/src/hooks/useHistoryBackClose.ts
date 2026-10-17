import { useCallback, useEffect, useRef } from 'react';
import { isAuthLegalDetour } from '../state/authConsentDraft';

const STATE_KEY = 'pamOverlayId';

/** Top-most history-backed overlay; only this entry handles platform back. */
type OverlayEntry = {
  id: string;
  close: () => void;
};

const overlayStack: OverlayEntry[] = [];

/**
 * While mounted (and `enabled`), owns one same-URL history entry so the
 * platform back gesture/button dismisses this overlay instead of leaving
 * the current route. Call the returned `requestClose` from every UI close
 * path (button, backdrop, Escape) — it pops that entry; `onClose` runs from
 * the matching `popstate`. Success/confirm paths that unmount the overlay
 * can keep calling `onClose` directly: cleanup reclaims the entry.
 *
 * Nested overlays (lightbox under cart drawer, confirm over a sheet) each
 * push their own entry. Only the top of the stack closes on back. A
 * parent-driven unmount drops the entry in cleanup when it is still on top,
 * without undoing a later route push (e.g. Size guide / Go to cart).
 * History.back during cleanup is deferred so it never nests inside another
 * popstate (flaky on mobile).
 *
 * When `isAuthLegalDetour()` is set (CGU/privacy opened from a consent step),
 * cleanup skips history.back() so reclaim cannot fire `onClose` and wipe the
 * pending signup draft before the visitor returns.
 *
 * Pass `enabled: false` for overlays that stay mounted while closed
 * (mobile nav, Mondial Relay sheet) so they only own a history entry while
 * actually shown. Loading/status splash overlays must not use this hook —
 * they are not user-dismissible.
 */
export function useHistoryBackClose(onClose: () => void, enabled = true): () => void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const ownedRef = useRef(false);
  const idRef = useRef(`pam-${Math.random().toString(36).slice(2, 10)}`);
  const pathWhenOpenedRef = useRef<string | null>(null);
  const idxWhenOpenedRef = useRef<number | null>(null);
  const lengthWhenOpenedRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const id = idRef.current;
    const prev = window.history.state;
    const base: Record<string, unknown> =
      typeof prev === 'object' && prev !== null ? { ...(prev as Record<string, unknown>) } : {};
    // Strict Mode remounts this effect after a cleanup that deferred
    // history.back(). The first mount's push is still on top (same id) —
    // pushing again would leave a duplicate entry, and the deferred back
    // would pop the remount and close the overlay immediately. Re-bind to
    // the existing entry instead.
    const alreadyOurs = base[STATE_KEY] === id;
    if (!alreadyOurs) {
      // React Router tracks stack position via `idx`. Keep that sequence valid
      // so a later in-app navigate() from inside the overlay still computes
      // the correct delta when the platform back fires.
      if (typeof base.idx === 'number') {
        base.idx += 1;
      }
      window.history.pushState({ ...base, [STATE_KEY]: id }, '');
    }
    pathWhenOpenedRef.current = window.location.pathname;
    lengthWhenOpenedRef.current = window.history.length;
    const openedState = window.history.state as Record<string, unknown> | null;
    idxWhenOpenedRef.current = openedState && typeof openedState.idx === 'number' ? openedState.idx : null;
    ownedRef.current = true;

    const entry: OverlayEntry = {
      id,
      close: () => onCloseRef.current(),
    };
    overlayStack.push(entry);

    const onPopState = () => {
      if (!ownedRef.current) return;
      // Another overlay is above us — its handler owns this pop.
      if (overlayStack[overlayStack.length - 1] !== entry) return;
      ownedRef.current = false;
      const idx = overlayStack.indexOf(entry);
      if (idx >= 0) overlayStack.splice(idx, 1);
      onCloseRef.current();
    };

    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      const idx = overlayStack.indexOf(entry);
      if (idx >= 0) overlayStack.splice(idx, 1);
      if (!ownedRef.current) return;
      ownedRef.current = false;
      // CGU/privacy detour: leave the orphan overlay entry; reclaiming with
      // history.back() would run onClose and often wipe the consent draft.
      if (isAuthLegalDetour()) return;
      const state = window.history.state as Record<string, unknown> | null;
      if (state && state[STATE_KEY] === id) {
        // Snapshot at schedule time: a Link click may already be in flight
        // when this deferred reclaim runs. Comparing against live pathname/
        // length/idx alone is not enough if React Router has not committed
        // yet — history.back() would then cancel Galerie and leave the
        // customer on the previous page with a dismissed cart drawer.
        const reclaimPath = window.location.pathname;
        const reclaimLength = window.history.length;
        const reclaimIdx = state && typeof state.idx === 'number' ? state.idx : idxWhenOpenedRef.current;
        // Never history.back() re-entrantly inside another overlay's popstate
        // (Android often swallows the nested navigation — first back "does
        // nothing"). Defer so the lightbox entry under a just-closed drawer
        // is reclaimed on the next task.
        setTimeout(() => {
          // Strict Mode remount: a new stack entry with this same id is
          // already live — don't steal its history entry.
          if (overlayStack.some((e) => e.id === id)) return;
          if (isAuthLegalDetour()) return;
          if (window.location.pathname !== reclaimPath) return;
          if (window.history.length !== reclaimLength) return;
          // A Link inside this overlay may already have pushed a new route
          // (mobile burger → Mon profil). Reclaiming would pop that route
          // and leave the customer on the previous page with the menu gone.
          if (pathWhenOpenedRef.current && window.location.pathname !== pathWhenOpenedRef.current) {
            return;
          }
          const current = window.history.state as Record<string, unknown> | null;
          // A later in-app push (Galerie, Mon profil) sits above this overlay
          // entry. Popping it would undo that route and dismiss just-added
          // cart UI that listens to pathname.
          if (current && typeof current.idx === 'number' && reclaimIdx !== null && current.idx > reclaimIdx) {
            return;
          }
          if (lengthWhenOpenedRef.current !== null && window.history.length > lengthWhenOpenedRef.current) {
            return;
          }
          if (current && current[STATE_KEY] === id) {
            window.history.back();
          }
        }, 0);
      }
    };
  }, [enabled]);

  return useCallback(() => {
    if (ownedRef.current) {
      window.history.back();
      return;
    }
    onCloseRef.current();
  }, []);
}
