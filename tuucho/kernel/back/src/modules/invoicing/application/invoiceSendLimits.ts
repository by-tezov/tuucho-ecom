/** Invoicing's public contract for the per-customer action audit log. The
 * table and its columns stay private to this module. */
export { recordInvoiceAction } from '../infrastructure/invoiceSends.js';
export type { InvoiceSendChannel } from '../infrastructure/invoiceSends.js';
