import type { Strings } from '../../types';

export const checkoutSessionExpired: Strings['checkoutSessionExpired'] = {
  title: 'Afreksessie verlopen',
  message: (minutes) =>
    `Voor je veiligheid zijn niet-opgeslagen adressen en betaalgegevens na ${minutes} minuten zonder activiteit verwijderd.`,
  continue: 'Doorgaan',

  warningTitle: 'Je betaalsessie verloopt bijna',

  warningMessage:
    'Zonder activiteit van jou in de komende {n} minuten worden de gegevens die je voor je bestelling hebt ingevuld uit veiligheid gewist.',
};
