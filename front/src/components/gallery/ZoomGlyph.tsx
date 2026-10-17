/** Magnifier with a plus, on the gallery card's mobile zoom button. Decorative:
 * the button carries the accessible name. */
export function ZoomGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7.8 10.5H13.2M10.5 7.8V13.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M15.3 15.3 20.1 20.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
