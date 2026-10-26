import type { AccountEmailCopy } from '@kernel/back/modules/messaging/application/accountEmailCopyTypes';

/** French account/service email copy. Registered as `account-email:fr`. */
export const ACCOUNT_EMAIL_COPY_FR: AccountEmailCopy = {
  ctaFallbackHint: 'Si le bouton ne fonctionne pas, copiez-collez ce lien dans votre navigateur :',
  contactReply: {
    subject: 'Shop : réponse à votre message',
    title: 'Réponse à votre message',
    hello: 'Bonjour,',
  },
  passwordReset: {
    subject: 'Réinitialisation de votre mot de passe : Shop',
    title: 'Réinitialisation de votre mot de passe',
    intro: 'Une réinitialisation de mot de passe a été demandée pour votre compte Shop.',
    followLink: 'Suivez ce lien pour choisir un nouveau mot de passe :',
    outro: "Ce lien expire dans 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.",
    cta: 'Réinitialiser mon mot de passe',
  },
  loginCode: {
    subject: 'Votre code de connexion : Shop',
    title: 'Votre code de connexion',
    intro: 'Voici le code à 6 chiffres pour continuer sur Shop.',
    codeLabel: 'Code',
    outro:
      "Ce code expire dans 10 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.",
    hint: 'Votre code',
  },
  confirmEmail: {
    subject: 'Confirmez votre adresse email : Shop',
    title: 'Confirmez votre adresse email',
    followLink: 'Confirmez votre adresse email en suivant ce lien :',
    outro: 'Ce lien expire dans 24 heures.',
    cta: 'Confirmer mon adresse email',
  },
  emailChange: {
    subject: 'Changement d’adresse email demandé : Shop',
    title: 'Changement d’adresse email demandé',
    intro: (email) =>
      `Une demande de changement d’adresse email vers ${email} a été effectuée sur votre compte Shop.`,
    outro:
      "Si c'est bien vous, aucune action n'est nécessaire. Si vous n'êtes pas à l'origine de cette demande, verrouillez immédiatement votre compte. Il restera bloqué jusqu'à ce que nous le déverrouillions manuellement après vérification.",
    lockLabel: 'Verrouiller mon compte',
    cta: 'Ce n’est pas moi : verrouiller mon compte',
  },
  superAdminSignIn: {
    subject: 'Connexion super-administrateur : Shop',
    title: 'Connexion à votre compte super-administrateur',
    introSignIn: 'Une connexion vient d’avoir lieu sur votre compte super-administrateur Shop.',
    introResume:
      'Votre session super-administrateur Shop vient d’être reprise automatiquement sur un appareil déjà connecté.',
    when: (value) => `Quand : ${value}`,
    place: (value) => `Lieu : ${value}`,
    ipAddress: (value) => `Adresse IP : ${value}`,
    device: (value) => `Appareil : ${value}`,
    unknown: 'inconnu',
    outro:
      "Si c'est bien vous, aucune action n'est nécessaire. Sinon, verrouillez immédiatement le compte : toutes ses sessions seront fermées, et il restera bloqué jusqu'à ce qu'un autre super-administrateur ou l'opérateur du site le déverrouille.",
    lockLabel: 'Verrouiller le compte',
    cta: 'Ce n’est pas moi : verrouiller le compte',
  },
  deletionRequested: {
    subject: 'Suppression de votre compte planifiée : Shop',
    title: 'Suppression de votre compte planifiée',
    intro: 'Vous avez demandé la suppression de votre compte Shop.',
    outro: (date) =>
      `Votre compte sera définitivement supprimé le ${date} si vous ne vous reconnectez pas d'ici là. Reconnectez-vous à tout moment avant cette date pour annuler la suppression.`,
  },
  deletionReminder: {
    title: 'Votre compte Shop sera bientôt supprimé',
    intro: (days, date) =>
      `Il vous reste ${days} jour(s) avant la suppression définitive de votre compte Shop, prévue le ${date}.`,
    outro: 'Reconnectez-vous avant cette date pour annuler la suppression.',
  },
  invoice: {
    title: (n) => `Votre facture (commande ${n})`,
    intro: (n) => `Vous trouverez ci-joint la facture de votre commande ${n}.`,
    guestIntro: (n, label) =>
      `Vous trouverez ci-joint la facture de votre commande ${n}. Utilisez « ${label} » pour suivre cette commande (lien valable 24 h).`,
    frenchDocumentNote: null,
  },
  orderReceived: {
    title: (n) => `Votre commande ${n} est reçue`,
    subject: (n) => `Commande reçue (${n}) : Shop`,
    intro: 'Votre commande est indiquée comme reçue. Votre facture est disponible dans votre espace commandes.',
    cta: 'Consulter mon historique de commandes',
  },
  productRequest: {
    title: 'Demande produit',
    accepted: 'Bonne nouvelle, votre demande est acceptée.',
    refused: 'Nous ne pouvons malheureusement pas accepter votre demande.',
    acceptedSubject: 'Shop : votre demande est acceptée',
    refusedSubject: 'Shop : réponse à votre demande',
    article: 'Article',
    size: 'Taille',
    quantity: 'Quantité',
    price: 'Prix proposé',
    replyHint: 'Répondez directement à cet e-mail pour continuer l’échange.',
  },
};
