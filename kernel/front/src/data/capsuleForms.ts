import { shapeOrder } from './capsuleLengthTable';

/** The nail-tip shapes offered. The client chooses the shape only. Each
 *  shape's photo is a single flat file, named after the shape: drop
 *  src/assets/images/guide-capsule/shape/<shape>.{jpg,jpeg,png,webp} in and
 *  swapping the photo is just overwriting that file. */
export const CAPSULE_FORM_KEYS = ['almond', 'ballerina', 'coffin', 'oval', 'square', 'stiletto'] as const;

export type CapsuleFormKey = (typeof CAPSULE_FORM_KEYS)[number];

export interface CapsuleForm {
  key: CapsuleFormKey;
  image: string;
}

// File shape: src/assets/images/guide-capsule/shape/<shape>.{jpg,jpeg,png,webp}
const formModules = import.meta.glob<string>('../assets/images/guide-capsule/shape/*.{jpg,jpeg,png,webp}', {
  eager: true,
  import: 'default',
});

/** '../assets/images/guide-capsule/shape/almond.jpg' -> 'almond' */
function formKey(path: string): string {
  return /\/shape\/([^/.]+)\.[^./]+$/.exec(path)?.[1] ?? path;
}

const byForm = new Map(Object.entries(formModules).map(([path, url]) => [formKey(path), url]));

/** Display order: the shape order of guide-capsule-length.json, then any
 *  shape missing from it in key order. Forms with no photo are dropped.
 *  Names, descriptions and alt text are localized (capsules.forms[key]). */
const displayOrder: CapsuleFormKey[] = [
  ...shapeOrder.filter((key) => CAPSULE_FORM_KEYS.includes(key)),
  ...CAPSULE_FORM_KEYS.filter((key) => !shapeOrder.includes(key)),
];

export const capsuleForms: CapsuleForm[] = displayOrder
  .map((key) => ({
    key,
    image: byForm.get(key) ?? '',
  }))
  .filter((form) => form.image);
