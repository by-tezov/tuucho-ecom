import type { Strings } from '../../types';

/** Top-level labels belonging to no single screen. */
export const common: {
  [
    K in
      | 'skip'
      | 'skipFooter'
      | 'backLink'
      | 'brandAria'
      | 'navAria'
      | 'menuOpenAria'
      | 'menuCloseAria'
      | 'newWindowAria'
      | 'continueAction'
      | 'requiredFieldsNote'
  ]: Strings[K];
} = {
  skip: 'Ir al contenido principal',
  skipFooter: 'Ir al pie de página',
  backLink: 'Volver',
  brandAria: 'Lumen, volver al inicio',
  navAria: 'Navegación principal',
  menuOpenAria: 'Abrir menú',
  menuCloseAria: 'Cerrar menú',
  newWindowAria: 'nueva ventana',
  continueAction: 'Continuar',
  requiredFieldsNote: 'Los campos marcados con un asterisco (*) son obligatorios.',
};
