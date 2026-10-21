export interface NotificationChannelCopy {
  title: string;
  description: string;
  disableConfirmTitle: string;
  disableConfirmMessage: string;
}

export interface NotificationsStrings {
  pageTitle: string;
  emailsSectionTitle: string;
  emailsMasterLabel: string;
  emailsMasterDescription: string;
  primaryEmailLabel: string;
  verifiedBadge: string;
  unverifiedBadge: string;
  unverifiedBanner: string;
  loading: string;
  loadError: string;
  masterDisableConfirmTitle: string;
  masterDisableConfirmMessage: string;
  transactionalSectionTitle: string;
  marketingSectionTitle: string;
  disableConfirmButton: string;
  cancelButton: string;
  orderConfirmation: NotificationChannelCopy;
  orderShipped: NotificationChannelCopy;
  invoice: NotificationChannelCopy;
  security: NotificationChannelCopy;
  chatReply: NotificationChannelCopy;
  loyaltyExpiry: NotificationChannelCopy;
  nouveautes: NotificationChannelCopy;
  cartReminder: NotificationChannelCopy;
  favoriteSold: NotificationChannelCopy;
  favoriteRestock: NotificationChannelCopy;
  promo: NotificationChannelCopy;
}
