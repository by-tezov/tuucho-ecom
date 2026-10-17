import type { Lang } from './types';

/** Display order for the language switcher. */
export const LANGUAGE_ORDER: Lang[] = ['fr', 'en', 'th', 'es', 'it', 'nl', 'pt'];

/** Each language's own name, in its own script — used as each switcher button's accessible label, not translated per active language. */
export const LANGUAGE_NAMES: Record<Lang, string> = {
  fr: 'Français',
  en: 'English',
  th: 'ไทย',
  es: 'Español',
  it: 'Italiano',
  nl: 'Nederlands',
  pt: 'Português',
};

/** Accessible label for the switcher group itself, in the currently active language. */
export const LANGUAGE_SWITCHER_LABEL: Record<Lang, string> = {
  fr: 'Changer de langue',
  en: 'Change language',
  th: 'เปลี่ยนภาษา',
  es: 'Cambiar de idioma',
  it: 'Cambia lingua',
  nl: 'Taal wijzigen',
  pt: 'Mudar de idioma',
};
