import { fireEvent } from '@testing-library/react';

const MOBILE_MQ = '(max-width: 1023px)';
const DESKTOP_MQ = '(min-width: 1024px)';

/**
 * Pointer press the way a visitor produces one: enter → down → up → click.
 * Calling the React `onClick` prop (or setting picker state) would not
 * exercise the effects that run after a real open, which is how the
 * quantity list used to vanish immediately.
 *
 * When the element has a real layout box, refuse to click through a covering
 * node (jsdom usually has no layout, so this guard is a no-op there —
 * Patchright `clickUnobscured` is what proves a shopper could hit the control).
 */
export function pressLikeUser(element: HTMLElement, pointerType: 'mouse' | 'touch' = 'mouse'): void {
  const rect = element.getBoundingClientRect();
  if (rect.width >= 8 && rect.height >= 8) {
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const topmost = document.elementFromPoint(x, y);
    if (topmost && topmost !== element && !element.contains(topmost)) {
      throw new Error(
        `Cannot press like a user: the pointer at (${Math.round(x)}, ${Math.round(y)}) hits a covering node instead of the control.`,
      );
    }
  }
  const pointer = { pointerId: 1, pointerType, isPrimary: true as const, button: 0 };
  fireEvent.pointerEnter(element, pointer);
  fireEvent.pointerDown(element, pointer);
  if (pointerType === 'mouse') fireEvent.mouseDown(element, { button: 0 });
  fireEvent.pointerUp(element, pointer);
  if (pointerType === 'mouse') fireEvent.mouseUp(element, { button: 0 });
  fireEvent.click(element, { button: 0 });
}

export function stubViewport(kind: 'mobile' | 'desktop'): void {
  const mobile = kind === 'mobile';
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string): MediaQueryList => ({
      matches: query.includes(MOBILE_MQ) ? mobile : query.includes(DESKTOP_MQ) ? !mobile : false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

/** JSDOM has no layout box; production focus trapping ignores zero-size nodes. */
export function stubFocusableLayout(): void {
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get: () => 1,
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get: () => 1,
  });
  Object.defineProperty(HTMLElement.prototype, 'getClientRects', {
    configurable: true,
    value: () => [new DOMRect(0, 0, 1, 1)],
  });
}
