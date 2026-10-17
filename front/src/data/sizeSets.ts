import raw from '../assets/i18n/data/guide-size-chart.json';

const FINGER_KEYS = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const;

export interface SizeSet {
  key: 'XS' | 'S' | 'M' | 'L';
  /** widths in mm for [Thumb, Index, Middle, Ring, Pinky] */
  mm: [number, number, number, number, number];
}

type RawSizeSetEntry = Partial<Record<(typeof FINGER_KEYS)[number], number>>;

const table = raw as unknown as { sets: Partial<Record<SizeSet['key'], RawSizeSetEntry>> };

const SET_KEYS: SizeSet['key'][] = ['XS', 'S', 'M', 'L'];

/** Same size/finger measurements as the size guide's mm table
 *  (assets/i18n/data/guide-size-chart.json — edit that file, not this one). */
export const sizeSets: SizeSet[] = SET_KEYS.filter((key) => key in table.sets).map((key) => {
  const entry = table.sets[key]!;
  return {
    key,
    mm: FINGER_KEYS.map((finger) => entry[finger]!) as SizeSet['mm'],
  };
});
