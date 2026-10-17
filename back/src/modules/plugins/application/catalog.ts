import type {
  PluginKind,
  PluginManifest,
  PaymentGatewayContract,
  ShippingMethodContract,
} from '../domain/contracts.js';
import { DEFAULT_CORE_ENGINE } from '../domain/coreVersion.js';
import { discoverDiskPlugins } from './discoverPlugins.js';

const ENGINES = { core: DEFAULT_CORE_ENGINE };

export const SHIPPED_PLUGINS: PluginManifest[] = [
  {
    id: 'theme-default',
    name: 'Default theme',
    version: '1.0.0',
    kind: 'theme',
    description: 'Design tokens and layout skin for the storefront chrome.',
    engines: ENGINES,
    required: true,
    defaultEnabled: true,
    provides: ['Theme'],
  },
  {
    id: 'page-home',
    name: 'Home',
    version: '1.0.0',
    kind: 'page',
    description: 'Landing page (hero, featured products, trust, CTA).',
    engines: ENGINES,
    required: true,
    defaultEnabled: true,
    provides: ['StorefrontPage'],
    route: '/home',
    nav: { key: 'home', order: 10, bottomBar: true },
  },
  {
    id: 'page-about',
    name: 'About',
    version: '1.0.0',
    kind: 'page',
    description: 'About the atelier.',
    engines: ENGINES,
    defaultEnabled: true,
    provides: ['StorefrontPage'],
    route: '/about',
    nav: { key: 'about', order: 40 },
  },
  {
    id: 'page-guides',
    name: 'Guides',
    version: '1.0.0',
    kind: 'page',
    description: 'Size, shape and care guides.',
    engines: ENGINES,
    defaultEnabled: true,
    provides: ['StorefrontPage'],
    route: '/sizes',
    nav: { key: 'guide', order: 30 },
  },
  {
    id: 'page-legal',
    name: 'Legal',
    version: '1.0.0',
    kind: 'page',
    description: 'Terms, privacy and cookies samples.',
    engines: ENGINES,
    defaultEnabled: true,
    provides: ['StorefrontPage'],
    route: '/legal',
    nav: { key: 'legal', order: 90 },
  },
  {
    id: 'payment-stripe',
    name: 'Stripe',
    version: '1.0.0',
    kind: 'payment',
    description: 'Card, PayPal, Bancontact, Google Pay and Apple Pay via Stripe.',
    engines: ENGINES,
    defaultEnabled: true,
    provides: ['PaymentGateway'],
  },
  {
    id: 'shipping-home',
    name: 'Home address delivery',
    version: '1.0.0',
    kind: 'shipping',
    description: 'Delivery to a home address (Colissimo, Chronopost, Mondial Relay home).',
    engines: ENGINES,
    defaultEnabled: true,
    provides: ['ShippingMethod'],
    courierCodes: ['colissimo-home', 'chronopost-home', 'mondial-relay-home'],
  },
  {
    id: 'shipping-mondial-relay',
    name: 'Mondial Relay',
    version: '1.0.0',
    kind: 'shipping',
    description: 'Pickup at a Mondial Relay Point Relais.',
    engines: ENGINES,
    defaultEnabled: true,
    provides: ['ShippingMethod'],
    courierCodes: ['mondial-relay-point'],
  },
  {
    id: 'commerce-vouchers',
    name: 'Vouchers',
    version: '1.0.0',
    kind: 'commerce',
    description: 'Promo codes at checkout and the Vouchers admin page.',
    engines: ENGINES,
    defaultEnabled: true,
    provides: ['CheckoutAlteration', 'AdminPage'],
    permissions: [{ code: 'vouchers', label: 'Vouchers' }],
  },
  {
    id: 'commerce-cart-rules',
    name: 'Cart rules',
    version: '1.0.0',
    kind: 'commerce',
    description: 'Thresholds, gifts and other cart alterations, plus the Cart rules admin page.',
    engines: ENGINES,
    defaultEnabled: true,
    provides: ['CheckoutAlteration', 'AdminPage'],
    permissions: [{ code: 'cart_rules', label: 'Cart rules' }],
  },
  {
    id: 'commerce-reviews',
    name: 'Customer reviews',
    version: '1.0.0',
    kind: 'commerce',
    description: 'Home-page customer reviews and the Reviews admin page.',
    engines: ENGINES,
    defaultEnabled: true,
    provides: ['StorefrontSlot', 'AdminPage'],
    permissions: [{ code: 'reviews', label: 'Customer reviews' }],
  },
  {
    id: 'commerce-product-requests',
    name: 'Product requests',
    version: '1.0.0',
    kind: 'commerce',
    description: 'Sold-out size requests and the Product requests admin page.',
    engines: ENGINES,
    defaultEnabled: true,
    provides: ['StorefrontSlot', 'AdminPage', 'PreferenceEntry'],
    permissions: [{ code: 'product_requests', label: 'Product requests' }],
  },
  {
    id: 'commerce-loyalty',
    name: 'Loyalty wallet',
    version: '1.0.0',
    kind: 'commerce',
    description: 'Wallet, checkout spend, and the Loyalty admin page.',
    engines: ENGINES,
    defaultEnabled: true,
    provides: ['CheckoutAlteration', 'AdminPage', 'ProfileEntry', 'NotificationEntry'],
    permissions: [{ code: 'loyalty', label: 'Loyalty wallet' }],
  },
  {
    id: 'commerce-gift',
    name: 'Gift orders',
    version: '1.0.0',
    kind: 'commerce',
    description: 'Create a gift, receiver shop, and the Gift admin page.',
    engines: ENGINES,
    defaultEnabled: true,
    provides: ['StorefrontPage', 'AdminPage'],
    permissions: [{ code: 'gift', label: 'Gift orders' }],
  },
  {
    id: 'journal-api',
    name: 'Journal API',
    version: '1.0.0',
    kind: 'generic',
    description: 'Persist and query journal events. Complements depend on this API.',
    engines: ENGINES,
    defaultEnabled: true,
    provides: ['JournalApi'],
  },
  {
    id: 'journal-admin',
    name: 'API journal',
    version: '1.0.0',
    kind: 'generic',
    description: 'Admin API journal. Complements Journal API.',
    engines: ENGINES,
    defaultEnabled: true,
    dependsOn: [{ id: 'journal-api', version: '>=1.0.0' }],
    provides: ['AdminPage'],
    permissions: [{ code: 'api_log', label: 'API journal' }],
  },
  {
    id: 'journal-email',
    name: 'Email journal',
    version: '1.0.0',
    kind: 'generic',
    description: 'Admin e-mail journal. Complements Journal API.',
    engines: ENGINES,
    defaultEnabled: true,
    dependsOn: [{ id: 'journal-api', version: '>=1.0.0' }],
    provides: ['AdminPage'],
    permissions: [{ code: 'email_log', label: 'Email journal' }],
  },
  {
    id: 'journal-cron',
    name: 'Cron journals',
    version: '1.0.0',
    kind: 'generic',
    description: 'Admin cron journals. Complements Journal API.',
    engines: ENGINES,
    defaultEnabled: true,
    dependsOn: [{ id: 'journal-api', version: '>=1.0.0' }],
    provides: ['AdminPage'],
    permissions: [{ code: 'cron_logs', label: 'Cron journals' }],
  },
  {
    id: 'shipping-expedition-cron',
    name: 'Expedition cron',
    version: '1.0.0',
    kind: 'generic',
    description: 'Scheduled shipment tracking. Complements home and Mondial Relay shipping.',
    engines: ENGINES,
    defaultEnabled: true,
    dependsOn: [
      { id: 'shipping-home', version: '>=1.0.0' },
      { id: 'shipping-mondial-relay', version: '>=1.0.0' },
    ],
    provides: ['CronJob'],
  },
  {
    id: 'docs-developer',
    name: 'Documentation',
    version: '1.0.0',
    kind: 'docs',
    description: 'In-admin developer guide: create plugins, APIs, database, and sample walkthroughs.',
    engines: ENGINES,
    defaultEnabled: true,
    provides: ['AdminPage'],
  },
];

export const PAYMENT_GATEWAY: PaymentGatewayContract = {
  id: 'payment-stripe',
  methods: ['card', 'paypal', 'bancontact', 'google_pay', 'apple_pay'],
};

export const SHIPPING_HOME: ShippingMethodContract = {
  id: 'shipping-home',
  courierCodes: ['colissimo-home', 'chronopost-home', 'mondial-relay-home'],
};

export const SHIPPING_MONDIAL_RELAY: ShippingMethodContract = {
  id: 'shipping-mondial-relay',
  courierCodes: ['mondial-relay-point'],
};

const CONTRACT_CODES: Record<string, string[]> = {
  [SHIPPING_HOME.id]: SHIPPING_HOME.courierCodes,
  [SHIPPING_MONDIAL_RELAY.id]: SHIPPING_MONDIAL_RELAY.courierCodes,
};

export async function loadManifests(): Promise<PluginManifest[]> {
  const disk = await discoverDiskPlugins();
  const byId = new Map<string, PluginManifest>();
  for (const plugin of SHIPPED_PLUGINS) byId.set(plugin.id, plugin);
  for (const plugin of disk) {
    const current = byId.get(plugin.id);
    byId.set(plugin.id, current ? { ...current, ...plugin, required: current.required || plugin.required } : plugin);
  }
  return [...byId.values()].map((plugin) => ({
    ...plugin,
    courierCodes: plugin.courierCodes ?? CONTRACT_CODES[plugin.id],
  }));
}

export async function manifestById(id: string): Promise<PluginManifest | undefined> {
  const all = await loadManifests();
  return all.find((plugin) => plugin.id === id);
}

export function manifestsOfKind(kind: PluginKind): PluginManifest[] {
  return SHIPPED_PLUGINS.filter((plugin) => plugin.kind === kind);
}
