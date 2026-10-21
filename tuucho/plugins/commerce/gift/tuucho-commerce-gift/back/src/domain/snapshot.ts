export interface FrozenGiftSnapshot {
  offerId: string;
  giverDisplayName: string;
  receiverName: string;
  /** Giver account / offer email at payment time. */
  giverEmail: string;
  /** Recipient email collected at confirm. Absent on snapshots written before that field existed. */
  receiverEmail: string | null;
  giverComment: string | null;
  maxSets: number | null;
  maxBudget: number | null;
  allowAccessories: boolean;
  maxAccessoryBudget: number | null;
  hideReceiverPrices: boolean;
}

export function frozenGiftSnapshot(input: FrozenGiftSnapshot): FrozenGiftSnapshot {
  return {
    offerId: input.offerId,
    giverDisplayName: input.giverDisplayName,
    receiverName: input.receiverName,
    giverEmail: input.giverEmail,
    receiverEmail: input.receiverEmail,
    giverComment: input.giverComment,
    maxSets: input.maxSets,
    maxBudget: input.maxBudget,
    allowAccessories: input.allowAccessories,
    maxAccessoryBudget: input.maxAccessoryBudget,
    hideReceiverPrices: input.hideReceiverPrices,
  };
}
