import type { Strings } from '../../types';

export const accessibilityStatement: Strings['accessibilityStatement'] = {
  eyebrow: 'Información legal',
  title: 'Declaración de accesibilidad',
  updated: 'Emitida el 5 de octubre de 2026',
  intro:
    'Lumen se compromete a hacer su sitio web accesible para todas las personas, de acuerdo con el referencial francés de accesibilidad (RGAA), versión 4.1.2. Esta declaración se aplica a toda la tienda en línea.',
  statusTitle: 'Estado de conformidad',
  statusBody: [
    'Lumen es parcialmente conforme con el RGAA 4.1.2. Las páginas de la tienda siguen los criterios del referencial: navegación con teclado, ventanas de diálogo, mensajes leídos por los lectores de pantalla, etiquetas de los campos, contraste y ausencia de plazos impuestos.',
    'Los contenidos que aún no son accesibles se enumeran más abajo.',
  ],
  issuesTitle: 'Contenidos no accesibles',
  issuesIntro: 'Los siguientes contenidos aún no son accesibles o dependen de un servicio de terceros:',
  issues: [
    'La elección de un punto de recogida Mondial Relay se realiza mediante un módulo y un mapa proporcionados por Mondial Relay, difíciles de usar con el teclado o con un lector de pantalla. La entrega a domicilio sigue disponible, y también puede escribirnos: le ayudaremos a elegir su punto de recogida.',
    'La animación de apertura del sitio y algunas animaciones decorativas no se pueden pausar desde la página. Se detienen si el ajuste de reducir el movimiento de su dispositivo está activado.',
    'Los campos de pago con tarjeta y los botones de pago exprés los proporciona Stripe, en un marco cuyo contenido no controlamos.',
    'Los vídeos de demostración están alojados en YouTube; sus pasos también se describen por escrito en la misma página.',
  ],
  preparationTitle: 'Elaboración de esta declaración',
  preparationBody: [
    'Esta declaración se emitió el 5 de octubre de 2026.',
    'Tecnologías utilizadas para crear el sitio: HTML, CSS, JavaScript y WAI-ARIA.',
  ],
  contactTitle: 'Comentarios y contacto',
  contactBody:
    'Si no puede acceder a un contenido o a un servicio, escríbanos: le indicaremos una alternativa accesible o le enviaremos el contenido en otro formato.',
  contactEmailLabel: 'Correo electrónico',
  contactFormLabel: 'Formulario',
  contactPageLink: 'Formulario de contacto',
};
