import { applyFilters } from '../../plugins/application/hooks.js';
import { productHasStockSql } from './availability.js';

/** Catalogue "anything left to buy" predicate. Unit catalogues default to
 * closed until a plugin supplies offer SQL. */
export async function productOfferSql(productType: string, productIdExpr: string): Promise<string> {
  const fallback = productType === 'nail_single' ? 'false' : productHasStockSql(productIdExpr);
  return applyFilters('catalog.offerSql', fallback, { productIdExpr, productType });
}
