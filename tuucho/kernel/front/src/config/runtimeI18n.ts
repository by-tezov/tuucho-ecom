import type { Lang } from '../assets/i18n/types';

/** Runtime default language, set by `applyStorefrontBootstrap` (config/env.ts)
 * from the bootstrap `i18n.default` once it has been validated against the
 * narrowed enabled set. Before bootstrap arrives (and whenever the configured
 * value is invalid) every reader gets the build-time fallback 'en' — the
 * prerendered shell and the pre-bootstrap paint stay on the constants. */
let appliedDefaultLang: Lang | undefined;

export function runtimeDefaultLang(): Lang {
  return appliedDefaultLang ?? 'en';
}

export function setRuntimeDefaultLang(lang: Lang | undefined): void {
  appliedDefaultLang = lang;
}

/** Bootstrap `i18n.enabled` narrows the build-time `VITE_ENABLED_LANGUAGES`
 * set (intersection, build order kept) so a shop turns languages off without a
 * rebuild. An empty intersection would brick every reader, so it falls back to
 * the build-time set unchanged. */
export function narrowEnabledLanguages(buildEnabled: Lang[], bootstrapEnabled: string[]): Lang[] {
  const narrowed = buildEnabled.filter((lang) => bootstrapEnabled.includes(lang));
  return narrowed.length > 0 ? narrowed : [...buildEnabled];
}

/** The configured default counts only when it survives narrowing; anything
 * else leaves the pre-bootstrap fallback in place. */
export function resolveRuntimeDefaultLang(
  bootstrapDefault: string | undefined,
  enabled: Lang[],
): Lang | undefined {
  return bootstrapDefault && (enabled as string[]).includes(bootstrapDefault)
    ? (bootstrapDefault as Lang)
    : undefined;
}
