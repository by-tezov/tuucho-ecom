import type { CapsuleFormKey } from './capsuleForms';

/** The lengths a shape can be cut to, shortest first. The guide renders one
 *  hero photo per shape (heroImageForShape below) plus the mm table, not a
 *  photo per length. */
export const CAPSULE_LENGTH_KEYS = ['extraShort', 'short', 'medium', 'long', 'extra'] as const;

export type CapsuleLengthKey = (typeof CAPSULE_LENGTH_KEYS)[number];

export interface CapsuleLengthSpec {
  key: CapsuleLengthKey;
}

/** Every possible length tag. The mm table (data/capsuleLengthTable.ts) only
 *  has values for what is in its own JSON, so it does not depend on this list
 *  being narrowed. */
export const capsuleLengthSpecs: CapsuleLengthSpec[] = CAPSULE_LENGTH_KEYS.map((key) => ({ key }));

// Folder shape: src/assets/images/guide-capsule/hero/<shape>.{jpg,jpeg,png,webp}
// The Lengths section's own carousel photo, one flat file per shape — distinct
// from the shape card's photo (data/capsuleForms.ts, guide-capsule/shape/).
const heroModules = import.meta.glob<string>('../assets/images/guide-capsule/hero/*.{jpg,jpeg,png,webp}', {
  eager: true,
  import: 'default',
});

function heroImagesByShape(): Map<string, string> {
  const byHeroShape = new Map<string, string>();
  for (const [path, url] of Object.entries(heroModules)) {
    const shape = /\/hero\/([^/.]+)\.[^./]+$/.exec(path)?.[1];
    if (shape) byHeroShape.set(shape, url);
  }
  return byHeroShape;
}

const byHeroShape = heroImagesByShape();

/** The Lengths carousel's own photo for a shape, or undefined if none has
 *  been dropped in yet — that shape is simply left out of the carousel. */
export function heroImageForShape(shapeKey: CapsuleFormKey): string | undefined {
  return byHeroShape.get(shapeKey);
}
