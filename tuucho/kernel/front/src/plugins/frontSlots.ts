/** Slot/view ids live outside PluginHost so plugin fronts can import them
 * without re-entering the eager glob that loads those fronts. */
export const CORE_FRONT_SLOTS = {
  cartSummary: 'slot.cart.summary',
  cartLine: 'slot.cart.line',
  checkoutPayment: 'slot.checkout.payment',
  productActions: 'slot.product.actions',
  /** Two-column extras on Account after Delete / Introduction. */
  accountProfile: 'slot.account.profile',
  /** Left column under Information (same pair as Change email / Recent logins). */
  accountProfileDetails: 'slot.account.profile.details',
  /** Right column after Change email and Recent logins. */
  accountProfileCredentials: 'slot.account.profile.credentials',
  /** Same row as Delete my account (Introduction registers here). */
  accountProfileEnd: 'slot.account.profile.end',
  accountNotifications: 'slot.account.notifications',
  orderDetail: 'slot.order.detail',
  orderHistoryRow: 'slot.order.history.row',
  homeFaq: 'slot.home.faq',
  homeOnboarding: 'slot.home.onboarding',
  homeFeatured: 'slot.home.featured',
  /** KPI / number cards on Admin home. Extra regions use new slot ids. */
  adminDashboard: 'slot.admin.dashboard',
  /** Needs-attention tiles on Admin home (counts, alerts). */
  adminDashboardAttention: 'slot.admin.dashboard.attention',
  footerIdentity: 'slot.footer.identity',
  galleryLightboxCompose: 'slot.gallery.lightbox.compose',
  galleryCardCompose: 'slot.gallery.card.compose',
} as const;

export const CORE_FRONT_VIEWS = {
  cart: 'view.cart',
  product: 'view.product',
  invoicePreview: 'view.invoice.preview',
  /** Cold-boot splash (`/` entry). Receives ariaLabel/markAria/tagline/instant/speed via useSlotProps. */
  bootSplash: 'view.boot.splash',
} as const;

export type FrontSlotName = (typeof CORE_FRONT_SLOTS)[keyof typeof CORE_FRONT_SLOTS];
export type FrontViewName = (typeof CORE_FRONT_VIEWS)[keyof typeof CORE_FRONT_VIEWS];
