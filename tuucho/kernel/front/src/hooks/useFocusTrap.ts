import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function isReachable(element: HTMLElement): boolean {
  if (element.closest('[inert]')) return false;
  return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
}

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isReachable);
}

/** Header × / dismiss controls. They stay in the tab order; they must not
 * receive opening focus. */
function isDismissControl(element: HTMLElement): boolean {
  if (element.hasAttribute('data-modal-close')) return true;
  const testId = element.getAttribute('data-testid') ?? '';
  if (/(^|-)close$/i.test(testId)) return true;
  return /closeButton/i.test(element.className);
}

/** Marks a container that took opening focus itself (see `parkOnShell`). The
 * global stylesheet never draws a ring on it: it is not a control. */
const SHELL_ATTRIBUTE = 'data-focus-shell';

function pickInitialFocus(
  container: HTMLElement | null,
  preferred: HTMLElement | null | undefined,
): HTMLElement | null {
  if (!preferred || isDismissControl(preferred)) return null;
  if (container && !container.contains(preferred)) return null;
  return preferred;
}

/** Opening focus when no field is named: the dialog shell itself, never its
 * first control (that read as a random selection after a tap) and never the
 * close icon. Screen readers then announce the dialog as it opens (RGAA 7.1).
 * Skipped when focus is already inside, so re-enabling a trap mid-dialog does
 * not pull focus off the control the customer is on. */
function parkOnShell(container: HTMLElement | null): void {
  if (!container || container.contains(document.activeElement)) return;
  if (!container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1');
  container.setAttribute(SHELL_ATTRIBUTE, '');
  container.focus({ preventScroll: true });
}

interface UseFocusTrapOptions {
  /** Called when Escape is pressed. Omit to leave Escape to the caller. */
  onEscape?: (() => void) | undefined;
  enabled?: boolean | undefined;
  /** Focus this control when the overlay opens (e.g. a password field).
   * Omit to focus the container itself. The close button is never used. */
  initialFocusRef?: RefObject<HTMLElement | null> | undefined;
  /** Return focus to the opener when this overlay goes away. Nested overlays
   * naturally restore to the focused control in their parent dialog. */
  restoreFocus?: boolean | undefined;
}

/** Every enabled trap. All listen on `document`: stacked, both answered Tab
 * (focus stuck on the front close button) and one Escape closed both. */
const activeTraps = new Set<RefObject<HTMLElement | null>>();

/** True when no other enabled trap is in front of `container`: overlays portal
 * to the end of `<body>` as they open, so the latest in document order wins. */
export function isTopmostTrap(container: HTMLElement | null): boolean {
  if (!container) return false;
  for (const ref of activeTraps) {
    const other = ref.current;
    if (!other || other === container || !other.isConnected) continue;
    if (container.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING) return false;
  }
  return true;
}

/** Keep Tab / Shift+Tab cycling inside `containerRef` while a modal is open,
 * so focus cannot wander into the page behind the overlay. Dismissible
 * overlays must also call `useHistoryBackClose` so the platform back
 * gesture/button closes them instead of leaving the current route. */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  { onEscape, enabled = true, initialFocusRef, restoreFocus = true }: UseFocusTrapOptions = {},
): void {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!enabled) return;
    // Capture before moving focus. Each hook instance owns its own opener,
    // which makes stacked dialogs restore one level at a time.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const container = containerRef.current;
    const preferred = pickInitialFocus(container, initialFocusRef?.current);
    if (preferred) preferred.focus({ preventScroll: true });
    else parkOnShell(container);
    activeTraps.add(containerRef);

    function onKeyDown(event: KeyboardEvent) {
      // Behind another dialog, or already handled (a portaled option list).
      if (event.defaultPrevented || !isTopmostTrap(containerRef.current)) return;
      if (event.key === 'Escape' && onEscapeRef.current) {
        onEscapeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const container = containerRef.current;
      if (!container) return;

      const focusable = getFocusableElements(container);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;

      // The shell itself is not in `focusable`; leaving Tab to the browser
      // there would let Shift+Tab walk out to the page behind.
      if (!active || active === container || !container.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      activeTraps.delete(containerRef);
      if (!restoreFocus || !opener?.isConnected) return;
      // Do not steal focus from a route transition or another overlay that
      // has already taken ownership while this one was unmounting.
      const active = document.activeElement;
      if (active === document.body || (container && container.contains(active))) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [containerRef, enabled, initialFocusRef, restoreFocus]);
}
