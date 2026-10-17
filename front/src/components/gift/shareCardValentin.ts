/** Tip of the Saint-Valentin heart, in the 500×300 art viewBox. */
export const VALENTIN_HEART_BOTTOM = 126 / 300;

export function withValentinHeartLift(svg: string, liftSvg: number): string {
  if (liftSvg <= 0.05) return svg;
  return svg.replace(
    'class="valentin-heart"',
    `class="valentin-heart" transform="translate(0 ${(-liftSvg).toFixed(2)})"`,
  );
}
