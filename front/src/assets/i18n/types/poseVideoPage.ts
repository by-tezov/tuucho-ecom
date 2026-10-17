/** The page that exists so one demo video can be the main content of a URL
 * of its own — the "watch page" Google requires before it will treat an
 * embed as a video result. See config/poseVideos.ts. */
export interface PoseVideoPageStrings {
  /** Heading over the written steps that accompany the video. */
  stepsTitle: string;
  stepsSub: string;
  /** Primary call to action. Its destination depends on viewport width, so
   * the wording has to work for both the home page and the gallery. */
  ctaShop: string;
  /** Secondary call to action, back to the full guide. */
  ctaGuide: string;
  /** Introduces the link to the other application method's video. */
  alsoWatch: string;
}
