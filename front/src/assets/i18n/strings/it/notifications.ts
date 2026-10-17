import type { Strings } from '../../types';

export const notifications: Strings['notifications'] = {
  pageTitle: 'Notifiche',
  emailsSectionTitle: 'Email',
  emailsMasterLabel: 'Ricevi email',
  emailsMasterDescription:
    'Il grande interruttore. Off = silenzio totale (tranne reset password e sicurezza critica). On = scegli tu, canale per canale.',
  primaryEmailLabel: 'Indirizzo principale',
  verifiedBadge: 'Verificata',
  unverifiedBadge: 'Non verificata',
  unverifiedBanner:
    'Conferma la tua email per ricevere gli avvisi fun (novità, carrello, preferiti…). Puoi già impostare le tue preferenze qui sotto.',
  loading: 'Caricamento…',
  loadError: 'Impossibile caricare le tue preferenze. Riprova tra un momento.',
  masterDisableConfirmTitle: 'Disattivare tutte le email?',
  masterDisableConfirmMessage:
    'Niente più recap ordini, fatture o avvisi. Potrai comunque accedere e resettare la password.',
  transactionalSectionTitle: 'Ordini & sicurezza',
  marketingSectionTitle: 'Ispirazione & carrello',
  disableConfirmButton: 'Disattiva',
  cancelButton: 'Annulla',
  orderConfirmation: {
    title: 'Conferma dell’ordine',
    description:
      'Il “tutto ok, confermato” subito dopo il pagamento. Un piccolo high-five nella tua casella di posta.',
    disableConfirmTitle: 'Disattivare le conferme d’ordine?',
    disableConfirmMessage:
      'Non riceverai più il recap via email dopo un acquisto. Lo trovi comunque nel tuo account.',
  },
  orderShipped: {
    title: 'Ordine spedito',
    description: 'Il “si parte”, per sapere quando i tuoi set lasciano l’atelier.',
    disableConfirmTitle: 'Disattivare le email di spedizione?',
    disableConfirmMessage:
      'Niente più email quando un ordine viene spedito. Il tracciamento resta disponibile nel tuo account.',
  },
  invoice: {
    title: 'Fattura',
    description: 'La fattura in PDF nella tua casella, comoda per contabilità e rimborsi.',
    disableConfirmTitle: 'Disattivare le fatture via email?',
    disableConfirmMessage: 'Potrai comunque scaricare le tue fatture dai tuoi ordini.',
  },
  security: {
    title: 'Avvisi di sicurezza',
    description:
      'I digest di sicurezza facoltativi. Le cose critiche (blocco, reset password) vengono sempre inviate comunque.',
    disableConfirmTitle: 'Disattivare gli avvisi di sicurezza facoltativi?',
    disableConfirmMessage: 'Reset password, blocco account e cancellazione restano sempre attivi.',
  },
  chatReply: {
    title: 'Risposte della chat',
    description: 'Ricevi un’e-mail quando Lumen risponde mentre non stai consultando la conversazione.',
    disableConfirmTitle: 'Disattivare le notifiche della chat?',
    disableConfirmMessage: 'Potrai continuare a leggere le risposte nella tua conversazione.',
  },
  loyaltyExpiry: {
    title: 'Loyalty expiry reminder',
    description: 'A heads-up before your loyalty credit expires.',
    disableConfirmTitle: 'Turn off loyalty expiry reminders?',
    disableConfirmMessage: 'You may lose credit without a reminder before the expiry date.',
  },
  nouveautes: {
    title: 'Novità',
    description: 'Nuovi arrivi in galleria. Per non perderti il set che ti fa l’occhiolino.',
    disableConfirmTitle: 'Disattivare le novità?',
    disableConfirmMessage: 'Non riceverai più un ping quando arrivano nuovi set.',
  },
  cartReminder: {
    title: 'Carrello in attesa',
    description:
      'Un piccolo promemoria chill se hai lasciato delle unghie nel carrello. Niente spam aggressivo.',
    disableConfirmTitle: 'Disattivare i promemoria del carrello?',
    disableConfirmMessage: 'Non ti ricorderemo più il carrello non finalizzato.',
  },
  favoriteSold: {
    title: 'Preferito venduto',
    description: 'Il tuo crush se n’è appena andato. Così sai che non era un bug di magazzino.',
    disableConfirmTitle: 'Disattivare gli avvisi sui preferiti venduti?',
    disableConfirmMessage: 'Non sarai più avvisatə quando un preferito va esaurito.',
  },
  favoriteRestock: {
    title: 'Preferito di ritorno',
    description: 'Colpo di scena: è tornato. Te lo diciamo subito prima che sparisca di nuovo.',
    disableConfirmTitle: 'Disattivare gli avvisi di rientro in stock?',
    disableConfirmMessage: 'Niente più avviso quando un preferito torna disponibile.',
  },
  promo: {
    title: 'Offerte & codici',
    description: 'Le vere occasioni (codici, drop). Rare, non una newsletter ogni lunedì.',
    disableConfirmTitle: 'Disattivare le offerte?',
    disableConfirmMessage: 'Non riceverai più codici e promozioni via email.',
  },
};
