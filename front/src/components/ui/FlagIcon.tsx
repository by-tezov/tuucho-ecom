import type { Lang } from '../../assets/i18n';

interface FlagIconProps {
  lang: Lang;
  className?: string;
}

/** Small flat flag icon (FR / UK / Thailand) — plain SVG so it renders identically across platforms, unlike emoji flags which some OS fonts render as bare letter codes. */
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

  if (lang === 'th') {
    return (
      <svg className={className} width="16" height="12" viewBox="0 0 60 40" aria-hidden="true">
        <rect width="60" height="40" fill="#f4f5f8" />
        <rect y="6.67" width="60" height="6.67" fill="#f4f5f8" />
        <rect y="13.33" width="60" height="13.33" fill="#2d2a4a" />
        <rect y="0" width="60" height="6.67" fill="#a51931" />
        <rect y="33.33" width="60" height="6.67" fill="#a51931" />
      </svg>
    );
  }

  if (lang === 'es') {
    return (
      <svg className={className} width="16" height="12" viewBox="0 0 60 40" aria-hidden="true">
        <rect width="60" height="40" fill="#aa151b" />
        <rect y="10" width="60" height="20" fill="#f1bf00" />
      </svg>
    );
  }

  if (lang === 'it') {
    return (
      <svg className={className} width="16" height="12" viewBox="0 0 60 40" aria-hidden="true">
        <rect width="20" height="40" fill="#009246" />
        <rect x="20" width="20" height="40" fill="#fff" />
        <rect x="40" width="20" height="40" fill="#ce2b37" />
      </svg>
    );
  }

  if (lang === 'nl') {
    return (
      <svg className={className} width="16" height="12" viewBox="0 0 60 40" aria-hidden="true">
        <rect width="60" height="40" fill="#21468b" />
        <rect width="60" height="26.67" fill="#fff" />
        <rect width="60" height="13.33" fill="#ae1c28" />
      </svg>
    );
  }

  if (lang === 'pt') {
    return (
      <svg className={className} width="16" height="12" viewBox="0 0 60 40" aria-hidden="true">
        <rect width="60" height="40" fill="#da291c" />
        <rect width="24" height="40" fill="#046a38" />
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
