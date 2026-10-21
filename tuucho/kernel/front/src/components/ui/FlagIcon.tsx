import type { Lang } from '../../assets/i18n';

interface FlagIconProps {
  lang: Lang;
  className?: string;
}

/** Small flat flag icon (FR / UK) — plain SVG so it renders identically across platforms. */
export function FlagIcon({ lang, className }: FlagIconProps) {
  if (lang === 'fr') {
    return (
      <svg className={className} width="16" height="12" viewBox="0 0 60 40" aria-hidden="true">
        <rect width="60" height="40" fill="#fff" />
        <rect width="20" height="40" fill="#0055a4" />
        <rect x="40" width="20" height="40" fill="#ef4135" />
      </svg>
    );
  }

  return (
    <svg
      className={className}
      width="16"
      height="12"
      viewBox="0 0 60 40"
      overflow="hidden"
      aria-hidden="true"
    >
      <rect width="60" height="40" fill="#00247d" />
      <path d="M0,0 L60,40 M60,0 L0,40" stroke="#fff" strokeWidth="8" />
      <path d="M0,0 L60,40 M60,0 L0,40" stroke="#cf142b" strokeWidth="3" />
      <path d="M30,0 V40 M0,20 H60" stroke="#fff" strokeWidth="13" />
      <path d="M30,0 V40 M0,20 H60" stroke="#cf142b" strokeWidth="8" />
    </svg>
  );
}
