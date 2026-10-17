import type { AccountEmailCopy } from './accountEmailCopyTypes.js';

/** French, English and Spanish copy of the account emails (accountEmails.ts). */
export const ACCOUNT_EMAIL_COPY_FR: AccountEmailCopy = {
  ctaFallbackHint: 'Si le bouton ne fonctionne pas, copiez-collez ce lien dans votre navigateur :',
  contactReply: {
    subject: 'Lumen : réponse à votre message',
    title: 'Réponse à votre message',
    hello: 'Bonjour,',
  },
  passwordReset: {
    subject: 'Réinitialisation de votre mot de passe : Lumen',
    title: 'Réinitialisation de votre mot de passe',
    intro: 'Une réinitialisation de mot de passe a été demandée pour votre compte Lumen.',
    followLink: 'Suivez ce lien pour choisir un nouveau mot de passe :',
    outro: "Ce lien expire dans 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.",
    cta: 'Réinitialiser mon mot de passe',
  },
  loginCode: {
    subject: 'Votre code de connexion : Lumen',
    title: 'Votre code de connexion',
    intro: 'Voici le code à 6 chiffres pour continuer sur Lumen.',
    codeLabel: 'Code',
    outro:
      "Ce code expire dans 10 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.",
    hint: 'Votre code',
  },
  confirmEmail: {
    subject: 'Confirmez votre adresse email : Lumen',
    title: 'Confirmez votre adresse email',
    followLink: 'Confirmez votre adresse email en suivant ce lien :',
    outro: 'Ce lien expire dans 24 heures.',
    cta: 'Confirmer mon adresse email',
  },
  emailChange: {
    subject: 'Changement d’adresse email demandé : Lumen',
    title: 'Changement d’adresse email demandé',
    intro: (email) =>
      `Une demande de changement d’adresse email vers ${email} a été effectuée sur votre compte Lumen.`,
    outro:
      "Si c'est bien vous, aucune action n'est nécessaire. Si vous n'êtes pas à l'origine de cette demande, verrouillez immédiatement votre compte. Il restera bloqué jusqu'à ce que nous le déverrouillions manuellement après vérification.",
    lockLabel: 'Verrouiller mon compte',
    cta: 'Ce n’est pas moi : verrouiller mon compte',
  },
  superAdminSignIn: {
    subject: "Connexion super-administrateur : Lumen",
    title: "Connexion à votre compte super-administrateur",
    introSignIn: "Une connexion vient d’avoir lieu sur votre compte super-administrateur Lumen.",
    introResume: "Votre session super-administrateur Lumen vient d’être reprise automatiquement sur un appareil déjà connecté.",
    when: (value) => `Quand : ${value}`,
    place: (value) => `Lieu : ${value}`,
    ipAddress: (value) => `Adresse IP : ${value}`,
    device: (value) => `Appareil : ${value}`,
    unknown: "inconnu",
    outro: "Si c'est bien vous, aucune action n'est nécessaire. Sinon, verrouillez immédiatement le compte : toutes ses sessions seront fermées, et il restera bloqué jusqu'à ce qu'un autre super-administrateur ou l'opérateur du site le déverrouille.",
    lockLabel: "Verrouiller le compte",
    cta: "Ce n’est pas moi : verrouiller le compte",
  },
  deletionRequested: {
    subject: 'Suppression de votre compte planifiée : Lumen',
    title: 'Suppression de votre compte planifiée',
    intro: 'Vous avez demandé la suppression de votre compte Lumen.',
    outro: (date) =>
      `Votre compte sera définitivement supprimé le ${date} si vous ne vous reconnectez pas d'ici là. Reconnectez-vous à tout moment avant cette date pour annuler la suppression.`,
  },
  deletionReminder: {
    title: 'Votre compte Lumen sera bientôt supprimé',
    intro: (days, date) =>
      `Il vous reste ${days} jour(s) avant la suppression définitive de votre compte Lumen, prévue le ${date}.`,
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
    subject: (n) => `Commande reçue (${n}) : Lumen`,
    intro:
      'Votre commande est indiquée comme reçue. Votre facture est disponible dans votre espace commandes.',
    cta: 'Consulter mon historique de commandes',
  },
  productRequest: {
    title: 'Demande produit',
    accepted: 'Bonne nouvelle, votre demande est acceptée.',
    refused: 'Nous ne pouvons malheureusement pas accepter votre demande.',
    acceptedSubject: 'Lumen : votre demande est acceptée',
    refusedSubject: 'Lumen : réponse à votre demande',
    article: 'Article',
    size: 'Taille',
    quantity: 'Quantité',
    price: 'Prix proposé',
    replyHint: 'Répondez directement à cet e-mail pour continuer l’échange.',
  },
};

export const ACCOUNT_EMAIL_COPY_EN: AccountEmailCopy = {
  ctaFallbackHint: 'If the button does not work, copy and paste this link into your browser:',
  contactReply: {
    subject: 'Lumen: reply to your message',
    title: 'Reply to your message',
    hello: 'Hello,',
  },
  passwordReset: {
    subject: 'Reset your password: Lumen',
    title: 'Reset your password',
    intro: 'A password reset was requested for your Lumen account.',
    followLink: 'Follow this link to choose a new password:',
    outro: 'This link expires in 1 hour. If you did not make this request, ignore this email.',
    cta: 'Reset my password',
  },
  loginCode: {
    subject: 'Your sign-in code: Lumen',
    title: 'Your sign-in code',
    intro: 'Here is the 6-digit code to continue on Lumen.',
    codeLabel: 'Code',
    outro: 'This code expires in 10 minutes. If you did not make this request, ignore this email.',
    hint: 'Your code',
  },
  confirmEmail: {
    subject: 'Confirm your email address: Lumen',
    title: 'Confirm your email address',
    followLink: 'Confirm your email address by following this link:',
    outro: 'This link expires in 24 hours.',
    cta: 'Confirm my email address',
  },
  emailChange: {
    subject: 'Email address change requested: Lumen',
    title: 'Email address change requested',
    intro: (email) => `A request to change the email address of your Lumen account to ${email} was made.`,
    outro:
      'If this was you, nothing more is needed. If you did not make this request, lock your account right away. It will stay locked until we unlock it by hand after checking.',
    lockLabel: 'Lock my account',
    cta: 'This was not me: lock my account',
  },
  superAdminSignIn: {
    subject: "Super administrator sign-in: Lumen",
    title: "Sign-in to your super administrator account",
    introSignIn: "Someone just signed in to your Lumen super administrator account.",
    introResume: "Your Lumen super administrator session was just resumed automatically on a device that was already signed in.",
    when: (value) => `When: ${value}`,
    place: (value) => `Location: ${value}`,
    ipAddress: (value) => `IP address: ${value}`,
    device: (value) => `Device: ${value}`,
    unknown: "unknown",
    outro: "If this was you, nothing more is needed. If not, lock the account right away: all its sessions will be closed, and it will stay locked until another super administrator or the site operator unlocks it.",
    lockLabel: "Lock the account",
    cta: "This was not me: lock the account",
  },
  deletionRequested: {
    subject: 'Your account deletion is scheduled: Lumen',
    title: 'Your account deletion is scheduled',
    intro: 'You asked for your Lumen account to be deleted.',
    outro: (date) =>
      `Your account will be permanently deleted on ${date} unless you sign in again before then. Sign in at any time before that date to cancel the deletion.`,
  },
  deletionReminder: {
    title: 'Your Lumen account will soon be deleted',
    intro: (days, date) =>
      `${days} day(s) are left before your Lumen account is permanently deleted, on ${date}.`,
    outro: 'Sign in before that date to cancel the deletion.',
  },
  invoice: {
    title: (n) => `Your invoice (order ${n})`,
    intro: (n) => `Please find attached the invoice for your order ${n}.`,
    guestIntro: (n, label) =>
      `Please find attached the invoice for your order ${n}. Use "${label}" to follow this order (link valid for 24 hours).`,
    frenchDocumentNote: 'The invoice is issued in French, as French law requires.',
  },
  orderReceived: {
    title: (n) => `Your order ${n} has been received`,
    subject: (n) => `Order received (${n}): Lumen`,
    intro: 'Your order is marked as received. Your invoice is available in your orders area.',
    cta: 'View my order history',
  },
  productRequest: {
    title: 'Product request',
    accepted: 'Good news, your request has been accepted.',
    refused: 'Unfortunately we cannot accept your request.',
    acceptedSubject: 'Lumen: your request has been accepted',
    refusedSubject: 'Lumen: reply to your request',
    article: 'Item',
    size: 'Size',
    quantity: 'Quantity',
    price: 'Proposed price',
    replyHint: 'Reply directly to this email to continue the conversation.',
  },
};

export const ACCOUNT_EMAIL_COPY_ES: AccountEmailCopy = {
  ctaFallbackHint: 'Si el botón no funciona, copie y pegue este enlace en su navegador:',
  contactReply: {
    subject: 'Lumen: respuesta a su mensaje',
    title: 'Respuesta a su mensaje',
    hello: 'Hola:',
  },
  passwordReset: {
    subject: 'Restablecer su contraseña: Lumen',
    title: 'Restablecer su contraseña',
    intro: 'Se ha solicitado restablecer la contraseña de su cuenta Lumen.',
    followLink: 'Siga este enlace para elegir una nueva contraseña:',
    outro: 'Este enlace caduca en 1 hora. Si no ha hecho esta solicitud, ignore este correo.',
    cta: 'Restablecer mi contraseña',
  },
  loginCode: {
    subject: 'Su código de acceso: Lumen',
    title: 'Su código de acceso',
    intro: 'Este es el código de 6 cifras para continuar en Lumen.',
    codeLabel: 'Código',
    outro: 'Este código caduca en 10 minutos. Si no ha hecho esta solicitud, ignore este correo.',
    hint: 'Su código',
  },
  confirmEmail: {
    subject: 'Confirme su dirección de correo: Lumen',
    title: 'Confirme su dirección de correo',
    followLink: 'Confirme su dirección de correo siguiendo este enlace:',
    outro: 'Este enlace caduca en 24 horas.',
    cta: 'Confirmar mi dirección de correo',
  },
  emailChange: {
    subject: 'Cambio de dirección de correo solicitado: Lumen',
    title: 'Cambio de dirección de correo solicitado',
    intro: (email) => `Se ha solicitado cambiar la dirección de correo de su cuenta Lumen a ${email}.`,
    outro:
      'Si ha sido usted, no tiene que hacer nada. Si no ha hecho esta solicitud, bloquee su cuenta de inmediato. Seguirá bloqueada hasta que la desbloqueemos manualmente tras comprobarlo.',
    lockLabel: 'Bloquear mi cuenta',
    cta: 'No he sido yo: bloquear mi cuenta',
  },
  superAdminSignIn: {
    subject: "Inicio de sesión de superadministrador: Lumen",
    title: "Inicio de sesión en su cuenta de superadministrador",
    introSignIn: "Se acaba de iniciar sesión en su cuenta de superadministrador de Lumen.",
    introResume: "Su sesión de superadministrador de Lumen se acaba de reanudar automáticamente en un dispositivo que ya estaba conectado.",
    when: (value) => `Cuándo: ${value}`,
    place: (value) => `Lugar: ${value}`,
    ipAddress: (value) => `Dirección IP: ${value}`,
    device: (value) => `Dispositivo: ${value}`,
    unknown: "desconocido",
    outro: "Si ha sido usted, no tiene que hacer nada. Si no, bloquee la cuenta de inmediato: se cerrarán todas sus sesiones y seguirá bloqueada hasta que otro superadministrador o el operador del sitio la desbloquee.",
    lockLabel: "Bloquear la cuenta",
    cta: "No he sido yo: bloquear la cuenta",
  },
  deletionRequested: {
    subject: 'Eliminación de su cuenta programada: Lumen',
    title: 'Eliminación de su cuenta programada',
    intro: 'Ha solicitado eliminar su cuenta Lumen.',
    outro: (date) =>
      `Su cuenta se eliminará definitivamente el ${date} si no vuelve a iniciar sesión antes. Inicie sesión en cualquier momento antes de esa fecha para cancelar la eliminación.`,
  },
  deletionReminder: {
    title: 'Su cuenta Lumen se eliminará pronto',
    intro: (days, date) =>
      `Quedan ${days} día(s) antes de la eliminación definitiva de su cuenta Lumen, prevista el ${date}.`,
    outro: 'Inicie sesión antes de esa fecha para cancelar la eliminación.',
  },
  invoice: {
    title: (n) => `Su factura (pedido ${n})`,
    intro: (n) => `Adjuntamos la factura de su pedido ${n}.`,
    guestIntro: (n, label) =>
      `Adjuntamos la factura de su pedido ${n}. Use «${label}» para seguir este pedido (enlace válido 24 horas).`,
    frenchDocumentNote: 'La factura se emite en francés, como exige la ley francesa.',
  },
  orderReceived: {
    title: (n) => `Su pedido ${n} se ha recibido`,
    subject: (n) => `Pedido recibido (${n}): Lumen`,
    intro: 'Su pedido figura como recibido. Su factura está disponible en su espacio de pedidos.',
    cta: 'Ver mi historial de pedidos',
  },
  productRequest: {
    title: 'Solicitud de producto',
    accepted: 'Buenas noticias, su solicitud ha sido aceptada.',
    refused: 'Lamentablemente no podemos aceptar su solicitud.',
    acceptedSubject: 'Lumen: su solicitud ha sido aceptada',
    refusedSubject: 'Lumen: respuesta a su solicitud',
    article: 'Artículo',
    size: 'Talla',
    quantity: 'Cantidad',
    price: 'Precio propuesto',
    replyHint: 'Responda directamente a este correo para continuar la conversación.',
  },
};
