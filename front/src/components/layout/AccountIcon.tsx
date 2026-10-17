interface AccountIconProps {
  size?: number;
}

/** Person/profile glyph — optical center in a 16×16 box (matches CartControl stroke). */
export function AccountIcon({ size = 18 }: AccountIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="5.75" r="2.5" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M3.4 13.25c.75-2.15 2.35-3.25 4.6-3.25s3.85 1.1 4.6 3.25"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
