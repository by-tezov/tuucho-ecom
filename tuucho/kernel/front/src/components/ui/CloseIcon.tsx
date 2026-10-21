export interface CloseIconProps {
  /** Visual size in CSS pixels; the icon stays decorative. */
  size?: number;
  className?: string;
}

/** Canonical close/remove glyph. The owning button supplies the accessible label. */
export function CloseIcon({ size = 16, className }: CloseIconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 2L14 14M14 2L2 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
