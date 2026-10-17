interface GiftIconProps {
  size?: number;
}

/** Gift-box glyph — optical center in a 16×16 box (matches CartControl stroke). */
export function GiftIcon({ size = 18 }: GiftIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.4" y="6.6" width="11.2" height="7.2" rx="1.15" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2.4 8.3h11.2M8 6.6v7.2" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M8 6.7c-1.55-2.35-3.7-2.2-3.7-.85 0 1.05 1.85 1.15 3.7.85 1.85.3 3.7.2 3.7-.85 0-1.35-2.15-1.5-3.7.85Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
