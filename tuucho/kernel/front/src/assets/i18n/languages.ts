import type { Lang } from './types';

/** Display order for the language switcher. */
export const LANGUAGE_ORDER: Lang[] = ['en', 'fr'];

/** Each language's own name, in its own script. Stays in the kernel so the
 * switcher can show every option at once; sentence copy lives in locale packs. */
export const LANGUAGE_NAMES: Record<Lang, string> = {
  en: 'English',
  fr: 'Français',
};
