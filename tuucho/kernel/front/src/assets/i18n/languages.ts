import type { Lang } from './types';

/** Display order for the language switcher. */
export const LANGUAGE_ORDER: Lang[] = ['en', 'fr'];

/** Each language's own name, in its own script. */
export const LANGUAGE_NAMES: Record<Lang, string> = {
  en: 'English',
  fr: 'Français',
};

/** Accessible label for the switcher group itself, in the currently active language. */
export const LANGUAGE_SWITCHER_LABEL: Record<Lang, string> = {
  en: 'Change language',
  fr: 'Changer de langue',
};
