import type { Strings } from '../../types';

export const guide: Strings['guide'] = {
  eyebrow: 'Size guide',
  title: 'Find your size',
  leadTitle: 'Most of the time, a standard size fits you',
  leadSub:
    'Most pieces match one of the four ready-to-wear sizes below. Compare the listed width with the space you have.',
  customTitle: 'None of the standard sizes fit?',
  customSub:
    'No worries: I also make fully custom sets. Write to the atelier with the width you need. A custom format can be made for you.',
  howTitle: 'How to choose your format',
  howSub: 'The tape method, accurate, with no special tools.',
  steps: [
    {
      n: '1',
      title: 'Lay the tape',
      desc: 'Compare the listed width with the space where the piece will sit.',
    },
    {
      n: '2',
      title: 'Mark the width',
      desc: 'With a fine pen, draw a line on each side at the widest point of the format, where it starts to curve.',
    },
    {
      n: '3',
      title: 'Measure in mm',
      desc: 'Remove the tape, lay it flat and measure the gap between the two marks with a ruler. Note the value for each dimension.',
    },
  ],
  chartTitle: 'Standard size chart',
  chartSub: 'Each format matches a precise width. Compare your measurements to this chart.',
  chartNum: 'Size',
  chartMm: 'Width (mm)',
  fingers: ['Measure 1', 'Measure 2', 'Measure 3', 'Measure 4', 'Measure 5'],
  ctaOrder: 'Browse the gallery to find a set that suits me',
  tipSetsNote: 'Numbers go from smallest to largest.',
};
