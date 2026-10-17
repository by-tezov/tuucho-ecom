/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BRAND_NAME: string;
  readonly VITE_BRAND_SUFFIX: string;
  readonly VITE_SHOP_NAME: string;
  readonly VITE_BRAND_ALIASES: string;
  readonly VITE_SITE_URL: string;
  readonly VITE_CONTACT_EMAIL: string;
  readonly VITE_GALLERY_LOAD_MORE_DELAY: string;
  readonly VITE_GALLERY_CARD_REVEAL: string;
  readonly VITE_GALLERY_CARD_OVERLAP_REVEAL: string;
  readonly VITE_GALLERY_IMAGE_MAX_CONCURRENT: string;
  readonly VITE_GALLERY_IMAGE_TIMEOUT: string;
  readonly VITE_GALLERY_ROW_OVERSCAN: string;
  readonly VITE_GALLERY_CARD_ROOT_MARGIN_PX: string;
  readonly VITE_GUEST_STORAGE_RETENTION: string;
  readonly VITE_LOADING_MIN_SHORT: string;
  readonly VITE_LOADING_MIN: string;
  readonly VITE_LOADING_MIN_LONG: string;
  readonly VITE_NOTICE: string;
  readonly VITE_PRODUCT_CACHE_TTL: string;
  readonly VITE_CART_PAGE_CACHE_TTL: string;
  readonly VITE_BOOT_SPLASH_SPEED: string;
  readonly VITE_PAYMENT_TIMEOUT: string;
  readonly VITE_SHOP_VINTED_URL: string;
  /** Apple Services ID for Sign in with Apple (optional). */
  readonly VITE_APPLE_CLIENT_ID?: string;
  /** Optional Absolute Apple redirectURI; defaults to VITE_SITE_URL / siteUrl. */
  readonly VITE_APPLE_REDIRECT_URI?: string;
  readonly VITE_TIKTOK_URL: string;
  readonly VITE_INSTAGRAM_URL: string;
  readonly VITE_YOUTUBE_URL: string;
  readonly VITE_FACEBOOK_URL: string;
  readonly VITE_LEGAL_OWNER: string;
  readonly VITE_LEGAL_STATUS: string;
  readonly VITE_LEGAL_SIREN: string;
  readonly VITE_LEGAL_ADDRESS: string;
  readonly VITE_LEGAL_VAT: string;
  readonly VITE_LEGAL_PHONE: string;
  readonly VITE_HOST_NAME: string;
  readonly VITE_HOST_ADDRESS: string;
  readonly VITE_HOST_PHONE: string;
  readonly VITE_HOST_WEBSITE: string;
  readonly VITE_MEDIATOR_NAME: string;
  readonly VITE_MEDIATOR_WEBSITE: string;
  /** Pose-guide demo videos: the YouTube share URL plus the two facts
   * VideoObject markup needs, an ISO 8601 upload timestamp and duration.
   * Prod-only, so optional here. */
  readonly VITE_POSE_VIDEO_GLUE_URL?: string;
  readonly VITE_POSE_VIDEO_GLUE_UPLOADED?: string;
  readonly VITE_POSE_VIDEO_GLUE_DURATION?: string;
  readonly VITE_POSE_VIDEO_PATCH_URL?: string;
  readonly VITE_POSE_VIDEO_PATCH_UPLOADED?: string;
  readonly VITE_POSE_VIDEO_PATCH_DURATION?: string;
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

/** package.json's "version" at build time — see vite.config.ts's `define`. */
declare const __APP_VERSION__: string;

/** Resolved from Vite's own --mode, same 'dev'/'preprod'/'prod' values as
 * targetFileSuffix picks the env-file overlay with — see vite.config.ts's
 * `define`. Used for env-specific UI cues (Header's background tint). */
declare const __APP_TARGET__: string;
