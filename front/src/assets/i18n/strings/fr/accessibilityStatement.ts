import type { Strings } from '../../types';

export const accessibilityStatement: Strings['accessibilityStatement'] = {
  eyebrow: 'Informations légales',
  title: 'Déclaration d’accessibilité',
  updated: 'Établie le 5 octobre 2026',
  intro:
    'Lumen s’engage à rendre son site accessible à toutes et à tous, conformément au référentiel général d’amélioration de l’accessibilité (RGAA), version 4.1.2. Cette déclaration s’applique à l’ensemble de la boutique en ligne.',
  statusTitle: 'État de conformité',
  statusBody: [
    'Lumen est partiellement conforme au RGAA 4.1.2. Les pages de la boutique suivent les critères du référentiel : navigation au clavier, fenêtres de dialogue, messages lus par les lecteurs d’écran, libellés des champs, contrastes et absence de délais imposés.',
    'Les contenus qui ne sont pas encore accessibles sont listés plus bas.',
  ],
  issuesTitle: 'Contenus non accessibles',
  issuesIntro: 'Les contenus suivants ne sont pas encore accessibles ou dépendent d’un service tiers :',
  issues: [
    'Le choix d’un point relais Mondial Relay passe par un module et une carte fournis par Mondial Relay, difficiles à utiliser au clavier et avec un lecteur d’écran. La livraison à domicile reste possible, et tu peux aussi nous écrire : nous t’aiderons à choisir ton point relais.',
    'L’animation d’ouverture du site et quelques animations décoratives ne peuvent pas être mises en pause depuis la page. Elles s’arrêtent si le réglage « réduire les animations » de ton appareil est activé.',
    'Les champs de paiement par carte et les boutons de paiement express sont fournis par Stripe, dans un cadre dont nous ne maîtrisons pas le contenu.',
    'Les vidéos de démonstration sont hébergées par YouTube ; leurs étapes sont aussi décrites par écrit sur la même page.',
  ],
  preparationTitle: 'Établissement de cette déclaration',
  preparationBody: [
    'Cette déclaration a été établie le 5 octobre 2026.',
    'Technologies utilisées pour la réalisation du site : HTML, CSS, JavaScript et WAI-ARIA.',
  ],
  contactTitle: 'Retour d’information et contact',
  contactBody:
    'Si tu n’arrives pas à accéder à un contenu ou à un service, écris-nous : nous t’orienterons vers une alternative accessible ou t’enverrons le contenu sous une autre forme.',
  contactEmailLabel: 'E-mail',
  contactFormLabel: 'Formulaire',
  contactPageLink: 'Formulaire de contact',
};
