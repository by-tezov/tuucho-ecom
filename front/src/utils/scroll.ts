export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Jump the window without a smooth animation. Forces a reflow after
 * disabling CSS `scroll-behavior` — iOS otherwise keeps the previous
 * smooth timing for a `scrollTo` in the same turn. */
export function scrollWindowInstant(top: number): void {
  const html = document.documentElement;
  const previous = html.style.scrollBehavior;
  html.style.scrollBehavior = 'auto';
  void html.offsetHeight;
  window.scrollTo(0, Math.max(0, top));
  html.style.scrollBehavior = previous;
}

/** Smooth-scrolls to a section by id, offset for the sticky header. Respects prefers-reduced-motion. */
export function scrollToId(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  const headerOffset = 72;
  const y = el.getBoundingClientRect().top + window.scrollY - headerOffset;
  window.scrollTo({
    top: y < 0 ? 0 : y,
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
  });
}
