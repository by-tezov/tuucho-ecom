import { languageMeta } from '../../assets/i18n/languages';
import type { Lang } from '../../assets/i18n';

interface FlagIconProps {
  lang: Lang;
  className?: string;
}

function FrFlag({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="12" viewBox="0 0 60 40" aria-hidden="true">
      <rect width="60" height="40" fill="#fff" />
      <rect width="20" height="40" fill="#0055a4" />
      <rect x="40" width="20" height="40" fill="#ef4135" />
    </svg>
  );
}

function EnFlag({ className }: { className?: string }) {
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

/** Neutral placeholder when no stock SVG and no `registerLanguage.flagUrl`. */
function UnknownFlag({ lang, className }: { lang: Lang; className?: string }) {
  const label = lang.slice(0, 2).toUpperCase();
  return (
    <svg className={className} width="16" height="12" viewBox="0 0 60 40" aria-hidden="true">
      <rect width="60" height="40" rx="2" fill="#6b6b6b" />
      <text
        x="30"
        y="26"
        textAnchor="middle"
        fill="#fff"
        fontSize="16"
        fontFamily="system-ui, sans-serif"
        fontWeight="600"
      >
        {label}
      </text>
    </svg>
  );
}

/**
 * Switcher flag: optional `flagUrl` from bootstrap / `registerLanguage`, else
 * stock SVG for `fr` and `en`, else a neutral code badge (never silent UK).
 */
export function FlagIcon({ lang, className }: FlagIconProps) {
  const flagUrl = languageMeta(lang).flagUrl?.trim();
  const classProp = className ? { className } : {};
  if (flagUrl) {
    return (
      <img
        {...classProp}
        src={flagUrl}
        alt=""
        width={16}
        height={12}
        decoding="async"
        draggable={false}
      />
    );
  }
  if (lang === 'fr') return <FrFlag {...classProp} />;
  if (lang === 'en') return <EnFlag {...classProp} />;
  return <UnknownFlag lang={lang} {...classProp} />;
}
