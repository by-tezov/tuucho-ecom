import type { Strings } from '../../types';

export const notifications: Strings['notifications'] = {
  pageTitle: 'Meldingen',
  emailsSectionTitle: 'E-mails',
  emailsMasterLabel: 'E-mails ontvangen',
  emailsMasterDescription:
    'De hoofdschakelaar. Uit = radiostilte (behalve wachtwoord resetten en kritieke beveiliging). Aan = jij kiest per kanaal.',
  primaryEmailLabel: 'Primair adres',
  verifiedBadge: 'Geverifieerd',
  unverifiedBadge: 'Niet geverifieerd',
  unverifiedBanner:
    'Bevestig je e-mail om de leuke meldingen te ontvangen (nieuwe drops, winkelwagen, favorieten…). Je kunt je voorkeuren hieronder alvast instellen.',
  loading: 'Laden…',
  loadError: 'Je voorkeuren konden niet worden geladen. Probeer het straks opnieuw.',
  masterDisableConfirmTitle: 'Alle e-mails uitschakelen?',
  masterDisableConfirmMessage:
    'Geen samenvattingen van bestellingen, facturen of meldingen meer. Je kunt nog altijd inloggen en je wachtwoord resetten.',
  transactionalSectionTitle: 'Bestellingen & beveiliging',
  marketingSectionTitle: 'Inspiratie & winkelwagen',
  disableConfirmButton: 'Uitschakelen',
  cancelButton: 'Annuleren',
  orderConfirmation: {
    title: 'Bestelbevestiging',
    description: 'Het “het is in orde, bevestigd” meteen na betaling. Een kleine high-five in je inbox.',
    disableConfirmTitle: 'Bestelbevestigingen uitschakelen?',
    disableConfirmMessage:
      'Je krijgt geen e-mailoverzicht meer na een aankoop. Deze blijft wel in je account staan.',
  },
  orderShipped: {
    title: 'Bestelling verzonden',
    description: 'Het “het is onderweg”-berichtje wanneer je sets het atelier verlaten.',
    disableConfirmTitle: 'Verzendmails uitschakelen?',
    disableConfirmMessage:
      'Geen e-mail meer wanneer een bestelling wordt verzonden. Tracking blijft in je account.',
  },
  invoice: {
    title: 'Factuur',
    description: 'PDF-factuur in je inbox, handig voor uitgaven en terugbetalingen.',
    disableConfirmTitle: 'Factuurmails uitschakelen?',
    disableConfirmMessage: 'Je kunt facturen nog altijd downloaden vanuit je bestellingen.',
  },
  security: {
    title: 'Beveiligingsmeldingen',
    description:
      'Optionele beveiligingsoverzichten. Kritieke zaken (vergrendeling, wachtwoord resetten) worden altijd verstuurd.',
    disableConfirmTitle: 'Optionele beveiligingsmeldingen uitschakelen?',
    disableConfirmMessage:
      'Wachtwoord resetten, accountvergrendeling en verwijdering worden nog altijd verstuurd.',
  },
  chatReply: {
    title: 'Chatreacties',
    description: 'Ontvang een e-mail wanneer Lumen antwoordt terwijl je het gesprek niet bekijkt.',
    disableConfirmTitle: 'Chatmeldingen uitschakelen?',
    disableConfirmMessage: 'Je kunt antwoorden altijd in je gesprek blijven lezen.',
  },
  loyaltyExpiry: {
    title: 'Loyalty expiry reminder',
    description: 'A heads-up before your loyalty credit expires.',
    disableConfirmTitle: 'Turn off loyalty expiry reminders?',
    disableConfirmMessage: 'You may lose credit without a reminder before the expiry date.',
  },
  nouveautes: {
    title: 'Nieuwe aankomsten',
    description: 'Verse drops in de galerij. Zo mis je die ene set niet die alles wint.',
    disableConfirmTitle: 'Nieuwe aankomsten uitschakelen?',
    disableConfirmMessage: 'Je krijgt geen seintje meer als er nieuwe sets binnenkomen.',
  },
  cartReminder: {
    title: 'Winkelwagen wacht',
    description:
      'Een rustig zetje als je stukken in je winkelwagen zijn blijven liggen. Geen opdringerige spam.',
    disableConfirmTitle: 'Winkelwagenherinneringen uitschakelen?',
    disableConfirmMessage: 'We herinneren je niet meer aan een onafgemaakte winkelwagen.',
  },
  favoriteSold: {
    title: 'Favoriet verkocht',
    description: 'Je favoriet is net vertrokken. Zo weet je dat het geen voorraadfoutje was.',
    disableConfirmTitle: 'Meldingen voor verkochte favorieten uitschakelen?',
    disableConfirmMessage: 'Je hoort niet meer wanneer een favoriet is uitverkocht.',
  },
  favoriteRestock: {
    title: 'Favoriet weer op voorraad',
    description: 'Onverwachte wending: hij is terug. We laten het je weten voordat hij weer verdwijnt.',
    disableConfirmTitle: 'Herbevoorradingsmeldingen uitschakelen?',
    disableConfirmMessage: 'Geen melding meer wanneer een favoriet weer beschikbaar is.',
  },
  promo: {
    title: 'Aanbiedingen & codes',
    description: 'De echte deals (codes, drops). Zeldzaam, geen wekelijkse nieuwsbrief.',
    disableConfirmTitle: 'Aanbiedingen uitschakelen?',
    disableConfirmMessage: 'Je ontvangt geen kortingscodes meer per e-mail.',
  },
};
