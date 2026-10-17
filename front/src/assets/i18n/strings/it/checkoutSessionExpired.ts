import type { Strings } from '../../types';

export const checkoutSessionExpired: Strings['checkoutSessionExpired'] = {
  title: 'Sessione di acquisto scaduta',
  message: (minutes) =>
    `Per sicurezza, gli indirizzi e i dati di pagamento non salvati sono stati cancellati dopo ${minutes} minuti di inattività.`,
  continue: 'Continua',

  warningTitle: 'La tua sessione di pagamento sta per scadere',

  warningMessage:
    'Senza alcuna attività da parte tua nei prossimi {n} minuti, i dati inseriti per il tuo ordine verranno cancellati per sicurezza.',
};
