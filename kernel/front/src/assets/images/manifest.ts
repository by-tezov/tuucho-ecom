import hero from './hero/hero.webp';
import aboutPortrait from './about/portrait.webp';
import aboutDesk from './about/desk.webp';
import aboutColor1 from './about/color-1.webp';
import aboutColor2 from './about/color-2.webp';
import aboutColor3 from './about/color-3.webp';
import measureStep1 from './guide-size/measure-step-1.webp';
import measureStep2 from './guide-size/measure-step-2.webp';
import measureStep3 from './guide-size/measure-step-3.webp';
import sizeChart from './guide-size/size-chart.webp';
import poseKit from './guide-pose/kit.webp';
import posePrep1 from './guide-pose/prep-1.webp';
import posePrep2 from './guide-pose/prep-2.webp';
import posePrep3 from './guide-pose/prep-3.webp';
import posePrep4Glue from './guide-pose/prep-4-glue.webp';
import posePrep4Patch from './guide-pose/prep-4-patch.webp';
import posePrep5 from './guide-pose/prep-5.webp';
import poseVideoPoster from './guide-pose/video-poster.jpg';

/**
 * Fixed one-off image slots. For the large images imported as WebP, the
 * original JPG/PNG files are editable sources; run `npm run assets:optimize`
 * after replacing one to refresh its delivery asset.
 * The gallery photos are handled separately, served by kernel/back's API
 * (src/api/gallery.ts fetches them) — not part of this manifest.
 * Onboarding artwork lives in `onboarding/manifest.ts` so it stays out of the
 * entry chunk used by prerendered pages.
 */
export const images = {
  hero,
  aboutPortrait,
  about: {
    desk: aboutDesk,
    colors: [aboutColor1, aboutColor2, aboutColor3] as [string, string, string],
  },
  // Shape photos (data/capsuleForms.ts) and shape-length photos
  // (data/capsuleLengths.ts) are both folder-driven, not part of this manifest.
  guide: {
    measureSteps: [measureStep1, measureStep2, measureStep3] as [string, string, string],
    sizeChart,
  },
  pose: {
    kit: poseKit,
    // prep-4-patch is a placeholder duplicate of prep-4-glue ("avec colle") until a dedicated "avec patch" photo is shot.
    prep: [posePrep1, posePrep2, posePrep3, posePrep4Glue, posePrep4Patch, posePrep5] as [
      string,
      string,
      string,
      string,
      string,
      string,
    ],
    videoPoster: poseVideoPoster,
  },
};
