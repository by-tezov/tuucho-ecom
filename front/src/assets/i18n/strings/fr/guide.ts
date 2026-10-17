import type { Strings } from '../../types';

export const guide: Strings['guide'] = {
  eyebrow: 'Guide des tailles',
  title: 'Trouve ta taille',
  leadTitle: 'Dans la plupart des cas, une taille standard te convient',
  leadSub:
    'La majorité des pieces correspond à l’une des quatre tailles prêtes-à-porter ci-dessous. Compare simplement la largeur indiquée à l’espace dont tu disposes.',
  customTitle: 'Aucun format standard ne convient ?',
  customSub:
    'Aucun souci, une piece sur mesure est possible. Indique la largeur dont tu as besoin, Lumen te répond.',
  howTitle: 'Comment choisir ton format',
  howSub: 'Méthode du ruban adhésif, précise et sans matériel spécial.',
  steps: [
    {
      n: '1',
      title: 'Pose le ruban',
      desc: 'Compare la largeur indiquée avec l’emplacement prévu pour la piece.',
    },
    {
      n: '2',
      title: 'Marque la largeur',
      desc: 'Avec un stylo fin, trace un trait de chaque côté, à l’endroit le plus large du format, là où il commence à se courber.',
    },
    {
      n: '3',
      title: 'Mesure en mm',
      desc: 'Retire le ruban, pose-le à plat et mesure l’écart entre les deux traits avec une règle. Note la valeur pour chaque dimension.',
    },
  ],
  chartTitle: 'Tableau des tailles standard',
  chartSub: 'Chaque format correspond à une largeur précise. Compare tes mesures à ce tableau.',
  chartNum: 'Taille',
  chartMm: 'Largeur (mm)',
  fingers: ['Mesure 1', 'Mesure 2', 'Mesure 3', 'Mesure 4', 'Mesure 5'],
  ctaOrder: 'Consulter la galerie pour trouver un set qui me convient',
  tipSetsNote: 'Les numéros vont du plus petit au plus grand.',
};
