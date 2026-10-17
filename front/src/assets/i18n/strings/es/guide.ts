import type { Strings } from '../../types';

export const guide: Strings['guide'] = {
  eyebrow: 'Guía de tallas',
  title: 'Encuentra tu talla',
  leadTitle: 'En la mayoría de los casos, una talla estándar te conviene',
  leadSub:
    'La mayoría de las piezas corresponde a una de las cuatro tallas listas para usar indicadas abajo. Compara la anchura indicada con el espacio del que dispones.',
  customTitle: '¿Ninguna talla estándar encaja?',
  customSub:
    'Sin problema: una pieza a medida es posible. Indica la anchura que necesitas y el atelier te responde.',
  howTitle: 'Cómo elegir tu formato',
  howSub: 'Compara la anchura indicada, sin herramientas especiales.',
  steps: [
    {
      n: '1',
      title: 'Coloca la cinta',
      desc: 'Pega un trozo de cinta transparente con el espacio previsto para la pieza.',
    },
    {
      n: '2',
      title: 'Marca el ancho',
      desc: 'Con un bolígrafo fino, traza una línea a cada lado, en el punto más ancho del formato.',
    },
    {
      n: '3',
      title: 'Mide en mm',
      desc: 'Retira la cinta, colócala plana y mide la distancia entre las dos líneas con una regla. Anota el valor de cada dedo.',
    },
  ],
  chartTitle: 'Tabla de tallas estándar',
  chartSub: 'Cada número de talla corresponde a un ancho preciso. Compara tus medidas con esta tabla.',
  chartNum: 'Talla',
  chartMm: 'Ancho (mm)',
  fingers: ['Medida 1', 'Medida 2', 'Medida 3', 'Medida 4', 'Medida 5'],
  ctaOrder: 'Ver la galería para encontrar un set que me vaya bien',
  tipSetsNote: 'Los números van del pulgar al meñique.',
};
