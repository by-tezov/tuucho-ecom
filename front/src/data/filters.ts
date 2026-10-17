import type { FilterCategory, Trilingual } from './types';

// occasion and shape are free-form text (see
// src/data/filterOptions.ts, which derives each filter's selectable values
// dynamically from whatever pamsurin-back's API actually returns — never
// hardcoded here, so a new tag just needs to exist on a gallery set to
// appear as a filter option automatically). pamsurin-manager's
// prepare-library.mjs (see that repo) is what constrains these fields to a
// curated, properly-cased list of French phrases when it's the one writing
// them — that's what keeps e.g. "Automne" and "automne" from becoming two
// different filter values, without the site itself needing a hardcoded list
// to stay in sync with.

/** Label for the "all" option per category. French grammatical gender
 * differs by category — "Toutes" vs "Tous" — so it can't be a single
 * hardcoded string shared across categories. */
export const filterAllLabel: Record<FilterCategory, Trilingual> = {
  occasion: { fr: 'Toutes', en: 'All', th: 'ทั้งหมด', es: 'Todas', it: 'Tutte', nl: 'Alle', pt: 'Todas' },
  shape: { fr: 'Toutes', en: 'All', th: 'ทั้งหมด', es: 'Todas', it: 'Tutte', nl: 'Alle', pt: 'Todas' },
  length: { fr: 'Toutes', en: 'All', th: 'ทั้งหมด', es: 'Todas', it: 'Tutte', nl: 'Alle', pt: 'Todas' },
  size: { fr: 'Toutes', en: 'All', th: 'ทั้งหมด', es: 'Todas', it: 'Tutte', nl: 'Alle', pt: 'Todas' },
};

export const filterGroupLabels: Record<FilterCategory, Trilingual> = {
  occasion: {
    fr: 'Occasion',
    en: 'Occasion',
    th: 'โอกาส',
    es: 'Ocasión',
    it: 'Occasione',
    nl: 'Gelegenheid',
    pt: 'Ocasião',
  },
  shape: { fr: 'Forme', en: 'Shape', th: 'ทรง', es: 'Forma', it: 'Forma', nl: 'Vorm', pt: 'Forma' },
  length: {
    fr: 'Longueur',
    en: 'Length',
    th: 'ความยาว',
    es: 'Longitud',
    it: 'Lunghezza',
    nl: 'Lengte',
    pt: 'Comprimento',
  },
  size: { fr: 'Taille', en: 'Size', th: 'ไซซ์', es: 'Talla', it: 'Taglia', nl: 'Maat', pt: 'Tamanho' },
};
