/** The per-set product pages at `/creations/<slug>` — the site's indexable
 * product surface (see routes/ProductPage.tsx). The `seo*` fields and
 * `schemaCategory` are never displayed: they go into the page's title, meta
 * description and schema.org Product, so they are translated alongside the
 * visible labels rather than hard-coded in French.
 *
 * `seoNoun`, `seoNounAlt`, `seoTitleTerm` and `seoDescSuffix` must stay word
 * for word what kernel/back's `catalog/domain/productSeoCopy.ts` holds: the
 * crawlable version of a product page is rendered there, this one replaces it
 * on hydration, and the two describing the same URL differently is the defect
 * that shared copy exists to fix. */
export interface ProductStrings {
  breadcrumbAria: string;
  shapeLabel: string;
  lengthLabel: string;
  occasionLabel: string;
  colorsMainLabel: string;
  colorsSecondaryLabel: string;
  referenceLabel: string;
  inStock: string;
  outOfStock: string;
  poseGuideLink: string;
  /** "what this product is", in the words people search with, injected into
   * the description in place of the shape word alone. Two forms, alternated
   * across the catalogue so every snippet does not open the same way. Lower
   * case: the sentence capitalizes its own first letter. */
  seoNoun: string;
  seoNounAlt: string;
  /** The same term for the `<title>`, where there is no room to alternate. */
  seoTitleTerm: string;
  seoDescSuffix: string;
  /** seoDescSuffix for a single nail's page; word for word kernel/back's
   * NAIL_SEO_COPY closing (catalog/domain/nailSeoCopy.ts). */
  nailSeoDescSuffix: string;
  schemaCategory: string;
}
