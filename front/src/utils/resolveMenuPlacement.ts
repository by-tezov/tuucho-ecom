/** Prefer the side of the trigger with more viewport room. */
export function resolveMenuPlacement(
  preferred: 'above' | 'below' | 'auto',
  rect: Pick<DOMRect, 'top' | 'bottom'>,
  viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0,
): 'above' | 'below' {
  if (preferred !== 'auto') return preferred;
  const spaceAbove = rect.top;
  const spaceBelow = viewportHeight - rect.bottom;
  return spaceAbove >= spaceBelow ? 'above' : 'below';
}
