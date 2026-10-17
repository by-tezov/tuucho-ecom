export interface PoseStepStrings {
  n: string;
  title: string;
  desc: string;
  /** Set only on a step that belongs to one application method. Two steps
   * deliberately share the number "4" (glue, adhesive tab); `/pose` shows
   * both, while each video's own page shows only its own (see
   * utils/poseVideo.ts's poseStepsFor). A step without it is shared. */
  variant?: 'glue' | 'patch';
}

export interface PoseStrings {
  eyebrow: string;
  title: string;
  intro: string;
  kitTitle: string;
  kitText: string;
  kitAlt: string;
  kitIncludes: string[];
  prepTitle: string;
  prepSub: string;
  steps: PoseStepStrings[];
  videoTitle: string;
  videoSub: string;
  /** shown above the "with glue" demo video */
  videoGlueLabel: string;
  /** shown above the "with adhesive tab" demo video */
  videoPatchLabel: string;
  videoPosterAlt: string;
  videoFallback: string;
  /** VideoObject `name`/`description` for each demo (utils/pageSeo.ts). Kept
   * apart from the on-page labels above: those sit next to a player that
   * already has a heading, so "Avec colle" is enough, while the structured
   * data has to stand alone in a search result and needs the full subject.
   * Distinct per video, because Google drops videos that share a
   * description. */
  videoGlueName: string;
  videoGlueDesc: string;
  videoPatchName: string;
  videoPatchDesc: string;
  /** Nav-length label for each watch page, used where a list of site pages
   * needs one short line (e.g. the plan-du-site) — the full `*Name` subject
   * is too long there. */
  videoGlueShortTitle: string;
  videoPatchShortTitle: string;
  removalTitle: string;
  removalSub: string;
  removalSteps: PoseStepStrings[];
  removalNote: string;
  /** heading of the boxed callout about removing patch-applied nails, shown below the main (glue) removal steps */
  removalPatchTitle: string;
  removalPatchText: string;
}
