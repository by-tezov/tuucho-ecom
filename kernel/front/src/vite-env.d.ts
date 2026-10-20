/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Leftover origins until same-origin / SSR bootstrap. */
  readonly VITE_API_BASE_URL: string;
  readonly VITE_SITE_URL: string;
  readonly VITE_ENABLED_LANGUAGES?: string;
  readonly VITE_GALLERY_LOAD_MORE_DELAY?: string;
  readonly VITE_GALLERY_CARD_REVEAL?: string;
  readonly VITE_GALLERY_CARD_OVERLAP_REVEAL?: string;
  readonly VITE_GALLERY_IMAGE_MAX_CONCURRENT?: string;
  readonly VITE_GALLERY_IMAGE_TIMEOUT?: string;
  readonly VITE_GALLERY_ROW_OVERSCAN?: string;
  readonly VITE_GALLERY_CARD_ROOT_MARGIN_PX?: string;
  readonly VITE_GUEST_STORAGE_RETENTION?: string;
  readonly VITE_LOADING_MIN_SHORT?: string;
  readonly VITE_LOADING_MIN?: string;
  readonly VITE_LOADING_MIN_LONG?: string;
  readonly VITE_NOTICE?: string;
  readonly VITE_PRODUCT_CACHE_TTL?: string;
  readonly VITE_CART_PAGE_CACHE_TTL?: string;
  readonly VITE_BOOT_SPLASH_SPEED?: string;
  readonly VITE_PAYMENT_TIMEOUT?: string;
  readonly VITE_QUANTITY_SELECT_THRESHOLD?: string;
  /** Set only by `npm run build -- maintenance-prepare --from ... --to ...` — epoch ms. */
  readonly VITE_MAINTENANCE_FROM?: string;
  readonly VITE_MAINTENANCE_TO?: string;
  readonly VITE_MAINTENANCE_MESSAGE?: string;
  /** Deploy-only admin route segment — never in committed env files. */
  readonly VITE_ADMIN_ROUTE_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Root package.json "version" at build time — see vite.config.ts's `define`. */
declare const __APP_VERSION__: string;

/** Resolved from Vite's own --mode, same 'dev'/'preprod'/'prod' values as
 * leftover origin overlay — see vite.config.ts's `define`. Used for
 * env-specific UI cues (Header's background tint). */
declare const __APP_TARGET__: string;
