import type { Strings } from '../../types';

export const capsules: Strings['capsules'] = {
  eyebrow: 'Guide des formes',
  title: 'Quelle forme te correspond ?',
  intro:
    'La forme dessine le look, la hauteur decide du quotidien. Chaque forme existe en plusieurs hauteurs.',
  shapesTitle: 'Les formes',
  shapesSub: 'De la plus douce a la plus graphique, chaque silhouette a son caractere.',
  forms: {
    almond: {
      name: 'Ovale allonge',
      desc: 'Silhouette douce, elle allonge la piece sans l alourdir.',
      alt: 'Piece forme ovale allonge',
    },
    oval: {
      name: 'Ovale',
      desc: 'Classique et stable, parfaite pour un rendu discret.',
      alt: 'Piece forme ovale',
    },
    square: {
      name: 'Carree',
      desc: 'Nette et moderne, avec un bord droit.',
      alt: 'Piece forme carree',
    },
    coffin: {
      name: 'Trapeze',
      desc: 'Affinees sur les cotes et droite au bout, pour un look net.',
      alt: 'Piece forme trapeze',
    },
    ballerina: {
      name: 'Evasee',
      desc: 'Effilee puis coupee droit, chic et graphique.',
      alt: 'Piece forme evasee',
    },
    stiletto: {
      name: 'Effilee',
      desc: 'Pointue et audacieuse, pour un vrai statement.',
      alt: 'Piece forme effilee',
    },
  },
  lengthsTitle: 'Les longueurs',
  lengthsSub:
    'Choisis ta forme et ta taille, puis la hauteur : le format suit.',
  lengths: {
    extraShort: {
      name: 'Extra courte',
      desc: 'Le format le plus compact, discret et robuste.',
      alt: 'Piece extra courte',
    },
    short: {
      name: 'Courte',
      desc: 'Compact, pensé pour le quotidien.',
      alt: 'Piece courte',
    },
    medium: {
      name: 'Medium',
      desc: 'Le bon compromis : ça se voit, ça reste confortable. La longueur la plus commandée.',
      alt: 'Piece de hauteur moyenne',
    },
    long: {
      name: 'Longue',
      desc: 'Plus haut, effet presence, prevois un peu d espace.',
      alt: 'Piece haute',
    },
    extra: {
      name: 'Extra longue',
      desc: 'Spectaculaire, pensée pour les shootings et les grandes occasions.',
      alt: 'Piece extra haute',
    },
  },
  lengthsShapeLabel: 'Forme',
  lengthsShapePickerTitle: 'Choisir une forme',
  lengthsTableTitle: 'Les longueurs en millimètres',
  lengthsNote:
    'Valeurs indicatives : la hauteur varie un peu selon la forme choisie.',
  lengthsNoteSizesBefore: 'Consulte le ',
  lengthsNoteSizesLink: 'guide des tailles',
  lengthsNoteSizesAfter: ' pour connaître la largeur.',

  moreNoteBefore:
    'D’autres formes et longueurs existent, je travaille actuellement principalement sur celles-ci. N’hésite pas à ',
  moreNoteLink: 'm’envoyer un message',
  moreNoteAfter: ' pour une demande personnalisée.',
  lengthUnavailable: 'Non disponible',
};
