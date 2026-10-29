/**
 * Shared vocabulary every other contract file may reference.
 */

/** Locale codes the shop serves. Open string; membership is the language
 * registry (builtins en/fr plus `registerLanguage`). `fr` is the catalog
 * import anchor. */
export type Lang = string;
