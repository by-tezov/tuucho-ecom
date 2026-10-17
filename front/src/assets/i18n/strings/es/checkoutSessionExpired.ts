import type { Strings } from '../../types';

export const checkoutSessionExpired: Strings['checkoutSessionExpired'] = {
  title: 'La sesión de compra ha caducado',
  message: (minutes) =>
    `Por seguridad, las direcciones y los datos de pago no guardados se han borrado tras ${minutes} minutos sin actividad.`,
  continue: 'Continuar',

  warningTitle: 'Tu sesión de pago está a punto de caducar',

  warningMessage:
    'Si no hay actividad por tu parte en los próximos {n} minutos, los datos introducidos para tu pedido se borrarán por seguridad.',
};
