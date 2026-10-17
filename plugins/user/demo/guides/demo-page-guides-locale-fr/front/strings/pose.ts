import type { Strings } from '@kernel/front/assets/i18n/types';

export const pose: Strings['pose'] = {
  eyebrow: 'Entretien',
  title: 'Prendre soin de tes pieces',
  intro:
    'Chaque piece part de l atelier protegee. Voici comment la recevoir, l installer chez toi et la garder longtemps.',
  kitTitle: 'Ce qui accompagne ta commande',
  kitText:
    'Chaque commande est emballee avec un livret d entretien et le necessaire pour installer ta piece, rien d autre a acheter.',
  kitAlt: 'Le necessaire fourni avec la commande',
  kitIncludes: [
    'Livret d entretien',
    'Chiffon doux',
    'Socle ou support selon le modele',
    'Notice d installation',
  ],
  prepTitle: 'Installer ta piece',
  prepSub: 'Cinq minutes de preparation pour une installation propre.',
  steps: [
    {
      n: '1',
      title: 'Choisir l emplacement',
      desc: 'Pose la piece sur une surface plane, propre et seche, a l abri des chocs.',
    },
    {
      n: '2',
      title: 'Verifier la taille',
      desc: 'Compare le socle ou le format a l espace prevu. Le guide des tailles t aide si besoin.',
    },
    {
      n: '3',
      title: 'Essuyer',
      desc: 'Passe le chiffon doux avant la premiere utilisation.',
    },
    {
      n: '4',
      title: 'Installer',
      desc: 'Place la piece, sans forcer, puis ajuste le support.',
    },
    {
      n: '5',
      title: 'Admirer',
      desc: 'Garde-la a l abri du soleil direct et des sources de chaleur.',
    },
  ],
  videoTitle: 'Shop t explique',
  videoSub: 'Les gestes essentiels, de l ouverture du colis a l installation.',
  videoGlueLabel: 'Installation',
  videoPatchLabel: 'Entretien',
  videoPosterAlt: 'Atelier Shop, installation d une piece',
  videoFallback: 'La video de demonstration arrive bientot.',
  videoGlueName: 'Comment installer une piece artisanale',
  videoGlueDesc:
    'Shop montre comment deballer, installer et entretenir une piece faite main, du socle a la finition.',
  videoPatchName: 'Comment entretenir une piece artisanale',
  videoPatchDesc:
    'Shop montre le nettoyage doux et le rangement d une piece faite main, sans produits agressifs.',
  videoGlueShortTitle: 'Video installation',
  videoPatchShortTitle: 'Video entretien',
  removalTitle: 'Deplacer ou ranger',
  removalSub: 'Soulevee avec soin, ta piece voyage et se range sans casse.',
  removalSteps: [
    {
      n: '1',
      title: 'Saisir par la base',
      desc: 'Prends la piece par le socle, jamais par un detail fragile.',
    },
    {
      n: '2',
      title: 'Emballer',
      desc: 'Utilise le papier d origine pour un transport ou un rangement.',
    },
    {
      n: '3',
      title: 'Ranger',
      desc: 'Un endroit sec, hors gel et hors soleil direct.',
    },
  ],
  removalNote:
    'Ne force jamais un assemblage qui resiste. Reprends le livret ou ecris-nous.',
  removalPatchTitle: 'Nettoyage courant',
  removalPatchText:
    'Un chiffon doux et sec suffit. Evite l eau stagnante et les solvants.',
};
