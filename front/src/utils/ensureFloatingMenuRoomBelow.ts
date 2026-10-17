const DESKTOP_MQ = '(min-width: 1024px)';

function findScrollParent(start: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = start.parentElement;
  while (el && el !== document.documentElement) {
    const { overflowY } = getComputedStyle(el);
    if (
      (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
      el.scrollHeight > el.clientHeight + 1
    ) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

/**
 * Desktop only: when a floating menu opens below its trigger and would
 * spill past the scrollport (or the viewport), scroll that port so the
 * trigger moves up and the menu fits underneath. Instant scroll so a
 * portaled menu that tracks scroll can reposition in the same frame.
 */
export function ensureFloatingMenuRoomBelow(
  anchor: HTMLElement,
  menu: HTMLElement,
  options?: { gap?: number; padding?: number },
): void {
  if (typeof window === 'undefined') return;
  if (!window.matchMedia(DESKTOP_MQ).matches) return;

  const gap = options?.gap ?? 6;
  const padding = options?.padding ?? 12;
  const menuHeight = menu.getBoundingClientRect().height;
  if (menuHeight <= 0) return;

  const scrollParent = findScrollParent(anchor);
  const limitBottom = scrollParent ? scrollParent.getBoundingClientRect().bottom : window.innerHeight;
  const overflow = anchor.getBoundingClientRect().bottom + gap + menuHeight + padding - limitBottom;
  if (overflow <= 1) return;

  if (scrollParent) {
    scrollParent.scrollTop += overflow;
  } else {
    window.scrollBy(0, overflow);
  }
}

/**
 * How many CSS pixels the menu lacks above the trigger (0 if it already
 * fits under the top inset). Used on mobile zoom when the list opens upward.
 */
export function measureFloatingMenuOverflowAbove(
  anchor: HTMLElement,
  menu: HTMLElement,
  options?: { gap?: number; padding?: number },
): number {
  const gap = options?.gap ?? 6;
  const padding = options?.padding ?? 12;
  const menuHeight = menu.getBoundingClientRect().height;
  if (menuHeight <= 0) return 0;
  const overflow = padding + menuHeight + gap - anchor.getBoundingClientRect().top;
  return overflow > 1 ? overflow : 0;
}
