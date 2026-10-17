import { shopConfig } from '../config/env';
import type { Strings } from '../assets/i18n';
import type { PoseStepStrings } from '../assets/i18n/types';
import type { PoseVideoVariant } from '../config/poseVideos';

/**
 * Everything one demo needs, gathered from the two places it is split
 * across: the video's identity in config (env, because the URL and the
 * upload date change together when the video is re-uploaded) and its copy in
 * the dictionary. Shared by the watch page, the player on `/pose` and the
 * VideoObject markup so all three always describe the same video.
 */
export interface PoseVideoContent {
  /** YouTube share URL as copied out of YouTube; empty ⇒ placeholder. */
  shareUrl: string;
  /** ISO 8601 timestamp with offset, or empty when not configured. */
  uploadDate: string;
  /** ISO 8601 duration ("PT1M27S"), or empty when not configured. */
  duration: string;
  /** Short label beside the player on `/pose` ("Avec colle"). */
  label: string;
  /** Full subject, used as the watch page's H1, `<title>` and VideoObject
   * `name` — a watch page's heading should be the video's own title. */
  name: string;
  description: string;
  /** Nav-length title for a list of site pages (e.g. the plan-du-site) —
   * `name` is too long there. */
  shortTitle: string;
}

export function poseVideoContent(variant: PoseVideoVariant, t: Strings): PoseVideoContent {
  return variant === 'glue'
    ? {
        shareUrl: shopConfig.poseVideoGlueUrl,
        uploadDate: shopConfig.poseVideoGlueUploadDate,
        duration: shopConfig.poseVideoGlueDuration,
        label: t.pose.videoGlueLabel,
        name: t.pose.videoGlueName,
        description: t.pose.videoGlueDesc,
        shortTitle: t.pose.videoGlueShortTitle,
      }
    : {
        shareUrl: shopConfig.poseVideoPatchUrl,
        uploadDate: shopConfig.poseVideoPatchUploadDate,
        duration: shopConfig.poseVideoPatchDuration,
        label: t.pose.videoPatchLabel,
        name: t.pose.videoPatchName,
        description: t.pose.videoPatchDesc,
        shortTitle: t.pose.videoPatchShortTitle,
      };
}

/**
 * The prep steps that apply to one demo: every shared step, plus that
 * variant's own step 4, minus the other variant's.
 *
 * `/pose` shows all of them (two steps deliberately share the number "4");
 * a watch page shows only the path its video actually follows, which is what
 * makes each page's text genuinely different rather than a near-duplicate of
 * its sibling. The index is carried through because PosePrep's photos are
 * positional (`images.pose.prep[i]`).
 */
export function poseStepsFor(
  variant: PoseVideoVariant,
  t: Strings,
): { step: PoseStepStrings; index: number }[] {
  return t.pose.steps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => step.variant === undefined || step.variant === variant);
}
