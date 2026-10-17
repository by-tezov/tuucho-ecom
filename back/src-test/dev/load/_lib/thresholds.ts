import type { Options } from 'k6/options';

/** p95 budget per request family, from how heavy each one is on the server:
 * a catalogue read is one cached query, a checkout takes row locks and writes
 * an order, a crawler route renders the whole catalogue on a cache miss. */
const P95_BUDGET_MS: Record<string, number> = {
  gallery_feed: 300,
  gallery_filter_options: 300,
  gallery_set: 300,
  nail_feed: 300,
  nail_filter_options: 300,
  nail_detail: 300,
  account_cart_get: 400,
  compose_create: 600,
  compose_cart_get: 400,
  checkout_free: 1_000,
  compose_checkout_free: 1_000,
  guest_checkout_free: 1_000,
  gift_offer_create: 1_000,
  gift_receiver_confirm: 1_000,
  gift_giver_checkout_free: 1_000,
  scarce_checkout_free: 1_500,
  twin_checkout_free: 1_500,
  order_invoice: 1_500,
  seo_gallery: 1_500,
  seo_gallery_nail: 1_500,
  seo_product: 800,
  seo_nail: 800,
  sitemap_products: 1_500,
};

/** Fail the run on a 5xx, on an elevated error rate, or on a slow p95 (setup
 * registrations excluded). In the contention profile refusals (400/409) are
 * the expected outcome of losing a race, so the failure-rate guard is the
 * 5xx counter alone. */
export function buildThresholds(
  profile: 'smoke' | 'baseline' | 'contention',
): NonNullable<Options['thresholds']> {
  const perEndpoint = Object.fromEntries(
    Object.entries(P95_BUDGET_MS).map(([name, ms]) => [`http_req_duration{name:${name}}`, [`p(95)<${ms}`]]),
  );
  return {
    server_errors: ['count==0'],
    // Mail-helper wait polls use expectedStatuses(200,404) so they do not
    // inflate this rate. Still prefer the VU-tagged series below as the
    // capacity signal; keep a loose overall guard for unexpected transport errors.
    ...(profile === 'contention'
      ? {}
      : {
          http_req_failed: ['rate<0.05'],
          'http_req_failed{phase:vu}': ['rate<0.01'],
        }),
    // Password hashing during setup() is slow; measure only VU API traffic.
    'http_req_duration{phase:vu}': ['p(95)<800'],
    checks: ['rate>0.99'],
    ...perEndpoint,
  };
}
