/**
 * Generated from the API contract. Do not edit here.
 *
 * Source of truth: kernel/back `src/contract/admin/cronLogs.ts`.
 * Regenerate the front copy with `npm run sync:contract` in kernel/back.
 */

/** Allowlisted cron journal the administration can read. */
export type AdminCronLogKind =
  | 'shipment'
  | 'account-deletion'
  | 'guest-saved-cleanup'
  | 'loyalty'
  | 'gift'
  | 'gift-purge'
  | 'payment-auth-expiry'
  | 'warm';

/** Newest last, as stored in the private jsonl file. */
export interface AdminCronLogTail {
  lines: string[];
}
