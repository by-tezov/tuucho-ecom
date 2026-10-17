import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/** Unit/component tests deliberately use an isolated config. Importing the
 * application Vite config would load deployment environment files and mix
 * build/deploy behavior into deterministic tests. */
export default defineConfig({
  plugins: [react()],
  /** `src/config/env.ts` throws at load time for every mandatory variable, so
   * anything importing it fails here unless they are defined. This is the full
   * set that `required()` guards.
   *
   * Stated as fixed placeholders rather than read from `.env/`: the point of
   * this isolated config is that a test result never depends on a deployment
   * file. A test that cares about one of these values must assert on its own
   * value, not on whatever a target happens to be configured with. */
  define: {
    __APP_TARGET__: JSON.stringify('dev'),
    ...Object.fromEntries(
      Object.entries({
        VITE_API_BASE_URL: 'http://127.0.0.1:3000',
        VITE_BOOT_SPLASH_SPEED: '1',
        VITE_CAPSULE_FORM_ALMOND: 'true',
        VITE_CAPSULE_FORM_BALLERINA: 'true',
        VITE_CAPSULE_FORM_COFFIN: 'true',
        VITE_CAPSULE_FORM_OVAL: 'true',
        VITE_CAPSULE_FORM_SQUARE: 'true',
        VITE_CAPSULE_FORM_STILETTO: 'true',
        VITE_CART_PAGE_CACHE_TTL: '1s',
        VITE_ENABLED_LANGUAGES: 'fr,en,th,es,it,nl,pt',
        VITE_FEATURE_NAILS_LIMIT: '1',
        VITE_GALLERY_CARD_OVERLAP_REVEAL: '1s',
        VITE_GALLERY_CARD_REVEAL: '1s',
        VITE_GALLERY_CARD_ROOT_MARGIN_PX: '0',
        VITE_GALLERY_IMAGE_MAX_CONCURRENT: '0',
        VITE_GALLERY_IMAGE_TIMEOUT: '1s',
        VITE_GALLERY_LOAD_MORE_DELAY: '1s',
        VITE_GALLERY_ROW_OVERSCAN: '0',
        VITE_GUEST_STORAGE_RETENTION: '1s',
        VITE_MONDIAL_RELAY_BRAND: 'TEST_MONDIAL_RELAY_BRAND',
        VITE_MONDIAL_RELAY_HOME_NETWORK_CODE: 'TEST_MONDIAL_RELAY_HOME_NETWORK_CODE',
        VITE_MONDIAL_RELAY_PICKER_NETWORK_CODE: 'TEST_MONDIAL_RELAY_PICKER_NETWORK_CODE',
        VITE_PAYMENT_TIMEOUT: '1s',
        VITE_LOADING_MIN_SHORT: '1s',
        VITE_LOADING_MIN: '1s',
        VITE_LOADING_MIN_LONG: '1s',
        VITE_NOTICE: '1s',
        VITE_PRODUCT_CACHE_TTL: '1s',
        VITE_QUANTITY_SELECT_THRESHOLD: '1',
        VITE_SITE_URL: 'http://127.0.0.1:5173',
        VITE_STRIPE_PUBLISHABLE_KEY: 'pk_test_placeholder',
      }).map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]),
    ),
  },
  test: {
    include: ['src-test/unit-test/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./src-test/unit-test/setup.ts'],
    restoreMocks: true,
    clearMocks: true,
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
