import type { Strings } from '../../types';

export const onboarding: Strings['onboarding'] = {
  closeAria: 'Presentatie sluiten',
  prevAria: 'Vorige slide',
  nextLabel: 'Volgende',
  doneLabel: 'Begrepen',
  stepAria: (current, total) => `Stap ${current} van ${total}`,
  handmade: {
    title: 'Lumen',
    headline: 'Kwaliteit met de hand gemaakt',
    body: 'Elke set wordt met de hand gevijld, geschilderd en versierd, één voor één. Geen massaproductie: een zorgvuldig stuk, voor jou gemaakt.',
  },
  deals: {
    title: 'Voordelen',
    headline: 'Kortingen en gratis verzending',
    subheadline:
      'Lots laten je besparen zodra je meerdere sets bestelt, en gratis verzending gaat automatisch aan vanaf het voorziene bedrag.',
    volumeTitle: 'Volumekortingen',
    volumeLead: 'Hoe meer sets je bestelt, hoe meer je bespaart.',
    volumeTier: (qty, percent) => `${qty} sets −${percent} %`,
    volumeJoin: ' · ',
    volumeHint: 'De balk in je winkelwagen stijgt met elke set die je toevoegt.',
    freeShippingTitle: 'Verzending',
    freeShippingLead: (amount) => `Gratis verzending vanaf ${amount} aan merchandise.`,
    freeShippingHint: 'De drempel hangt af van het land van levering.',
    genericBody:
      'Volumekortingen op sets en gratis verzending vanaf een bepaald bedrag wachten in je winkelwagen.',
  },
  loyalty: {
    title: 'Spaarpot',
    headline: 'Verdien tegoed op je bestellingen',
    body: 'Met een account spaar je loyaliteitstegoed op je bestellingen en kun je het gebruiken op een volgende winkelwagen.',
  },
  custom: {
    title: 'Op maat',
    headline: 'Maat of ontwerp op verzoek',
    body: 'Een maat of ontwerp dat niet in de shop staat? Schrijf me via de Contactpagina: we bekijken samen wat mogelijk is.',
  },
};
