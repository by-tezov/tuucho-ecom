/** The shopping-bag glyph every "add to cart" control carries — gallery
 * card, product zoom, compose page. One copy so the three never drift. */
export function CartGlyph({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2 2h1.2l.9 8.1a1.4 1.4 0 0 0 1.4 1.25h6.2a1.4 1.4 0 0 0 1.38-1.16l.82-4.7H4.4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="6.2" cy="13.4" r="1" fill="currentColor" />
      <circle cx="11" cy="13.4" r="1" fill="currentColor" />
    </svg>
  );
}
