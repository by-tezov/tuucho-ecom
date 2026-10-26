import type { CapsuleFormKey } from '../data/capsuleForms';
import type { Lang } from '../assets/i18n/types';
import { configureGalleryImageGate } from '../utils/galleryImageGate';
import { narrowEnabledLanguages, resolveRuntimeDefaultLang, setRuntimeDefaultLang } from './runtimeI18n';

export type ShopPlatformKey = 'vinted';
export type SocialPlatformKey = 'tiktok' | 'instagram' | 'youtube' | 'facebook';
export type PlatformKey = ShopPlatformKey | SocialPlatformKey;

const ALL_LANGS: Lang[] = ['en', 'fr'];

export interface ShopConfig {
  brandName: string;
  brandSuffix: string;
  shopName: string;
  /** Other spellings of the shop name that people actually search for, most
   * notably the plural "Shop" (the shop's own contact address uses
   * it). Emitted as schema.org `alternateName` on the OnlineStore/WebSite
   * nodes, which is how a brand declares its aliases to a search engine.
   * Visible footer copy is the user plugin `footer-identity`.
   * `shopName` itself is never repeated. */
  brandAliases: string[];
  siteUrl: string;
  /** React Router basename. Empty for the shop root (preprod is IP-gated,
   * not path-prefixed). */
  routerBasename: string;
  /** Deploy-generated route segment before /admin, empty when disabled. */
  adminRouteToken: string;
  /** kernel/back's public API base URL — no trailing slash. */
  apiBaseUrl: string;
  /** Google Identity Services client id (Sign in with Google). Optional —
   * when unset, the Google button is hidden. */
  googleClientId: string | undefined;
  /** Apple Services ID (Sign in with Apple). Optional — when unset, the Apple
   * button is hidden. */
  appleClientId: string | undefined;
  /** Absolute Apple redirectURI (Return URL registered for the Services ID).
   * Defaults to bare site origin. */
  appleRedirectUri: string;
  facebookAppId: string | undefined;
  /** Absolute Facebook Login browser return URI (Meta Valid OAuth Redirect
   * URIs). Optional — required for the mobile direct-web OAuth flow. */
  facebookOauthReturnUrl: string | undefined;
  /** Stripe's publishable key (pk_test_.../pk_live_...) — safe to ship to
   * the client (that's the whole point of "publishable"), unlike the
   * secret key the backend holds. Per-environment, same as apiBaseUrl. */
  stripePublishableKey: string;
  /** Mondial Relay's public merchant code, required by its browser widget. */
  mondialRelayBrand: string;
  /** Network assigned to addresses selected through the Mondial Relay point picker. */
  mondialRelayPickerNetworkCode: string;
  /** Courier which opens the Mondial Relay point picker. Defaults to the network code. */
  mondialRelayPickerCourierCode: string;
  /** Network automatically assigned when a customer adds a Mondial Relay home-delivery address. */
  mondialRelayHomeNetworkCode: string;
  /** Courier which opens the Mondial Relay home-delivery address form. Defaults to the network code. */
  mondialRelayHomeCourierCode: string;
  contactEmail: string;
  /** maximum number of active new arrivals shown on the home page */
  featuredLimit: number;
  /** minimum time (ms) the Gallery page's "loading next page" skeleton
   * stays visible before the newly fetched items appear, even when the
   * fetch itself resolves faster — see useGalleryFeed.ts. Deliberate, not
   * a bug: gives the loading state room to actually be seen instead of
   * flashing past unnoticed, and caps how fast a fast scroller (or a
   * script) can trigger consecutive page fetches. */
  galleryLoadMoreDelayMs: number;
  /** Duration (ms) of each gallery card's enter animation (translate +
   * scale from 0.85) as it's committed into the grid after a feed page
   * arrives. `0` mounts the whole chunk at once with no animation (legacy)
   * — see useStaggeredReveal.ts and GalleryCard.module.css's .itemEnter. */
  galleryCardRevealMs: number;
  /** How long before the end of one card's enter animation the next card
   * starts its own — the stagger interval between successive card mounts is
   * `galleryCardRevealMs - galleryCardOverlapRevealMs`, so animations overlap
   * instead of playing fully back-to-back. */
  galleryCardOverlapRevealMs: number;
  /** Max concurrent gallery thumbnail downloads (`/media/.../small`). `0`
   * disables the gate. See galleryImageGate.ts. Keep this at or below the
   * browser's own per-host connection limit (~6): granting more slots than
   * the browser can dial only moves the queue one layer down, where the
   * extra images wait on a socket with their galleryImageTimeoutMs clock
   * already running — which makes that timeout measure queue-wait rather
   * than the download it is meant to bound. */
  galleryImageMaxConcurrent: number;
  /** How long a gated gallery thumbnail may hold its concurrency slot before
   * that slot is freed for the next queued image — see galleryImageGate.ts.
   * The card then advances to its next retry/fallback source. This local
   * recovery timeout is not a backend-outage verdict and never produces a
   * customer-facing global error. */
  galleryImageTimeoutMs: number;
  /** Rows mounted above/below the visible viewport in the virtualized grid
   * — see GalleryGrid.tsx's useWindowVirtualizer `overscan`. Controls DOM
   * node count and how far ahead cards exist to start loading, independent
   * of galleryCardRootMarginPx below (that's per-card, this is per-row). */
  galleryRowOverscan: number;
  /** Vertical rootMargin (px) for useInViewport's IntersectionObserver on
   * each gallery card (GalleryCard.tsx) — how close a card must be to the
   * viewport, within an already-mounted row, before it swaps its skeleton
   * for the real photo and starts its gated image request. Horizontal
   * margin stays 0. */
  galleryCardRootMarginPx: number;
  /** QuantityControl: dropdown of 1..N (+ "N+"), +/- stepper above N — see
   * QuantityControl.tsx's own SELECT_THRESHOLD. */
  quantitySelectThreshold: number;
  /** Maximum lifetime of a signed-out visitor's cart/checkout snapshot after
   * its last change, parsed from VITE_GUEST_STORAGE_RETENTION. */
  guestStorageRetentionMs: number;
  /** Whole-day display form of guestStorageRetentionMs for legal copy. */
  guestStorageRetentionDays: number;
  /** How long cached product/stock data stays "fresh" before a silent
   * background revalidation fires (state/productCache.ts). Stale data is
   * still rendered instantly — this only paces refetching, so the customer
   * never waits on it. Stock shown from cache is advisory: checkout's own
   * reserveCart re-validates against product_availability under a row lock
   * and is the only authoritative check. */
  productCacheTtlMs: number;
  /** How long the cart page bootstrap snapshot (addresses, payment methods,
   * wallet probe) may be reused for cache-first Galerie↔Panier navigation
   * after the last SPA activity in this tab. Memory-only — refresh / new
   * tab / browser reopen are always cold. See cartBootstrapCache.ts. */
  cartPageCacheTtlMs: number;
  /** Floor (ms) for a LoadingModal overlay: work that finishes sooner still
   * shows the spinner this long, work that takes longer keeps it until it
   * settles (see `withMinDuration`). Three sizes instead of one knob per
   * screen, because a floor is a perception setting, not a property of the
   * operation it covers. `0` disables the floor.
   *
   * `short` for an overlay over something already on screen (cart drawer,
   * checkout step), `normal` as the default (sign-in, register, add card,
   * cart switch, cold boot), `long` when the overlay carries a message that
   * must be read before the next step appears ("code being sent"). */
  loadingMinMs: {
    short: number;
    normal: number;
    long: number;
  };
  /** How long a message that closes itself stays on screen: a success
   * dialog, a toast, an inline settings notice, a "you need an account"
   * notice shown before a redirect. Long enough to be read, short enough
   * not to block, and one value so they stay consistent. A message nobody
   * can finish reading is the same as no message. Anything that
   * auto-dismisses reads this instead of its own constant. */
  noticeMs: number;
  /** Intro playback rate — 1 = design timing, &gt;1 faster (e.g. 1.25). */
  bootSplashSpeed: number;
  /** Maximum time the browser may wait for Stripe/PayPal confirmation. */
  paymentTimeoutMs: number;
  /** application-guide YouTube URL, "with glue" demo; empty ⇒ "coming soon" placeholder */
  poseVideoGlueUrl: string;
  /** application-guide YouTube URL, "with adhesive tab" demo; empty ⇒ "coming soon" placeholder */
  poseVideoPatchUrl: string;
  /** The two facts about each demo that only YouTube knows and that Google
   * requires (uploadDate) or strongly recommends (duration) in VideoObject
   * markup: an ISO 8601 timestamp with an offset, and an ISO 8601 duration
   * ("PT1M27S"). They live next to the URL because they change exactly when
   * it does. Either one empty drops that video's structured data rather than
   * publishing a guessed date, which would be worse than none. */
  poseVideoGlueUploadDate: string;
  poseVideoGlueDuration: string;
  poseVideoPatchUploadDate: string;
  poseVideoPatchDuration: string;
  platformUrls: Record<PlatformKey, string>;
  /** whether each capsule shape is shown on the shape guide (its shape + length photo) */
  capsuleFormVisible: Record<CapsuleFormKey, boolean>;
  /** languages selectable in the language switcher, in display order — a
   * language left out of VITE_ENABLED_LANGUAGES isn't reachable through the
   * switcher (see LangSwitcher.tsx / LanguageContext.tsx). */
  enabledLanguages: Lang[];
}

const env = import.meta.env;
const mondialRelayPickerNetworkCode = 'mondial-relay-point';
const mondialRelayPickerCourierCode = 'mondial-relay-point';
const mondialRelayHomeNetworkCode = 'home';
const mondialRelayHomeCourierCode = 'mondial-relay-home';

/** A mandatory env variable — throws at load time if unset, so a missing value fails loudly instead of silently shipping a placeholder. */
function required(value: string | undefined, name: string): string {
  if (value === undefined || value.trim() === '') {
    throw new Error(
      `Missing required leftover origin ${name} — set kernel http.apiBaseUrl / http.frontendBaseUrl in config/.`,
    );
  }
  return value;
}

function requiredPositiveInteger(value: string | undefined, name: string): number {
  if (value === undefined || !/^\d+$/.test(value.trim())) {
    throw new Error(`Missing or invalid ${name} — set it to a positive whole number.`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`Missing or invalid ${name} — set it to a positive whole number.`);
  }
  return number;
}

/** Positive finite number (e.g. splash speed 1.25). */
function requiredPositiveNumber(value: string | undefined, name: string): number {
  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing or invalid ${name} — set it to a positive number (e.g. 1.25).`);
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`Missing or invalid ${name} — set it to a positive number (e.g. 1.25).`);
  }
  return number;
}

/** Non-negative whole ms (including 0 to disable a delay floor). */
function requiredNonNegativeInteger(value: string | undefined, name: string): number {
  if (value === undefined || !/^\d+$/.test(value.trim())) {
    throw new Error(`Missing or invalid ${name} — set it to a non-negative whole number (ms).`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`Missing or invalid ${name} — set it to a non-negative whole number (ms).`);
  }
  return number;
}

/** Parse human-readable durations consistently with the server config: 1.5s,
 * 10m, 1h, 30d (and ms for the rare sub-second case). */
function durationMs(value: string | undefined, name: string, allowZero = false): number {
  const raw = value?.trim();
  const match = raw?.match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/i);
  const unitMs: Record<string, number> = {
    ms: 1,
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  const amount = match ? Number(match[1]) : Number.NaN;
  const multiplier = match ? unitMs[match[2]!.toLowerCase()] : undefined;
  if (
    !Number.isFinite(amount) ||
    (!allowZero && amount <= 0) ||
    (allowZero && amount < 0) ||
    multiplier === undefined
  ) {
    throw new Error(`Missing or invalid ${name} — use a duration such as "15s" or "10m".`);
  }
  const milliseconds = amount * multiplier;
  if (!Number.isSafeInteger(milliseconds)) {
    throw new Error(`Missing or invalid ${name} — duration is too large.`);
  }
  return milliseconds;
}

function requiredDurationMs(value: string | undefined, name: string): number {
  return durationMs(value, name);
}

function requiredNonNegativeDurationMs(value: string | undefined, name: string): number {
  return durationMs(value, name, true);
}

/** A required comma-separated list of language codes (e.g. "en,fr") —
 * throws at load time if unset, contains an unknown code, or omits "en"
 * (the kernel language every other language falls back to). Order is
 * preserved and duplicates are dropped. */
function requiredLanguageList(value: string | undefined, name: string): Lang[] {
  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing required language list ${name}.`);
  }
  const codes = value
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean);

  const result: Lang[] = [];
  for (const code of codes) {
    if (!ALL_LANGS.includes(code as Lang)) {
      throw new Error(
        `${name} lists unknown language "${code}" — must be a comma-separated list from: ${ALL_LANGS.join(', ')}.`,
      );
    }
    if (!result.includes(code as Lang)) result.push(code as Lang);
  }
  if (result.length === 0) {
    throw new Error(`${name} must list at least one language code — from: ${ALL_LANGS.join(', ')}.`);
  }
  if (!result.includes('en')) {
    throw new Error(
      `${name} must include "en" — it's the kernel language, every other language falls back to it.`,
    );
  }
  return result;
}

function resolveAdminRouteToken(raw: string | undefined): string {
  const token = raw?.trim() ?? '';
  if (!token) return '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(token)) {
    throw new Error(`VITE_ADMIN_ROUTE_TOKEN must be 1-64 letters/digits/hyphens/underscores (got "${raw}")`);
  }
  return token;
}

/** Origin from VITE_SITE_URL (trailing slash stripped). */
function siteOriginFromEnv(raw: string): string {
  return raw.replace(/\/$/, '');
}

/** Splits brand aliases, dropping blanks, duplicates and any entry that
 * merely repeats the shop name (schema.org's `alternateName` is for names
 * *other than* `name`). */
function brandAliases(raw: string | undefined, shopName: string): string[] {
  const seen = new Set([shopName.toLowerCase()]);
  return (raw ?? '')
    .split(',')
    .map((alias) => alias.trim())
    .filter((alias) => {
      const key = alias.toLowerCase();
      if (!alias || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

const adminRouteToken = resolveAdminRouteToken(env.VITE_ADMIN_ROUTE_TOKEN);
const siteOrigin = siteOriginFromEnv(required(env.VITE_SITE_URL, 'VITE_SITE_URL'));

export const shopConfig: ShopConfig = {
  brandName: 'Shop',
  brandSuffix: '',
  shopName: 'Shop',
  brandAliases: brandAliases(undefined, 'Shop'),
  siteUrl: siteOrigin,
  routerBasename: '',
  adminRouteToken,
  apiBaseUrl: required(env.VITE_API_BASE_URL, 'VITE_API_BASE_URL').replace(/\/$/, ''),
  googleClientId: undefined,
  appleClientId: undefined,
  // Default to bare origin (Apple Return URL) until bootstrap overlays the plugin.
  appleRedirectUri: siteOrigin,
  facebookAppId: undefined,
  facebookOauthReturnUrl: undefined,
  stripePublishableKey: '',
  mondialRelayBrand: '',
  mondialRelayPickerNetworkCode,
  mondialRelayPickerCourierCode,
  mondialRelayHomeNetworkCode,
  mondialRelayHomeCourierCode,
  contactEmail: 'hello@shop.example',
  featuredLimit: 5,
  galleryLoadMoreDelayMs: requiredDurationMs(
    env.VITE_GALLERY_LOAD_MORE_DELAY ?? '250ms',
    'VITE_GALLERY_LOAD_MORE_DELAY',
  ),
  galleryCardRevealMs: requiredNonNegativeDurationMs(
    env.VITE_GALLERY_CARD_REVEAL ?? '120ms',
    'VITE_GALLERY_CARD_REVEAL',
  ),
  galleryCardOverlapRevealMs: requiredNonNegativeDurationMs(
    env.VITE_GALLERY_CARD_OVERLAP_REVEAL ?? '30ms',
    'VITE_GALLERY_CARD_OVERLAP_REVEAL',
  ),
  galleryImageMaxConcurrent: requiredNonNegativeInteger(
    env.VITE_GALLERY_IMAGE_MAX_CONCURRENT ?? '6',
    'VITE_GALLERY_IMAGE_MAX_CONCURRENT',
  ),
  galleryImageTimeoutMs: requiredDurationMs(
    env.VITE_GALLERY_IMAGE_TIMEOUT ?? '10s',
    'VITE_GALLERY_IMAGE_TIMEOUT',
  ),
  galleryRowOverscan: requiredNonNegativeInteger(
    env.VITE_GALLERY_ROW_OVERSCAN ?? '2',
    'VITE_GALLERY_ROW_OVERSCAN',
  ),
  galleryCardRootMarginPx: requiredNonNegativeInteger(
    env.VITE_GALLERY_CARD_ROOT_MARGIN_PX ?? '200',
    'VITE_GALLERY_CARD_ROOT_MARGIN_PX',
  ),
  quantitySelectThreshold: requiredPositiveInteger(
    env.VITE_QUANTITY_SELECT_THRESHOLD ?? '3',
    'VITE_QUANTITY_SELECT_THRESHOLD',
  ),
  guestStorageRetentionMs: requiredDurationMs(
    env.VITE_GUEST_STORAGE_RETENTION ?? '15d',
    'VITE_GUEST_STORAGE_RETENTION',
  ),
  guestStorageRetentionDays:
    requiredDurationMs(env.VITE_GUEST_STORAGE_RETENTION ?? '15d', 'VITE_GUEST_STORAGE_RETENTION') /
    86_400_000,
  productCacheTtlMs: requiredDurationMs(env.VITE_PRODUCT_CACHE_TTL ?? '5m', 'VITE_PRODUCT_CACHE_TTL'),
  cartPageCacheTtlMs: requiredDurationMs(env.VITE_CART_PAGE_CACHE_TTL ?? '1h', 'VITE_CART_PAGE_CACHE_TTL'),
  loadingMinMs: {
    short: requiredNonNegativeDurationMs(env.VITE_LOADING_MIN_SHORT ?? '250ms', 'VITE_LOADING_MIN_SHORT'),
    normal: requiredNonNegativeDurationMs(env.VITE_LOADING_MIN ?? '450ms', 'VITE_LOADING_MIN'),
    long: requiredNonNegativeDurationMs(env.VITE_LOADING_MIN_LONG ?? '1250ms', 'VITE_LOADING_MIN_LONG'),
  },
  noticeMs: requiredNonNegativeDurationMs(env.VITE_NOTICE ?? '2400ms', 'VITE_NOTICE'),
  bootSplashSpeed: requiredPositiveNumber(env.VITE_BOOT_SPLASH_SPEED ?? '2.0', 'VITE_BOOT_SPLASH_SPEED'),
  paymentTimeoutMs: requiredDurationMs(env.VITE_PAYMENT_TIMEOUT ?? '15s', 'VITE_PAYMENT_TIMEOUT'),
  poseVideoGlueUrl: '',
  poseVideoPatchUrl: '',
  poseVideoGlueUploadDate: '',
  poseVideoGlueDuration: '',
  poseVideoPatchUploadDate: '',
  poseVideoPatchDuration: '',
  enabledLanguages: requiredLanguageList(env.VITE_ENABLED_LANGUAGES ?? 'en,fr', 'VITE_ENABLED_LANGUAGES'),
  platformUrls: {
    vinted: '#',
    tiktok: '#',
    instagram: '#',
    youtube: '#',
    facebook: '#',
  },
  capsuleFormVisible: {
    almond: true,
    oval: true,
    square: true,
    coffin: true,
    ballerina: true,
    stiletto: true,
  },
};

configureGalleryImageGate(shopConfig.galleryImageMaxConcurrent, shopConfig.galleryImageTimeoutMs);

function enabledPluginSettings(
  bootstrap: { plugins: Array<{ id: string; enabled?: boolean; settings?: Record<string, unknown> }> },
  id: string,
): Record<string, unknown> | undefined {
  const plugin = bootstrap.plugins.find((entry) => entry.id === id);
  if (!plugin || plugin.enabled === false) return undefined;
  return plugin.settings;
}

function overlayString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function applyStorefrontBootstrap(bootstrap: {
  store: { name: string; suffix?: string; contactEmail: string };
  plugins: Array<{ id: string; enabled?: boolean; settings?: Record<string, unknown> }>;
  i18n?: { default: string; enabled: string[] };
}): void {
  shopConfig.shopName = bootstrap.store.name || shopConfig.shopName;
  shopConfig.brandName = bootstrap.store.name || shopConfig.brandName;
  shopConfig.brandSuffix = bootstrap.store.suffix ?? shopConfig.brandSuffix;
  shopConfig.contactEmail = bootstrap.store.contactEmail || shopConfig.contactEmail;
  // Runtime i18n: bootstrap `enabled` narrows the build-time
  // VITE_ENABLED_LANGUAGES set in place (module-level readers keep the same
  // array reference), then a valid `default` becomes the runtime default
  // language (runtimeDefaultLang).
  if (bootstrap.i18n) {
    const narrowed = narrowEnabledLanguages(shopConfig.enabledLanguages, bootstrap.i18n.enabled);
    shopConfig.enabledLanguages.splice(0, shopConfig.enabledLanguages.length, ...narrowed);
    setRuntimeDefaultLang(resolveRuntimeDefaultLang(bootstrap.i18n.default, narrowed));
  }
  const google = enabledPluginSettings(bootstrap, 'tuucho-signin-google');
  shopConfig.googleClientId = overlayString(google?.clientId);
  const apple = enabledPluginSettings(bootstrap, 'tuucho-signin-apple');
  shopConfig.appleClientId = overlayString(apple?.clientId);
  shopConfig.appleRedirectUri = overlayString(apple?.redirectUri)?.replace(/\/$/, '') || shopConfig.siteUrl;
  const facebook = enabledPluginSettings(bootstrap, 'tuucho-signin-facebook');
  shopConfig.facebookAppId = overlayString(facebook?.appId);
  shopConfig.facebookOauthReturnUrl = facebook
    ? overlayString(facebook.oauthReturnUrl)?.replace(/\/$/, '') ||
      `${shopConfig.siteUrl.replace(/\/$/, '')}/auth/facebook-return`
    : undefined;
  const stripe = bootstrap.plugins.find((plugin) => plugin.id === 'tuucho-payment-stripe')?.settings;
  if (typeof stripe?.publishableKey === 'string' && stripe.publishableKey.trim()) {
    shopConfig.stripePublishableKey = stripe.publishableKey.trim();
  }
  const carrier =
    bootstrap.plugins.find((plugin) => plugin.id === 'tuucho-shipping-mondial-relay')?.settings ?? {};
  if (typeof carrier.brand === 'string' && carrier.brand.trim())
    shopConfig.mondialRelayBrand = carrier.brand.trim();
  if (typeof carrier.pointNetworkCode === 'string' && carrier.pointNetworkCode.trim()) {
    shopConfig.mondialRelayPickerNetworkCode = carrier.pointNetworkCode.trim();
  }
  if (typeof carrier.pointCourierCode === 'string' && carrier.pointCourierCode.trim()) {
    shopConfig.mondialRelayPickerCourierCode = carrier.pointCourierCode.trim();
  }
  if (typeof carrier.homeNetworkCode === 'string' && carrier.homeNetworkCode.trim()) {
    shopConfig.mondialRelayHomeNetworkCode = carrier.homeNetworkCode.trim();
  }
  if (typeof carrier.homeCourierCode === 'string' && carrier.homeCourierCode.trim()) {
    shopConfig.mondialRelayHomeCourierCode = carrier.homeCourierCode.trim();
  }
}
