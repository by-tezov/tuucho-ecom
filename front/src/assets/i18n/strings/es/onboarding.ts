import type { Strings } from '../../types';

export const onboarding: Strings['onboarding'] = {
  closeAria: 'Cerrar la presentación',
  prevAria: 'Diapositiva anterior',
  nextLabel: 'Siguiente',
  doneLabel: 'Entendido',
  stepAria: (current, total) => `Paso ${current} de ${total}`,
  handmade: {
    title: 'Lumen',
    headline: 'Calidad hecha a mano',
    body: 'Cada set se lima, pinta y decora a mano, uno a uno. Sin producción en masa: una pieza cuidada, preparada para ti.',
  },
  deals: {
    title: 'Ventajas',
    headline: 'Descuentos y envío gratis',
    subheadline:
      'Los lotes te hacen ahorrar en cuanto pides varios sets, y el envío gratis se activa solo al llegar al importe previsto.',
    volumeTitle: 'Descuentos por volumen',
    volumeLead: 'Cuantos más sets pidas, más ahorras.',
    volumeTier: (qty, percent) => `${qty} sets −${percent} %`,
    volumeJoin: ' · ',
    volumeHint: 'La barra del carrito sube con cada set que añades.',
    freeShippingTitle: 'Envío',
    freeShippingLead: (amount) => `Envío gratis a partir de ${amount} de mercancía.`,
    freeShippingHint: 'El umbral depende del país de entrega.',
    genericBody:
      'Descuentos por volumen en sets y envío gratis a partir de cierto importe te esperan en el carrito.',
  },
  loyalty: {
    title: 'Monedero',
    headline: 'Gana crédito con tus pedidos',
    body: 'Con una cuenta, acumulas crédito de fidelidad en tus pedidos y puedes usarlo en un carrito posterior.',
  },
  custom: {
    title: 'A medida',
    headline: 'Talla o diseño personalizado',
    body: '¿Una talla o un diseño que no está en la tienda? Escríbeme desde la página Contacto: vemos juntas qué es posible.',
  },
};
