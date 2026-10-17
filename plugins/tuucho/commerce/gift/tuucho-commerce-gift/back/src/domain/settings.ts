export interface GiftSettings {
  /** Always true. `gift_settings.enabled` stays in the database so a rollback
   * of the previous application still finds new offers allowed. */
  enabled: boolean;
  receiverTokenTtlDays: number;
  /** Ceiling for the giver's offer-extension button, in days from now. */
  extendCeilingDays: number;
  lockSessionTtlHours: number;
  stockHoldTtlDays: number;
  giverPayTtlDays: number;
  visibilityAfterTerminalDays: number;
  /** Smallest sets budget an offer may carry (`GIFT_MIN_BUDGET`). */
  minBudget: number;
  maxBudgetCeiling: number;
  maxAccessoryBudgetCeiling: number;
  maxOpenPromisesPerGiver: number;
  /** Wrong PIN tries before exponential wait starts (`GIFT_PIN_FAILURES`'s first half). */
  pinFreeFailures: number;
  /** Absolute wrong-PIN cap; further tries return `gift_pin_locked`
   * (`GIFT_PIN_FAILURES`'s second half). */
  pinMaxFailures: number;
  /** Days after `created_at` before the gift-purge cron hard-deletes a
   * non-converted (`cancelled` / `expired`) offer and its PII. CNIL's usual
   * benchmark for prospect/contact data never resulting in a sale is 13
   * months (`GIFT_PURGE_AFTER_DAYS`). */
  purgeAfterDays: number;
}

/** Every number in `GiftSettings` comes from the `GIFT_*` environment and is
 * required there, so there is deliberately no default for any of them here:
 * a second copy of those values would be read by nobody and would drift. */
