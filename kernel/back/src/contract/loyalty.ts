/**
 * Generated from the API contract. Do not edit here.
 *
 * Source of truth: kernel/back `src/contract/loyalty.ts`.
 * Regenerate the front copy with `npm run sync:contract` in kernel/back.
 */

export interface LoyaltyAdminStats {
  totalOutstanding: number;
  pendingGrant: number;
  atRiskBeforeNextMarch: number;
  usersWithBalance: number;
  minAvailable: number | null;
  averageAvailable: number | null;
  maxAvailable: number | null;
}

export type LoyaltyLedgerKind =
  'earn' | 'spend' | 'spend_refund' | 'expire' | 'earn_reversal' | 'credit_manual' | 'uncredit_manual';

export interface LoyaltyLedgerEntry {
  id: string;
  kind: LoyaltyLedgerKind;
  amount: number;
  reason: string | null;
  orderId: string | null;
  orderNumber: string | null;
  createdAt: string;
}

export interface LoyaltyWalletSummary {
  enabled: boolean;
  earningEnabled: boolean;
  available: number;
  atRisk: number;
  atRiskExpiresAt: string | null;
  burnNoticeAmount: number | null;
  burnNoticeExpiresAt: string | null;
  carried: number;
  coming: number;
  burned: number;
  nextSettlementDate: string | null;
}

export interface LoyaltyCheckoutPreview {
  enabled: boolean;
  earningEnabled?: boolean;
  loyaltyCredit: number;
  loyaltyEarn: number;
  incompatibleWithVoucher: boolean;
  availableBalance?: number;
  atRisk?: number;
  atRiskExpiresAt?: string | null;
  total: number;
}

export type LoyaltyManualOp = {
  id: string;
  kind: 'credit_manual' | 'uncredit_manual';
  amount: number;
  reason: string | null;
  createdAt: string;
  userId: string;
  userEmail: string;
  actorUserId: string | null;
  actorEmail: string | null;
};
