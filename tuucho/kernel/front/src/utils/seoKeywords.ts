import type { Lang } from '../assets/i18n/types';

/**
 * Structured-data `keywords` field per language — schema.org's `Thing.keywords`,
 * inherited by OnlineStore/CollectionPage/ContactPage/AboutPage below. Not a
 * ranking signal (Google ignores it, same as the old HTML meta keywords tag)
 * and not what drives search visibility — that's the title/description/H1
 * copy in strings.*.ts's seo/hero/gallery/about/contact sections. This is a
 * low-cost, harmless addition on top of that, not a substitute for it.
 *
 * One real-world-grounded term set per language (see strings.*.ts's seo/hero
 * copy for the same research: French/English/Spanish/Italian/Dutch/
 * Portuguese/Thai handmade nail sellers' own titles and product copy).
 */
export const SEO_KEYWORDS: Record<Lang, string[]> = {
  fr: [
    'objets faits main',
    'pieces artisanales',
    'atelier',
    'ceramique',
    'decoration',
    'fait main France',
  ],
  en: [
    'handmade objects',
    'studio pieces',
    'atelier',
    'ceramics',
    'home decor',
    'handmade France',
  ],
};

export function seoKeywords(lang: Lang): string {
  return SEO_KEYWORDS[lang].join(', ');
}
