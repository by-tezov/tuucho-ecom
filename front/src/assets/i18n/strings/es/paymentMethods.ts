import type { Strings } from '../../types';

export const paymentMethods: Strings['paymentMethods'] = {
  pageTitle: 'Mis métodos de pago',
  pageSubtitle:
    'Guarda aquí tu tarjeta y elige tus métodos de pago para encontrarlos rápidamente en cada pedido.',
  addButton: 'Añadir una tarjeta bancaria',
  deleteButton: 'Eliminar',
  deleteConfirm: '¿Eliminar esta tarjeta?',
  emptyState: 'Aún no tienes ninguna tarjeta guardada.',
  addCardModalTitle: 'Añadir una tarjeta bancaria',
  cardholderNameLabel: 'Nombre del titular de la tarjeta',
  cardholderNamePlaceholder: 'Ej. Juan Pérez',
  cardholderNameRequiredError: 'Indica el nombre del titular de la tarjeta.',
  rememberCardLabel: 'Quiero recordar esta tarjeta para mis próximas compras.',
  useCardButton: 'Usar esta tarjeta',
  saveCardButton: 'Guardar tarjeta',
  savingCardButton: 'Guardando…',
  preparingCardForm: 'Preparando el formulario seguro…',
  saveCardError: 'No se ha podido guardar la tarjeta. Inténtalo de nuevo.',
  expiresLabel: 'Caduca',
  paypalDescription: 'Pago seguro con PayPal.',
  googlePayDescription: 'Pago seguro con Google Pay.',
  applePayDescription: 'Pago seguro con Apple Pay.',
  bancontactDescription: 'Pago directo seguro con Bancontact (Bélgica / EUR).',
  paypalEnableAction: 'Mostrar',
  paypalDisableAction: 'Ocultar',
  paypalDisableConfirmTitle: '¿Ocultar PayPal?',
  paypalDisableConfirmMessage:
    'Ya no aparecerá en la lista principal del carrito, pero seguirá disponible en « Otros métodos de pago ».',
  bancontactDisableConfirmTitle: '¿Ocultar Bancontact?',
  bancontactDisableConfirmMessage:
    'Ya no aparecerá en la lista principal del carrito, pero seguirá disponible en « Otros métodos de pago ».',
  googlePayDisableConfirmTitle: '¿Ocultar Google Pay?',
  googlePayDisableConfirmMessage:
    'Ya no aparecerá en la lista principal del carrito, pero seguirá disponible en « Otros métodos de pago ».',
  applePayDisableConfirmTitle: '¿Ocultar Apple Pay?',
  applePayDisableConfirmMessage:
    'Ya no aparecerá en la lista principal del carrito, pero seguirá disponible en « Otros métodos de pago ».',
  newCardDescription: 'Introduce una tarjeta nueva al pagar.',
  newCardDisableConfirmTitle: '¿Ocultar Nueva tarjeta bancaria?',
  newCardDisableConfirmMessage:
    'Ya no aparecerá en la lista principal del carrito, pero seguirá disponible en « Otros métodos de pago ». Tus tarjetas guardadas siguen visibles.',
  secureDataNotice: 'Sus datos bancarios están cifrados y gestionados por nuestro proveedor de pagos.',
};
