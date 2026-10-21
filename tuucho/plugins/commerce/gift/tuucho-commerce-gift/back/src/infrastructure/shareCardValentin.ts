interface ShareRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Tip of the Saint-Valentin heart, in the 500×300 art viewBox. */
export const VALENTIN_HEART_BOTTOM = 126 / 300;

export function valentinPackEndCopyBox(rect: ShareRect, pad: [number, number, number, number]): ShareRect {
  const [pt, pr, pb, pl] = pad;
  const padT = (rect.w * pt) / 100;
  const padR = (rect.w * pr) / 100;
  const padB = (rect.w * pb) / 100;
  const padL = (rect.w * pl) / 100;
  const qrSize = (rect.w * 25) / 100;
  const colGap = (rect.w * 4) / 100;
  const headerH = (rect.w * 3.4) / 100;
  const innerH = rect.h - padT - padB;
  return {
    x: rect.x + padL,
    y: rect.y + padT + headerH,
    w: rect.w - padL - padR - qrSize - colGap,
    h: innerH - headerH - (rect.w * 3.6) / 100 - (rect.w * 1) / 100,
  };
}

export function valentinHeartLiftSvg(nameTop: number, rect: ShareRect): number {
  const gap = (rect.w * 1.6) / 100;
  const heartBottom = rect.y + rect.h * VALENTIN_HEART_BOTTOM;
  const liftPt = Math.max(0, heartBottom + gap - nameTop);
  const liftSvg = (liftPt / rect.h) * 300;
  return Math.min(80, liftSvg);
}

export function withValentinHeartLift(svg: string, liftSvg: number): string {
  if (liftSvg <= 0.05) return svg;
  return svg.replace(
    'class="valentin-heart"',
    `class="valentin-heart" transform="translate(0 ${(-liftSvg).toFixed(2)})"`,
  );
}
