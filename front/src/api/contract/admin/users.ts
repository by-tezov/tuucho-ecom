/**
 * Generated from the API contract. Do not edit here.
 *
 * Source of truth: pamsurin-back `src/contract/admin/users.ts`.
 * Regenerate the front copy with `npm run sync:contract` in pamsurin-back.
 */
import type { OrderStatus } from '../orders';

export type AdminUserStatus = 'active' | 'pending_deletion' | 'deleted' | 'locked';

export type AdminUserLockSource = 'customer' | 'admin' | 'ops';

export interface AdminUserOrderBucket {
  count: number;
  total: number;
}

/** Account card returned by the browser-only `/admin/users` API. The default
 * query returns customers; the staff switch (`role=staff`) returns every other
 * role, administrators included. */
export interface AdminUserSummary {
  id: string;
  /** Summary of `roles`: `super-admin` when held, else the first staff role, else
   * `user` (customer). */
  role: string;
  /** Every staff role the account holds (empty for a customer). */
  roles: { code: string; label: string }[];
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: AdminUserStatus;
  lockedAt: string | null;
  lockReason: string | null;
  lockSource: AdminUserLockSource | null;
  emailVerified: boolean;
  createdAt: string;
  lastConnectedAt: string | null;
  connectionCount: number;
  hasPassword: boolean;
  hasGoogle: boolean;
  googleEmail: string | null;
  hasFacebook: boolean;
  facebookEmail: string | null;
  hasApple: boolean;
  appleEmail: string | null;
  orders: {
    inFlight: AdminUserOrderBucket;
    received: AdminUserOrderBucket;
    cancelled: AdminUserOrderBucket;
  };
  activityCounts: {
    contacts: number;
    chats: number;
    productRequests: number;
    identityHistory: number;
  };
}

export type AdminIdentityEventKind =
  | 'account_created'
  | 'email_changed'
  | 'google_linked'
  | 'google_unlinked'
  | 'facebook_linked'
  | 'facebook_unlinked'
  | 'apple_linked'
  | 'apple_unlinked';

export interface AdminIdentityHistoryEvent {
  kind: AdminIdentityEventKind;
  createdAt: string;
  email: string | null;
  previousEmail: string | null;
  providerSubject: string | null;
  backfilled: boolean;
}

export interface AdminUserOrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  total: number;
  confirmedAt: string;
  adminVerified: boolean;
}
