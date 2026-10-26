const HAND_FINGERS = {
  left: ['left-pinky', 'left-ring', 'left-middle', 'left-index', 'left-thumb'],
  right: ['right-thumb', 'right-index', 'right-middle', 'right-ring', 'right-pinky'],
} as const;

function fingers(left: string[], right: string[]): Record<string, string> {
  return Object.fromEntries([
    ...HAND_FINGERS.left.map((finger, index) => [finger, left[4 - index]!]),
    ...HAND_FINGERS.right.map((finger, index) => [finger, right[index]!]),
  ]);
}

export const enCustomSet = {
    handLeft: 'Left hand',
    handRight: 'Right hand',
    nailCount: '{count} / {max} nails',
    fingers: fingers(
      ['Left thumb', 'Left index', 'Left middle', 'Left ring', 'Left pinky'],
      ['Right thumb', 'Right index', 'Right middle', 'Right ring', 'Right pinky'],
    ),
  };
