import type { Strings } from '../../types';

export const guide: Strings['guide'] = {
  eyebrow: 'Guida alle taglie',
  title: 'Trova la tua taglia',
  leadTitle: 'Nella maggior parte dei casi, una taglia standard ti sta bene',
  leadSub:
    'La maggior parte dei pezzi corrisponde a una delle quattro taglie pronte sotto. Confronta la larghezza indicata con lo spazio di cui disponi.',
  customTitle: 'Nessuna taglia standard va bene?',
  customSub:
    'Nessun problema: un pezzo su misura è possibile. Indica la larghezza che ti serve, l atelier ti risponde.',
  howTitle: 'Come scegliere il formato',
  howSub: 'Confronta la larghezza indicata, senza strumenti speciali.',
  steps: [
    {
      n: '1',
      title: 'Applica il nastro',
      desc: 'Incolla un pezzo di nastro trasparente sull’unghia nuda, facendolo aderire bene agli angoli per seguire la curva.',
    },
    {
      n: '2',
      title: 'Segna la larghezza',
      desc: 'Con una penna sottile, traccia un segno su ogni lato, nel punto più largo dell’unghia, dove inizia a curvarsi.',
    },
    {
      n: '3',
      title: 'Misura in mm',
      desc: 'Rimuovi il nastro, appoggialo su una superficie piatta e misura la distanza tra i due segni con un righello. Annota il valore per ogni dito.',
    },
  ],
  chartTitle: 'Tabella delle taglie standard',
  chartSub:
    'Ogni numero di taglia corrisponde a una larghezza precisa. Confronta le tue misure con questa tabella.',
  chartNum: 'Taglia',
  chartMm: 'Larghezza (mm)',
  fingers: ['Misura 1', 'Misura 2', 'Misura 3', 'Misura 4', 'Misura 5'],
  ctaOrder: 'Sfoglia la galleria per trovare un set adatto a me',
  tipSetsNote: 'I numeri vanno dal pollice al mignolo.',
};
