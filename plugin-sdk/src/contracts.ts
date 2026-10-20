/** Shared plugin contracts. The kernel hosts them; plugins implement them. */

export type PluginKind =
  | 'theme'
  | 'page'
  | 'payment'
  | 'shipping'
  | 'commerce'
  | 'docs'
  | 'generic'
  | 'seo'
  | 'locale';

export type PluginDependency = string | { id: string; version?: string };

export type DependsOnMode = 'all' | 'any';

export type PluginSettingFieldType =
  | 'string'
  | 'text'
  | 'number'
  | 'boolean'
  | 'secret'
  | 'url'
  | 'email';

export interface PluginSettingOption {
  value: string;
  label: string;
}

export interface PluginSettingField {
  type: PluginSettingFieldType;
  /** Operator-facing name. Empty is a product bug. */
  label: string;
  /** What the field is and when to fill it. Empty is a product bug. */
  description: string;
  section?: string | undefined;
  sectionTitle?: string | undefined;
  sectionDescription?: string | undefined;
  placeholder?: string | undefined;
  options?: PluginSettingOption[] | undefined;
  /** Secret PEM / JSON: replace control is a textarea, still never shows the stored value. */
  long?: boolean | undefined;
}

export interface PluginAdminNavItem {
  id: string;
  group: string;
  to: string;
  permission: string;
  order?: number;
  label?: string;
  /** Extra admin paths that keep this nav item active. */
  alsoActiveOn?: string[];
}

export interface PluginFrontMount {
  admin?: string;
  storefront?: string;
  slots?: string;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  kind: PluginKind;
  /** Operator-facing summary of what the plugin does. Required except locale plugins. */
  description: string;
  required?: boolean;
  defaultEnabled?: boolean;
  provides?: string[];
  dependsOn?: PluginDependency[];
  /** `all` (default) requires every parent; `any` requires at least one. */
  dependsOnMode?: DependsOnMode;
  engines?: { core?: string };
  route?: string;
  nav?: { key: string; order: number; bottomBar?: boolean };
  courierCodes?: string[];
  defaultSettings?: Record<string, unknown>;
  settingsSchema?: Record<string, PluginSettingField>;
  permissions?: Array<{ code: string; label: string }>;
  adminNav?: PluginAdminNavItem[];
  front?: PluginFrontMount;
  /**
   * Repo-relative posix path of the package folder (leaf equals `id`).
   * Tuucho ids use `plugins/tuucho/…`; user ids use `plugins/user/…`.
   */
  installPath?: string;
  /**
   * HTTPS GitHub repo root for Check / Apply of this user plugin only.
   * Ignored on `tuucho-*` ids.
   */
  repository?: string;
}

export interface ThemeTokens {
  [cssVariable: string]: string;
}

export interface ThemeContract {
  id: string;
  tokens: ThemeTokens;
  fonts?: { display?: string; body?: string };
  slots?: string[];
}

export interface StorefrontPageContract {
  id: string;
  route: string;
  navKey: string;
  required?: boolean;
}

export interface PaymentGateway {
  id: string;
  methods: string[];
  capabilities?: string[];
  getClient?: () => unknown;
  getOrCreateCustomerId?: (...args: unknown[]) => Promise<unknown>;
  createAccountIntent?: (...args: unknown[]) => Promise<unknown>;
  createGuestIntent?: (...args: unknown[]) => Promise<unknown>;
  createSetupIntent?: (...args: unknown[]) => Promise<unknown>;
  listPaymentMethods?: (...args: unknown[]) => Promise<unknown>;
  getPaymentMethod?: (...args: unknown[]) => Promise<unknown>;
  detachPaymentMethod?: (...args: unknown[]) => Promise<unknown>;
  constructWebhookEvent?: (raw: Buffer, signature: string) => unknown;
  retrievePaymentIntent?: (...args: unknown[]) => Promise<unknown>;
  cancelPaymentIntent?: (...args: unknown[]) => Promise<unknown>;
  capturePaymentIntent?: (...args: unknown[]) => Promise<unknown>;
  createRefund?: (...args: unknown[]) => Promise<unknown>;
  listRefunds?: (...args: unknown[]) => Promise<unknown>;
  retrieveRemotePaymentMethod?: (...args: unknown[]) => Promise<unknown>;
  attachRemotePaymentMethod?: (...args: unknown[]) => Promise<unknown>;
  detachRemotePaymentMethod?: (...args: unknown[]) => Promise<unknown>;
  updateRemotePaymentMethod?: (...args: unknown[]) => Promise<unknown>;
  createRemoteCustomer?: (...args: unknown[]) => Promise<unknown>;
  deleteRemoteCustomer?: (...args: unknown[]) => Promise<unknown>;
  retrieveBalance?: (...args: unknown[]) => Promise<unknown>;
}

export interface ShippingMethod {
  id: string;
  courierCodes: string[];
  ensureCouriers?: () => Promise<void>;
}

export interface Review {
  id: string;
  author: string;
  body: string;
  rating?: number;
  language?: string;
  source?: string;
  featured?: boolean;
}

export interface ReviewsContract {
  listFeatured(): Promise<Review[]>;
  listPublic(): Promise<Review[]>;
}

export interface CheckoutVoucher {
  code: string;
  discount: number;
  itemDiscount: number;
  shippingDiscount: number;
  offer: { type: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface CheckoutCartRulesState {
  gifts: Array<{ productId: string; productUid: string; quantity: number; locked: true; ruleCode: string }>;
  nailQtyTier: unknown;
  freeShipping: unknown;
  forbidVoucher: boolean;
  rulesItemDiscount: number;
  shippingListFee: number;
  shippingFee: number;
  snapshot: object;
}

export interface CheckoutQuote {
  merchandiseSubtotal: number;
  shippingListFee: number;
  shippingFee: number;
  totalQuantity: number;
  packetKey: string;
  rulesItemDiscount: number;
  cartRules: CheckoutCartRulesState;
  extraLines: ExtraLine[];
  plugins: Record<string, unknown>;
  total: number;
  items: unknown[];
  [key: string]: unknown;
}

export interface CheckoutQuoteContext {
  client: unknown;
  userId?: string;
  cartId?: string;
  pluginRequest?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ExtraLine {
  id: string;
  pluginId: string;
  label: string;
  amount: number;
  quantity?: number;
}

export interface OrderPluginSnapshot {
  plugins: Record<string, unknown>;
}

export interface InvoiceThemeTokens {
  ink?: string;
  muted?: string;
  label?: string;
  rule?: string;
  cream?: string;
  [token: string]: string | undefined;
}

export interface InvoiceFingerLabels {
  [finger: string]: string;
}

export interface InvoiceCopy {
  language: string;
  dateLocale: string;
  documentTitle: (invoiceNumber: string) => string;
  heading: string;
  number: (invoiceNumber: string) => string;
  date: (formatted: string) => string;
  order: (orderNumber: string) => string;
  giftOrder: string;
  giftedBy: (giver: string, receiver: string) => string;
  maxSets: (count: number) => string;
  budget: (amount: string) => string;
  integrity: (token: string) => string;
  seller: string;
  billedTo: string;
  shippedTo: string;
  article: string;
  qty: string;
  qtyExpanded: string;
  unitPrice: string;
  unitPriceExpanded: string;
  lineTotal: string;
  piece: string;
  pieces: string;
  size: (size: string) => string;
  quantity: string;
  free: string;
  ref: (id: string) => string;
  subtotal: string;
  shipping: string;
  shippingWith: (name: string, express: boolean) => string;
  freeWas: (was: string) => string;
  volumeDiscount: string;
  grandTotal: string;
  payment: string;
  status: (label: string) => string;
  method: (label: string) => string;
  captureAuthorized: string;
  captureCaptured: string;
  captureNotRequired: string;
  captureExpired: string;
  captureCanceled: string;
  card: string;
  noneZeroTotal: string;
  handmade: string;
  page: (current: number, total: number) => string;
  siren: (value: string) => string;
  itemSections: Record<string, string>;
  fingers: InvoiceFingerLabels;
  leftHand: string;
  rightHand: string;
}

export interface InvoiceRenderState {
  theme: InvoiceThemeTokens;
  extraLines: ExtraLine[];
  extraBlocks: unknown[];
  copy: InvoiceCopy;
  language: string;
}

export interface InvoiceDocumentOverride {
  bytes: Uint8Array;
}

export interface MailTemplateMessage {
  subject: string;
  text: string;
  html?: string;
}

export interface HttpMount {
  pluginId: string;
  scope: 'admin' | 'account' | 'public' | 'plugin' | 'operation';
  path: string;
  router: unknown;
}

export const CORE_OPENING_FILTERS = {
  preferences: 'core.preferences.entries',
  profile: 'core.profile.entries',
  signIn: 'core.signIn.methods',
  notifications: 'core.notifications.entries',
  cartShipping: 'cart.shipping.methods',
  cartLines: 'cart.lines',
  orderHistory: 'orders.history.entries',
  ordersSnapshot: 'orders.snapshot',
  checkoutQuote: 'checkout.quote',
  checkoutLines: 'checkout.lines',
  checkoutTotals: 'checkout.totals',
  checkoutConfirm: 'checkout.confirm',
  checkoutPrepare: 'checkout.prepare',
  checkoutRelease: 'checkout.release',
  checkoutReserve: 'checkout.reserve',
  invoiceRender: 'invoice.render',
  invoiceDocument: 'invoice.document',
  mailSend: 'mail.send',
  mailTemplates: 'mail.templates',
  mailRecipients: 'mail.recipients',
  mailSpyChannels: 'mail.spy.channels',
  mailSpyResolve: 'mail.spy.resolve',
  seoMeta: 'seo.meta',
  seoJsonLd: 'seo.jsonld.graph',
  seoSitemap: 'seo.sitemap.entries',
  seoRobots: 'seo.robots.rules',
  seoRedirects: 'seo.redirects.rules',
  storefrontBootstrap: 'storefront.bootstrap',
} as const;

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

export type CoreOpeningEntry = {
  id: string;
  pluginId: string;
  title: string;
  description?: string;
  href?: string;
};

/** Who/whether filters a spy-mail channel accepts in Admin → Spy e-mails. */
export type SpyChannelFilter = 'role' | 'email' | 'kind';

/** One ops-notify channel. Kernel and plugins append via `mail.spy.channels`. */
export interface SpyChannelDeclaration {
  id: string;
  pluginId: string;
  title: string;
  description: string;
  filters: SpyChannelFilter[];
}

/** Filled by `tuucho-mail-spy` on `mail.spy.resolve`. Empty `to` skips the send. */
export interface SpyResolveState {
  channelId: string;
  to: string[];
}

/** Append a channel once. Spy plugin must not invent other plugins' channels. */
export function appendSpyChannel(
  channels: SpyChannelDeclaration[],
  channel: SpyChannelDeclaration,
): SpyChannelDeclaration[] {
  if (channels.some((entry) => entry.id === channel.id)) return channels;
  return [...channels, channel];
}
