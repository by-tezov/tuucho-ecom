import type { Strings } from '../../types';

export const onboarding: Strings['onboarding'] = {
  closeAria: 'Chiudi la presentazione',
  prevAria: 'Slide precedente',
  nextLabel: 'Avanti',
  doneLabel: 'Ho capito',
  stepAria: (current, total) => `Passo ${current} di ${total}`,
  handmade: {
    title: 'Lumen',
    headline: 'Qualità fatta a mano',
    body: 'Ogni set è limato, dipinto e decorato a mano, uno per uno. Niente produzione di massa: un pezzo curato, preparato per te.',
  },
  deals: {
    title: 'Vantaggi',
    headline: 'Sconti e spedizione gratuita',
    subheadline:
      'I lotti ti fanno risparmiare non appena ordini più set, e la spedizione gratuita si attiva automaticamente quando raggiungi l’importo previsto.',
    volumeTitle: 'Sconti volume',
    volumeLead: 'Più set ordini, più risparmi.',
    volumeTier: (qty, percent) => `${qty} set −${percent} %`,
    volumeJoin: ' · ',
    volumeHint: 'La barra del carrello sale con ogni set che aggiungi.',
    freeShippingTitle: 'Spedizione',
    freeShippingLead: (amount) => `Spedizione gratuita da ${amount} di merce.`,
    freeShippingHint: 'La soglia dipende dal paese di consegna.',
    genericBody: 'Sconti volume sui set e spedizione gratuita da un certo importo ti aspettano nel carrello.',
  },
  loyalty: {
    title: 'Borsellino',
    headline: 'Guadagna credito sui tuoi ordini',
    body: 'Con un account accumuli credito fedeltà sugli ordini e puoi usarlo su un carrello successivo.',
  },
  custom: {
    title: 'Su misura',
    headline: 'Taglia o design personalizzato',
    body: 'Una taglia o un design che non è in boutique? Scrivimi dalla pagina Contatti: vediamo insieme cosa è possibile.',
  },
};
