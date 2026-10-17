/** Slot/view ids live outside PluginHost so plugin fronts can import them
 * without re-entering the eager glob that loads those fronts. */
export const CORE_FRONT_SLOTS = {
  cartSummary: 'slot.cart.summary',
  cartLine: 'slot.cart.line',
  checkoutPayment: 'slot.checkout.payment',
  productActions: 'slot.product.actions',
  accountProfile: 'slot.account.profile',
  accountNotifications: 'slot.account.notifications',
  orderDetail: 'slot.order.detail',
  orderHistoryRow: 'slot.order.history.row',
  homeFaq: 'slot.home.faq',
  homeOnboarding: 'slot.home.onboarding',
  homeFeatured: 'slot.home.featured',
  adminDashboard: 'slot.admin.dashboard',
  footerIdentity: 'slot.footer.identity',
} as const;

export const CORE_FRONT_VIEWS = {
  cart: 'view.cart',
  product: 'view.product',
  invoicePreview: 'view.invoice.preview',
} as const;

export type FrontSlotName = (typeof CORE_FRONT_SLOTS)[keyof typeof CORE_FRONT_SLOTS];
export type FrontViewName = (typeof CORE_FRONT_VIEWS)[keyof typeof CORE_FRONT_VIEWS];
