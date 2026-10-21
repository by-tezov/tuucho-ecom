/**
 * App-wide screen-reader announcements (RGAA 7.5). Two visually hidden live
 * regions, polite (`status`) and assertive (`alert`), live directly under
 * `<body>`, outside the React tree: a message is spoken even when the
 * component raising it unmounts in the same tick (a dialog closing on
 * success), and no region is ever mounted already filled, which most screen
 * readers ignore. main.tsx mounts them empty at startup.
 */
export type Politeness = 'polite' | 'assertive';

const regions = new Map<Politeness, HTMLElement>();
let pendingFrame = 0;

function region(politeness: Politeness): HTMLElement {
  let element = regions.get(politeness);
  if (!element?.isConnected) {
    element = document.createElement('div');
    element.className = 'visuallyHidden';
    element.setAttribute('role', politeness === 'assertive' ? 'alert' : 'status');
    element.setAttribute('aria-live', politeness);
    element.setAttribute('aria-atomic', 'true');
    document.body.append(element);
    regions.set(politeness, element);
  }
  return element;
}

/** Puts both regions in the page before anything is announced. */
export function mountLiveRegions(): void {
  region('polite');
  region('assertive');
}

/** `assertive` is for errors and warnings, `polite` for results and status. */
export function announce(message: string, politeness: Politeness = 'polite'): void {
  const text = message.trim();
  if (!text || typeof document === 'undefined') return;
  const target = region(politeness);
  region(politeness === 'assertive' ? 'polite' : 'assertive').textContent = '';
  // Clear, then set on the next frame: an identical message still fires.
  target.textContent = '';
  window.cancelAnimationFrame(pendingFrame);
  pendingFrame = window.requestAnimationFrame(() => {
    target.textContent = text;
  });
}
