import type { Strings } from '../../types';

export const checkoutSessionExpired: Strings['checkoutSessionExpired'] = {
  title: 'A sessão de compra expirou',
  message: (minutes) =>
    `Para sua segurança, os endereços e dados de pagamento não guardados foram apagados após ${minutes} minutos sem atividade.`,
  continue: 'Continuar',

  warningTitle: 'A sua sessão de pagamento está prestes a expirar',

  warningMessage:
    'Sem atividade da sua parte nos próximos {n} minutos, os dados introduzidos para a sua encomenda serão apagados por segurança.',
};
