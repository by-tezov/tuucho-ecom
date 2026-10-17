/**
 * The two application demos, each of which gets its own page.
 *
 * Why a page per video: Search Console reported both embeds under "Video is
 * not on a watch page". Google will only turn a video into a video result
 * when it can point at a page whose *main* content is that one video, and
 * `/pose` is a full guide with a kit section, prep steps, removal steps and
 * two players on it. The guide stays exactly as it is; these pages exist
 * beside it, each holding one video, its own title, its own description and
 * the written steps that match it.
 *
 * French slugs on purpose. The path is shared by every locale (`/en/pose-colle`
 * as much as `/fr/pose-colle`), and French is the market these rank in, the
 * default language, and already the convention for `/pose` and `/creations`.
 *
 * Flat, hyphenated, NOT nested under `/pose/`. The deploy serves a clean URL
 * by appending `.html` to it (public/.htaccess), so `/fr/pose/colle` would
 * need a `fr/pose/` directory sitting beside the `fr/pose.html` snapshot,
 * and Apache's `!-d` guard on that same rule would then stop serving the
 * guide page itself. `/sales-terms` sets the same hyphenated precedent, and
 * the hierarchy a nested path would have expressed is stated outright by the
 * BreadcrumbList in utils/pageSeo.ts.
 *
 * Deliberately import-free so every consumer can use it without dragging in
 * config or i18n: App.tsx's routes, prerenderedPaths.ts, entry-server.tsx's
 * page list, i18nRoutes.ts's localizable paths, utils/pageSeo.ts's structured
 * data and the page component itself all read this one list.
 */

export type PoseVideoVariant = 'glue' | 'patch';

export interface PoseVideoRoute {
  variant: PoseVideoVariant;
  /** Unprefixed route identity, the form `Seo`/`staticPageJsonLd` take. */
  path: string;
  /** Prerender output, written under `<lang>/` like every other page. */
  file: string;
}

export const POSE_VIDEOS: readonly PoseVideoRoute[] = [
  { variant: 'glue', path: '/pose-colle', file: 'pose-colle.html' },
  { variant: 'patch', path: '/pose-patch', file: 'pose-patch.html' },
];

export function poseVideoRoute(variant: PoseVideoVariant): PoseVideoRoute {
  const route = POSE_VIDEOS.find((candidate) => candidate.variant === variant);
  if (!route) throw new Error(`poseVideoRoute: no route for variant "${variant}"`);
  return route;
}

/** The other demo, for the cross-link each page carries to its sibling. */
export function otherPoseVideo(variant: PoseVideoVariant): PoseVideoRoute {
  return poseVideoRoute(variant === 'glue' ? 'patch' : 'glue');
}
