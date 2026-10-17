const HAND_FINGERS = {
  left: ['left-pinky', 'left-ring', 'left-middle', 'left-index', 'left-thumb'],
  right: ['right-thumb', 'right-index', 'right-middle', 'right-ring', 'right-pinky'],
} as const;

/** Same mapping as kernel English: left/right arrays are thumb → pinky. */
function fingers(left: string[], right: string[]): Record<string, string> {
  return Object.fromEntries([
    ...HAND_FINGERS.left.map((finger, index) => [finger, left[4 - index]!]),
    ...HAND_FINGERS.right.map((finger, index) => [finger, right[index]!]),
  ]);
}

export const frCustomSet = {
  handLeft: 'Main gauche',
  handRight: 'Main droite',
  nailCount: '{count} / {max} pieces',
  fingers: fingers(
    ['Pouce gauche', 'Index gauche', 'Majeur gauche', 'Annulaire gauche', 'Auriculaire gauche'],
    ['Pouce droit', 'Index droit', 'Majeur droit', 'Annulaire droit', 'Auriculaire droit'],
  ),
};
