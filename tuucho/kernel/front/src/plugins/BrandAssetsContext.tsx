import { createContext, useContext, type ReactNode } from 'react';
import { useStorefrontBootstrap } from './StorefrontBootstrap';

/** Overridable static brand artwork keys. Each maps to a kernel demo image
 * (the default when no override is set): `src/assets/images/manifest.ts` and
 * `src/assets/images/onboarding/manifest.ts`. A plugin replaces one by putting
 * an absolute image URL under the same key in the bootstrap `brandAssets`
 * record (via the `storefront.bootstrap` filter). */
export const BRAND_ASSET_KEYS = [
  'favicon',
  'ogImage',
  'lockProbe',
  'hero',
  'aboutPortrait',
  'aboutDesk',
  'aboutColor1',
  'aboutColor2',
  'aboutColor3',
  'guideMeasureStep1',
  'guideMeasureStep2',
  'guideMeasureStep3',
  'guideSizeChart',
  'poseKit',
  'posePrep1',
  'posePrep2',
  'posePrep3',
  'posePrep4Glue',
  'posePrep4Patch',
  'posePrep5',
  'poseVideoPoster',
  'onboardingHandmade',
  'onboardingCustom',
  'onboardingLoyalty',
  'onboardingDeals',
] as const;

/** Kernel public/ fallbacks when no bootstrap override is set. Paths are
 * site-root relative; callers that need an absolute URL prefix with siteUrl. */
export const BRAND_ASSET_DEFAULTS: Record<
  'favicon' | 'ogImage' | 'lockProbe',
  string
> = {
  favicon: '/favicon.svg',
  ogImage: '/og-image.jpg',
  lockProbe: '/lock-probe.jpg',
};

export type BrandAssetKey = (typeof BRAND_ASSET_KEYS)[number];

/** Override resolution: a non-empty override URL wins, the kernel default
 * otherwise. Pure so the rule is unit-testable without rendering. */
export function resolveBrandAsset(
  assets: Record<string, string>,
  key: BrandAssetKey,
  kernelDefault: string,
): string {
  const override = assets[key];
  return typeof override === 'string' && override.trim() ? override : kernelDefault;
}

/** Explicit overrides win over the bootstrap payload when both exist — the
 * provider form is how tests (or a host surface) pin assets without a
 * bootstrap fetch. */
const BrandAssetsContext = createContext<Record<string, string> | null>(null);

export function BrandAssetsProvider({
  assets,
  children,
}: {
  assets: Record<string, string>;
  children: ReactNode;
}) {
  return <BrandAssetsContext.Provider value={assets}>{children}</BrandAssetsContext.Provider>;
}

/** The raw override record (explicit provider first, else bootstrap). */
export function useBrandAssets(): Record<string, string> {
  const pinned = useContext(BrandAssetsContext);
  const bootstrap = useStorefrontBootstrap();
  return pinned ?? bootstrap.brandAssets ?? {};
}

/** Override URL for `key`, or undefined when the kernel default stays. */
export function useBrandAsset(key: BrandAssetKey): string | undefined {
  const override = useBrandAssets()[key];
  return typeof override === 'string' && override.trim() ? override : undefined;
}
