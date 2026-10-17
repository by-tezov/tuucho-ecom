/**
 * The orders module's public contract for hydrating an order's lines.
 *
 * `messaging` needs the items to render an order email, and `infrastructure/`
 * is private to this module. The SQL and the PII decryption stay behind this
 * boundary.
 */
export { attachItems } from '../infrastructure/orderRows.js';
