import type { Strings } from '../../types';

export const notifications: Strings['notifications'] = {
  pageTitle: 'Notificaciones',
  emailsSectionTitle: 'Correos',
  emailsMasterLabel: 'Recibir correos',
  emailsMasterDescription:
    'El interruptor general. Apagado = silencio total (salvo restablecer contraseña y seguridad crítica). Encendido = eliges canal por canal.',
  primaryEmailLabel: 'Dirección principal',
  verifiedBadge: 'Verificado',
  unverifiedBadge: 'Sin verificar',
  unverifiedBanner:
    'Confirma tu correo para recibir las alertas chulas (nuevos lanzamientos, carrito, favoritos…). Ya puedes configurar tus preferencias más abajo.',
  loading: 'Cargando…',
  loadError: 'No se han podido cargar tus preferencias. Inténtalo de nuevo en un momento.',
  masterDisableConfirmTitle: '¿Desactivar todos los correos?',
  masterDisableConfirmMessage:
    'No más resúmenes de pedidos, facturas ni alertas. Podrás seguir iniciando sesión y restableciendo tu contraseña.',
  transactionalSectionTitle: 'Pedidos y seguridad',
  marketingSectionTitle: 'Inspiración y carrito',
  disableConfirmButton: 'Desactivar',
  cancelButton: 'Cancelar',
  orderConfirmation: {
    title: 'Confirmación de pedido',
    description:
      'El «todo en orden, confirmado» justo después del pago. Un pequeño chócala en tu bandeja de entrada.',
    disableConfirmTitle: '¿Desactivar las confirmaciones de pedido?',
    disableConfirmMessage:
      'No recibirás el resumen por email tras una compra. Sigue disponible en tu cuenta.',
  },
  orderShipped: {
    title: 'Pedido enviado',
    description: 'El aviso de «ya está en camino» cuando tu pedido sale del taller.',
    disableConfirmTitle: '¿Desactivar los correos de envío?',
    disableConfirmMessage: 'No recibirás email cuando se envíe un pedido. El seguimiento sigue en tu cuenta.',
  },
  invoice: {
    title: 'Factura',
    description: 'Factura en PDF en tu bandeja de entrada, ideal para gastos y devoluciones.',
    disableConfirmTitle: '¿Desactivar los correos de factura?',
    disableConfirmMessage: 'Puedes seguir descargando las facturas desde tus pedidos.',
  },
  security: {
    title: 'Alertas de seguridad',
    description:
      'Resúmenes de seguridad opcionales. Lo crítico (bloqueo, restablecer contraseña) siempre se envía.',
    disableConfirmTitle: '¿Desactivar las alertas de seguridad opcionales?',
    disableConfirmMessage:
      'Los correos de restablecer contraseña, bloqueo de cuenta y eliminación siempre se envían.',
  },
  chatReply: {
    title: 'Respuestas del chat',
    description: 'Recibe un correo cuando Lumen responda mientras no estés viendo la conversación.',
    disableConfirmTitle: '¿Desactivar las notificaciones del chat?',
    disableConfirmMessage: 'Podrás seguir leyendo las respuestas en tu espacio de conversación.',
  },
  loyaltyExpiry: {
    title: 'Loyalty expiry reminder',
    description: 'A heads-up before your loyalty credit expires.',
    disableConfirmTitle: 'Turn off loyalty expiry reminders?',
    disableConfirmMessage: 'You may lose credit without a reminder before the expiry date.',
  },
  nouveautes: {
    title: 'Novedades',
    description: 'Nuevos lanzamientos en la galería. Para que no te pierdas el set que triunfa.',
    disableConfirmTitle: '¿Desactivar las novedades?',
    disableConfirmMessage: 'No te avisaremos cuando lleguen nuevos sets.',
  },
  cartReminder: {
    title: 'Carrito esperando',
    description: 'Un recordatorio suave si dejaste piezas en el carrito. Sin spam agresivo.',
    disableConfirmTitle: '¿Desactivar los recordatorios de carrito?',
    disableConfirmMessage: 'No te recordaremos un carrito sin terminar.',
  },
  favoriteSold: {
    title: 'Favorito vendido',
    description: 'Tu flechazo acaba de irse. Para que sepas que no fue un fallo de stock.',
    disableConfirmTitle: '¿Desactivar las alertas de favorito vendido?',
    disableConfirmMessage: 'No te avisaremos cuando se agote un favorito.',
  },
  favoriteRestock: {
    title: 'Favorito repuesto',
    description: 'Giro de guion: ha vuelto. Te avisamos antes de que desaparezca otra vez.',
    disableConfirmTitle: '¿Desactivar las alertas de reposición?',
    disableConfirmMessage: 'Sin alerta cuando un favorito vuelva a estar disponible.',
  },
  promo: {
    title: 'Ofertas y códigos',
    description:
      'Los descuentos de verdad (códigos, lanzamientos). Algo raro, no es una newsletter de cada lunes.',
    disableConfirmTitle: '¿Desactivar las ofertas?',
    disableConfirmMessage: 'No recibirás códigos promocionales por email.',
  },
};
