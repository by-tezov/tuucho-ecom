/** Shapes only — the seven language records live in emailStrings.ts. */

/** One entry per email "context" (order confirmation, order shipped) per
 * language — every key is required for every language (no en/fr fallback
 * like the catalog's `localize`): this is a small, fixed, hand-authored set,
 * so a missing translation should be a compile error, not a silent fallback
 * inside a customer-facing purchase email. The contact-form notification
 * deliberately isn't part of this: it's only ever read by the site owner, so
 * its subject stays a fixed French literal in email.service.ts rather than
 * carrying six unused translations. */
export interface OrderConfirmationStrings {
  subject: (orderNumber: string) => string;
  title: string;
  /** Deliberately doesn't take the order number — it's already shown once,
   * prominently, right below this intro (see orderConfirmationCustomer.hbs
   * /orderConfirmationSpy.hbs); repeating it here read as a duplicate. */
  intro: string;
  itemsHeading: string;
  subtotalLabel: string;
  shippingLabel: string;
  totalLabel: string;
  expressSuffix: string;
  rulesDiscountLabel: string;
  freeShippingLabel: string;
  giftFreeLabel: string;
  addressHeading: string;
  billingAddressHeading: string;
  invoiceNotice: string;
  /** Guest-order counterpart of invoiceNotice — invoiceNotice promises the
   * customer will be emailed once a PDF invoice is ready, but that PDF is
   * only ever generated/emailed on demand from an authenticated account
   * (see ensureInvoice's call sites in account.routes.ts), which a guest
   * order can never reach. Tells the guest this confirmation email itself
   * is their invoice instead of promising a follow-up that won't come. */
  guestInvoiceNotice: string;
  loginSuggestion: string;
  loginLinkLabel: string;
  /** Guest-order counterpart of loginSuggestion/loginLinkLabel — a still-
   * unlinked guest has no account to log into, so the CTA is a 24h
   * manage-order token rather than /orders or /register. */
  guestAccountSuggestion: string;
  guestAccountLinkLabel: string;
  /** Lead-in text for the HMAC integrity fingerprint shown under the "log
   * into the website" paragraph — see orders.service.ts's
   * computeOrderContentHash. The token itself is appended after this label,
   * not translated (it's a fixed hex string). */
  integrityLabel: string;
  /** Discount row label when loyalty credit was applied at checkout. */
  loyaltyCreditLabel: string;
  /** Totals row label for frozen earn amount on the order snapshot. */
  loyaltyEarnLabel: string;
  /** Shown when the order will earn wallet credit after reception is confirmed. */
  loyaltyEarnNotice: (amount: string) => string;
  /** Guest confirmation: earn only usable after an account is created/signed in
   * with the same email and the order is linked. */
  loyaltyEarnNoticeGuest: (amount: string) => string;
  footer: string;
}

export interface OrderShippedStrings {
  subject: (orderNumber: string) => string;
  title: string;
  /** Same reasoning as OrderConfirmationStrings.intro — no orderNumber. */
  intro: string;
  itemsHeading: string;
  totalLabel: string;
  addressHeading: string;
  billingAddressHeading: string;
  /** The closing button to the shop, for an account holder. */
  siteLinkLabel: string;
  footer: string;
}

export interface OrderCancelledStrings {
  subject: (orderNumber: string) => string;
  title: string;
  intro: string;
  body: string;
  loginLinkLabel: string;
  footer: string;
}

export interface OrderUpdatedStrings {
  subject: (orderNumber: string) => string;
  title: string;
  intro: string;
  /** Replaces the invoice note in the detailed recap template. */
  notice: string;
}

/** Section-header labels above the nail set / accessory / gift blocks of an
 * order's item table — shared by every email that renders that table
 * (confirmation, shipped, updated; their spy/internal copies always use
 * `fr` regardless of the customer's own language). No singular/plural
 * split here (unlike the front-end's own equivalent) — an order's item
 * table routinely lists several lines per section, so a single category
 * label reads fine either way. */
export interface OrderItemGroupLabels {
  nail: string;
  composition: string;
  accessory: string;
  gift: string;
}

export interface LoyaltyExpiryReminderStrings {
  subject: (expiresAt: string) => string;
  title: string;
  body: (atRisk: string, expiresAt: string) => string;
  ctaLabel: string;
  footer: string;
}

export interface EmailStrings {
  orderConfirmation: OrderConfirmationStrings;
  orderShipped: OrderShippedStrings;
  orderCancelled: OrderCancelledStrings;
  orderUpdated: OrderUpdatedStrings;
  loyaltyExpiryReminder: LoyaltyExpiryReminderStrings;
  itemGroupLabels: OrderItemGroupLabels;
}
