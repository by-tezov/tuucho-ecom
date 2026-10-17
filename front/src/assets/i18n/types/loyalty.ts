export interface LoyaltyStrings {
  pageTitle: string;
  pageSubtitle: string;
  walletAvailable: string;
  walletBurnNotice: (amount: string, date: string) => string;
  walletComing: string;
  walletBurned: string;
  walletLedgerTitle: string;
  walletOrdersLink: string;
  ledgerOrder: (orderNumber: string) => string;
  walletLoadError: string;
  walletEmpty: string;
  ledgerEmpty: string;
  ledgerKindEarn: string;
  ledgerKindSpend: string;
  ledgerKindSpendRefund: string;
  ledgerKindExpire: string;
  ledgerKindEarnReversal: string;
  ledgerKindCreditManual: string;
  ledgerKindUncreditManual: string;
  cartCreditLabel: string;
  cartWalletAvailable: (amount: string) => string;
  cartUseWallet: string;
  cartIncompatibleVoucher: string;
  cartEarnBelowPayPrefix: string;
  cartEarnBelowPaySuffix: string;
  /** Order-success callout — amount is rendered separately (same style as cart). */
  successEarnPrefix: string;
  successEarnSuffix: string;
  orderCreditLabel: string;
  orderEarnPendingPrefix: string;
  orderEarnPendingSuffix: string;
  orderEarnGrantedPrefix: string;
  orderEarnGrantedSuffix: string;
}
