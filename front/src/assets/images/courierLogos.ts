/**
 * Real courier logos, keyed by courier code — see `couriers/README.md`.
 *
 * Globbed rather than imported one by one on purpose: couriers are
 * server/env-configured (see `utils/courierBadge.ts`), so this front-end
 * can't hold a fixed list of them. Dropping `<code>.svg` in `couriers/`
 * is enough to give that courier a logo; a courier with no file here keeps
 * the initials badge, which is what `CourierLogo` falls back to.
 */
const files = import.meta.glob('./couriers/*.{svg,png,webp,jpg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export const courierLogos: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.replace(/^.*\/(.+)\.[^.]+$/, '$1').toLowerCase(), url]),
);

export function courierLogoUrl(courierCode: string): string | undefined {
  return courierLogos[courierCode.toLowerCase()];
}
